/**
 * Types Module
 * 
 * Centralized TypeScript type definitions for the SDK.
 * 
 * @module types
 */

// Re-export all types
export * from './events';
export * from './friction';
// Export decisions types (but not NudgeDecision to avoid conflict)
export type { WireNudgeDecision, TemplateId } from './decisions';
export * from './config';
export * from './session';
export * from './security';
// Re-export UI decision types (UI-facing NudgeDecision takes precedence)
export { 
  mapWireToUI,
  type UINudgeDecision,
  type NudgeDecision, // UI-facing type (takes precedence over wire type)
  type NudgeTemplateId,
  type NudgeSeverity
} from './uiDecision';

