/**
 * RageClickDetector
 *
 * Detects rapid, repeated clicks on the same element (user frustration).
 *
 * Logic:
 * - Tracks click events on elements
 * - Counts clicks within time window (e.g., 4 clicks in 900ms)
 * - Emits FrictionSignal with type "rageclick"
 * - Excludes clicks on Reveal overlay components
 *
 * @module detectors/rageClickDetector
 */

import type { FrictionType } from "../types/friction";
import type { Logger } from "../utils/logger";

/**
 * Default configuration for rage click detection
 */
const DEFAULT_RAGE_CONFIG = {
  minClicks: 4,              // Minimum clicks to trigger
  windowMs: 900,             // Time window (900ms)
  maxTargetDriftPx: 24,      // Max drift between clicks (same target)
  minInterClickMs: 30,       // Ignore ultra-fast duplicates
  cooldownMs: 2000,          // Per-target cooldown after emit
  maxPositions: 5,           // Limit stored positions to prevent memory bloat
};

/**
 * RageClickDetector options
 */
export interface RageClickDetectorOptions {
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
 * RageClickDetector interface
 */
export interface RageClickDetector {
  name: string;
  init(): void;
  destroy(): void;
}

/**
 * Internal click state per target
 */
interface ClickState {
  targetKey: string;
  selectorPattern: string | null;
  clicks: Array<{ ts: number; x: number; y: number }>;
  lastEmitTs: number;
  hasFired: boolean;
}

/**
 * Create a new RageClickDetector instance
 *
 * @param options - Configuration options
 * @returns RageClickDetector instance
 */
export function createRageClickDetector(
  options: RageClickDetectorOptions
): RageClickDetector {
  const {
    win = typeof window !== "undefined" ? window : undefined,
    doc = typeof document !== "undefined" ? document : undefined,
    logger,
    emit,
  } = options;

  // State
  const clickStates = new Map<string, ClickState>();
  let clickHandler: ((e: MouseEvent) => void) | null = null;

  /**
   * Generate deterministic target key without requiring new DOM attributes
   * Priority: element.id → data-testid (opportunistic) → role+aria → domPath fallback
   */
  function generateTargetKey(element: Element): string {
    // Priority 1: element.id
    if (element.id) {
      return `id:${element.id}`;
    }

    // Priority 2: data-testid (opportunistic, best-effort)
    const testId = element.getAttribute("data-testid");
    if (testId) {
      return `testid:${testId}`;
    }

    // Priority 3: accessible signature (role + aria)
    const role = element.getAttribute("role");
    const ariaLabel = element.getAttribute("aria-label");
    const ariaName = element.getAttribute("aria-name");
    const tagName = element.tagName?.toLowerCase();

    if (role && (ariaLabel || ariaName)) {
      const label = (ariaLabel || ariaName || "").slice(0, 32); // Truncate
      return `${role}:${label}`;
    }

    if ((tagName === "button" || tagName === "input") && ariaLabel) {
      const label = ariaLabel.slice(0, 32);
      return `${tagName}:${label}`;
    }

    // Priority 4: Fallback domPath (UNSTABLE, depth-limited)
    return generateDomPath(element);
  }

  /**
   * Generate lightweight domPath index signature (unstable identifier)
   */
  function generateDomPath(element: Element): string {
    const path: string[] = [];
    let current: Element | null = element;

    while (current && path.length < 4) {
      const tag = current.tagName?.toLowerCase();
      const siblings = current.parentElement?.children || [];
      const index = Array.from(siblings).indexOf(current);
      path.unshift(`${tag}[${index}]`);
      current = current.parentElement;
    }

    return `path:${path.join(">")}`;
  }

  /**
   * Generate honest CSS selector (must be queryable or null)
   * NEVER put domPath strings into selector field
   */
  function generateSelector(element: Element): string | null {
    // element.id → valid CSS selector
    if (element.id) {
      return `#${element.id}`;
    }

    // data-testid → valid CSS selector (opportunistic)
    const testId = element.getAttribute("data-testid");
    if (testId) {
      return `[data-testid="${testId}"]`;
    }

    // Otherwise: null (unstable identifiers go in extra.targetKey only)
    return null;
  }

  /**
   * Check if click is on Reveal overlay using composedPath
   * Pierces shadow DOM boundaries
   */
  function isRevealOverlayClick(event: MouseEvent): boolean {
    // Use composedPath to traverse shadow DOM
    const path = event.composedPath();

    for (const node of path) {
      // In test environment, mocks may be plain objects
      const el = node as any;
      if (!el || typeof el !== "object") continue;

      // Check for overlay root container
      if (el.id === "reveal-overlay-root") {
        return true;
      }

      // Check for reveal- web components
      const tagName = el.tagName?.toLowerCase?.();
      if (tagName && tagName.startsWith("reveal-")) {
        return true;
      }
    }

    return false;
  }

  /**
   * Calculate maximum drift between all click positions
   */
  function calculateMaxDrift(clicks: Array<{ x: number; y: number; ts: number }>): number {
    if (clicks.length < 2) return 0;

    let maxDrift = 0;
    for (let i = 0; i < clicks.length; i++) {
      for (let j = i + 1; j < clicks.length; j++) {
        const dx = clicks[i].x - clicks[j].x;
        const dy = clicks[i].y - clicks[j].y;
        const drift = Math.sqrt(dx * dx + dy * dy);
        maxDrift = Math.max(maxDrift, drift);
      }
    }
    return Math.round(maxDrift);
  }

  /**
   * Emit rageclick friction signal with summary properties (no arrays/objects for backend validation)
   */
  function emitRageClickSignal(
    state: ClickState,
    selector: string | null,
    driftPx: number
  ): void {
    const clicks = state.clicks;
    const interClickMs: number[] = [];
    for (let i = 1; i < clicks.length; i++) {
      interClickMs.push(clicks[i].ts - clicks[i - 1].ts);
    }

    // Compute interclick timing statistics (instead of raw array)
    const interClickStats = interClickMs.length > 0 ? {
      min: Math.min(...interClickMs),
      max: Math.max(...interClickMs),
      avg: Math.round(interClickMs.reduce((a, b) => a + b, 0) / interClickMs.length),
    } : { min: 0, max: 0, avg: 0 };

    const debugCode = `RC_${clicks.length}C_${DEFAULT_RAGE_CONFIG.windowMs}MS_${state.targetKey.slice(0, 8)}`;

    emit({
      type: "rageclick",
      pageUrl: win?.location?.href ?? null,
      selector: selector, // null or valid CSS selector only
      extra: {
        targetKey: state.targetKey,
        target_id: state.targetKey, // BACKWARD COMPAT: SDK docs mention target_id
        clickCount: clicks.length,
        windowMs: DEFAULT_RAGE_CONFIG.windowMs,
        // Flattened statistics (no arrays)
        interClickMs_min: interClickStats.min,
        interClickMs_max: interClickStats.max,
        interClickMs_avg: interClickStats.avg,
        positions_count: clicks.length,
        driftPx,
        debugCode,
      },
    });

    logger.logDebug("RageClickDetector: rage click signal emitted", {
      targetKey: state.targetKey,
      clickCount: clicks.length,
      driftPx,
      debugCode,
    });
  }

  /**
   * Handle click events
   */
  function handleClick(e: MouseEvent): void {
    try {
      const target = e.target as Element | null;
      if (!target) return;

      // Exclude overlay clicks using composedPath
      if (isRevealOverlayClick(e)) {
        return;
      }

      const targetKey = generateTargetKey(target);
      const selector = generateSelector(target);
      const now = Date.now();

      // Get or create state
      let state = clickStates.get(targetKey);
      if (!state) {
        state = {
          targetKey,
          selectorPattern: selector,
          clicks: [],
          lastEmitTs: 0,
          hasFired: false,
        };
        clickStates.set(targetKey, state);
      }

      // Check if cooldown has expired - reset hasFired if so
      if (state.hasFired && now - state.lastEmitTs >= DEFAULT_RAGE_CONFIG.cooldownMs) {
        state.hasFired = false;
      }

      // Reset if outside window (check span from first to last click)
      if (state.clicks.length > 0) {
        const firstClick = state.clicks[0];
        if (now - firstClick.ts > DEFAULT_RAGE_CONFIG.windowMs) {
          state.clicks = [];
          // hasFired is managed by cooldown expiry above
        }
      }

      // Check inter-click minimum
      if (state.clicks.length > 0) {
        const lastClick = state.clicks[state.clicks.length - 1];
        if (now - lastClick.ts < DEFAULT_RAGE_CONFIG.minInterClickMs) {
          return; // Ignore ultra-fast duplicate
        }
      }

      // Add click (limit to maxPositions to prevent memory bloat)
      state.clicks.push({ ts: now, x: e.clientX, y: e.clientY });
      if (state.clicks.length > DEFAULT_RAGE_CONFIG.maxPositions) {
        state.clicks.shift(); // Remove oldest
      }

      // Check drift
      const driftPx = calculateMaxDrift(state.clicks);
      if (driftPx > DEFAULT_RAGE_CONFIG.maxTargetDriftPx) {
        // Reset: clicks are on different elements
        state.clicks = [state.clicks[state.clicks.length - 1]]; // Keep only last
        return;
      }

      // Check threshold and cooldown
      if (state.clicks.length >= DEFAULT_RAGE_CONFIG.minClicks) {
        // Only emit if not in cooldown
        const inCooldown = state.hasFired && now - state.lastEmitTs < DEFAULT_RAGE_CONFIG.cooldownMs;
        if (!inCooldown) {
          emitRageClickSignal(state, selector, driftPx);
          state.hasFired = true;
          state.lastEmitTs = now;
        }
      }
    } catch (err: any) {
      logger.logError("RageClickDetector: error handling click", {
        error: err?.message || String(err),
      });
    }
  }

  /**
   * Initialize detector
   */
  function init(): void {
    if (!doc || clickHandler) {
      return; // Already initialized or no document
    }

    clickHandler = handleClick;
    doc.addEventListener("click", clickHandler, true); // Capture phase

    logger.logDebug("RageClickDetector: initialized");
  }

  /**
   * Destroy detector
   */
  function destroy(): void {
    if (!doc || !clickHandler) {
      return;
    }

    doc.removeEventListener("click", clickHandler, true);
    clickHandler = null;
    clickStates.clear();

    logger.logDebug("RageClickDetector: destroyed");
  }

  return {
    name: "RageClickDetector",
    init,
    destroy,
  };
}
