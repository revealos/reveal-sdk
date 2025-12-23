/**
 * OverlayManager Component
 *
 * React adapter for reveal-overlay-manager Web Component.
 * This is a thin wrapper that maps React props to Web Component properties/attributes.
 *
 * ALL UI logic lives in @reveal/overlay-wc - this component only handles:
 * - React portal management
 * - Props → Web Component properties/attributes mapping
 * - CustomEvents → React callback props
 *
 * @module components/OverlayManager
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { NudgeDecision } from "@reveal/overlay-wc";
import "@reveal/overlay-wc"; // Side-effect import to register Web Components

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
   */
  onTrack?: (kind: string, name: string, payload?: Record<string, any>) => void;

  /**
   * Show quadrant visualization overlays (default: false).
   * Set to true to show the transparent quadrant overlays for debugging.
   */
  showQuadrants?: boolean;
}

/**
 * OverlayManager - React wrapper for reveal-overlay-manager Web Component
 */
export const OverlayManager: React.FC<OverlayManagerProps> = ({
  decision,
  onDismiss,
  onActionClick,
  onTrack,
  showQuadrants = false,
}) => {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const wcRef = useRef<HTMLElement | null>(null);

  // Create portal container on mount
  useEffect(() => {
    let container = document.getElementById("reveal-overlay-root");
    if (!container) {
      container = document.createElement("div");
      container.id = "reveal-overlay-root";
      container.style.position = "fixed";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.pointerEvents = "auto"; // Allow events to reach tooltip buttons
      container.style.zIndex = "9999";
      document.body.appendChild(container);
    }
    setPortalContainer(container);

    return () => {
      // Cleanup: only remove if we created it and it's empty
      if (container && container.childElementCount === 0) {
        container.remove();
      }
    };
  }, []);

  // Sync decision property to Web Component
  useEffect(() => {
    if (wcRef.current) {
      (wcRef.current as any).decision = decision;
    }
  }, [decision]);

  // Attach event listeners to Web Component
  useEffect(() => {
    const wc = wcRef.current;
    if (!wc) return;

    const handleDismiss = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      onDismiss?.(detail.id);
    };

    const handleActionClick = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      onActionClick?.(detail.id);
    };

    const handleShown = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      onTrack?.("nudge", "nudge_shown", { nudgeId: detail.id });
    };

    wc.addEventListener("reveal:dismiss", handleDismiss);
    wc.addEventListener("reveal:action-click", handleActionClick);
    wc.addEventListener("reveal:shown", handleShown);

    return () => {
      wc.removeEventListener("reveal:dismiss", handleDismiss);
      wc.removeEventListener("reveal:action-click", handleActionClick);
      wc.removeEventListener("reveal:shown", handleShown);
    };
  }, [onDismiss, onActionClick, onTrack]);

  if (!portalContainer) return null;

  return createPortal(
    <reveal-overlay-manager
      ref={wcRef}
      show-quadrants={showQuadrants ? "" : undefined}
    />,
    portalContainer
  );
};
