/**
 * Event Types
 * 
 * Type definitions for events in the SDK.
 * 
 * @module types/events
 */

/**
 * Event kind enumeration
 */
export type EventKind = "product" | "friction" | "nudge" | "session";

/**
 * Environment enumeration
 */
export type Environment = "production" | "staging" | "development";

/**
 * Event source enumeration
 */
export type EventSource = "system" | "user";

/**
 * UI layer enumeration
 *
 * Describes the UI surface where an event occurred.
 * This is optional, developer-provided context attached by the overlay/UI layer.
 */
export type UiLayer = "page" | "modal" | "drawer" | "popover" | "unknown";

/**
 * Event payload type
 * 
 * Event payloads are flat objects containing event-specific properties.
 * All values must be primitives (string, number, boolean, null).
 */
export type EventPayload = Record<string, any>;

/**
 * Base event structure (SDK internal)
 */
export interface BaseEvent {
  kind: EventKind;
  name: string;
  event_source: EventSource;
  session_id: string;
  is_treatment: boolean | null;
  timestamp: number;

  /**
   * Raw location hints for the current view.
   *
   * These fields are populated from the host application's routing / screen system
   * (when available) and are treated as low-level signals.
   */
  path: string | null;
  route: string | null;
  screen: string | null;

  /**
   * Derived view identifier for analytics & engine consumption.
   *
   * Computed on the client as: route || path || screen || "unknown"
   * (using the PII-scrubbed path value). Always present.
   */
  viewKey: string;

  /**
   * Optional overlay/UI context describing the UI layer where the event occurred.
   * This is developer-provided metadata (e.g. supplied by overlay-react) and
   * is never inferred from sensitive user content.
   */
  ui_layer?: UiLayer;

  /**
   * Optional, developer-defined identifier for a modal (or similar container)
   * associated with this event. Intended to be a stable key (e.g. overlay root id),
   * not arbitrary user input.
   */
  modal_key?: string | null;

  user_agent: string;
  viewport_width: number;
  viewport_height: number;
  payload: EventPayload;
}

