/**
 * InlineHint Component
 *
 * React adapter for reveal-inline-hint-nudge Web Component.
 * This is a thin wrapper that maps React props to Web Component properties.
 *
 * ALL UI logic lives in @reveal/overlay-wc - this component only handles:
 * - Props → Web Component properties mapping
 * - CustomEvents → React callback props
 *
 * @module components/templates/InlineHint
 */

"use client";

import React, { useEffect, useRef } from "react";
import type { NudgeDecision } from "@reveal/overlay-wc";
import "@reveal/overlay-wc";

export interface InlineHintProps {
  /** The nudge decision containing content and configuration */
  decision: NudgeDecision;
  /** Callback when nudge is dismissed */
  onDismiss: (id: string) => void;
  /** Optional callback for tracking events (e.g., Reveal.track) */
  onTrack?: (kind: string, name: string, payload?: Record<string, any>) => void;
}

/**
 * InlineHint - React wrapper for reveal-inline-hint-nudge Web Component
 */
export const InlineHint: React.FC<InlineHintProps> = ({
  decision,
  onDismiss,
  onTrack,
}) => {
  const wcRef = useRef<HTMLElement | null>(null);

  // Sync decision property
  useEffect(() => {
    if (wcRef.current) {
      (wcRef.current as any).decision = decision;
    }
  }, [decision]);

  // Attach event listeners
  useEffect(() => {
    const wc = wcRef.current;
    if (!wc) return;

    const handleDismiss = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      onDismiss(detail.id);
    };

    const handleShown = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      onTrack?.("nudge", "nudge_shown", { nudgeId: detail.id });
    };

    wc.addEventListener("reveal:dismiss", handleDismiss);
    wc.addEventListener("reveal:shown", handleShown);

    return () => {
      wc.removeEventListener("reveal:dismiss", handleDismiss);
      wc.removeEventListener("reveal:shown", handleShown);
    };
  }, [onDismiss, onTrack]);

  return <reveal-inline-hint-nudge ref={wcRef} />;
};
