// packages/overlay-react/src/types/NudgeDecision.ts

/**
 * Wire-level NudgeDecision (from SDK/backend)
 * This is the canonical shape used between engine and SDK.
 * 
 * Note: This type is also defined in @reveal/client for consistency.
 * Overlay-react keeps its own copy to maintain independence.
 */
export interface WireNudgeDecision {
  nudgeId: string;
  templateId: "tooltip" | "modal" | "banner" | "spotlight" | "inline_hint";
  title?: string;
  body?: string;
  ctaText?: string;
  slotId?: string; // Deprecated: kept for backward compatibility
  quadrant?: NudgeQuadrant; // Viewport quadrant for positioning (defaults to "topCenter")
  frictionType?: "stall" | "rageclick" | "backtrack";
  debugCode?: string; // Debug code for tracing decision (6-8 chars, e.g., "X4368DGE")
  expiresAt?: string; // ISO string
  extra?: Record<string, string | number | boolean | null>;
}

// Template identifiers supported by the nudge library
export type NudgeTemplateId =
  | "spotlight"
  | "banner"
  | "tooltip"
  | "inline_hint"
  | "modal";

// Optional severity to vary styling
export type NudgeSeverity = "info" | "success" | "warning" | "danger";

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
 * UI-facing nudge decision.
 * This is the shape used internally by the overlay-react package.
 * It is derived from WireNudgeDecision via the mapWireToUI function.
 */
export interface UINudgeDecision {
  /** Stable identifier for this specific nudge instance */
  id: string;

  /** Template to use for rendering in the nudge library */
  templateId: NudgeTemplateId;

  /** Main heading text for the nudge (optional) */
  title?: string;

  /** Body / explanation text (optional) */
  body?: string;

  /** Label for the primary call-to-action button (optional) */
  ctaText?: string;

  /** Optional severity used to tweak colours / emphasis */
  severity?: NudgeSeverity;

  /**
   * Optional DOM target identifier.
   * Deprecated: kept for backward compatibility but no longer used for positioning.
   */
  targetId?: string | null;

  /**
   * Viewport quadrant for positioning the nudge.
   * Defaults to "topCenter" if not specified.
   */
  quadrant?: NudgeQuadrant;

  /**
   * Whether the user is allowed to dismiss this nudge manually.
   * If false, templates may hide the close button.
   */
  dismissible?: boolean;

  /**
   * Auto-dismiss timeout in milliseconds.
   * When set, useNudgeVisibility will hide the nudge after this duration
   * and call onDismiss if provided.
   */
  autoDismissMs?: number | null;

  /**
   * Debug code for tracing decision (6-8 chars, e.g., "X4368DGE").
   * Optional field for debugging and support.
   */
  debugCode?: string;

  /**
   * Arbitrary extra metadata that templates or host may use.
   * Must remain JSON-serialisable.
   */
  extra?: Record<string, string | number | boolean | null>;
}

/**
 * Maps a wire-level NudgeDecision (from SDK/backend) to a UI-facing NudgeDecision.
 * 
 * This function is the single boundary between the wire format and the UI format.
 * It should be called when receiving a decision from the SDK before passing it to
 * the overlay-react components.
 * 
 * Note: This function is also defined in @reveal/client for use by React hooks.
 * Overlay-react keeps its own copy to maintain independence. Both implementations
 * must remain identical to prevent drift.
 * 
 * @param wire - The wire-level decision from SDK/backend
 * @param options - Optional UI-specific overrides
 * @returns UI-facing decision ready for overlay-react components
 */
export function mapWireToUI(
  wire: WireNudgeDecision,
  options?: {
    severity?: NudgeSeverity;
    targetId?: string | null;
    quadrant?: NudgeQuadrant;
    dismissible?: boolean;
    autoDismissMs?: number | null;
  }
): UINudgeDecision {
  return {
    id: wire.nudgeId,
    templateId: wire.templateId,
    title: wire.title,
    body: wire.body,
    ctaText: wire.ctaText,
    severity: options?.severity,
    targetId: options?.targetId ?? wire.slotId ?? null,
    quadrant: options?.quadrant ?? wire.quadrant ?? "topCenter",
    dismissible: options?.dismissible ?? true,
    autoDismissMs: options?.autoDismissMs ?? null,
    debugCode: wire.debugCode,
    extra: wire.extra,
  };
}

// Convenience alias for external imports.
// In most places we just want NudgeDecision, not UINudgeDecision.
export type NudgeDecision = UINudgeDecision;

