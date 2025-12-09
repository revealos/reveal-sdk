/**
 * Friction Types
 * 
 * Type definitions for friction detection.
 * 
 * @module types/friction
 */

/**
 * Friction type enumeration
 */
export type FrictionType = "stall" | "rageclick" | "backtrack";

/**
 * Friction signal emitted by detectors
 */
export interface FrictionSignal {
  type: FrictionType;
  pageUrl: string;
  selector: string | null;
  timestamp: number;
  extra?: Record<string, any>;
}

