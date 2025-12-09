/**
 * Data Sanitization
 * 
 * Scrubs PII and minimizes data collection per privacy requirements.
 * 
 * SECURITY BOUNDARY: This module is the single choke point for PII scrubbing
 * before data leaves the SDK. All event payloads and friction signal extras
 * must pass through scrubPII() before being sent over the network.
 * 
 * @module security/dataSanitization
 */

/**
 * Known PII field patterns (case-insensitive matching)
 * These keys will have their values replaced with "[REDACTED]"
 */
const PII_KEY_PATTERNS = [
  // Email addresses
  'email',
  'emailaddress',
  'email_address',
  'e-mail',
  'e_mail',
  
  // Phone numbers
  'phone',
  'phonenumber',
  'phone_number',
  'mobile',
  'mobilephone',
  'mobile_phone',
  'telephone',
  
  // Passwords and authentication
  'password',
  'passwd',
  'pwd',
  'secret',
  'apikey',
  'api_key',
  'apisecret',
  'api_secret',
  'token',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'bearertoken',
  'bearer_token',
  'authtoken',
  'auth_token',
  
  // Financial information
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'ssn',
  'socialsecuritynumber',
  'social_security_number',
  
  // Personal identifiers
  'fullname',
  'full_name',
  'firstname',
  'first_name',
  'lastname',
  'last_name',
  'middlename',
  'middle_name',
  
  // Address information (potentially PII)
  'address',
  'streetaddress',
  'street_address',
  'postalcode',
  'postal_code',
  'zipcode',
  'zip_code',
] as const;

/**
 * Check if a key matches a PII pattern (case-insensitive)
 */
function isPIIKey(key: string): boolean {
  const normalizedKey = key.toLowerCase().replace(/[-_]/g, '');
  return PII_KEY_PATTERNS.some(pattern => normalizedKey.includes(pattern.toLowerCase()));
}

/**
 * Scrub PII from data object
 * 
 * Recursively processes an object and replaces values for keys that match
 * known PII patterns with "[REDACTED]". This function operates on the
 * EventPayload type which should be flat, but handles nested objects
 * defensively.
 * 
 * SECURITY: This is called before any data is sent over the network.
 * All event payloads and friction signal extras must pass through this.
 * 
 * @param data - Data object to scrub (typically EventPayload or Record<string, any>)
 * @returns Scrubbed data object with PII values replaced
 * 
 * @example
 * scrubPII({ email: 'user@example.com', buttonId: 'signup' })
 * // Returns: { email: '[REDACTED]', buttonId: 'signup' }
 */
export function scrubPII(data: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    // Primitives and arrays are returned as-is (per EventPayload contract, arrays shouldn't exist)
    return data;
  }

  const scrubbed: Record<string, any> = {};

  for (const [key, value] of Object.entries(data)) {
    if (isPIIKey(key)) {
      // Replace PII value with redaction marker
      scrubbed[key] = '[REDACTED]';
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively scrub nested objects (defensive, though payloads should be flat per contract)
      scrubbed[key] = scrubPII(value as Record<string, any>);
    } else {
      // Non-PII primitive value, keep as-is
      scrubbed[key] = value;
    }
  }

  return scrubbed;
}

/**
 * Minimize data to only required fields
 * 
 * NOTE: Currently a no-op. EventPayload contract already enforces flat structure
 * with primitive values only. This function is kept for future extensibility
 * if field-level filtering becomes necessary.
 * 
 * @param data - Data object to minimize
 * @returns Minimized data object (currently returns as-is)
 */
export function minimizeData(data: Record<string, any>): Record<string, any> {
  // Current implementation: no-op
  // EventPayload contract already enforces minimal structure (flat, primitives only)
  // Future: could filter out unnecessary fields based on event type
  return data;
}

/**
 * Mask sensitive fields in data object
 * 
 * NOTE: Currently a no-op. PII scrubbing is handled by scrubPII() above.
 * This function is kept for future extensibility if partial masking
 * (e.g., showing last 4 digits) becomes necessary.
 * 
 * @param data - Data object to mask
 * @returns Data object with masked fields (currently returns as-is)
 */
export function maskSensitiveFields(
  data: Record<string, any>
): Record<string, any> {
  // Current implementation: no-op
  // PII scrubbing is handled by scrubPII() which fully redacts values
  // Future: could implement partial masking (e.g., "****1234" for credit cards)
  return data;
}
