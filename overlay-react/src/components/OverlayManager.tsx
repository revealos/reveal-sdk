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

  // Use refs to avoid re-attaching listeners when callbacks change
  const onDismissRef = useRef(onDismiss);
  const onActionClickRef = useRef(onActionClick);
  const onTrackRef = useRef(onTrack);

  // Keep callback refs up to date
  useEffect(() => {
    onDismissRef.current = onDismiss;
    onActionClickRef.current = onActionClick;
    onTrackRef.current = onTrack;
  });

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
      container.style.pointerEvents = "none"; // Let clicks pass through to harness app
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

  // Attach listeners when portal container is ready
  useEffect(() => {
    if (!portalContainer) return;

    // Portal renders async, so we need to wait for the WC ref to be assigned
    // Use requestAnimationFrame to wait until after the next paint
    const rafId = requestAnimationFrame(() => {
      const wc = wcRef.current;
      if (!wc) return;

      const handleDismiss = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        onDismissRef.current?.(detail.id);
      };

      const handleActionClick = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        onActionClickRef.current?.(detail.id);
      };

      const handleShown = (e: Event) => {
        const detail = (e as CustomEvent).detail;
        onTrackRef.current?.("nudge", "nudge_shown", { nudgeId: detail.id });
      };

      wc.addEventListener("reveal:dismiss", handleDismiss);
      wc.addEventListener("reveal:action-click", handleActionClick);
      wc.addEventListener("reveal:shown", handleShown);

      // Store cleanup function
      (wc as any)._cleanupListeners = () => {
        wc.removeEventListener("reveal:dismiss", handleDismiss);
        wc.removeEventListener("reveal:action-click", handleActionClick);
        wc.removeEventListener("reveal:shown", handleShown);
      };
    });

    return () => {
      cancelAnimationFrame(rafId);
      const wc = wcRef.current;
      if (wc && (wc as any)._cleanupListeners) {
        (wc as any)._cleanupListeners();
      }
    };
  }, [portalContainer]); // Attach once when portal is ready

  // Separate effect: sync decision to Web Component
  // Depends on both decision AND portalContainer to ensure ref is assigned before syncing
  useEffect(() => {
    const wc = wcRef.current;
    if (!wc) return;

    if (decision) {
      const wcDecision = {
        ...decision,
        nudgeId: (decision as any).id || (decision as any).nudgeId,
      };
      (wc as any).decision = wcDecision;
    } else {
      (wc as any).decision = null;
    }
  }, [decision, portalContainer]);

  if (!portalContainer) return null;

  return createPortal(
    <reveal-overlay-manager
      ref={wcRef}
      show-quadrants={showQuadrants ? "" : undefined}
    />,
    portalContainer
  );
};
