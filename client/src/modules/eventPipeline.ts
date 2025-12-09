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
  captureEvent(kind: EventKind, name: string, payload?: EventPayload): void;
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

    // Transform payload: map camelCase to snake_case for nudge events
    const transformedPayload =
      kind === "nudge" ? transformNudgePayload(payload) : payload;

    // Determine event_source: nudges are system-generated, all others are user-generated
    const event_source: EventSource = kind === "nudge" ? "system" : "user";

    // Build enriched event
    const enrichedEvent: BaseEvent = {
      // Event identification
      kind,
      name,
      event_source,

      // Session context
      session_id: session ? session.id : "pending",
      is_treatment: session ? session.isTreatment : null,

      // Timing
      timestamp: now(),

      // Location context
      path: location?.path ?? null,
      route: location?.route ?? null,
      screen: location?.screen ?? null,

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

      // Custom payload (transformed for nudge events)
      payload: transformedPayload || {},
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
      transformed.nudge_id = transformed.nudgeId;
      delete transformed.nudgeId;
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
    payload: EventPayload = {}
  ): void {
    if (isDestroyed) {
      logger?.logDebug("EventPipeline: destroyed, ignoring event");
      return;
    }

    safeTry(
      () => {
        logger?.logDebug("EventPipeline: capturing event", { kind, name });

        // Enrich event with metadata
        const enrichedEvent = enrichEvent(kind, name, payload);

        // Add to buffer
        eventBuffer.push(enrichedEvent);

        // Check if buffer size threshold reached
        logger?.logDebug("EventPipeline: buffer check", {
          currentLength: eventBuffer.length,
          batchSize,
          shouldFlush: eventBuffer.length >= batchSize,
        });

        if (eventBuffer.length >= batchSize) {
          logger?.logDebug(
            "EventPipeline: batch size reached, triggering flush",
            { bufferLength: eventBuffer.length, batchSize }
          );
          // Fire-and-forget flush (don't await)
          flush(false, "normal").catch((error) => {
            logger?.logError("EventPipeline: auto-flush failed", error);
          });
        }
      },
      logger,
      "captureEvent"
    );
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

    // Final flush with beacon mode (best effort, fire-and-forget)
    if (eventBuffer.length > 0) {
      logger?.logDebug("EventPipeline: final flush on destroy");
      flush(true, "beacon").catch((error) => {
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

