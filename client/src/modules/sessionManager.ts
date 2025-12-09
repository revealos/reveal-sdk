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
}

/**
 * SessionManager interface
 */
export interface SessionManager {
  getCurrentSession(): Session | null;
  markActivity(): void;
  endSession(reason: string): void;
  onSessionEnd(handler: (reason: string) => void): void;
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
  const { logger } = options;

  // ──────────────────────────────────────────────────────────────────────
  // GENERATE SESSION ID
  // ──────────────────────────────────────────────────────────────────────
  const sessionId = generateSessionId();
  const now = Date.now();

  // ──────────────────────────────────────────────────────────────────────
  // INITIALIZE SESSION STATE
  // ──────────────────────────────────────────────────────────────────────
  let session: Session = {
    id: sessionId,
    isTreatment: null, // v0: no treatment assignment
    startedAt: now,
    lastActivityAt: now,
  };

  logger?.logDebug("SessionManager: session created", {
    sessionId: session.id,
    startedAt: session.startedAt,
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
