/**
 * Unit Tests - Input Validation Module
 * 
 * Tests for URL validation, HTTPS enforcement, and input sanitization.
 */

import { describe, it, expect } from 'vitest';
import {
  validateHttpsUrl,
  validateAllBackendUrls,
  type ValidationResult,
} from '../../security/inputValidation';

describe('InputValidation', () => {
  describe('validateHttpsUrl', () => {
    it('should accept valid HTTPS URLs', () => {
      const validUrls = [
        'https://api.reveal.io',
        'https://api.reveal.io/ingest',
        'https://api.reveal.io:443/ingest',
        'https://example.com',
        'https://subdomain.example.com/path',
        'https://api.example.com:8443/decide?param=value',
      ];

      validUrls.forEach((url) => {
        const result = validateHttpsUrl(url);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should accept localhost HTTP URLs (development exception)', () => {
      const localhostUrls = [
        'http://localhost',
        'http://localhost:3000',
        'http://localhost:3000/ingest',
        'http://127.0.0.1',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3000/decide',
        'http://[::1]',
        'http://[::1]:3000',
      ];

      localhostUrls.forEach((url) => {
        const result = validateHttpsUrl(url);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject non-localhost HTTP URLs', () => {
      const invalidUrls = [
        'http://api.reveal.io',
        'http://example.com',
        'http://192.168.1.1',
        'http://10.0.0.1',
        'http://subdomain.example.com',
      ];

      invalidUrls.forEach((url) => {
        const result = validateHttpsUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must use HTTPS protocol');
        expect(result.error).toContain('localhost');
      });
    });

    it('should reject invalid URL formats', () => {
      const invalidFormats = [
        'not-a-url',
        '//api.reveal.io',
        'api.reveal.io',
        '/relative/path',
        '',
        '   ',
      ];

      invalidFormats.forEach((url) => {
        const result = validateHttpsUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject non-HTTP/HTTPS protocols', () => {
      const invalidProtocols = [
        'ftp://example.com',
        'ws://example.com',
        'wss://example.com', // Even wss:// should be rejected (we only allow https://)
        'file:///path/to/file',
      ];

      invalidProtocols.forEach((url) => {
        const result = validateHttpsUrl(url);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('must use HTTPS protocol');
      });
    });

    it('should handle null and undefined', () => {
      expect(validateHttpsUrl(null as any).valid).toBe(false);
      expect(validateHttpsUrl(undefined as any).valid).toBe(false);
    });

    it('should trim whitespace', () => {
      const result = validateHttpsUrl('  https://api.reveal.io  ');
      expect(result.valid).toBe(true);
    });
  });

  describe('validateAllBackendUrls', () => {
    it('should accept all valid HTTPS URLs', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'https://api.reveal.io/ingest',
        decisionEndpoint: 'https://api.reveal.io/decide',
        apiBase: 'https://api.reveal.io',
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept localhost HTTP URLs', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'http://localhost:3000/ingest',
        decisionEndpoint: 'http://localhost:3000/decide',
        apiBase: 'http://localhost:3000',
      });

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should work without apiBase', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'https://api.reveal.io/ingest',
        decisionEndpoint: 'https://api.reveal.io/decide',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject if ingest endpoint is invalid', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'http://api.reveal.io/ingest',
        decisionEndpoint: 'https://api.reveal.io/decide',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Ingest endpoint');
      expect(result.field).toBe('ingestEndpoint');
    });

    it('should reject if decision endpoint is invalid', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'https://api.reveal.io/ingest',
        decisionEndpoint: 'http://api.reveal.io/decide',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Decision endpoint');
      expect(result.field).toBe('decisionEndpoint');
    });

    it('should reject if apiBase is invalid', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'https://api.reveal.io/ingest',
        decisionEndpoint: 'https://api.reveal.io/decide',
        apiBase: 'http://api.reveal.io',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('API base URL');
      expect(result.field).toBe('apiBase');
    });

    it('should return first failure when multiple URLs are invalid', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'http://api.reveal.io/ingest', // First invalid
        decisionEndpoint: 'http://api.reveal.io/decide', // Also invalid
        apiBase: 'http://api.reveal.io', // Also invalid
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Ingest endpoint'); // First one
      expect(result.field).toBe('ingestEndpoint');
    });

    it('should handle mixed valid and invalid URLs', () => {
      const result = validateAllBackendUrls({
        ingestEndpoint: 'https://api.reveal.io/ingest', // Valid
        decisionEndpoint: 'http://api.reveal.io/decide', // Invalid
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Decision endpoint');
      expect(result.field).toBe('decisionEndpoint');
    });
  });
});

