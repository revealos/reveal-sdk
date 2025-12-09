/**
 * Session Types
 * 
 * Type definitions for session management.
 * 
 * @module types/session
 */

/**
 * Session information
 */
export interface Session {
  id: string;
  isTreatment: boolean | null;
  startedAt: number;
  lastActivityAt: number;
}

