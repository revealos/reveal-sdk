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
import { createSessionManager, type SessionManager } from "../modules/sessionManager";
import { createDecisionClient, type DecisionClient } from "../modules/decisionClient";
import { createTransport, type Transport } from "../modules/transport";
import { createEventPipeline, type EventPipeline } from "../modules/eventPipeline";
import { createConfigClient, type ConfigClient } from "../modules/configClient";
import { setAuditLogger } from "../security/auditLogger";
import { setErrorLogger } from "../errors/errorHandler";
import { validateAllBackendUrls, validateHttpsUrl } from "../security/inputValidation";
import { getOrCreateAnonymousId } from "../utils/anonymousId";
import { transformBaseEventToBackendFormat, type PageContext } from "../modules/eventTransformer";
import type { BaseEvent } from "../types/events";
import type { FrictionSignal } from "../types/friction";
import type { ClientConfig } from "../types/config";
import type { WireNudgeDecision } from "../types/decisions";
import type { EventKind, EventPayload } from "../types/events";

// Global singleton state (closure scope, not exposed)
let isInitialized = false;
let isDisabled = false;

// Internal module references (held in closure)
let configClient: any = null;
let sessionManager: SessionManager | null = null;
let eventPipeline: EventPipeline | null = null;
let transport: Transport | null = null;
let detectorManager: DetectorManager | null = null;
let decisionClient: DecisionClient | null = null;
let logger: Logger | null = null;

// Nudge decision subscribers (host app callbacks)
let nudgeSubscribers: Array<(decision: WireNudgeDecision) => void> = [];

// Track last decision ID for deduplication
let lastDecisionId: string | null = null;

// Track if a nudge is currently active/visible (prevents multiple nudges)
let isNudgeActive = false;

