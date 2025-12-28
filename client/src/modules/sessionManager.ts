/**
 * SessionManager Module
 *
 * Manages client-side session identifier and basic activity tracking.
 *
 * Responsibilities:
 * - Create or restore session ID
 * - Track user activity timestamps
 * - Provide session context for decision requests
 *
 * Note: This is a minimal v0 implementation.
 * - No persistence (memory only)
 * - No idle timeout handling
 * - No treatment assignment
 * - No session end events
 *
 * @module modules/sessionManager
 */

import type { Logger } from "../utils/logger";

/**
 * Session information
 */
export interface Session {
  id: string;
  isTreatment: boolean | null;
  startedAt: number;
  lastActivityAt: number;
}

/**
 * SessionManager options
 */
export interface SessionManagerOptions {
  logger?: Logger;
  onSessionEnd?: (reason: string) => void;
  idleTimeoutMs?: number;
  projectId?: string; // For localStorage scoping
  anonymousId?: string; // For localStorage scoping
  initTraceId?: string; // For tracing init calls (debugging multiple SDK instances)
}

/**
 * SessionManager interface
 */
export interface SessionManager {
  getCurrentSession(): Session | null;
  markActivity(): void;
  endSession(reason: string): void;
  onSessionEnd(handler: (reason: string) => void): void;
  setTreatment(treatment: "control" | "treatment" | null): void;
}

/**
 * Create a new SessionManager instance
 *
 * @param options - Configuration options
 * @returns SessionManager instance
 */
export function createSessionManager(
  options: SessionManagerOptions = {}
): SessionManager {
  const { logger, projectId, anonymousId, initTraceId } = options;

  // ──────────────────────────────────────────────────────────────────────
  // GENERATE SESSION ID
  // ──────────────────────────────────────────────────────────────────────
  const sessionId = generateSessionId();
  const now = Date.now();

  // ──────────────────────────────────────────────────────────────────────
  // HELPER: Load treatment from localStorage (PROJECT + USER scoped)
  // ──────────────────────────────────────────────────────────────────────
  function loadTreatmentFromStorage(): boolean | null {
    if (!projectId || !anonymousId) {
      // TRACE: Log why we can't load from storage
      logger?.logDebug("SessionManager: cannot load treatment from storage (missing projectId or anonymousId)", {
        initTraceId,
        hasProjectId: !!projectId,
        hasAnonymousId: !!anonymousId,
      });
      return null; // Can't load without both IDs
    }

    try {
      const storageKey = `reveal_treatment_${projectId}_${anonymousId}`;
      const stored = localStorage.getItem(storageKey);

      // TRACE: Log storage read result
      logger?.logDebug("SessionManager: loadTreatmentFromStorage", {
        initTraceId,
        storageKey,
        storedValue: stored,
        projectId,
        anonymousId,
        willReturn: stored === "treatment" ? true : stored === "control" ? false : null,
      });

      if (stored === "treatment") return true;
      if (stored === "control") return false;
      return null;
    } catch (error) {
      logger?.logWarn("SessionManager: failed to load treatment from storage", {
        initTraceId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null; // localStorage not available or quota exceeded
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // INITIALIZE SESSION STATE
  // ──────────────────────────────────────────────────────────────────────
  let session: Session = {
    id: sessionId,
    isTreatment: loadTreatmentFromStorage(), // Load from localStorage if available
    startedAt: now,
    lastActivityAt: now,
  };

  logger?.logDebug("SessionManager: session created", {
    initTraceId,
    sessionId: session.id,
    startedAt: session.startedAt,
    treatmentLoaded: session.isTreatment !== null,
    isTreatment: session.isTreatment, // Show actual value (true/false/null)
    projectId,
    anonymousId,
  });

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Get the current session
   * @returns Current session (never null in v0)
   */
  function getCurrentSession(): Session {
    return session;
  }

  /**
   * Mark user activity (updates lastActivityAt timestamp)
   */
  function markActivity(): void {
    session.lastActivityAt = Date.now();
  }

  /**
   * Set treatment assignment for current session
   * Persists to localStorage (PROJECT + USER scoped)
   * @param treatment - "control" | "treatment" | null
   */
  function setTreatment(treatment: "control" | "treatment" | null): void {
    session.isTreatment = treatment === "treatment" ? true : treatment === "control" ? false : null;

    // Persist to localStorage (SCOPED PER PROJECT + USER to prevent cross-project bleed)
    if (!projectId || !anonymousId) {
      logger?.logWarn("SessionManager: cannot persist treatment without projectId and anonymousId");
      return;
    }

    try {
      const storageKey = `reveal_treatment_${projectId}_${anonymousId}`;
      if (treatment) {
        localStorage.setItem(storageKey, treatment);
        logger?.logDebug("SessionManager: treatment persisted", { treatment, storageKey });
      } else {
        localStorage.removeItem(storageKey);
        logger?.logDebug("SessionManager: treatment cleared", { storageKey });
      }
    } catch (error) {
      logger?.logWarn("SessionManager: failed to persist treatment to localStorage", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * End the current session
   * Note: Minimal implementation - just logs
   * @param reason - Reason for ending session
   */
  function endSession(reason: string): void {
    logger?.logDebug("SessionManager: session ended", {
      sessionId: session.id,
      reason,
      duration: Date.now() - session.startedAt,
    });
    // v0: no persistence, no cleanup needed
  }

  /**
   * Register a session end handler
   * Note: Minimal implementation - not used in v0
   * @param handler - Handler function
   */
  function onSessionEnd(handler: (reason: string) => void): void {
    // v0: no session end events
    logger?.logDebug("SessionManager: onSessionEnd handler registered (no-op in v0)");
  }

  // ──────────────────────────────────────────────────────────────────────
  // RETURN PUBLIC API
  // ──────────────────────────────────────────────────────────────────────
  return {
    getCurrentSession,
    markActivity,
    endSession,
    onSessionEnd,
    setTreatment,
  };
}

/**
 * Generate a session ID
 * Uses crypto.randomUUID if available, falls back to simple UUID generation
 */
function generateSessionId(): string {
  // Try crypto.randomUUID (modern browsers)
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback: simple UUID v4 generation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
