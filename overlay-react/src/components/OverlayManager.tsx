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
import React, { memo, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import type { NudgeDecision } from "../types/NudgeDecision";
import { useNudgeVisibility } from "../hooks/useNudgeVisibility";
import { useTrackNudgeShown } from "../hooks/useTrackNudgeShown";
import { TooltipNudge } from "./templates/TooltipNudge";
import { DebugCode } from "./primitives/DebugCode";
import { Z_INDEX } from "../utils/constants";

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

  /**
   * Show quadrant visualization overlays (default: false).
   * Set to true to show the transparent quadrant overlays for debugging.
   */
  showQuadrants?: boolean;
}

/**
 * Main host component that renders the appropriate nudge template
 * based on the current NudgeDecision.
 */
/**
 * Get quadrant-specific background color for visual debugging (transparent)
 * Returns rgba color string for inline styles
 */
function getQuadrantBgColor(quadrant: string): string {
  switch (quadrant) {
    case "topLeft":
      return "rgba(59, 130, 246, 0.15)" // Blue with 15% opacity
    case "topCenter":
      return "rgba(34, 197, 94, 0.15)" // Green with 15% opacity
    case "topRight":
      return "rgba(168, 85, 247, 0.15)" // Purple with 15% opacity
    case "bottomLeft":
      return "rgba(249, 115, 22, 0.15)" // Orange with 15% opacity
    case "bottomCenter":
      return "rgba(236, 72, 153, 0.15)" // Pink with 15% opacity
    case "bottomRight":
      return "rgba(6, 182, 212, 0.15)" // Cyan with 15% opacity
    default:
      return "transparent"
  }
}

/**
 * Get quadrant bounds for rendering overlay
 * Each quadrant is exactly 1/3 of the viewport width
 */
function getQuadrantBounds(quadrant: string): { top: number; left: number; width: number; height: number } {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const quadrantWidth = viewportWidth / 3; // Each quadrant is 1/3 width

  switch (quadrant) {
    case "topLeft":
      return {
        top: 0,
        left: 0,
        width: quadrantWidth,
        height: viewportHeight / 2,
      };
    case "topCenter":
      return {
        top: 0,
        left: quadrantWidth,
        width: quadrantWidth,
        height: viewportHeight / 2,
      };
    case "topRight":
      return {
        top: 0,
        left: quadrantWidth * 2,
        width: quadrantWidth,
        height: viewportHeight / 2,
      };
    case "bottomLeft":
      return {
        top: viewportHeight / 2,
        left: 0,
        width: quadrantWidth,
        height: viewportHeight / 2,
      };
    case "bottomCenter":
      return {
        top: viewportHeight / 2,
        left: quadrantWidth,
        width: quadrantWidth,
        height: viewportHeight / 2,
      };
    case "bottomRight":
      return {
        top: viewportHeight / 2,
        left: quadrantWidth * 2,
        width: quadrantWidth,
        height: viewportHeight / 2,
      };
    default:
      return { top: 0, left: 0, width: 0, height: 0 };
  }
}

