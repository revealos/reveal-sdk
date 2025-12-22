/**
 * DebugCode Component
 *
 * Displays the debug code for tracing decisions.
 * Renders faintly in the corner of the overlay for support and debugging.
 *
 * @module components/primitives/DebugCode
 */

"use client";

import React from "react";

export interface DebugCodeProps {
  /** Debug code string (6-8 chars, e.g., "X4368DGE") */
  code: string;

  /** Position in the viewport (default: "bottom-right") */
  position?: "top-right" | "bottom-right" | "top-left" | "bottom-left";
}

/**
 * DebugCode component
 *
 * Renders a faint debug code in the corner of the viewport.
 * Format: "reveal: X4368DGE"
 *
 * Features:
 * - Small text, light grey, high transparency (opacity: 0.3)
 * - Non-interactive by default
 * - Position: bottom-right or top-right corner
 * - Does not interfere with nudge content
 */
export function DebugCode(props: DebugCodeProps): React.ReactElement {
  const { code, position = "bottom-right" } = props;

  // Calculate position styles
  const positionStyles: React.CSSProperties = {};

  switch (position) {
    case "top-right":
      positionStyles.top = "8px";
      positionStyles.right = "12px";
      break;
    case "bottom-right":
      positionStyles.bottom = "8px";
      positionStyles.right = "12px";
      break;
    case "top-left":
      positionStyles.top = "8px";
      positionStyles.left = "12px";
      break;
    case "bottom-left":
      positionStyles.bottom = "8px";
      positionStyles.left = "12px";
      break;
  }

  return (
    <div
      style={{
        position: "fixed",
        ...positionStyles,
        fontSize: "10px",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        color: "rgba(156, 163, 175, 0.2)", // Light grey with 40% opacity
        pointerEvents: "none",
        userSelect: "none",
        zIndex: 999999, // Very high z-index to ensure visibility
        lineHeight: "1",
        padding: "4px 6px",
        borderRadius: "3px",
      }}
      aria-hidden="true"
      data-reveal-debug-code={code}
    >
      reveal: {code}
    </div>
  );
}