// Track cooldown period after nudge dismissal (prevents immediate re-triggering)
// Cooldown duration: 2 seconds (gives backend time to process dismissal event)
const NUDGE_DISMISSAL_COOLDOWN_MS = 2000;
let nudgeDismissalCooldownUntil: number | null = null;

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

  // SETUP: Extract options
  const debugMode = options.debug === true;

  // INITIALIZE: Logger (must be first for error handling)
  logger = createLogger({ debug: debugMode });
  
  // Store logger reference for safeTry (TypeScript narrowing)
  // createLogger always returns a Logger, so this is safe
  const loggerRef: Logger = logger;

  // SECURITY: Wire logger into audit and error handling modules
  setAuditLogger(loggerRef);
  setErrorLogger(loggerRef);

  // ──────────────────────────────────────────────────────────────────────
  // SECURITY: Validate apiBase first (if provided) before using it to construct URLs
  // This happens synchronously before marking as initialized
  // ──────────────────────────────────────────────────────────────────────
  if (options.apiBase && typeof options.apiBase === "string") {
    const apiBaseValidation = validateHttpsUrl(options.apiBase);
    if (!apiBaseValidation.valid) {
      const errorMessage = `[Reveal SDK] SECURITY: Backend URLs must use HTTPS. API base URL ${apiBaseValidation.error}`;
      loggerRef.logError(errorMessage);
      console.error(errorMessage);
      isDisabled = true;
      isInitialized = false; // Allow retry if desired
      return; // Exit early, no modules initialized
    }
  }

  // Mark as initialized after initial validation passes
  isInitialized = true;

  // ORCHESTRATE: Async initialization flow
  safeTryAsync(async () => {
    loggerRef.logDebug("Reveal SDK initializing.");

    // ──────────────────────────────────────────────────────────────────────
    // RESOLVE INGEST ENDPOINT
    // ──────────────────────────────────────────────────────────────────────
    // Support both ingestEndpoint (explicit) and endpoint (backward compat)
    // Also support apiBase + "/ingest" pattern
    let ingestEndpoint: string;
    if (options.ingestEndpoint && typeof options.ingestEndpoint === "string") {
      ingestEndpoint = options.ingestEndpoint;
    } else if (options.endpoint && typeof options.endpoint === "string") {
      // Backward compatibility: if endpoint provided, use it (harness uses this)
      ingestEndpoint = options.endpoint;
      loggerRef.logWarn(
        "Using 'endpoint' option is deprecated, use 'ingestEndpoint' instead"
      );
    } else if (options.apiBase && typeof options.apiBase === "string") {
      ingestEndpoint = `${options.apiBase}/ingest`;
    } else {
      ingestEndpoint = "https://api.reveal.io/ingest";
    }
    loggerRef.logDebug("Resolved ingest endpoint", { ingestEndpoint });

    // ──────────────────────────────────────────────────────────────────────
    // RESOLVE CONFIG ENDPOINT
    // ──────────────────────────────────────────────────────────────────────
    let configEndpoint: string;
    if (options.configEndpoint && typeof options.configEndpoint === "string") {
      configEndpoint = options.configEndpoint;
    } else if (options.apiBase && typeof options.apiBase === "string") {
      configEndpoint = `${options.apiBase}/config`;
    } else {
      configEndpoint = "https://api.reveal.io/config";
    }
    loggerRef.logDebug("Resolved config endpoint", { configEndpoint });

    // ──────────────────────────────────────────────────────────────────────
    // FETCH CONFIG FROM BACKEND (with fallback to minimalConfig)
    // ──────────────────────────────────────────────────────────────────────
    const environment = (options.environment as "production" | "staging" | "development") || "development";
    
    // Environment-aware timeout defaults:
    // - Production: 400ms (realistic for network + backend processing)
    // - Development: 2000ms (allows for CORS preflight + logging overhead)
    const defaultDecisionTimeout = environment === "production" ? 400 : 2000;
    
    // Fallback minimal config (used if backend fetch fails)
    const minimalConfig: ClientConfig = {
      projectId: clientKey, // Temporary: use clientKey as projectId
      environment,
      sdk: {
        samplingRate: 1.0,
      },
      decision: {
        endpoint: options.decisionEndpoint || `${options.apiBase || "https://api.reveal.io"}/decide`,
        timeoutMs: options.decisionTimeoutMs || defaultDecisionTimeout,
      },
      templates: [],
      ttlSeconds: 3600,
    };

    // Try to fetch config from backend
    let clientConfig: ClientConfig | null = null;
    try {
      // Validate config endpoint URL for HTTPS (with localhost exception)
      const configUrlValidation = validateHttpsUrl(configEndpoint);
      if (configUrlValidation.valid) {
        loggerRef.logDebug("Creating ConfigClient", { endpoint: configEndpoint, environment });
        
        // Create ConfigClient instance
        configClient = createConfigClient({
          endpoint: configEndpoint,
          clientKey: clientKey,
          environment: environment,
          fetchFn: typeof fetch !== "undefined" ? fetch : undefined,
          logger: loggerRef,
          timeoutMs: 5000,
        });

        loggerRef.logDebug("Fetching config from backend...");
        
        // Fetch config from backend
        clientConfig = await configClient.getConfig();
        if (clientConfig) {
          loggerRef.logDebug("Config fetched from backend", { projectId: clientConfig.projectId, environment: clientConfig.environment });
          console.log("[Reveal SDK] ✓ Config fetched from backend:", clientConfig);
        } else {
          loggerRef.logWarn("Failed to fetch config from backend, using fallback minimalConfig");
          console.warn("[Reveal SDK] ⚠ Failed to fetch config from backend, using fallback minimalConfig");
        }
      } else {
        loggerRef.logWarn("Config endpoint URL validation failed, using fallback minimalConfig", { error: configUrlValidation.error });
        console.warn("[Reveal SDK] ⚠ Config endpoint URL validation failed:", configUrlValidation.error);
      }
    } catch (error: any) {
      loggerRef.logWarn("Error during config fetch, using fallback minimalConfig", { error: error?.message || String(error) });
      console.error("[Reveal SDK] ✗ Error during config fetch:", error?.message || String(error));
      // Continue with minimalConfig fallback
    }

    // Use fetched config or fallback to minimalConfig
    const finalConfig: ClientConfig = clientConfig || minimalConfig;

    // ──────────────────────────────────────────────────────────────────────
    // RESOLVE RELATIVE DECISION ENDPOINT TO FULL URL
    // ──────────────────────────────────────────────────────────────────────
    // Backend may return relative paths (e.g., "/decide"), so we need to resolve them
    let resolvedDecisionEndpoint = finalConfig.decision.endpoint;
    
    // If decision endpoint is relative (starts with /), resolve it using apiBase or configEndpoint base
    if (resolvedDecisionEndpoint.startsWith("/")) {
      // Use apiBase if available, otherwise derive from configEndpoint
      const baseUrl = options.apiBase || (configEndpoint ? configEndpoint.replace(/\/config.*$/, "") : "https://api.reveal.io");
      resolvedDecisionEndpoint = `${baseUrl}${resolvedDecisionEndpoint}`;
    }

    // ──────────────────────────────────────────────────────────────────────
    // SECURITY: Validate all backend URLs are HTTPS (localhost exception)
    // ──────────────────────────────────────────────────────────────────────
    // Validate ingest and decision endpoints (apiBase already validated above)
    const urlValidation = validateAllBackendUrls({
      ingestEndpoint,
      decisionEndpoint: resolvedDecisionEndpoint,
      // apiBase already validated above, don't validate again
    });

    if (!urlValidation.valid) {
      const errorMessage = `[Reveal SDK] SECURITY: Backend URLs must use HTTPS. ${urlValidation.error}`;
      loggerRef.logError(errorMessage);
      console.error(errorMessage);
      isDisabled = true;
      isInitialized = false; // Allow retry if desired
      return; // Exit early, no modules initialized
    }

    // STEP: Initialize anonymousId (persistent user identifier)
    // Must be defined before onFrictionSignal so it's available in the closure
    const anonymousId = getOrCreateAnonymousId();

    // STEP 6: DetectorManager – friction detection
    // Friction signals may include semantic IDs in extra:
    // - For "stall": stall_ms (number) - stall duration in milliseconds
    // - For "rageclick": target_id (string) - stable target identifier
    // - For "backtrack": from_view (string), to_view (string) - view identifiers
    function onFrictionSignal(rawSignal: FrictionSignal) {
      safeTry(async () => {
        if (!eventPipeline || !sessionManager) {
          // For now, just log the signal
          logger?.logDebug("Friction signal received", rawSignal);
          console.log("[Reveal SDK] Friction signal:", rawSignal);
          return;
        }

        const now = Date.now();
        
        // Extract path from pageUrl if not provided
        const extractPathFromUrl = (url: string): string => {
          try {
            const urlObj = new URL(url);
            return urlObj.pathname;
          } catch {
            // Fallback: try simple string extraction
            const match = url.match(/\/\/[^\/]+(\/.*)?$/);
            return match && match[1] ? match[1] : "/";
          }
        };
        
        // Extract referrerPath from document.referrer if available
        const getReferrerPath = (): string | null => {
          if (typeof document === "undefined") return null;
          const referrer = document.referrer;
          if (!referrer) return null;
          try {
            const urlObj = new URL(referrer);
            return urlObj.pathname;
          } catch {
            return null;
          }
        };
        
        const frictionSignal: FrictionSignal = {
          type: rawSignal.type,
          pageUrl: rawSignal.pageUrl,
          selector: rawSignal.selector ?? null,
          timestamp: rawSignal.timestamp || now,
          path: rawSignal.path || extractPathFromUrl(rawSignal.pageUrl),
          referrerPath: rawSignal.referrerPath !== undefined ? rawSignal.referrerPath : getReferrerPath(),
          activationContext: rawSignal.activationContext || null, // Optional, can be null
          extra: rawSignal.extra || {},
        };

        logger?.logDebug("Friction signal received", frictionSignal);

        // Emit friction event to pipeline
        // CRITICAL: flushImmediately=true ensures friction events are sent before nudge events
        // This preserves causality: friction → decision → nudge
        eventPipeline.captureEvent(
          "friction",
          `friction_${frictionSignal.type}`,
          {
            page_url: frictionSignal.pageUrl,
            selector: frictionSignal.selector,
            ...frictionSignal.extra,
            type: frictionSignal.type, // Set type AFTER spread to ensure it's not overwritten
          },
          true // flushImmediately: ensure friction events are sent before nudge events
        );

        // Mark activity for session idle handling
        if (sessionManager.markActivity) {
          sessionManager.markActivity();
        }

        // Request decision from backend (only if no nudge is currently active and cooldown has passed)
        // This prevents multiple nudges from appearing when user interacts while a nudge is visible
        const isInCooldown = nudgeDismissalCooldownUntil !== null && now < nudgeDismissalCooldownUntil;
        
        if (isNudgeActive || isInCooldown) {
          logger?.logDebug("Skipping decision request - nudge already active or in cooldown", {
            frictionType: frictionSignal.type,
            isNudgeActive,
            isInCooldown,
            cooldownRemainingMs: isInCooldown ? nudgeDismissalCooldownUntil! - now : 0,
          });
          return;
        }

        const currentSession = sessionManager.getCurrentSession();
        if (currentSession && decisionClient) {
          const decision = await decisionClient.requestDecision(frictionSignal, {
            projectId: finalConfig.projectId,
            sessionId: currentSession.id,
            anonymousId: anonymousId, // Persistent user identifier for treatment assignment
            isNudgeActive, // Send state to backend for monitoring
          });

          if (decision) {
            isNudgeActive = true; // Mark nudge as active
            notifyNudgeSubscribers(decision);
          }
        }
      }, loggerRef, "onFrictionSignal");
    }


    // STEP: Initialize SessionManager (provides session context for decisions and events)
    sessionManager = createSessionManager({ logger: loggerRef });

    // STEP: Initialize event transformation (convert BaseEvent to backend format)
    // anonymousId already defined above (before onFrictionSignal)
    const sdkVersion = "0.1.0"; // TODO: Read from package.json
    const transformEvent = (baseEvent: BaseEvent) => {
      return transformBaseEventToBackendFormat(baseEvent, {
        anonymousId,
        sdkVersion,
        getPageContext: (): PageContext => ({
          url: typeof window !== "undefined" ? window.location.href : null,
          title: typeof document !== "undefined" ? document.title : null,
          referrer: typeof document !== "undefined" ? document.referrer : null,
        }),
      });
    };

    // STEP: Initialize Transport (HTTP transport for event batches)
    safeTry(() => {
      transport = createTransport({
        endpointUrl: ingestEndpoint,
        clientKey: clientKey,
        logger: loggerRef,
        transformEvent,
      });
      loggerRef.logDebug("Transport initialized", { endpointUrl: ingestEndpoint });
    }, loggerRef, "Transport creation");

    // STEP: Initialize EventPipeline (event buffering and enrichment)
    safeTry(() => {
      if (!transport) {
        loggerRef.logError("Transport not available, EventPipeline cannot be created");
        return;
      }
      if (!sessionManager) {
        loggerRef.logError("SessionManager not available, EventPipeline cannot be created");
        return;
      }

      eventPipeline = createEventPipeline({
        sessionManager: sessionManager,
        transport: transport,
        logger: loggerRef,
        config: {
          maxFlushIntervalMs: 5000,
          maxBufferSize: 1000,
          eventBatchSize: 20,
          maxEventRetries: 2,
        },
        getCurrentLocation: () => {
          // Browser environment: use window.location
          if (typeof window !== "undefined" && window.location) {
            return { 
              path: window.location.pathname,
              route: null, // Not available from window.location
              screen: null, // Not available from window.location
            };
          }
          return { 
            path: null,
            route: null,
            screen: null,
          };
        },
      });

      // Start periodic flush for automatic event sending
      safeTry(() => {
        eventPipeline?.startPeriodicFlush();
        loggerRef.logDebug("EventPipeline periodic flush started");
      }, loggerRef, "EventPipeline.startPeriodicFlush");

      loggerRef.logDebug("EventPipeline initialized");
    }, loggerRef, "EventPipeline creation");

    // STEP: Initialize DecisionClient (requests nudge decisions from backend)
    safeTry(() => {
      if (!transport) {
        loggerRef.logError("Transport not available, DecisionClient cannot be created");
        return;
      }
    decisionClient = createDecisionClient({
        endpoint: resolvedDecisionEndpoint, // Use resolved endpoint (full URL)
        timeoutMs: finalConfig.decision.timeoutMs,
        projectId: finalConfig.projectId,
        environment: finalConfig.environment,
      clientKey: clientKey,
      logger: loggerRef,
        transport: transport,
    });
      loggerRef.logDebug("DecisionClient initialized");
    }, loggerRef, "DecisionClient creation");

    detectorManager = createDetectorManager({
      config: finalConfig,
      onFrictionSignal,
      logger: loggerRef,
    });

    // SAFETY: Wrap detector initialization in safeTry to prevent crashes
    safeTry(() => {
      if (detectorManager) {
        detectorManager.initDetectors();
        loggerRef.logDebug("Detectors initialized and listening");
      }
    }, loggerRef, "DetectorManager.initDetectors");

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
  properties: EventPayload = {}
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
  
  // EventPipeline may be null if initialization failed (fail-open)
  if (!eventPipeline) {
    logger?.logWarn("EventPipeline not available, event ignored", {
      eventKind,
      eventType,
    });
    return;
  }

  // Simple guard for allowed event kinds
  const allowedKinds: EventKind[] = ["product", "friction", "nudge", "session"];
  if (!allowedKinds.includes(eventKind as EventKind)) {
    logger?.logWarn("Reveal.track(): invalid eventKind, ignoring", {
      eventKind,
      eventType,
    });
    return;
  }

  // Track nudge dismissal/click to reset active flag and set cooldown
  // This allows new friction detection after nudge is dismissed, with a brief cooldown
  // to prevent immediate re-triggering while backend processes the dismissal event
  if (eventKind === "nudge" && (eventType === "nudge_dismissed" || eventType === "nudge_clicked")) {
    isNudgeActive = false;
    nudgeDismissalCooldownUntil = Date.now() + NUDGE_DISMISSAL_COOLDOWN_MS;
    logger?.logDebug("Nudge dismissed/clicked - resuming friction detection after cooldown", {
      eventType,
      nudgeId: properties?.nudgeId,
      cooldownMs: NUDGE_DISMISSAL_COOLDOWN_MS,
    });
  }

  eventPipeline.captureEvent(
    eventKind as EventKind,
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

  // Deduplication: skip if same decision ID
  if (lastDecisionId === decision.nudgeId) {
    logger?.logDebug("Skipping duplicate nudge decision", { nudgeId: decision.nudgeId });
    return;
  }

  lastDecisionId = decision.nudgeId;
  isNudgeActive = true; // Mark nudge as active when notifying subscribers
  nudgeDismissalCooldownUntil = null; // Clear any cooldown when new nudge is shown

  nudgeSubscribers.forEach((handler) => {
    safeTry(() => handler(decision), logger || undefined, "nudgeSubscriber");
  });
}

function cleanup() {
  // Tear down any partially initialized modules
  // Order matters: stop detectors first, then pipeline (which may flush), then others
  
  if (detectorManager) {
    const dm = detectorManager; // Capture for TypeScript narrowing
    safeTry(() => dm.destroy(), logger || undefined, "cleanup:detectors");
  }

  if (eventPipeline) {
    const ep = eventPipeline; // Capture for TypeScript narrowing
    safeTry(() => ep.destroy(), logger || undefined, "cleanup:pipeline");
  }

  if (sessionManager) {
    const sm = sessionManager; // Capture for TypeScript narrowing
    safeTry(() => sm.endSession("cleanup"), logger || undefined, "cleanup:session");
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

