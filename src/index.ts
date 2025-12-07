/**
 * Reveal SDK
 * 
 * Main entry point for the Reveal SDK.
 * Provides the public API surface for host applications.
 * 
 * @module index
 */

// Import from entryPoint
import { init, track, onNudgeDecision, destroy, startIdleWatch, stopIdleWatch, markContextClosed } from './core/entryPoint';

// Re-export types
export * from './types';

// Re-export React hooks (optional - requires React peer dependency)
export { useNudgeDecision } from './hooks/useNudgeDecision';
export type { UseNudgeDecisionResult } from './hooks/useNudgeDecision';

// Public API
export const Reveal = {
  init,
  track,
  onNudgeDecision,
  destroy,
  startIdleWatch,
  stopIdleWatch,
  markContextClosed,
};
