/**
 * EventPipeline Module
 * 
 * Receives events from the SDK, enriches them with metadata, buffers them,
 * and periodically flushes them to the backend via Transport.
 * 
 * Responsibilities:
 * - Accept events from SDK (product, friction, nudge, session)
 * - Enrich events with metadata (timestamps, session, location, etc.)
 * - Buffer events for batch sending
 * - Flush events periodically or on threshold
 * - Transform camelCase to snake_case for backend compatibility
 * - Handle event_source classification (system vs user)
 * 
 * Note: This module performs NO business analytics or decisions.
 * It is purely a data collection and transport layer.
 * 
 * @module modules/eventPipeline
 */

import type { EventKind, BaseEvent, EventSource, EventPayload } from "../types/events";
import type { SessionManager } from "./sessionManager";
import type { Transport } from "./transport";
import type { Logger } from "../utils/logger";
import { scrubPII, scrubUrlPII } from "../security/dataSanitization";
import { getTabState, incrementSeq } from "../utils/tabState";
import { generateAnonymousId } from "../utils/anonymousId";

/**
 * EventPipeline configuration
 */
export interface EventPipelineConfig {
  maxFlushIntervalMs: number;
  maxBufferSize: number;
  eventBatchSize: number;
  maxEventRetries: number;
}

/**
 * EventPipeline options
 */
export interface EventPipelineOptions {
  sessionManager: SessionManager;
  transport: Transport;
  logger?: Logger;
  config?: Partial<EventPipelineConfig>;
  getCurrentLocation?: () => { path: string | null; route: string | null; screen: string | null };
}

/**
 * EventPipeline interface
 */
export interface EventPipeline {
  captureEvent(kind: EventKind, name: string, payload?: EventPayload, flushImmediately?: boolean): string | null; // Returns event_id if available
  flush(force?: boolean, mode?: "normal" | "beacon"): Promise<void>;
  startPeriodicFlush(): void;
  destroy(): void;
}

/**
 * Create a new EventPipeline instance
 * 
 * @param options - Configuration options
 * @returns EventPipeline instance
 */
