/**
 * Audit Logger
 * 
 * Structured audit logging for compliance and security monitoring.
 * 
 * SECURITY BOUNDARY: This module provides audit logging hooks at key security
 * boundaries (network requests, data access). Audit events are logged with
 * scrubbed/summarized payloads to avoid exposing PII in logs.
 * 
 * @module security/auditLogger
 */

import type { Logger } from "../utils/logger";

/**
 * Audit event types
 */
export type AuditEventType = "auth" | "data_access" | "error" | "config_change";

/**
 * Audit event severity levels
 */
export type AuditSeverity = "low" | "medium" | "high" | "critical";

/**
 * Audit event structure
 */
export interface AuditEvent {
  type: AuditEventType;
  severity: AuditSeverity;
  message: string;
  metadata?: Record<string, any>;
  timestamp: number;
}

/**
 * Global logger instance (optional, set by SDK initialization)
 * If not set, audit logging is a no-op (safe for environments without logging)
 */
let globalLogger: Logger | undefined;

/**
 * Set the global logger for audit events
 * 
 * This is called during SDK initialization to enable audit logging.
 * If never called, audit logging will be a no-op.
 * 
 * @param logger - Logger instance from SDK
 */
export function setAuditLogger(logger: Logger | undefined): void {
  globalLogger = logger;
}

/**
 * Log an audit event
 * 
 * SECURITY: This function logs structured audit events for compliance monitoring.
 * Metadata should contain scrubbed/summarized information only (no raw PII).
 * 
 * If no logger is configured, this is a safe no-op (does not throw or break).
 * 
 * @param event - Audit event to log
 * 
 * @example
 * logAuditEvent(createAuditEvent(
 *   "data_access",
 *   "low",
 *   "Event batch sent to backend",
 *   { batchId: "batch_123", eventCount: 5 }
 * ));
 */
export function logAuditEvent(event: AuditEvent): void {
  // No-op if logger not configured (safe for environments without logging)
  if (!globalLogger) {
    return;
  }

  try {
    // Format audit event as structured log entry
    const logMessage = `[AUDIT] ${event.type.toUpperCase()}: ${event.message}`;
    const logMeta = {
      severity: event.severity,
      timestamp: new Date(event.timestamp).toISOString(),
      ...event.metadata,
    };

    // Route to appropriate log level based on severity
    switch (event.severity) {
      case "critical":
      case "high":
        globalLogger.logError(logMessage, logMeta);
        break;
      case "medium":
        globalLogger.logWarn(logMessage, logMeta);
        break;
      case "low":
      default:
        // Low-severity audit logs only show in debug mode (not production console)
        globalLogger.logDebug(logMessage, logMeta);
        break;
    }
  } catch (error) {
    // Fail silently - audit logging should never break the host app
    // If logger itself throws, we ignore it
  }
}

/**
 * Create an audit event
 * 
 * Helper function to create a properly structured audit event object.
 * The event is not automatically logged - call logAuditEvent() separately.
 * 
 * @param type - Event type
 * @param severity - Severity level
 * @param message - Event message (human-readable)
 * @param metadata - Optional metadata (should be scrubbed, no PII)
 * @returns Audit event object
 * 
 * @example
 * const event = createAuditEvent(
 *   "data_access",
 *   "low",
 *   "Decision request sent",
 *   { frictionType: "stall", endpoint: "/decide" }
 * );
 * logAuditEvent(event);
 */
export function createAuditEvent(
  type: AuditEventType,
  severity: AuditSeverity,
  message: string,
  metadata?: Record<string, any>
): AuditEvent {
  return {
    type,
    severity,
    message,
    metadata,
    timestamp: Date.now(),
  };
}
