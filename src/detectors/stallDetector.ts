/**
 * StallDetector
 * 
 * Detects user hesitation or long dwell time on a page or element.
 * 
 * Logic:
 * - Tracks last meaningful activity (clicks, scrolls, typing)
 * - Triggers when user is idle for threshold duration (e.g., 20-30 seconds)
 * - Emits FrictionSignal with type "stall"
 * - Supports context-based watching (startIdleWatch/stopIdleWatch)
 * 
 * @module detectors/stallDetector
 */

import type { FrictionSignal, FrictionType } from "../types/friction";
import type { Logger } from "../utils/logger";

/**
 * Base detector interface (for DetectorManager integration)
 */
interface BaseDetector {
  name: string;
  init(): void;
  destroy(): void;
}

/**
 * Context watch configuration
 */
export interface IdleWatchConfig {
  context: string;
  selector: string | null;
  timeoutMs?: number;
}

/**
 * StallDetector options
 */
export interface StallDetectorOptions {
  win?: Window;
  doc?: Document;
  logger: Logger;
  emit: (signal: {
    type: FrictionType;
    pageUrl?: string | null;
    selector?: string | null;
    extra?: Record<string, any>;
  }) => void;
}

/**
 * StallDetector interface (extends BaseDetector with additional APIs)
 */
export interface StallDetector extends BaseDetector {
  startIdleWatch(config: IdleWatchConfig): void;
  stopIdleWatch(context: string): void;
  markContextClosed(context: string): void;
}

/**
 * Internal context state
 */
interface ContextState {
  context: string;
  selector: string | null;
  timeoutMs: number;
  lastMeaningfulAt: number;
  hasFired: boolean; // Track if we've already fired for this context
  startTime: number;
}

/**
 * Create a new StallDetector instance
 * 
 * @param options - Configuration options
 * @returns StallDetector instance
 */