export const OverlayManager = memo(function OverlayManager(
  props: OverlayManagerProps
): React.ReactElement | null {
  const { decision, onDismiss, onActionClick, onTrack, showQuadrants = false } = props;

  // ✅ ALL HOOKS MUST BE CALLED UNCONDITIONALLY FIRST (Rules of Hooks)
  // This prevents React 19 Fast Refresh "Expected static flag was missing" errors
  
  // Track nudge_shown (handles null gracefully)
  useTrackNudgeShown(decision?.id || null, onTrack);

  // Manage visibility + auto-dismiss (now handles null gracefully)
  const { isVisible, handleManualDismiss } = useNudgeVisibility({
    decision,
    onDismiss,
  });

  // Portal container for DOM isolation
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  // Force re-render on window resize to update quadrant bounds
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    // Create or find portal container
    let container = document.getElementById("reveal-overlay-root");
    if (!container) {
      container = document.createElement("div");
      container.id = "reveal-overlay-root";
      container.style.cssText = `position: fixed; top: 0; left: 0; pointer-events: none; z-index: ${Z_INDEX.OVERLAY_ROOT};`;
      document.body.appendChild(container);
    }
    setPortalContainer(container);

    return () => {
      // Cleanup: only remove if we created it and it's empty
      if (container && container.children.length === 0 && container.id === "reveal-overlay-root") {
        container.remove();
      }
    };
  }, []);

  // Update quadrant positions on window resize
  useEffect(() => {
    if (!showQuadrants) return;

    const handleResize = () => {
      forceUpdate((prev) => prev + 1);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [showQuadrants]);

  // Wait for portal container (needed for quadrant overlays even if no decision)
  if (!portalContainer) {
    return null;
  }

  // NOW check conditions AFTER all hooks are called
  // Show quadrants even if no decision
  if (!decision) {
    if (showQuadrants) {
      return createPortal(
        <>
          {(["topLeft", "topCenter", "topRight", "bottomLeft", "bottomCenter", "bottomRight"] as const).map((q) => {
            const bounds = getQuadrantBounds(q);
            return (
              <div
                key={q}
                className="fixed pointer-events-none border border-current/30"
                style={{
                  top: `${bounds.top}px`,
                  left: `${bounds.left}px`,
                  width: `${bounds.width}px`,
                  height: `${bounds.height}px`,
                  backgroundColor: getQuadrantBgColor(q),
                  zIndex: Z_INDEX.OVERLAY_ROOT + 1,
                }}
                aria-hidden="true"
              >
                <div className="absolute top-2 left-2 text-xs font-mono opacity-70 text-foreground">
                  {q}
                </div>
              </div>
            );
          })}
        </>,
        portalContainer
      );
    }
    return null;
  }

  // If not visible (auto-dismissed or manually dismissed), render nothing
  if (!isVisible) {
    // Still show quadrants if enabled
    if (showQuadrants) {
      return createPortal(
        <>
          {(["topLeft", "topCenter", "topRight", "bottomLeft", "bottomCenter", "bottomRight"] as const).map((q) => {
            const bounds = getQuadrantBounds(q);
            return (
              <div
                key={q}
                className="fixed pointer-events-none border border-current/30"
                style={{
                  top: `${bounds.top}px`,
                  left: `${bounds.left}px`,
                  width: `${bounds.width}px`,
                  height: `${bounds.height}px`,
                  backgroundColor: getQuadrantBgColor(q),
                  zIndex: Z_INDEX.OVERLAY_ROOT + 1,
                }}
                aria-hidden="true"
              >
                <div className="absolute top-2 left-2 text-xs font-mono opacity-70 text-foreground">
                  {q}
                </div>
              </div>
            );
          })}
        </>,
        portalContainer
      );
    }
    return null;
  }

  // Get active quadrant for highlighting
  const activeQuadrant = decision.quadrant ?? "topCenter";

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
  // Render via portal for DOM isolation
  switch (decision.templateId) {
    case "tooltip":
      return createPortal(
        <>
          {/* Quadrant visualization overlays - show all 6 quadrants with transparent colors */}
          {showQuadrants && (
            <>
              {(["topLeft", "topCenter", "topRight", "bottomLeft", "bottomCenter", "bottomRight"] as const).map((q) => {
                const bounds = getQuadrantBounds(q);
                const isActive = activeQuadrant === q;
                return (
                  <div
                    key={q}
                    className={`fixed pointer-events-none border ${isActive ? "border-current/50 ring-2 ring-offset-1 ring-current" : "border-current/30"}`}
                    style={{
                      top: `${bounds.top}px`,
                      left: `${bounds.left}px`,
                      width: `${bounds.width}px`,
                      height: `${bounds.height}px`,
                      backgroundColor: isActive ? getQuadrantBgColor(q).replace('0.15', '0.25') : getQuadrantBgColor(q),
                      zIndex: Z_INDEX.OVERLAY_ROOT + 1, // Above overlay root, below tooltip
                    }}
                    aria-hidden="true"
                  >
                    {/* Quadrant label */}
                    <div className="absolute top-2 left-2 text-xs font-mono opacity-70 text-foreground">
                      {q}
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <TooltipNudge
            decision={decision}
            onDismiss={handleDismiss}
            onActionClick={handleActionClick}
            onTrack={onTrack}
          />
          {/* Debug code display (if present) */}
          {decision.debugCode && <DebugCode code={decision.debugCode} position="bottom-right" />}
        </>,
        portalContainer
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

