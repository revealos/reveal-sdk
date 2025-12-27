/**
 * BacktrackDetector
 *
 * Detects when user navigates backward to immediately previous route (A→B→A pattern),
 * indicating potential confusion or lost state.
 *
 * Logic:
 * - Tracks navigation history via popstate, hashchange, and History API
 * - Detects A→B→A pattern (return to route from 2 entries ago)
 * - Emits FrictionSignal with type "backtrack"
 * - 30s recency window, 10s cooldown
 * - Route identity: pathname-only (strips search params and hash)
 *
 * @module detectors/backtrackDetector
 */

import type { FrictionType } from "../types/friction";
import type { Logger } from "../utils/logger";

/**
 * Default configuration for backtrack detection
 */
const DEFAULT_BACKTRACK_CONFIG = {
  recentWindowMs: 30000, // 30s window to consider route "recent"
  cooldownMs: 10000, // 10s cooldown between backtrack emissions
  maxStack: 20, // Max route stack size (memory limit)
};

/**
 * BacktrackDetector options
 */
export interface BacktrackDetectorOptions {
  win?: Window;
  doc?: Document; // Kept for signature consistency, not used at runtime
  logger: Logger;
  emit: (signal: {
    type: FrictionType;
    pageUrl?: string | null;
    selector?: string | null;
    extra?: Record<string, any>;
  }) => void;
}

/**
 * BacktrackDetector interface
 */
export interface BacktrackDetector {
  name: string;
  init(): void;
  destroy(): void;
}

/**
 * Internal route entry
 */
interface RouteEntry {
  url: string; // Full URL
  routeKey: string; // Pathname only (normalized)
  ts: number; // Timestamp
}

/**
 * Create a new BacktrackDetector instance
 *
 * @param options - Configuration options
 * @returns BacktrackDetector instance
 */
