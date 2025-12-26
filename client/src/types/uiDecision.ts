/**
 * UI Decision Types
 * 
 * Type definitions for UI-facing nudge decisions and mapping utilities.
 * These types are used by the SDK's React hooks and can be used by host apps.
 * 
 * @module types/uiDecision
 */

import type { WireNudgeDecision } from "./decisions";

/**
 * Template identifiers supported by nudge rendering
 */
export type NudgeTemplateId =
  | "spotlight"
  | "banner"
  | "tooltip"
  | "inline_hint"
  | "modal";

/**
 * Optional severity to vary styling
 */
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
 * This is the shape used by React hooks and UI components.
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
   * CSS selector for target element (used by spotlight template to locate DOM element).
   */
  selectorPattern?: string;

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
 * UI components.
 * 
 * @param wire - The wire-level decision from SDK/backend
 * @param options - Optional UI-specific overrides
 * @returns UI-facing decision ready for UI components
 * 
 * @example
 * ```ts
 * const wireDecision = await Reveal.onNudgeDecision(...);
 * const uiDecision = mapWireToUI(wireDecision);
 * // Use uiDecision with OverlayManager or other UI components
 * ```
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
    selectorPattern: wire.selectorPattern,
    severity: options?.severity,
    targetId: options?.targetId ?? wire.slotId ?? null,
    quadrant: options?.quadrant ?? wire.quadrant ?? "topCenter",
    dismissible: options?.dismissible ?? true,
    autoDismissMs: options?.autoDismissMs ?? null,
    debugCode: wire.debugCode,
    extra: wire.extra,
  };
}

/**
 * Convenience alias for external imports.
 * In most places we just want NudgeDecision, not UINudgeDecision.
 */
export type NudgeDecision = UINudgeDecision;

