/**
 * Error Handler
 * 
 * Centralized error handling to prevent information leakage
 * and support audit logging.
 * 
 * SECURITY: This module ensures errors are handled safely without exposing
 * internal details or stack traces to the host application.
 * 
 * @module errors/errorHandler
 */

import type { Logger } from "../utils/logger";
import { logAuditEvent, createAuditEvent } from "../security/auditLogger";

/**
 * Global logger instance (optional, set by SDK initialization)
 */
let globalLogger: Logger | undefined;

/**
 * Set the global logger for error handling
 * 
 * @param logger - Logger instance from SDK
 */
export function setErrorLogger(logger: Logger | undefined): void {
  globalLogger = logger;
}

/**
 * Handle an error safely
 * 
 * SECURITY: This function ensures errors are:
 * - Logged internally (never exposed to host app)
 * - Categorized for audit purposes
 * - Handled silently in production (fail-open behavior)
 * - Never expose stack traces or internal details
 * 
 * @param error - Error to handle
 * @param context - Context where error occurred (e.g., "EventPipeline.flush")
 */
export function handleError(error: unknown, context: string): void {
  // Categorize error type
  const errorType = categorizeError(error);
  const errorMessage = error instanceof Error ? error.message : String(error);

  // Log internally (if logger available)
  if (globalLogger) {
    globalLogger.logError(`Error in ${context}`, {
      errorType,
      message: errorMessage,
      // NOTE: Do not log stack traces or full error objects to avoid information leakage
    });
  }

  // Create audit log entry for security-relevant errors
  if (errorType === "security" || errorType === "network") {
    logAuditEvent(createAuditEvent(
      "error",
      errorType === "security" ? "high" : "medium",
      `Error in ${context}: ${errorMessage}`,
      { errorType, context }
    ));
  }

  // Fail silently - never throw or expose errors to host app
  // This ensures SDK errors never break the host application
}

/**
 * Categorize error type for logging and audit purposes
 * 
 * @param error - Error to categorize
 * @returns Error category
 */
function categorizeError(error: unknown): "network" | "security" | "validation" | "unknown" {
  if (!(error instanceof Error)) {
    return "unknown";
  }

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  // Network errors
  if (
    name.includes("network") ||
    name.includes("timeout") ||
    name.includes("abort") ||
    message.includes("fetch") ||
    message.includes("network")
  ) {
    return "network";
  }

  // Security errors
  if (
    name.includes("security") ||
    name.includes("auth") ||
    message.includes("unauthorized") ||
    message.includes("forbidden") ||
    message.includes("authentication")
  ) {
    return "security";
  }

  // Validation errors
  if (
    name.includes("validation") ||
    name.includes("type") ||
    message.includes("invalid") ||
    message.includes("required")
  ) {
    return "validation";
  }

  return "unknown";
}

/**
 * Check if error is retryable
 * 
 * Network errors and timeouts are retryable. Security/auth errors are not.
 * 
 * @param error - Error to check
 * @returns True if error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  const errorType = categorizeError(error);
  
  // Network errors are retryable
  if (errorType === "network") {
    return true;
  }
  
  // Security/auth errors are NOT retryable
  if (errorType === "security") {
    return false;
  }
  
  // Validation errors are NOT retryable (client error)
  if (errorType === "validation") {
    return false;
  }
  
  // Unknown errors default to non-retryable (conservative)
  return false;
}
