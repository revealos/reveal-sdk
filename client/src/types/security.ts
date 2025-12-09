/**
 * Security Types
 * 
 * Type definitions for security and compliance.
 * 
 * @module types/security
 */

/**
 * Security configuration
 */
export interface SecurityConfig {
  validateSSL: boolean;
  allowedOrigins?: string[];
  maxPayloadSize: number;
  enableAuditLogging: boolean;
}

/**
 * Audit metadata
 */
export interface AuditMetadata {
  userId?: string; // Hashed/anonymized
  sessionId: string;
  timestamp: number;
  action: string;
}

