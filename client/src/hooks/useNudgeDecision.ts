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
    /** Callback for tracking events (e.g., passed to OverlayManager) */
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
 *     <OverlayManager decision={decision} {...handlers} />
 *   </>
 * );
 * ```
 */
export function useNudgeDecision(): UseNudgeDecisionResult {
  const [decision, setDecision] = useState<UINudgeDecision | null>(null);
  const previousPathnameRef = useRef<string | null>(null);
  const lastDecisionIdRef = useRef<string | null>(null);

  // Track active nudge state for idempotency across multiple dismissal paths
  const activeNudgeRef = useRef<{
    nudgeId: string;
    shownAtMs: number;
    resolved: boolean;
  } | null>(null);

  // Centralized dismissal helper - ensures idempotency across all dismissal paths
  const dismissActiveNudge = useCallback((options: {
    reason: 'navigation' | 'route_change' | 'tab_hidden' | 'page_unload' | 'user_dismissed' | 'user_action';
    href?: string;
    useBeacon?: boolean;
  }) => {
    const activeNudge = activeNudgeRef.current;
    if (!activeNudge || activeNudge.resolved) {
      return; // Already dismissed or no active nudge
    }

    const { nudgeId, shownAtMs } = activeNudge;
    const dismissedAtMs = Date.now();
    const activeDurationMs = dismissedAtMs - shownAtMs;

    const payload: Record<string, any> = {
      nudgeId,
      reason: options.reason,
      shownAtMs,
      dismissedAtMs,
      activeDurationMs,
    };

    if (options.href) {
      payload.href = options.href;
    }

    // Track dismissal event (user_action maps to nudge_clicked)
    if (options.reason === 'user_action') {
      track('nudge', 'nudge_clicked', payload);
    } else {
      track('nudge', 'nudge_dismissed', payload);
    }

    // Mark as resolved (prevents double-dismissal)
    activeNudge.resolved = true;

    // Clear UI
    setDecision(null);
    lastDecisionIdRef.current = null;
  }, []);

  // Subscribe to nudge decisions
  useEffect(() => {
    const unsubscribe = onNudgeDecision((wireDecision: WireNudgeDecision) => {
      // Deduplication: skip if same decision ID
      if (lastDecisionIdRef.current === wireDecision.nudgeId) {
        return;
      }

      lastDecisionIdRef.current = wireDecision.nudgeId;

      // Initialize activeNudgeRef when decision is received
      activeNudgeRef.current = {
        nudgeId: wireDecision.nudgeId,
        shownAtMs: Date.now(),
        resolved: false,
      };

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
        // Pathname changed - dismiss the nudge with idempotency check
        const activeNudge = activeNudgeRef.current;
        if (activeNudge && !activeNudge.resolved) {
          dismissActiveNudge({ reason: 'route_change' });
        }
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
  }, [decision, dismissActiveNudge]);

  // Auto-dismiss on MPA link clicks (before page unload)
  useEffect(() => {
    if (!decision) return;

    const handleLinkClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const link = target.closest('a[href]') as HTMLAnchorElement | null;

      if (!link) return;

      const href = link.getAttribute('href');
      if (!href) return;

      // Ignore modified clicks (new tab/window)
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      // Ignore target="_blank"
      if (link.getAttribute('target') === '_blank') return;

      // Ignore same-page anchors (#fragment only)
      if (href.startsWith('#')) return;

      // Ignore javascript: and mailto: links
      if (href.startsWith('javascript:') || href.startsWith('mailto:')) return;

      // Dismiss active nudge before navigation
      const activeNudge = activeNudgeRef.current;
      if (activeNudge && !activeNudge.resolved) {
        dismissActiveNudge({
          reason: 'navigation',
          href: href,
        });
      }
    };

    // Use CAPTURE phase to intercept before any SPA framework
    document.addEventListener('click', handleLinkClick, true);

    return () => {
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [decision, dismissActiveNudge]);

  // Auto-dismiss on tab visibility change (user switches tabs or minimizes browser)
  useEffect(() => {
    if (!decision) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        const activeNudge = activeNudgeRef.current;
        if (activeNudge && !activeNudge.resolved) {
          dismissActiveNudge({
            reason: 'tab_hidden',
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [decision, dismissActiveNudge]);

  // Auto-dismiss on page unload (tab close, browser close, address bar navigation)
  useEffect(() => {
    if (!decision) return;

    const handlePageHide = () => {
      const activeNudge = activeNudgeRef.current;
      if (activeNudge && !activeNudge.resolved) {
        dismissActiveNudge({
          reason: 'page_unload',
          useBeacon: true, // Use sendBeacon for reliability during page unload
        });
      }
    };

    // Use pagehide (preferred over beforeunload for reliability)
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [decision, dismissActiveNudge]);

  // Handler for nudge dismissal (user clicks dismiss button)
  const handleDismiss = useCallback((nudgeId: string) => {
    dismissActiveNudge({ reason: 'user_dismissed' });
  }, [dismissActiveNudge]);

  // Handler for nudge action click (user clicks CTA button)
  const handleActionClick = useCallback((nudgeId: string) => {
    dismissActiveNudge({ reason: 'user_action' });
  }, [dismissActiveNudge]);

  // Handler for tracking events (passed to OverlayManager)
  const handleTrack = useCallback(
    (kind: string, name: string, payload?: EventPayload) => {
      // Capture nudge_shown event to initialize activeNudgeRef
      if (kind === 'nudge' && name === 'nudge_shown' && payload && 'nudgeId' in payload) {
        activeNudgeRef.current = {
          nudgeId: payload.nudgeId as string,
          shownAtMs: Date.now(),
          resolved: false,
        };
      }
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

