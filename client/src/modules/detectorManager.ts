/**
 * DetectorManager Module
 * 
 * Orchestrates friction detection by managing individual detectors.
 * 
 * Responsibilities:
 * - Initialize and manage detectors (Stall, RageClick, Backtrack)
 * - Listen to browser events and user interactions
 * - Emit FrictionSignal when patterns are detected
 * - Coordinate detector lifecycle
 * 
 * Note: DetectorManager is "dumb but observant" - it detects patterns
 * but does NOT decide what should happen next beyond raising the signal.
 * 
 * @module modules/detectorManager
 */

import type { FrictionSignal, FrictionType } from "../types/friction";
import type { ClientConfig } from "../types/config";
import { DEFAULT_FEATURES } from "../types/config";
import type { Logger } from "../utils/logger";
import { createStallDetector, type StallDetector, type IdleWatchConfig } from "../detectors/stallDetector";
import { createRageClickDetector, type RageClickDetector } from "../detectors/rageClickDetector";
import { createBacktrackDetector, type BacktrackDetector } from "../detectors/backtrackDetector";

/**
 * Base detector interface (internal)
 */
interface BaseDetector {
  name: string;
  init(): void;
  destroy(): void;
}

/**
 * DetectorManager options
 */
export interface DetectorManagerOptions {
  logger: Logger;
  config: ClientConfig;
  onFrictionSignal: (signal: FrictionSignal) => void;
  win?: Window;
  doc?: Document;
}

/**
 * DetectorManager interface
 */
export interface DetectorManager {
  initDetectors(): void;
  destroy(): void;
  startIdleWatch(config: IdleWatchConfig): void;
  stopIdleWatch(context: string): void;
  markContextClosed(context: string): void;
}

/**
 * Create a new DetectorManager instance
 * 
 * @param options - Configuration options
 * @returns DetectorManager instance
 */
export function createDetectorManager(
  options: DetectorManagerOptions
): DetectorManager {
  const {
    logger,
    config,
    onFrictionSignal,
    win = typeof window !== "undefined" ? window : undefined,
    doc = typeof document !== "undefined" ? document : undefined,
  } = options;

  // If we're not in a browser, detectors are effectively no-ops
  if (!win || !doc) {
    logger.logDebug("DetectorManager: no window/document, detectors disabled");
    return {
      initDetectors() {
        // noop
      },
      destroy() {
        // noop
      },
      startIdleWatch() {
        // noop
      },
      stopIdleWatch() {
        // noop
      },
      markContextClosed() {
        // noop
      },
    };
  }

  // Check feature flags (global + per-detector)
  const features = config.features || DEFAULT_FEATURES;
  const globalEnabled = features.enabled ?? true;

  if (!globalEnabled) {
    logger.logDebug("DetectorManager: all friction tracking disabled");
    return {
      initDetectors() {},
      destroy() {},
      startIdleWatch() {},
      stopIdleWatch() {},
      markContextClosed() {},
    };
  }

  const detectorFlags = features.detectors || DEFAULT_FEATURES.detectors;

  // Shared helper to emit FrictionSignal
  // Detectors should populate semantic IDs in extra:
  // - For "stall": stall_ms (number) - stall duration in milliseconds
  // - For "rageclick": target_id (string) - stable target identifier
  // - For "backtrack": from_view (string), to_view (string) - view identifiers
  function emitFrictionSignal(partial: {
    type: FrictionType;
    pageUrl?: string | null;
    selector?: string | null;
    extra?: Record<string, any>;
  }) {
    try {
      const now = Date.now();
      const pageUrl = partial.pageUrl ?? (win?.location?.href ?? "");
      const selector = partial.selector ?? null;

      const signal: FrictionSignal = {
        type: partial.type,
        pageUrl,
        selector,
        timestamp: now,
        extra: partial.extra ?? {},
      };

      onFrictionSignal(signal);
    } catch (err: any) {
      logger.logError("DetectorManager: failed to emit friction signal", {
        error: err?.message || String(err),
      });
    }
  }

  // Conditionally instantiate detectors based on feature flags
  const detectors: BaseDetector[] = [];
  let stallDetector: StallDetector | null = null;

  if (detectorFlags.stall ?? true) {
    stallDetector = createStallDetector({
      win,
      doc,
      logger,
      emit: emitFrictionSignal,
    });
    detectors.push(stallDetector);
  }

  if (detectorFlags.rageclick ?? true) {
    const rageClickDetector = createRageClickDetector({
      win,
      doc,
      logger,
      emit: emitFrictionSignal,
    });
    detectors.push(rageClickDetector);
  }

  if (detectorFlags.backtrack ?? true) {
    const backtrackDetector = createBacktrackDetector({
      win,
      doc,
      logger,
      emit: emitFrictionSignal,
    });
    detectors.push(backtrackDetector);
  }

  function initDetectors() {
    detectors.forEach((d) => {
      try {
        d.init();
      } catch (err: any) {
        logger.logError("DetectorManager: detector init failed", {
          detector: d.name,
          error: err?.message || String(err),
        });
      }
    });
  }

  function destroy() {
    detectors.forEach((d) => {
      try {
        d.destroy();
      } catch (err: any) {
        logger.logError("DetectorManager: detector destroy failed", {
          detector: d.name,
          error: err?.message || String(err),
        });
      }
    });
  }

  function startIdleWatch(config: IdleWatchConfig): void {
    if (stallDetector) {
      stallDetector.startIdleWatch(config);
    }
  }

  function stopIdleWatch(context: string): void {
    if (stallDetector) {
      stallDetector.stopIdleWatch(context);
    }
  }

  function markContextClosed(context: string): void {
    if (stallDetector) {
      stallDetector.markContextClosed(context);
    }
  }
  
  return {
    initDetectors,
    destroy,
    startIdleWatch,
    stopIdleWatch,
    markContextClosed,
  };
}

