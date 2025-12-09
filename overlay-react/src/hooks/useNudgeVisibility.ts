/**
 * useNudgeVisibility Hook
 * 
 * Manages nudge visibility state and auto-dismiss behavior.
 * Handles manual dismiss and automatic dismiss based on autoDismissMs.
 * 
 * @module hooks/useNudgeVisibility
 */

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { NudgeDecision } from "../types/NudgeDecision";

export interface UseNudgeVisibilityArgs {
  decision: NudgeDecision | null;
  onDismiss?: (id: string) => void;
}

export interface UseNudgeVisibilityResult {
  isVisible: boolean;
  handleManualDismiss: () => void;
}

/**
 * Hook that manages nudge visibility and auto-dismiss behavior.
 * 
 * @param args - Decision and optional dismiss callback
 * @returns Visibility state and manual dismiss handler
 */
export function useNudgeVisibility({
  decision,
  onDismiss,
}: UseNudgeVisibilityArgs): UseNudgeVisibilityResult {
  const [isVisible, setIsVisible] = useState<boolean>(true);
  const timeoutRef = useRef<number | null>(null);

  // Handle manual dismiss (only if decision exists)
  const handleManualDismiss = useCallback(() => {
    setIsVisible(false);
    if (onDismiss && decision) {
      onDismiss(decision.id);
    }
  }, [decision?.id, onDismiss]);

  // Auto-dismiss logic (only if decision exists)
  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // If no decision, hide immediately
    if (!decision) {
      setIsVisible(false);
      return;
    }

    // If autoDismissMs is set and nudge is visible, set up auto-dismiss
    if (decision.autoDismissMs && decision.autoDismissMs > 0 && isVisible) {
      timeoutRef.current = window.setTimeout(() => {
        setIsVisible(false);
        if (onDismiss) {
          onDismiss(decision.id);
        }
        timeoutRef.current = null;
      }, decision.autoDismissMs);
    }

    // Cleanup on unmount or when decision/visibility changes
    return () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [decision?.autoDismissMs, decision?.id, isVisible, onDismiss]);

  // Reset visibility when decision changes (new decision = visible again, null = hidden)
  useEffect(() => {
    setIsVisible(decision !== null);
  }, [decision?.id]);

  return {
    isVisible: decision ? isVisible : false,
    handleManualDismiss,
  };
}

