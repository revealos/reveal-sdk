/**
 * useTrackNudgeShown Hook
 * 
 * Automatically tracks nudge_shown event when a nudge becomes visible.
 * Only tracks once per unique nudge ID to avoid duplicate events.
 * 
 * This hook ensures that nudge_shown events are automatically tracked
 * when a nudge is displayed, without requiring manual tracking calls.
 * 
 * @param decisionId - The unique identifier for the nudge decision
 * @param onTrack - Optional callback to track events (e.g., Reveal.track)
 * 
 * @module hooks/useTrackNudgeShown
 */

"use client";

import { useEffect, useRef } from "react";

// Module-level Set to track seen nudge IDs across all instances
const seenNudgeIds = new Set<string>();

export function useTrackNudgeShown(
  decisionId: string | null,
  onTrack?: (kind: string, name: string, payload?: Record<string, any>) => void
): void {
  const hasTrackedRef = useRef(false);

  useEffect(() => {
    // If no decisionId or no onTrack callback, do nothing
    if (!decisionId || !onTrack) {
      return;
    }

    // Only track once per unique decision ID (across all component instances)
    if (seenNudgeIds.has(decisionId)) {
      return;
    }

    // Mark as seen and track
    seenNudgeIds.add(decisionId);
    hasTrackedRef.current = true;

    // Track nudge_shown event
    onTrack("nudge", "nudge_shown", { nudgeId: decisionId });
  }, [decisionId, onTrack]);
}