export function createEventPipeline(
  options: EventPipelineOptions
): EventPipeline {
  // ──────────────────────────────────────────────────────────────────────
  // EXTRACT OPTIONS
  // ──────────────────────────────────────────────────────────────────────
  const {
    sessionManager,
    transport,
    logger,
    getCurrentLocation = () => {
      // Default location getter (browser environment)
      if (typeof window !== "undefined" && window.location) {
        return { 
          path: window.location.pathname,
          route: null,
          screen: null,
        };
      }
  return {
        path: null,
        route: null,
        screen: null,
      };
    },
    config = {},
  } = options;

  // ──────────────────────────────────────────────────────────────────────
  // CONFIGURATION FROM CONFIG
  // ──────────────────────────────────────────────────────────────────────
  const batchSize = config.eventBatchSize ?? 20;
  const maxFlushIntervalMs = config.maxFlushIntervalMs ?? 5000; // 5 seconds
  const maxBufferSize = config.maxBufferSize ?? 1000; // Prevent memory leak
  const maxRetries = config.maxEventRetries ?? 2;

  // ──────────────────────────────────────────────────────────────────────
  // PRIVATE STATE (closure scope)
  // ──────────────────────────────────────────────────────────────────────
  let eventBuffer: BaseEvent[] = [];
  let lastFlushTimestamp = now();
  let flushTimer: number | null = null;
  let isFlushing = false;
  let isDestroyed = false;

  // ──────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────────────────
  function now(): number {
    return Date.now();
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function safeTry<T>(fn: () => T, logger?: Logger, context?: string): T | null {
    try {
      return fn();
    } catch (error) {
      logger?.logError(`Error in ${context}:`, error);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: enrichEvent()
  // ──────────────────────────────────────────────────────────────────────
  function enrichEvent(
    kind: EventKind,
    name: string,
    payload: EventPayload = {}
  ): BaseEvent {
    // Get current session (may be null if session not yet started)
    const session = sessionManager.getCurrentSession();

    // Get current location (path, route, screen)
    const location = getCurrentLocation();

    // Capture page context at event creation time to prevent race conditions
    // during rapid navigation (Issue A fix)
    const pageUrlAtCreation = typeof window !== "undefined" ? window.location.href : null;
    const pageTitleAtCreation = typeof document !== "undefined" ? document.title : null;
    const referrerAtCreation = typeof document !== "undefined" ? document.referrer : null;

    // Capture client timestamp for deterministic ordering
    const clientTimestamp = now();

    // Generate event_id at creation time (for linking decisions to friction events)
    const event_id = generateAnonymousId();

    // Get tab state and increment seq counter
    const tabState = getTabState();
    const seq = incrementSeq();

    // Transform payload: map camelCase to snake_case for nudge events
    const transformedPayload =
      kind === "nudge" ? transformNudgePayload(payload) : payload;

    // SECURITY: Scrub PII from payload before creating BaseEvent
    // This is the single choke point where all event payloads are sanitized
    // before being sent over the network
    const scrubbedPayload = scrubPII(transformedPayload);

    // Determine event_source: nudges are system-generated, all others are user-generated
    const event_source: EventSource = kind === "nudge" ? "system" : "user";

    // SECURITY: Scrub obvious PII embedded in URL strings (email-in-URL)
    const scrubbedPath =
      typeof location?.path === "string" && location.path
        ? scrubUrlPII(location.path)
        : null;

    // Derived view identifier used by the engine and analytics.
    // Computed from low-level location hints in priority order:
    //   route || path || screen || "unknown"
    // NOTE: we always use the scrubbedPath value to avoid leaking PII-laden URLs.
    const viewKey =
      (location?.route && location.route) ||
      scrubbedPath ||
      (location?.screen && location.screen) ||
      "unknown";

    // Optional overlay/UI context may be supplied by the caller as part of the payload.
    // We lift it into top-level fields and remove it from the payload object to avoid
    // duplication. These fields are developer-controlled identifiers (not user input).
    let ui_layer: BaseEvent["ui_layer"] | undefined;
    let modal_key: BaseEvent["modal_key"] | undefined;

    if (scrubbedPayload && typeof scrubbedPayload === "object") {
      const candidateUiLayer = (scrubbedPayload as any).ui_layer;
      const candidateModalKey = (scrubbedPayload as any).modal_key;

      if (typeof candidateUiLayer === "string") {
        // Only accept known UiLayer values; ignore anything else.
        if (
          candidateUiLayer === "page" ||
          candidateUiLayer === "modal" ||
          candidateUiLayer === "drawer" ||
          candidateUiLayer === "popover" ||
          candidateUiLayer === "unknown"
        ) {
          ui_layer = candidateUiLayer;
        }
      }

      if (typeof candidateModalKey === "string") {
        modal_key = candidateModalKey;
      } else if (candidateModalKey === null) {
        modal_key = null;
      }
    }

    // Remove lifted overlay context keys from the payload that will be sent
    // so they only exist at the top level of BaseEvent.
    const {
      ui_layer: _omitUiLayer,
      modal_key: _omitModalKey,
      ...payloadWithoutOverlayContext
    } = (scrubbedPayload || {}) as Record<string, any>;

    // Build enriched event
    const enrichedEvent: BaseEvent = {
      // Event identification
      event_id, // Generated at creation time for linking
      kind,
      name,
      event_source,

      // Session context
      session_id: session ? session.id : "pending",
      is_treatment: session ? session.isTreatment : null,

      // Timing
      timestamp: clientTimestamp,

      // Location context
      path: scrubbedPath,
      route: location?.route ?? null,
      screen: location?.screen ?? null,
      viewKey,
      ui_layer,
      modal_key,

      // Page context captured at event creation time (Issue A fix)
      page_url: pageUrlAtCreation,
      page_title: pageTitleAtCreation,
      referrer: referrerAtCreation,

      // Event ordering fields (Issue B fix)
      client_ts_ms: clientTimestamp,
      seq, // Monotonic sequence number per tab
      tab_id: tabState.tab_id, // Unique identifier per browser tab

      // User agent (captured once)
      user_agent:
        typeof navigator !== "undefined" && navigator.userAgent
          ? navigator.userAgent
          : "",

      // Viewport dimensions
      viewport_width:
        typeof window !== "undefined" ? window.innerWidth : 0,
      viewport_height:
        typeof window !== "undefined" ? window.innerHeight : 0,

      // Custom payload (transformed for nudge events, scrubbed of PII)
      payload: payloadWithoutOverlayContext || {},
    };

    return enrichedEvent;
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: transformNudgePayload()
  // ──────────────────────────────────────────────────────────────────────
  function transformNudgePayload(
    payload: EventPayload
  ): EventPayload {
    if (!payload || typeof payload !== "object") {
      return payload;
    }

    const transformed = { ...payload };

    // Map camelCase to snake_case
    if ("nudgeId" in transformed) {
      console.log("[EventPipeline] transformNudgePayload: nudgeId found, transforming to nudge_id", transformed.nudgeId);
      transformed.nudge_id = transformed.nudgeId;
      delete transformed.nudgeId;
    } else {
      console.log("[EventPipeline] transformNudgePayload: NO nudgeId in payload!", transformed);
    }

    if ("slotId" in transformed) {
      transformed.slot_id = transformed.slotId;
      delete transformed.slotId;
    }

    if ("templateId" in transformed) {
      transformed.template_id = transformed.templateId;
      delete transformed.templateId;
    }

    if ("triggerReason" in transformed) {
      transformed.trigger_reason = transformed.triggerReason;
      delete transformed.triggerReason;
    }

    if ("decisionId" in transformed) {
      transformed.decision_id = transformed.decisionId;
      delete transformed.decisionId;
    }

    return transformed;
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: isCriticalEvent()
  // ──────────────────────────────────────────────────────────────────────
  function isCriticalEvent(event: BaseEvent): boolean {
    // Critical events: friction (user behavior) and session (system state)
    // Note: Pseudocode mentioned "overlay" but that's not in EventKind
    const criticalKinds: EventKind[] = ["friction", "session"];
    return criticalKinds.includes(event.kind);
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: sendBatch()
  // ──────────────────────────────────────────────────────────────────────
  async function sendBatch(
    events: BaseEvent[],
    mode: "normal" | "beacon"
  ): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        logger?.logDebug(
          `EventPipeline: send attempt ${attempt}/${maxRetries + 1}`
        );

        // Delegate to Transport module
        await transport.sendBatch(events, mode);

        // Success
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger?.logError(
          `EventPipeline: send attempt ${attempt} failed`,
          lastError
        );

        // If this wasn't the last attempt, wait before retrying
        if (attempt <= maxRetries) {
          const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          logger?.logDebug(`EventPipeline: retrying in ${delayMs}ms`);
          await sleep(delayMs);
        }
      }
    }

    // All retries exhausted
    throw new Error(
      `Failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: requeueFailedEvents()
  // ──────────────────────────────────────────────────────────────────────
  function requeueFailedEvents(failedEvents: BaseEvent[]): void {
    safeTry(
      () => {
        logger?.logDebug("EventPipeline: re-queueing failed events", {
          failedCount: failedEvents.length,
          currentBufferSize: eventBuffer.length,
        });

        // Check if adding failed events would exceed max buffer size
        const totalSize = eventBuffer.length + failedEvents.length;

        if (totalSize <= maxBufferSize) {
          // Safe to re-queue all events
          eventBuffer = [...failedEvents, ...eventBuffer];
          logger?.logDebug("EventPipeline: all events re-queued");
        } else {
          // Buffer overflow - need to drop some events
          logger?.logError(
            "EventPipeline: buffer overflow, dropping oldest non-critical events"
          );

          // Prioritize critical events (friction, session)
          const criticalEvents = failedEvents.filter((e) =>
            isCriticalEvent(e)
          );
          const nonCriticalEvents = failedEvents.filter(
            (e) => !isCriticalEvent(e)
          );

          // Re-queue critical events first
          eventBuffer = [...criticalEvents, ...eventBuffer];

          // Add as many non-critical events as possible
          const spaceLeft = maxBufferSize - eventBuffer.length;
          const nonCriticalToKeep = nonCriticalEvents.slice(0, spaceLeft);
          eventBuffer = [...nonCriticalToKeep, ...eventBuffer];

          const droppedCount =
            failedEvents.length -
            criticalEvents.length -
            nonCriticalToKeep.length;
          logger?.logError(
            `EventPipeline: dropped ${droppedCount} non-critical events due to buffer overflow`
          );
        }
      },
      logger,
      "requeueFailedEvents"
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API: captureEvent()
  // ──────────────────────────────────────────────────────────────────────
  function captureEvent(
    kind: EventKind,
    name: string,
    payload: EventPayload = {},
    flushImmediately: boolean = false
  ): string | null {
    if (isDestroyed) {
      logger?.logDebug("EventPipeline: destroyed, ignoring event");
      return null;
    }

    return safeTry(
      () => {
        logger?.logDebug("EventPipeline: capturing event", { kind, name, flushImmediately });

        // Enrich event with metadata
        const enrichedEvent = enrichEvent(kind, name, payload);

        // DEBUG PROBE 2: Log event enqueued
        if (typeof window !== "undefined" && (window as any).__REVEAL_DEBUG__) {
          console.log("[REVEAL_DEBUG] Event enqueued:", {
            event_kind: enrichedEvent.event_kind,
            event_type: enrichedEvent.event_type,
            friction_type: (enrichedEvent as any).friction_type || null,
            event_id: enrichedEvent.event_id,
            flushImmediately,
          });
        }

        // Add to buffer
        eventBuffer.push(enrichedEvent);

        // Return event_id for linking (e.g., friction events to decision requests)
        return enrichedEvent.event_id || null;

        // Check if buffer size threshold reached
        logger?.logDebug("EventPipeline: buffer check", {
          currentLength: eventBuffer.length,
          batchSize,
          shouldFlush: eventBuffer.length >= batchSize,
        });

        // If flushImmediately is true (e.g., for friction events), trigger immediate flush
        // This ensures friction events are sent before nudge events to preserve causality
        if (flushImmediately) {
          logger?.logDebug(
            "EventPipeline: immediate flush requested, triggering flush",
            { kind, name, bufferLength: eventBuffer.length }
          );
          // Fire-and-forget flush (don't await)
          flush(true, "normal").catch((error) => {
            logger?.logError("EventPipeline: immediate flush failed", error);
          });
        } else if (eventBuffer.length >= batchSize) {
          logger?.logDebug(
            "EventPipeline: batch size reached, triggering flush",
            { bufferLength: eventBuffer.length, batchSize }
          );
          // Fire-and-forget flush (don't await)
          flush(false, "normal").catch((error) => {
            logger?.logError("EventPipeline: auto-flush failed", error);
          });
        }

        // Return event_id for linking
        return enrichedEvent.event_id || null;
      },
      logger,
      "captureEvent"
    ) || null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API: flush()
  // ──────────────────────────────────────────────────────────────────────
  async function flush(
    force = false,
    mode: "normal" | "beacon" = "normal"
  ): Promise<void> {
    // Allow flush when destroyed only if forced (for final flush on destroy)
    if (isDestroyed && !force) {
      logger?.logDebug("EventPipeline: destroyed, ignoring flush");
      return;
    }

    // No-op if already flushing (prevent concurrent flushes)
    if (isFlushing) {
      logger?.logDebug("EventPipeline: flush already in progress, skipping");
      return;
    }

    // No-op if buffer is empty
    if (eventBuffer.length === 0) {
      logger?.logDebug("EventPipeline: buffer empty, skipping flush");
      return;
    }

    // If not forced, check if we should wait longer
    if (!force) {
      const timeSinceLastFlush = now() - lastFlushTimestamp;
      const shouldFlushByTime = timeSinceLastFlush >= maxFlushIntervalMs;
      const shouldFlushBySize = eventBuffer.length >= batchSize;

      logger?.logDebug("EventPipeline: flush condition check", {
        timeSinceLastFlush,
        maxFlushIntervalMs,
        bufferLength: eventBuffer.length,
        batchSize,
        shouldFlushByTime,
        shouldFlushBySize,
        willFlush: shouldFlushByTime || shouldFlushBySize,
      });

      if (!shouldFlushByTime && !shouldFlushBySize) {
        logger?.logDebug(
          "EventPipeline: conditions not met for flush, waiting",
          {
            timeSinceLastFlush,
            bufferLength: eventBuffer.length,
          }
        );
        return;
      }
    }

    // Mark as flushing
    isFlushing = true;

    logger?.logDebug("EventPipeline: starting flush", {
      eventCount: eventBuffer.length,
      mode,
    });

    // Extract events to send (drain buffer)
    const eventsToSend = eventBuffer.slice(); // Copy array
    eventBuffer = []; // Clear buffer immediately

    // CRITICAL: Sort events to ensure friction events always come before nudge events
    // This preserves causality: friction → decision → nudge
    // Events are sorted by kind priority: friction first, then others
    // Within same kind, order by client timestamp for deterministic ordering (Issue B fix)
    eventsToSend.sort((a, b) => {
      // Friction events always come first
      if (a.kind === "friction" && b.kind !== "friction") return -1;
      if (a.kind !== "friction" && b.kind === "friction") return 1;
      // Within same kind, order by client timestamp (deterministic ordering)
      if (a.client_ts_ms && b.client_ts_ms) return a.client_ts_ms - b.client_ts_ms;
      // Fallback to timestamp if client_ts_ms missing (backward compatibility)
      return a.timestamp - b.timestamp;
    });

    // Update last flush timestamp
    lastFlushTimestamp = now();

    try {
      // Send batch via transport
      await sendBatch(eventsToSend, mode);
      logger?.logDebug("EventPipeline: flush successful");
    } catch (error) {
      logger?.logError("EventPipeline: flush failed", error);

      // Re-queue failed events (with bounds check)
      requeueFailedEvents(eventsToSend);
    } finally {
      isFlushing = false;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API: startPeriodicFlush()
  // ──────────────────────────────────────────────────────────────────────
  function startPeriodicFlush(): void {
    if (flushTimer !== null) {
      logger?.logDebug("EventPipeline: periodic flush already started");
      return;
    }

    logger?.logDebug("EventPipeline: starting periodic flush", {
      intervalMs: maxFlushIntervalMs,
    });

    flushTimer = setInterval(() => {
      safeTry(
        () => {
          const timeSinceLastFlush = now() - lastFlushTimestamp;

          logger?.logDebug("EventPipeline: periodic flush check", {
            timeSinceLastFlush,
            maxFlushIntervalMs,
            bufferLength: eventBuffer.length,
            shouldFlush: timeSinceLastFlush >= maxFlushIntervalMs && eventBuffer.length > 0,
          });

          if (
            timeSinceLastFlush >= maxFlushIntervalMs &&
            eventBuffer.length > 0
          ) {
            logger?.logDebug("EventPipeline: periodic flush triggered");
            // Fire-and-forget flush (don't await)
            flush(false, "normal").catch((error) => {
              logger?.logError("EventPipeline: periodic flush failed", error);
            });
          } else {
            logger?.logDebug("EventPipeline: periodic flush skipped", {
              reason: timeSinceLastFlush < maxFlushIntervalMs
                ? "time not reached"
                : "buffer empty",
            });
          }
        },
        logger,
        "periodicFlush"
      );
    }, maxFlushIntervalMs) as unknown as number; // TypeScript: setInterval returns NodeJS.Timeout in Node, number in browser
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API: destroy()
  // ──────────────────────────────────────────────────────────────────────
  function destroy(): void {
    logger?.logDebug("EventPipeline: destroying");

    isDestroyed = true;

    // Stop periodic flush
    if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }

    // Final flush with timeout protection (wait up to 5 seconds)
    if (eventBuffer.length > 0) {
      logger?.logDebug("EventPipeline: final flush on destroy");
      
      const flushPromise = flush(true, "beacon");
      const timeoutPromise = new Promise<void>((resolve) => {
        setTimeout(() => {
          logger?.logWarn("EventPipeline: final flush timeout, continuing destroy");
          resolve();
        }, 5000);
      });
      
      Promise.race([flushPromise, timeoutPromise]).catch((error) => {
        logger?.logError("EventPipeline: final flush failed", error);
      });
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // RETURN PUBLIC API
  // ──────────────────────────────────────────────────────────────────────
  return {
    captureEvent,
    flush,
    startPeriodicFlush,
    destroy,
  };
}

