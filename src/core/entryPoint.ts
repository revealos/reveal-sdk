/**
 * EntryPoint Module
 * 
 * The main orchestration layer for the Reveal SDK.
 * Wires together all SDK modules (ConfigClient, SessionManager, EventPipeline, etc.)
 * and provides the public API surface (Reveal.init, Reveal.track, Reveal.onNudgeDecision).
 * 
 * Responsibilities:
 * - Initialize and coordinate all SDK modules
 * - Handle global error handling and teardown
 * - Manage SDK lifecycle (initialized, disabled states)
 * - Provide stable public API to host applications
 * 
 * @module core/entryPoint
 */

import { createLogger, type Logger } from "../utils/logger";
import { safeTry, safeTryAsync } from "../utils/safe";
import { createDetectorManager, type DetectorManager } from "../modules/detectorManager";
import type { FrictionSignal } from "../types/friction";
import type { ClientConfig } from "../types/config";
import type { WireNudgeDecision } from "../types/decisions";

// Global singleton state (closure scope, not exposed)
let isInitialized = false;
let isDisabled = false;

// Internal module references (held in closure)
let configClient: any = null;
let sessionManager: any = null;
let eventPipeline: any = null;
let transport: any = null;
let detectorManager: DetectorManager | null = null;
let decisionClient: any = null;
let logger: Logger | null = null;

// Nudge decision subscribers (host app callbacks)
let nudgeSubscribers: Array<(decision: WireNudgeDecision) => void> = [];

/**
 * Initialize the Reveal SDK
 * 
 * @param clientKey - Client authentication key
 * @param options - Configuration options
 * @returns Promise that resolves when initialization is complete
 */
export async function init(
  clientKey: string,
  options: Record<string, any> = {}
): Promise<void> {
  // GUARD: Prevent double-initialization
  if (isInitialized) {
    logger?.logDebug("Reveal.init() called again; ignoring.");
    return;
  }
  if (isDisabled) {
    logger?.logDebug("Reveal SDK is disabled due to previous fatal error.");
    return;
  }

  // VALIDATION: clientKey is required
  if (!clientKey || typeof clientKey !== "string") {
    console.error("[Reveal SDK] clientKey is required and must be a string.");
    isDisabled = true;
    return;
  }

  // Mark as initialized immediately to prevent race conditions
  isInitialized = true;

  // SETUP: Extract options
  const debugMode = options.debug === true;

  // INITIALIZE: Logger (must be first for error handling)
  logger = createLogger({ debug: debugMode });
  
  // Store logger reference for safeTry (TypeScript narrowing)
  // createLogger always returns a Logger, so this is safe
  const loggerRef: Logger = logger;

  // ORCHESTRATE: Async initialization flow
  safeTryAsync(async () => {
    loggerRef.logDebug("Reveal SDK initializing.");

    // For now, create a minimal config for DetectorManager to work
    // TODO: Replace with real ConfigClient when implemented
    const minimalConfig: ClientConfig = {
      projectId: clientKey, // Temporary: use clientKey as projectId
      environment: (options.environment as "production" | "staging" | "development") || "development",
      sdk: {
        samplingRate: 1.0,
      },
      decision: {
        endpoint: options.decisionEndpoint || `${options.apiBase || "https://api.reveal.io"}/decide`,
        timeoutMs: 200,
      },
      templates: [],
      ttlSeconds: 3600,
    };

    // STEP 6: DetectorManager – friction detection
    function onFrictionSignal(rawSignal: FrictionSignal) {
      safeTry(async () => {
        if (!eventPipeline || !sessionManager) {
          // For now, just log the signal
          logger?.logDebug("Friction signal received", rawSignal);
          console.log("[Reveal SDK] Friction signal:", rawSignal);
          return;
        }

        const now = Date.now();
        const frictionSignal: FrictionSignal = {
          type: rawSignal.type,
          pageUrl: rawSignal.pageUrl,
          selector: rawSignal.selector ?? null,
          timestamp: rawSignal.timestamp || now,
          extra: rawSignal.extra || {},
        };

        logger?.logDebug("Friction signal received", frictionSignal);

        // Emit friction event to pipeline
        eventPipeline.captureEvent(
          "friction",
          `friction_${frictionSignal.type}`,
          {
            page_url: frictionSignal.pageUrl,
            selector: frictionSignal.selector,
            ...frictionSignal.extra,
          }
        );

        // Mark activity for session idle handling
        if (sessionManager.markActivity) {
          sessionManager.markActivity();
        }

        // TODO: Ask backend to decide when DecisionClient is implemented
        // const currentSession = sessionManager.getCurrentSession();
        // if (currentSession) {
        //   const decision = await decisionClient.requestDecision(...);
        //   if (decision) {
        //     notifyNudgeSubscribers(decision);
        //   }
        // }
      }, loggerRef, "onFrictionSignal");
    }

    // ============================================================================
    // MINIMAL MODE: Stub EventPipeline (TEMPORARY - REMOVE WHEN REAL PIPELINE IMPLEMENTED)
    // ============================================================================
    // TODO: Replace this stub with real createEventPipeline() when EventPipeline is implemented
    // Search for "MINIMAL MODE: Stub EventPipeline" to find and remove this
    // ============================================================================
    eventPipeline = {
      captureEvent: (kind: string, name: string, payload?: Record<string, any>) => {
        loggerRef.logDebug("Event captured (minimal mode - stub pipeline)", {
          kind,
          name,
          payload,
        });
        // TODO: Replace with real EventPipeline.captureEvent() implementation
      },
      flush: async (force?: boolean, mode?: string) => {
        loggerRef.logDebug("EventPipeline flush called (minimal mode - stub)", {
          force,
          mode,
        });
        // TODO: Replace with real EventPipeline.flush() implementation
      },
      destroy: () => {
        loggerRef.logDebug("EventPipeline destroy called (minimal mode - stub)");
        // TODO: Replace with real EventPipeline.destroy() implementation
      },
    };
    // ============================================================================

    detectorManager = createDetectorManager({
      config: minimalConfig,
      onFrictionSignal,
      logger: loggerRef,
    });

    detectorManager.initDetectors();
    loggerRef.logDebug("Detectors initialized and listening");

    loggerRef.logDebug("Reveal SDK initialization complete ✓");
  }, loggerRef, "Reveal.init()").catch((error: any) => {
    // FATAL ERROR: Disable SDK entirely
    loggerRef.logError("Fatal error during Reveal SDK initialization", error);
    isDisabled = true;
    isInitialized = false; // Allow retry if desired

    // Clean up any partially initialized modules
    cleanup();
  });
}

