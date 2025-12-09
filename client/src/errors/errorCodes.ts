/**
 * Error Codes
 * 
 * Standardized error code constants for consistent error handling.
 * 
 * @module errors/errorCodes
 */

/**
 * Security error codes
 */
export const SECURITY_ERROR_CODES = {
  AUTH_FAILED: "AUTH_FAILED",
  INVALID_INPUT: "INVALID_INPUT",
  RATE_LIMIT: "RATE_LIMIT",
} as const;

/**
 * Validation error codes
 */
export const VALIDATION_ERROR_CODES = {
  INVALID_PAYLOAD: "INVALID_PAYLOAD",
  MISSING_FIELD: "MISSING_FIELD",
  TYPE_MISMATCH: "TYPE_MISMATCH",
} as const;

/**
 * Network error codes
 */
export const NETWORK_ERROR_CODES = {
  TIMEOUT: "TIMEOUT",
  NETWORK_ERROR: "NETWORK_ERROR",
  HTTP_ERROR: "HTTP_ERROR",
} as const;

/**
 * System error codes
 */
export const SYSTEM_ERROR_CODES = {
  UNEXPECTED_ERROR: "UNEXPECTED_ERROR",
  INITIALIZATION_FAILED: "INITIALIZATION_FAILED",
} as const;