export function createStallDetector(
  options: StallDetectorOptions
): StallDetector {
  const {
    win = typeof window !== "undefined" ? window : undefined,
    doc = typeof document !== "undefined" ? document : undefined,
    logger,
    emit,
  } = options;

  // Constants
  const DEFAULT_STALL_MS = 20_000; // 20 seconds default
  const POLL_INTERVAL_MS = 1_000; // Check every 1 second

  // State
  let lastGlobalMeaningfulAt = Date.now();
  let pollTimer: number | null = null;
  const activeContexts = new Map<string, ContextState>();
  let listenersAttached = false;

  /**
   * Check if an element is an input, textarea, or contenteditable
   */
  function isEditableElement(el: Element | null): boolean {
    if (!el) return false;
    const tagName = (el as HTMLElement).tagName?.toLowerCase();
    if (tagName === "input" || tagName === "textarea") return true;
    if ((el as HTMLElement).hasAttribute?.("contenteditable")) return true;
    return false;
  }

  /**
   * Handle meaningful activity - resets idle timer
   */
  function onMeaningfulActivity() {
    const now = Date.now();
    lastGlobalMeaningfulAt = now;

    // Reset all active contexts
    activeContexts.forEach((state) => {
      state.lastMeaningfulAt = now;
      // If we were in a stall and user moved, reset the fired flag
      if (state.hasFired) {
        state.hasFired = false;
      }
    });

    logger.logDebug("StallDetector: meaningful activity detected", {
      timestamp: now,
      activeContexts: activeContexts.size,
    });
  }

  /**
   * Handle keyboard activity (keydown, input, change)
   */
  function onKeyboardActivity(event: Event) {
    const target = event.target as Element | null;
    // Only count keyboard activity on editable elements or form elements
    const tagName = target ? (target as HTMLElement).tagName?.toLowerCase() : null;
    if (isEditableElement(target) || tagName === "form") {
      onMeaningfulActivity();
    }
  }

  /**
   * Handle mouse click activity (mousedown, click, mouseup)
   */
  function onMouseClickActivity() {
    onMeaningfulActivity();
  }

  /**
   * Handle form submit
   */
  function onFormSubmit() {
    onMeaningfulActivity();
  }

  /**
   * Handle navigation changes (popstate, hashchange, route change)
   */
  function onNavigationChange() {
    onMeaningfulActivity();
    // Also stop all active contexts on navigation
    activeContexts.clear();
    logger.logDebug("StallDetector: navigation detected, cleared all contexts");
  }

  /**
   * Attach global listeners for meaningful activity
   */
  function attachListeners() {
    if (!win || !doc || listenersAttached) return;

    // Keyboard activity
    doc.addEventListener("keydown", onKeyboardActivity, true);
    doc.addEventListener("input", onKeyboardActivity, true);
    doc.addEventListener("change", onKeyboardActivity, true);

    // Mouse click activity (only click, not mousedown/mouseup to avoid triple logging)
    doc.addEventListener("click", onMouseClickActivity, true);

    // Form submit
    doc.addEventListener("submit", onFormSubmit, true);

    // Navigation changes
    win.addEventListener("popstate", onNavigationChange);
    win.addEventListener("hashchange", onNavigationChange);

    // Next.js router events (if available)
    if (typeof win !== "undefined" && (win as any).next?.router) {
      try {
        (win as any).next.router.events.on("routeChangeStart", onNavigationChange);
      } catch (e) {
        // Next.js router not available, ignore
      }
    }

    listenersAttached = true;
    logger.logDebug("StallDetector: global listeners attached");
  }

  /**
   * Remove global listeners
   */
  function detachListeners() {
    if (!win || !doc || !listenersAttached) return;

    doc.removeEventListener("keydown", onKeyboardActivity, true);
    doc.removeEventListener("input", onKeyboardActivity, true);
    doc.removeEventListener("change", onKeyboardActivity, true);
    doc.removeEventListener("click", onMouseClickActivity, true);
    doc.removeEventListener("submit", onFormSubmit, true);

    if (win) {
      win.removeEventListener("popstate", onNavigationChange);
      win.removeEventListener("hashchange", onNavigationChange);
    }

    listenersAttached = false;
    logger.logDebug("StallDetector: global listeners detached");
  }

  /**
   * Start polling for idle detection
   */
  function startPolling() {
    if (pollTimer !== null) return;

    pollTimer = (win?.setInterval(() => {
      const now = Date.now();

      // Check each active context
      activeContexts.forEach((state, context) => {
        // Skip if already fired for this context
        if (state.hasFired) return;

        const idleMs = now - state.lastMeaningfulAt;

        if (idleMs >= state.timeoutMs) {
          // Fire stall signal for this context
          state.hasFired = true;

          const pageUrl = win?.location?.href ?? "";
          const signal: FrictionSignal = {
            type: "stall",
            pageUrl,
            selector: state.selector,
            timestamp: now,
            extra: {
              context,
              idleMs,
              timeoutMs: state.timeoutMs,
            },
          };

          // Emit signal via callback
          emit({
            type: "stall",
            pageUrl,
            selector: state.selector,
            extra: {
              context,
              idleMs,
              timeoutMs: state.timeoutMs,
            },
          });

          // Console log for debugging
          console.log("[StallDetector] Friction signal emitted:", {
            type: "stall",
            context,
            selector: state.selector,
            pageUrl,
            idleMs,
            timestamp: new Date(now).toISOString(),
          });

          logger.logDebug("StallDetector: stall signal emitted", {
            context,
            selector: state.selector,
            idleMs,
          });
        }
      });
    }, POLL_INTERVAL_MS) as unknown as number) ?? null;

    logger.logDebug("StallDetector: polling started");
  }

  /**
   * Stop polling
   */
  function stopPolling() {
    if (pollTimer !== null && win) {
      win.clearInterval(pollTimer);
      pollTimer = null;
      logger.logDebug("StallDetector: polling stopped");
    }
  }

  /**
   * Initialize detector (BaseDetector interface)
   */
  function init() {
    if (!win || !doc) {
      logger.logDebug("StallDetector: no window/document, skipping init");
      return;
    }

    attachListeners();
    startPolling();
    
    // Auto-start global stall detection (no context required for basic usage)
    // This allows stall detection to work immediately without calling startIdleWatch()
    const defaultContext: ContextState = {
      context: "__global__",
      selector: null,
      timeoutMs: DEFAULT_STALL_MS,
      lastMeaningfulAt: Date.now(),
      hasFired: false,
      startTime: Date.now(),
    };
    activeContexts.set("__global__", defaultContext);
    
    logger.logDebug("StallDetector initialized with global context");
  }

  /**
   * Destroy detector (BaseDetector interface)
   */
  function destroy() {
    stopPolling();
    detachListeners();
    activeContexts.clear();
    logger.logDebug("StallDetector destroyed");
  }

  /**
   * Start watching a specific context for idle behavior
   */
  function startIdleWatch(config: IdleWatchConfig): void {
    if (!win || !doc) {
      logger.logWarn("StallDetector: startIdleWatch called but no window/document");
      return;
    }

    const { context, selector, timeoutMs = DEFAULT_STALL_MS } = config;

    // If context already exists, update it
    const existing = activeContexts.get(context);
    if (existing) {
      existing.selector = selector;
      existing.timeoutMs = timeoutMs;
      existing.lastMeaningfulAt = Date.now();
      existing.hasFired = false;
      logger.logDebug("StallDetector: updated existing context watch", { context });
      return;
    }

    // Create new context state
    const state: ContextState = {
      context,
      selector,
      timeoutMs,
      lastMeaningfulAt: Date.now(),
      hasFired: false,
      startTime: Date.now(),
    };

    activeContexts.set(context, state);

    // Ensure listeners and polling are active
    if (!listenersAttached) {
      attachListeners();
    }
    if (pollTimer === null) {
      startPolling();
    }

    console.log("[StallDetector] Started idle watch:", {
      context,
      selector,
      timeoutMs,
      timestamp: new Date().toISOString(),
    });

    logger.logDebug("StallDetector: started idle watch", { context, selector, timeoutMs });
  }

  /**
   * Stop watching a specific context
   */
  function stopIdleWatch(context: string): void {
    const removed = activeContexts.delete(context);
    if (removed) {
      console.log("[StallDetector] Stopped idle watch:", {
        context,
        timestamp: new Date().toISOString(),
      });
      logger.logDebug("StallDetector: stopped idle watch", { context });
    }

    // If no more contexts, we could stop polling, but keep it running
    // in case new contexts are added soon
  }

  /**
   * Mark a context as closed (stops watching and resets)
   */
  function markContextClosed(context: string): void {
    stopIdleWatch(context);
    onMeaningfulActivity(); // Reset global timer
    logger.logDebug("StallDetector: context marked as closed", { context });
  }
  
  return {
    name: "StallDetector",
    init,
    destroy,
    startIdleWatch,
    stopIdleWatch,
    markContextClosed,
  };
}

