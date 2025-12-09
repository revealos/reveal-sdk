/**
 * Error Types
 * 
 * Structured error classes for different error categories.
 * 
 * @module errors/errorTypes
 */

/**
 * Security-related error
 */
export class SecurityError extends Error {
  code: "AUTH_FAILED" | "INVALID_INPUT" | "RATE_LIMIT";
  
  constructor(message: string, code: SecurityError["code"]) {
    super(message);
    this.name = "SecurityError";
    this.code = code;
    // TODO: Suppress stack traces in production
  }
}

/**
 * Validation error
 */
export class ValidationError extends Error {
  code: "INVALID_PAYLOAD" | "MISSING_FIELD" | "TYPE_MISMATCH";
  field?: string;
  
  constructor(
    message: string,
    code: ValidationError["code"],
    field?: string
  ) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.field = field;
  }
}

/**
 * Network error
 */
export class NetworkError extends Error {
  code: "TIMEOUT" | "NETWORK_ERROR" | "HTTP_ERROR";
  statusCode?: number;
  
  constructor(
    message: string,
    code: NetworkError["code"],
    statusCode?: number
  ) {
    super(message);
    this.name = "NetworkError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * System error (unexpected)
 */
export class SystemError extends Error {
  code: "UNEXPECTED_ERROR" | "INITIALIZATION_FAILED";
  
  constructor(message: string, code: SystemError["code"]) {
    super(message);
    this.name = "SystemError";
    this.code = code;
  }
}

