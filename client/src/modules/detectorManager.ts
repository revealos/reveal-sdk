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
import type { Logger } from "../utils/logger";
import { createStallDetector, type StallDetector, type IdleWatchConfig } from "../detectors/stallDetector";

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

  // Feature flag: allow disabling friction tracking entirely from config
  const frictionEnabled = (config as any).features?.enableFrictionTracking ?? true;
  if (!frictionEnabled) {
    logger.logDebug("DetectorManager: friction tracking disabled via config");
    return {
      initDetectors() {},
      destroy() {},
      startIdleWatch() {},
      stopIdleWatch() {},
      markContextClosed() {},
    };
  }

  // Shared helper to emit FrictionSignal
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

  // Instantiate concrete detectors
  const stallDetector = createStallDetector({
    win,
    doc,
    logger,
    emit: emitFrictionSignal,
  });

  // TODO: Create other detectors when implemented
  // const rageClickDetector = createRageClickDetector({...});
  // const backtrackDetector = createBacktrackDetector({...});

  const detectors: BaseDetector[] = [stallDetector];

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
    stallDetector.startIdleWatch(config);
  }

  function stopIdleWatch(context: string): void {
    stallDetector.stopIdleWatch(context);
  }

  function markContextClosed(context: string): void {
    stallDetector.markContextClosed(context);
  }
  
  return {
    initDetectors,
    destroy,
    startIdleWatch,
    stopIdleWatch,
    markContextClosed,
  };
}

