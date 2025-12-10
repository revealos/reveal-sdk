/**
 * Decision Types
 * 
 * Type definitions for nudge decisions.
 * 
 * @module types/decisions
 */

/**
 * Template ID enumeration
 */
export type TemplateId =
  | "tooltip"
  | "modal"
  | "banner"
  | "spotlight"
  | "inline_hint";

/**
 * Quadrant positioning options for overlays
 */
export type NudgeQuadrant =
  | "topLeft"
  | "topCenter"
  | "topRight"
  | "bottomLeft"
  | "bottomCenter"
  | "bottomRight";

/**
 * Wire-level NudgeDecision (canonical shape between engine and SDK)
 */
export interface WireNudgeDecision {
  nudgeId: string;
  templateId: TemplateId;
  title?: string;
  body?: string;
  ctaText?: string;
  slotId?: string; // Deprecated: kept for backward compatibility
  quadrant?: NudgeQuadrant; // Viewport quadrant for positioning (defaults to "topCenter")
  frictionType?: "stall" | "rageclick" | "backtrack";
  expiresAt?: string; // ISO string
  extra?: Record<string, string | number | boolean | null>;
}

/**
 * SDK NudgeDecision type (alias for WireNudgeDecision)
 * 
 * Note: This is the wire-level format. For UI-facing decisions used by React hooks,
 * use UINudgeDecision or NudgeDecision from './uiDecision' instead.
 */
export type NudgeDecision = WireNudgeDecision;