/**
 * Track an event
 * 
 * @param eventKind - Type of event (product, friction, nudge, session)
 * @param eventType - Specific event type identifier
 * @param properties - Optional event properties
 */
export function track(
  eventKind: string,
  eventType: string,
  properties: Record<string, any> = {}
): void {
  if (isDisabled) {
    return;
  }
  if (!isInitialized) {
    // Fails open: log to console in debug, but don't break host app
    console.warn?.(
      "[Reveal SDK] track() called before init; event ignored",
      { eventKind, eventType, properties }
    );
    return;
  }
  
  // Note: eventPipeline is always set in init() (minimal stub for now)
  // See "MINIMAL MODE: Stub EventPipeline" comment in init() function
  if (!eventPipeline) {
    logger?.logWarn("EventPipeline not available (should not happen)", {
      eventKind,
      eventType,
    });
    return;
  }

  // Simple guard for allowed event kinds
  const allowedKinds = ["product", "friction", "nudge", "session"];
  if (!allowedKinds.includes(eventKind)) {
    logger?.logWarn("Reveal.track(): invalid eventKind, ignoring", {
      eventKind,
      eventType,
    });
    return;
  }

  eventPipeline.captureEvent(
    eventKind,
    eventType,
    properties || {}
  );
}

/**
 * Subscribe to nudge decisions
 * 
 * @param handler - Callback function to receive nudge decisions
 * @returns Unsubscribe function
 */
export function onNudgeDecision(
  handler: (decision: WireNudgeDecision) => void
): () => void {
  if (typeof handler !== "function") {
    logger?.logWarn("onNudgeDecision called with non-function handler");
  return () => {};
  }

  nudgeSubscribers.push(handler);

  // Return unsubscribe function
  return () => {
    nudgeSubscribers = nudgeSubscribers.filter((h) => h !== handler);
  };
}

/**
 * Destroy the SDK instance and clean up resources
 */
export function destroy(): void {
  if (isDisabled && !isInitialized) {
    return;
  }
  safeTry(() => {
    logger?.logDebug("Reveal.destroy() called");
    cleanup();
    isInitialized = false;
    isDisabled = false;
  }, logger || undefined, "Reveal.destroy");
}

// ======================================================
// INTERNAL HELPERS
// ======================================================

function notifyNudgeSubscribers(decision: WireNudgeDecision) {
  if (!nudgeSubscribers.length) return;

  nudgeSubscribers.forEach((handler) => {
    safeTry(() => handler(decision), logger || undefined, "nudgeSubscriber");
  });
}

function cleanup() {
  // Tear down any partially initialized modules
  if (detectorManager) {
    const dm = detectorManager; // Capture for TypeScript narrowing
    safeTry(() => dm.destroy(), logger || undefined, "cleanup:detectors");
  }

  if (eventPipeline) {
    safeTry(() => eventPipeline.destroy(), logger || undefined, "cleanup:pipeline");
  }

  if (sessionManager) {
    safeTry(() => sessionManager.destroy(), logger || undefined, "cleanup:session");
  }

  // Clear references
  configClient = null;
  sessionManager = null;
  eventPipeline = null;
  transport = null;
  detectorManager = null;
  decisionClient = null;
}

/**
 * Start watching a context for idle behavior
 * 
 * @param config - Idle watch configuration (context, selector, timeoutMs)
 */
export function startIdleWatch(config: {
  context: string;
  selector: string | null;
  timeoutMs?: number;
}): void {
  if (detectorManager) {
    detectorManager.startIdleWatch(config);
  } else {
    logger?.logWarn("startIdleWatch called before SDK initialization");
  }
}

/**
 * Stop watching a context for idle behavior
 * 
 * @param context - Context identifier to stop watching
 */
export function stopIdleWatch(context: string): void {
  if (detectorManager) {
    detectorManager.stopIdleWatch(context);
  } else {
    logger?.logWarn("stopIdleWatch called before SDK initialization");
  }
}

/**
 * Mark a context as closed (stops watching and resets timers)
 * 
 * @param context - Context identifier to mark as closed
 */
export function markContextClosed(context: string): void {
  if (detectorManager) {
    detectorManager.markContextClosed(context);
  } else {
    logger?.logWarn("markContextClosed called before SDK initialization");
  }
}

