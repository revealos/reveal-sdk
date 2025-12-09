/**
 * OverlayManager Component
 * 
 * Main host component that renders the appropriate nudge template
 * based on the current NudgeDecision. Acts as the single entry point
 * for rendering nudges in a React app.
 * 
 * SECURITY: XSS Prevention
 * 
 * This component renders nudge content from backend decisions. All content
 * is treated as plain text and rendered via React's text node rendering
 * (e.g., <p>{decision.body}</p>). No HTML injection is possible because:
 * 
 * 1. Backend sends only plain string fields (title, body, ctaText) in WireNudgeDecision
 * 2. React automatically escapes all text content when rendering via JSX
 * 3. No dangerouslySetInnerHTML is used anywhere in the overlay package
 * 4. No eval() or Function() calls exist in the overlay package
 * 5. All template components render content as React props, not HTML strings
 * 
 * This ensures that even if the backend is compromised, no executable
 * code can be injected into the host application. The worst-case scenario
 * is incorrect text content being displayed, which cannot execute code.
 * 
 * @module components/OverlayManager
 */

"use client";

/* @refresh reset */
import React, { memo } from "react";
import type { NudgeDecision } from "../types/NudgeDecision";
import { useNudgeVisibility } from "../hooks/useNudgeVisibility";
import { useTargetRect } from "../hooks/useTargetRect";
import { useTrackNudgeShown } from "../hooks/useTrackNudgeShown";
import { TooltipNudge } from "./templates/TooltipNudge";

export interface OverlayManagerProps {
  /** Current nudge decision to render, or null if no active nudge */
  decision: NudgeDecision | null;

  /**
   * Called when a nudge is dismissed (either by user or auto-dismiss).
   * Receives the nudge id.
   */
  onDismiss?: (id: string) => void;

  /**
   * Called when the nudge's primary action is clicked.
   * Receives the nudge id.
   */
  onActionClick?: (id: string) => void;

  /**
   * Optional callback for tracking events (e.g., Reveal.track).
   * If provided, will be passed to useTrackNudgeShown for automatic tracking.
   */
  onTrack?: (kind: string, name: string, payload?: Record<string, any>) => void;
}

/**
 * Main host component that renders the appropriate nudge template
 * based on the current NudgeDecision.
 */
export const OverlayManager = memo(function OverlayManager(
  props: OverlayManagerProps
): React.ReactElement | null {
  const { decision, onDismiss, onActionClick, onTrack } = props;

  // ✅ ALL HOOKS MUST BE CALLED UNCONDITIONALLY FIRST (Rules of Hooks)
  // This prevents React 19 Fast Refresh "Expected static flag was missing" errors
  
  // Track nudge_shown (handles null gracefully)
  useTrackNudgeShown(decision?.id || null, onTrack);

  // Compute target rect (handles null gracefully)
  const targetRect = useTargetRect(decision?.targetId || null);

  // Manage visibility + auto-dismiss (now handles null gracefully)
  const { isVisible, handleManualDismiss } = useNudgeVisibility({
    decision,
    onDismiss,
  });

  // NOW check conditions AFTER all hooks are called
  if (!decision) {
    return null;
  }

  // If not visible (auto-dismissed or manually dismissed), render nothing
  if (!isVisible) {
    return null;
  }

  // Wrap dismiss handler - TooltipNudge expects (id: string) => void
  const handleDismiss = (id: string) => {
    // Verify id matches (safety check)
    if (id === decision.id) {
      handleManualDismiss(); // will call onDismiss(decision.id) internally
    }
  };

  // Wrap action click handler - TooltipNudge expects (id: string) => void
  const handleActionClick = (id: string) => {
    // Verify id matches (safety check)
    if (id === decision.id && onActionClick) {
      onActionClick(decision.id);
    }
  };

  // Delegate to specific template based on templateId
  switch (decision.templateId) {
    case "tooltip":
      return (
        <TooltipNudge
          decision={decision}
          targetRect={targetRect}
          onDismiss={handleDismiss}
          onActionClick={handleActionClick}
          onTrack={onTrack}
        />
      );

    case "spotlight":
      // TODO: Implement SpotlightNudge
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[OverlayManager] SpotlightNudge not yet implemented"
        );
      }
      return null;

    case "banner":
      // TODO: Implement BannerNudge
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[OverlayManager] BannerNudge not yet implemented"
        );
      }
      return null;

    case "inline_hint":
      // TODO: Implement InlineHint
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[OverlayManager] InlineHint not yet implemented"
        );
      }
      return null;

    case "modal":
      // TODO: Implement ModalNudge
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[OverlayManager] ModalNudge not yet implemented"
        );
      }
      return null;

    // Unknown templateId → fail gracefully
    default:
      // Optionally log in dev, but don't throw
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[OverlayManager] Unknown templateId:",
          decision.templateId
        );
      }
      return null;
  }
});

