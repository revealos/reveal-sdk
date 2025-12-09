/**
 * useNudgeDecision Hook
 * 
 * React hook that subscribes to nudge decisions from the SDK and converts
 * them to UI format. Reduces integration boilerplate from 30+ lines to 3 lines.
 * 
 * This hook:
 * - Subscribes to Reveal.onNudgeDecision internally
 * - Converts WireNudgeDecision to UINudgeDecision using mapWireToUI (from SDK)
 * - Manages decision state internally
 * - Provides tracking handlers (onDismiss, onActionClick, onTrack)
 * 
 * @module hooks/useNudgeDecision
 */

import { useState, useEffect, useCallback, useMemo, useRef, startTransition } from "react";
import { onNudgeDecision } from "../core/entryPoint";
import { track } from "../core/entryPoint";
import type { WireNudgeDecision } from "../types/decisions";
import { mapWireToUI, type UINudgeDecision } from "../types/uiDecision";
import type { EventPayload } from "../types/events";

export interface UseNudgeDecisionResult {
  /** Current nudge decision in UI format, or null if no active decision */
  decision: UINudgeDecision | null;
  /** Handlers for nudge interactions and tracking */
  handlers: {
    /** Call when nudge is dismissed */
    onDismiss: (nudgeId: string) => void;
    /** Call when nudge action/CTA is clicked */
    onActionClick: (nudgeId: string) => void;
    /** Callback for tracking events (e.g., passed to RevealNudgeHost) */
    onTrack: (kind: string, name: string, payload?: EventPayload) => void;
  };
}

/**
 * React hook that subscribes to nudge decisions and provides UI-ready decision state.
 * 
 * @returns Object containing current decision and interaction handlers
 * 
 * @example
 * ```tsx
 * const { decision, handlers } = useNudgeDecision();
 * return (
 *   <>
 *     {children}
 *     <RevealNudgeHost decision={decision} {...handlers} />
 *   </>
 * );
 * ```
 */
export function useNudgeDecision(): UseNudgeDecisionResult {
  const [decision, setDecision] = useState<UINudgeDecision | null>(null);
  const previousPathnameRef = useRef<string | null>(null);

  // Subscribe to nudge decisions
  useEffect(() => {
    const unsubscribe = onNudgeDecision((wireDecision: WireNudgeDecision) => {
      // Convert wire format to UI format
      const uiDecision = mapWireToUI(wireDecision);
      // Use startTransition to help React 19 Fast Refresh track state updates
      // from external callbacks
      startTransition(() => {
        setDecision(uiDecision);
        // Track current pathname when decision is set
        if (typeof window !== "undefined") {
          previousPathnameRef.current = window.location.pathname;
        }
      });
    });

    // Cleanup: unsubscribe on unmount
    return unsubscribe;
  }, []);

  // Auto-dismiss nudge on navigation (route changes)
  useEffect(() => {
    if (!decision) {
      return;
    }

    // Get current pathname
    const getCurrentPathname = () => {
      if (typeof window === "undefined") return null;
      return window.location.pathname;
    };

    // Check for pathname changes (handles Next.js App Router and other SPA frameworks)
    const checkPathnameChange = () => {
      const currentPathname = getCurrentPathname();
      const previousPathname = previousPathnameRef.current;

      if (previousPathname !== null && currentPathname !== previousPathname) {
        // Pathname changed - dismiss the nudge
        const nudgeId = decision.id;
        track("nudge", "nudge_dismissed", { 
          nudgeId,
          reason: "navigation" 
        });
        setDecision(null);
        previousPathnameRef.current = currentPathname;
      } else if (currentPathname !== null) {
        previousPathnameRef.current = currentPathname;
      }
    };

    // Initial check
    checkPathnameChange();

    // Listen to browser navigation events
    const handlePopState = () => {
      // Small delay to ensure pathname has updated
      setTimeout(checkPathnameChange, 0);
    };

    const handleHashChange = () => {
      // Hash changes might indicate navigation in some apps
      checkPathnameChange();
    };

    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handleHashChange);

    // Poll for pathname changes (catches Next.js App Router navigation)
    // Next.js App Router doesn't always fire popstate, so we poll
    const intervalId = setInterval(checkPathnameChange, 100);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handleHashChange);
      clearInterval(intervalId);
    };
  }, [decision]);

  // Handler for nudge dismissal
  const handleDismiss = useCallback((nudgeId: string) => {
    track("nudge", "nudge_dismissed", { nudgeId });
    setDecision(null);
  }, []);

  // Handler for nudge action click
  const handleActionClick = useCallback((nudgeId: string) => {
    track("nudge", "nudge_clicked", { nudgeId });
    setDecision(null);
  }, []);

  // Handler for tracking events (passed to RevealNudgeHost)
  const handleTrack = useCallback(
    (kind: string, name: string, payload?: EventPayload) => {
      track(kind, name, payload);
    },
    []
  );

  // Memoize handlers object to prevent React 19 Fast Refresh issues
  const handlers = useMemo(
    () => ({
      onDismiss: handleDismiss,
      onActionClick: handleActionClick,
      onTrack: handleTrack,
    }),
    [handleDismiss, handleActionClick, handleTrack]
  );

  return {
    decision,
    handlers,
  };
}

