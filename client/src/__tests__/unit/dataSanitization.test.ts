/**
 * Unit Tests - Data Sanitization
 * 
 * Tests for PII scrubbing functionality.
 */

import { describe, it, expect } from 'vitest';
import { scrubPII } from '../../security/dataSanitization';

describe('scrubPII', () => {
  it('should redact email addresses', () => {
    const input = {
      email: 'user@example.com',
      buttonId: 'signup',
    };
    const result = scrubPII(input);
    expect(result.email).toBe('[REDACTED]');
    expect(result.buttonId).toBe('signup');
  });

  it('should redact phone numbers', () => {
    const input = {
      phone: '555-1234',
      phoneNumber: '555-5678',
      phone_number: '555-9012',
    };
    const result = scrubPII(input);
    expect(result.phone).toBe('[REDACTED]');
    expect(result.phoneNumber).toBe('[REDACTED]');
    expect(result.phone_number).toBe('[REDACTED]');
  });

  it('should redact passwords and tokens', () => {
    const input = {
      password: 'secret123',
      token: 'abc123',
      accessToken: 'xyz789',
      apiKey: 'key123',
    };
    const result = scrubPII(input);
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.apiKey).toBe('[REDACTED]');
  });

  it('should redact financial information', () => {
    const input = {
      creditCard: '1234-5678-9012-3456',
      ssn: '123-45-6789',
      cvv: '123',
    };
    const result = scrubPII(input);
    expect(result.creditCard).toBe('[REDACTED]');
    expect(result.ssn).toBe('[REDACTED]');
    expect(result.cvv).toBe('[REDACTED]');
  });

  it('should handle case-insensitive matching', () => {
    const input = {
      Email: 'user@example.com',
      EMAIL: 'admin@example.com',
      Phone: '555-1234',
    };
    const result = scrubPII(input);
    expect(result.Email).toBe('[REDACTED]');
    expect(result.EMAIL).toBe('[REDACTED]');
    expect(result.Phone).toBe('[REDACTED]');
  });

  it('should handle nested objects', () => {
    const input = {
      user: {
        email: 'user@example.com',
        name: 'John Doe',
      },
      buttonId: 'signup',
    };
    const result = scrubPII(input);
    expect(result.user.email).toBe('[REDACTED]');
    expect(result.user.name).toBe('John Doe');
    expect(result.buttonId).toBe('signup');
  });

  it('should preserve non-PII fields', () => {
    const input = {
      buttonId: 'signup',
      page: '/onboarding',
      cartValue: 99.99,
      itemCount: 3,
      hasDiscount: true,
    };
    const result = scrubPII(input);
    expect(result).toEqual(input);
  });

  it('should handle empty objects', () => {
    const result = scrubPII({});
    expect(result).toEqual({});
  });

  it('should handle null and undefined values', () => {
    const input = {
      email: null,
      phone: undefined,
      buttonId: 'signup',
    };
    const result = scrubPII(input);
    expect(result.email).toBe('[REDACTED]');
    expect(result.phone).toBe('[REDACTED]');
    expect(result.buttonId).toBe('signup');
  });

  it('should handle arrays (defensive)', () => {
    const input = ['email@example.com', 'phone'];
    const result = scrubPII(input as any);
    expect(result).toEqual(input);
  });
});