export function createBacktrackDetector(
  options: BacktrackDetectorOptions
): BacktrackDetector {
  const {
    win = typeof window !== "undefined" ? window : undefined,
    logger,
    emit,
  } = options;

  // State
  const routeStack: RouteEntry[] = [];
  let lastEmitTs = 0;

  // Original history methods (for restoration on destroy)
  let originalPushState: typeof history.pushState | null = null;
  let originalReplaceState: typeof history.replaceState | null = null;

  // Event handlers (for cleanup)
  let popstateHandler: ((e: PopStateEvent) => void) | null = null;
  let hashchangeHandler: ((e: HashChangeEvent) => void) | null = null;

  /**
   * Normalize URL to pathname-only route key
   * - Keep leading slash
   * - Remove trailing slash (except root "/")
   * - Strip search params and hash
   * - Handle malformed URLs safely
   */
  function normalizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      let pathname = urlObj.pathname;

      // Remove trailing slash except for root
      if (pathname !== "/" && pathname.endsWith("/")) {
        pathname = pathname.slice(0, -1);
      }

      return pathname;
    } catch (err) {
      // Malformed URL - attempt to extract pathname manually
      logger.logWarn("BacktrackDetector: malformed URL", { url, error: String(err) });

      // Fallback: try to extract path manually
      try {
        const pathMatch = url.match(/^[^:]+:\/\/[^/]+(\/[^?#]*)/);
        if (pathMatch && pathMatch[1]) {
          let pathname = pathMatch[1];
          if (pathname !== "/" && pathname.endsWith("/")) {
            pathname = pathname.slice(0, -1);
          }
          return pathname;
        }
      } catch {
        // Final fallback
        return "/";
      }

      return "/";
    }
  }

  /**
   * Add route to stack with size limit
   */
  function addRouteToStack(url: string, method: string): void {
    const routeKey = normalizeUrl(url);
    const entry: RouteEntry = {
      url,
      routeKey,
      ts: Date.now(),
    };

    routeStack.push(entry);

    // Limit stack size (shift oldest if exceeds max)
    if (routeStack.length > DEFAULT_BACKTRACK_CONFIG.maxStack) {
      routeStack.shift();
    }

    logger.logDebug("BacktrackDetector: route added", {
      method,
      url,
      routeKey,
      stackSize: routeStack.length,
    });
  }

  /**
   * Detect A→B→A backtrack pattern
   * Checks if current route matches routeStack[-2] (prev2)
   */
  function detectBacktrack(
    currentUrl: string,
    method: string
  ): { detected: boolean; fromEntry?: RouteEntry; stackDepth?: number } {
    const currentRouteKey = normalizeUrl(currentUrl);
    const now = Date.now();

    // Need at least 2 entries to detect A→B→A pattern
    if (routeStack.length < 2) {
      return { detected: false };
    }

    const prev1 = routeStack[routeStack.length - 1]; // Most recent (B)
    const prev2 = routeStack[routeStack.length - 2]; // Two entries ago (A)

    // Skip if same as most recent route (same-route navigation)
    if (currentRouteKey === prev1.routeKey) {
      logger.logDebug("BacktrackDetector: skipping same-route navigation", {
        currentRouteKey,
        prev1RouteKey: prev1.routeKey,
      });
      return { detected: false };
    }

    // Check A→B→A pattern: current matches prev2
    if (currentRouteKey === prev2.routeKey) {
      const deltaMs = now - prev2.ts;

      // Check recency window
      if (deltaMs > DEFAULT_BACKTRACK_CONFIG.recentWindowMs) {
        logger.logDebug("BacktrackDetector: match too old", {
          deltaMs,
          windowMs: DEFAULT_BACKTRACK_CONFIG.recentWindowMs,
        });
        return { detected: false };
      }

      // Check cooldown
      if (lastEmitTs > 0 && now - lastEmitTs < DEFAULT_BACKTRACK_CONFIG.cooldownMs) {
        logger.logDebug("BacktrackDetector: in cooldown", {
          timeSinceLastEmit: now - lastEmitTs,
          cooldownMs: DEFAULT_BACKTRACK_CONFIG.cooldownMs,
        });
        return { detected: false };
      }

      return {
        detected: true,
        fromEntry: prev1, // We went FROM prev1 (B) back TO current (A)
        stackDepth: 2,
      };
    }

    return { detected: false };
  }

  /**
   * Emit backtrack friction signal with flattened properties (no nested objects for backend validation)
   */
  function emitBacktrackSignal(
    from: RouteEntry,
    currentUrl: string,
    method: string,
    stackDepth: number
  ): void {
    const now = Date.now();
    const deltaMs = now - from.ts;
    const currentRouteKey = normalizeUrl(currentUrl);
    const debugCode = `BT_${method.toUpperCase()}_${stackDepth}D_${deltaMs}MS`;

    emit({
      type: "backtrack",
      pageUrl: currentUrl,
      selector: null, // Always null for backtrack
      extra: {
        // Backend compatibility keys (for existing scoring)
        from_view: from.routeKey,
        to_view: currentRouteKey,

        // Flattened evidence (primitives only for backend validation)
        from_url: from.url,
        from_path: from.routeKey,
        to_url: currentUrl,
        to_path: currentRouteKey,
        method: method, // "popstate" | "pushState" | "replaceState" | "hashchange"
        reason: "returned_to_recent_route",
        lastForwardTs: from.ts, // Timestamp when from_view was last visited
        deltaMs: deltaMs,
        stackDepth: stackDepth,
        debugCode: debugCode,
      },
    });

    lastEmitTs = now;
    logger.logDebug("BacktrackDetector: backtrack emitted", { debugCode });
  }

  /**
   * Handle navigation event
   */
  function handleNavigation(url: string, method: string): void {
    try {
      // Detect backtrack before adding to stack
      const detection = detectBacktrack(url, method);

      if (detection.detected && detection.fromEntry) {
        emitBacktrackSignal(detection.fromEntry, url, method, detection.stackDepth!);
      }

      // Always add current route to stack
      addRouteToStack(url, method);
    } catch (err: any) {
      logger.logError("BacktrackDetector: navigation handler error", {
        error: err?.message || String(err),
        url,
        method,
      });
    }
  }

  /**
   * Patch pushState to track SPA navigations
   */
  function patchPushState(): void {
    if (!win?.history) return;

    originalPushState = win.history.pushState.bind(win.history);

    win.history.pushState = function (state, title, url) {
      // Call original first
      originalPushState!.call(this, state, title, url);

      // Then track navigation using actual window.location.href
      // DO NOT rely on url argument (may be relative, null, etc.)
      handleNavigation(win!.location.href, "pushState");
    };
  }

  /**
   * Patch replaceState to track SPA navigations
   */
  function patchReplaceState(): void {
    if (!win?.history) return;

    originalReplaceState = win.history.replaceState.bind(win.history);

    win.history.replaceState = function (state, title, url) {
      // Call original first
      originalReplaceState!.call(this, state, title, url);

      // Then track navigation using actual window.location.href
      // DO NOT rely on url argument (may be relative, null, etc.)
      handleNavigation(win!.location.href, "replaceState");
    };
  }

  /**
   * Initialize detector
   */
  function init(): void {
    try {
      if (!win) {
        logger.logWarn("BacktrackDetector: window not available");
        return;
      }

      // Patch history methods
      patchPushState();
      patchReplaceState();

      // Attach event listeners (ALL on window, NOT document)
      popstateHandler = (e: PopStateEvent) => {
        const url = win?.location?.href;
        if (!url) return;
        handleNavigation(url, "popstate");
      };

      hashchangeHandler = (e: HashChangeEvent) => {
        const url = e.newURL || win?.location?.href;
        if (!url) return;
        handleNavigation(url, "hashchange");
      };

      win.addEventListener("popstate", popstateHandler, true);
      win.addEventListener("hashchange", hashchangeHandler, true);

      // Initialize stack with current route
      const currentUrl = win.location.href;
      addRouteToStack(currentUrl, "init");

      logger.logDebug("BacktrackDetector initialized");
    } catch (err: any) {
      logger.logError("BacktrackDetector: init error", {
        error: err?.message || String(err),
      });
    }
  }

  /**
   * Clean up and restore original state
   */
  function destroy(): void {
    try {
      // Restore original history methods
      if (win?.history && originalPushState) {
        win.history.pushState = originalPushState;
        originalPushState = null;
      }
      if (win?.history && originalReplaceState) {
        win.history.replaceState = originalReplaceState;
        originalReplaceState = null;
      }

      // Remove event listeners (from WINDOW)
      if (win && popstateHandler) {
        win.removeEventListener("popstate", popstateHandler, true);
        popstateHandler = null;
      }
      if (win && hashchangeHandler) {
        win.removeEventListener("hashchange", hashchangeHandler, true);
        hashchangeHandler = null;
      }

      // Clear state
      routeStack.length = 0;
      lastEmitTs = 0;

      logger.logDebug("BacktrackDetector destroyed");
    } catch (err: any) {
      logger.logError("BacktrackDetector: destroy error", {
        error: err?.message || String(err),
      });
    }
  }

  return {
    name: "BacktrackDetector",
    init,
    destroy,
  };
}
