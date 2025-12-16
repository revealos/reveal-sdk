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
 * 
 * @property {FrictionType} type - Type of friction detected ("stall" | "rageclick" | "backtrack")
 * @property {string} pageUrl - Current page URL where friction was detected
 * @property {string | null} selector - CSS selector of the element (if applicable)
 * @property {number} timestamp - Timestamp when friction was detected (milliseconds since epoch)
 * @property {Record<string, any>} [extra] - Additional metadata. Standard semantic keys:
 *   - For `type: "rageclick"`: `target_id` (string) - Stable target identifier
 *   - For `type: "backtrack"`: `from_view` (string) - View identifier before navigation, `to_view` (string) - View identifier after navigation
 *   - For `type: "stall"`: `stall_ms` (number) - Stall duration in milliseconds
 */
export interface FrictionSignal {
  type: FrictionType;
  pageUrl: string;
  selector: string | null;
  timestamp: number;
  extra?: Record<string, any>;
}

