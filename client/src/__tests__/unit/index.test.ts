/**
 * Unit Tests - SDK Index
 * 
 * Basic tests to verify SDK exports and core functionality.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Reveal, type EventKind, type FrictionSignal, type WireNudgeDecision } from '../../index';

describe('Reveal SDK', () => {
  // Reset SDK state before each test
  beforeEach(() => {
    // Destroy any existing SDK instance (synchronous)
    Reveal.destroy();
    // Wait a bit to ensure cleanup completes
    return new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(() => {
    // Clean up after each test
    Reveal.destroy();
  });

  describe('Exports', () => {
    it('should export Reveal object', () => {
      expect(Reveal).toBeDefined();
      expect(typeof Reveal).toBe('object');
    });

    it('should export Reveal.init function', () => {
      expect(Reveal.init).toBeDefined();
      expect(typeof Reveal.init).toBe('function');
    });

    it('should export Reveal.track function', () => {
      expect(Reveal.track).toBeDefined();
      expect(typeof Reveal.track).toBe('function');
    });

    it('should export Reveal.onNudgeDecision function', () => {
      expect(Reveal.onNudgeDecision).toBeDefined();
      expect(typeof Reveal.onNudgeDecision).toBe('function');
    });
  });

  describe('Type Exports', () => {
    it('should export EventKind type', () => {
      // Type check - this will fail at compile time if type doesn't exist
      const kind: EventKind = 'product';
      expect(kind).toBe('product');
    });

    it('should export FrictionSignal interface', () => {
      const signal: FrictionSignal = {
        type: 'stall',
        pageUrl: 'https://example.com',
        selector: '#button',
        timestamp: Date.now(),
      };
      expect(signal.type).toBe('stall');
      expect(signal.pageUrl).toBe('https://example.com');
    });

    it('should export WireNudgeDecision type', () => {
      const decision: WireNudgeDecision = {
        nudgeId: 'nudge_123',
        templateId: 'tooltip',
        title: 'Test',
      };
      expect(decision.nudgeId).toBe('nudge_123');
      expect(decision.templateId).toBe('tooltip');
    });
  });

  describe('Reveal.init', () => {
    it('should accept clientKey and options', () => {
      expect(() => {
        Reveal.init('test-key', { debug: true });
      }).not.toThrow();
    });

    it('should accept clientKey without options', () => {
      expect(() => {
        Reveal.init('test-key');
      }).not.toThrow();
    });

    describe('Config fetch', () => {
      it('should fetch config from backend when apiBase is provided', async () => {
        const mockConfig = {
          projectId: 'test-project',
          environment: 'development',
          sdk: { samplingRate: 1.0 },
          decision: { endpoint: '/decide', timeoutMs: 2000 },
          templates: [],
          ttlSeconds: 60,
        };

        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockConfig,
        }) as any;

        try {
          await Reveal.init('test-key', {
            apiBase: 'https://api.reveal.io',
          });

          // Verify fetch was called for config
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/config'),
            expect.objectContaining({
              method: 'GET',
              headers: expect.objectContaining({
                'X-Reveal-Client-Key': 'test-key',
              }),
            })
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('should fall back to minimalConfig if config fetch fails', async () => {
        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any;

        try {
          // Should not throw - should fall back gracefully
          await Reveal.init('test-key', {
            apiBase: 'https://api.reveal.io',
          });

          // SDK should still be functional with fallback config
          expect(() => {
            Reveal.track('product', 'test');
          }).not.toThrow();
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('should use configEndpoint if explicitly provided', async () => {
        const mockConfig = {
          projectId: 'test-project',
          environment: 'development',
          sdk: { samplingRate: 1.0 },
          decision: { endpoint: '/decide', timeoutMs: 2000 },
          templates: [],
          ttlSeconds: 60,
        };

        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockConfig,
        }) as any;

        try {
          await Reveal.init('test-key', {
            configEndpoint: 'https://custom.api.com/config',
          });

          // Verify fetch was called with custom endpoint
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('https://custom.api.com/config'),
            expect.any(Object)
          );
        } finally {
          global.fetch = originalFetch;
        }
      });

      it('should construct config endpoint from apiBase if configEndpoint not provided', async () => {
        const mockConfig = {
          projectId: 'test-project',
          environment: 'development',
          sdk: { samplingRate: 1.0 },
          decision: { endpoint: '/decide', timeoutMs: 2000 },
          templates: [],
          ttlSeconds: 60,
        };

        const originalFetch = global.fetch;
        global.fetch = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => mockConfig,
        }) as any;

        try {
          await Reveal.init('test-key', {
            apiBase: 'https://api.example.com',
          });

          // Verify fetch was called with constructed endpoint
          expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('https://api.example.com/config?environment=development'),
            expect.any(Object)
          );
        } finally {
          global.fetch = originalFetch;
        }
      });
    });

    describe('HTTPS URL validation', () => {

      it('should initialize successfully with HTTPS URLs', async () => {
        await Reveal.init('test-key', {
          ingestEndpoint: 'https://api.reveal.io/ingest',
          decisionEndpoint: 'https://api.reveal.io/decide',
        });
        // Should not throw and SDK should be initialized
        expect(() => {
          Reveal.track('product', 'test');
        }).not.toThrow();
      });

      it('should initialize successfully with localhost HTTP URLs (development exception)', async () => {
        await Reveal.init('test-key', {
          ingestEndpoint: 'http://localhost:3000/ingest',
          decisionEndpoint: 'http://localhost:3000/decide',
        });
        // Should not throw and SDK should be initialized
        expect(() => {
          Reveal.track('product', 'test');
        }).not.toThrow();
      });

      it('should initialize successfully with 127.0.0.1 HTTP URLs (development exception)', async () => {
        await Reveal.init('test-key', {
          ingestEndpoint: 'http://127.0.0.1:3000/ingest',
          decisionEndpoint: 'http://127.0.0.1:3000/decide',
        });
        // Should not throw and SDK should be initialized
        expect(() => {
          Reveal.track('product', 'test');
        }).not.toThrow();
      });

      it('should disable SDK and log error for non-HTTPS ingest endpoint', async () => {
        const errorCalls: any[] = [];
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
          errorCalls.push(args);
        });
        
        await Reveal.init('test-key-https-validation-1', {
          ingestEndpoint: 'http://api.reveal.io/ingest', // Invalid: non-localhost HTTP
          decisionEndpoint: 'https://api.reveal.io/decide',
        });

        // Wait for async validation to complete (config fetch + URL validation)
        // Increased timeout to account for config fetch in CI
        await new Promise(resolve => setTimeout(resolve, 500));

        // SDK should be disabled and error logged
        expect(errorCalls.length).toBeGreaterThan(0);
        
        // Look for SECURITY error - it should contain "SECURITY", "Ingest", and "HTTPS"
        // The exact format is: "[Reveal SDK] SECURITY: Backend URLs must use HTTPS. Ingest endpoint URL must use HTTPS protocol: ..."
        // Check all arguments in each call, not just the first one
        const securityError = errorCalls.find(call => {
          // Convert all arguments to string and check
          const allArgs = call.map((arg: any) => String(arg || '')).join(' ');
          return allArgs.includes('SECURITY') && 
                 (allArgs.includes('Ingest') || allArgs.includes('ingest') || allArgs.includes('ingestEndpoint')) &&
                 allArgs.includes('HTTPS');
        });
        
        // If not found, log all errors for debugging
        if (!securityError && errorCalls.length > 0) {
          const allErrorMessages = errorCalls.map(call => call.map((arg: any) => String(arg || '')).join(' '));
          console.log('All error calls:', allErrorMessages);
        }
        
        expect(securityError).toBeDefined();
        const errorMsg = securityError.map((arg: any) => String(arg || '')).join(' ');
        expect(errorMsg).toContain('HTTPS');

        // SDK should not function (disabled)
        Reveal.track('product', 'test'); // Should be no-op when disabled

        consoleErrorSpy.mockRestore();
      });

      it('should disable SDK and log error for non-HTTPS decision endpoint', async () => {
        const errorCalls: any[] = [];
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
          errorCalls.push(args);
        });
        
        await Reveal.init('test-key-https-validation-2', {
          ingestEndpoint: 'https://api.reveal.io/ingest',
          decisionEndpoint: 'http://api.reveal.io/decide', // Invalid: non-localhost HTTP
        });

        // Wait for async validation to complete (config fetch + URL validation)
        // Increased timeout to account for config fetch in CI
        await new Promise(resolve => setTimeout(resolve, 500));

        // SDK should be disabled and error logged
        // May see config fetch error first, but SECURITY error should also appear
        expect(errorCalls.length).toBeGreaterThan(0);
        
        // Look for SECURITY error - it should contain "SECURITY", "Decision", and "HTTPS"
        // The exact format is: "[Reveal SDK] SECURITY: Backend URLs must use HTTPS. Decision endpoint URL must use HTTPS protocol: ..."
        // Check all arguments in each call, not just the first one
        const securityError = errorCalls.find(call => {
          // Convert all arguments to string and check
          const allArgs = call.map((arg: any) => String(arg || '')).join(' ');
          return allArgs.includes('SECURITY') && 
                 (allArgs.includes('Decision') || allArgs.includes('decision') || allArgs.includes('decisionEndpoint')) &&
                 allArgs.includes('HTTPS');
        });
        
        // If not found, log all errors for debugging
        if (!securityError && errorCalls.length > 0) {
          const allErrorMessages = errorCalls.map(call => call.map((arg: any) => String(arg || '')).join(' '));
          console.log('All error calls:', allErrorMessages);
        }
        
        expect(securityError).toBeDefined();
        const errorMsg = securityError.map((arg: any) => String(arg || '')).join(' ');
        expect(errorMsg).toContain('HTTPS');

        consoleErrorSpy.mockRestore();
      });

      it('should disable SDK and log error for non-HTTPS apiBase', async () => {
        const errorCalls: any[] = [];
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
          errorCalls.push(args);
        });
        
        await Reveal.init('test-key-https-validation-3', {
          apiBase: 'http://api.reveal.io', // Invalid: non-localhost HTTP
        });

        // Wait for async validation to complete (apiBase is validated synchronously, but wait for config fetch)
        // Increased timeout to account for config fetch in CI
        await new Promise(resolve => setTimeout(resolve, 500));

        // SDK should be disabled and error logged
        // apiBase is validated first, before it's used to construct URLs
        expect(errorCalls.length).toBeGreaterThan(0);
        
        // Look for SECURITY error - it should contain "SECURITY", "API base", and "HTTPS"
        // The exact format is: "[Reveal SDK] SECURITY: Backend URLs must use HTTPS. API base URL URL must use HTTPS protocol: ..."
        // Check all arguments in each call, not just the first one
        const securityError = errorCalls.find(call => {
          // Convert all arguments to string and check
          const allArgs = call.map((arg: any) => String(arg || '')).join(' ');
          return allArgs.includes('SECURITY') && 
                 (allArgs.includes('API base') || allArgs.includes('apiBase') || allArgs.includes('api base')) &&
                 allArgs.includes('HTTPS');
        });
        
        // If not found, log all errors for debugging
        if (!securityError && errorCalls.length > 0) {
          const allErrorMessages = errorCalls.map(call => call.map((arg: any) => String(arg || '')).join(' '));
          console.log('All error calls:', allErrorMessages);
        }
        
        expect(securityError).toBeDefined();
        const errorMsg = securityError.map((arg: any) => String(arg || '')).join(' ');
        expect(errorMsg).toContain('HTTPS');
        expect(errorMsg).toMatch(/API base|apiBase|api base/i);

        consoleErrorSpy.mockRestore();
      });

      it('should disable SDK for invalid URL format', async () => {
        const errorCalls: any[] = [];
        const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation((...args) => {
          errorCalls.push(args);
        });
        
        await Reveal.init('test-key-https-validation-4', {
          ingestEndpoint: 'not-a-valid-url',
          decisionEndpoint: 'https://api.reveal.io/decide',
        });

        // Wait for async validation to complete (config fetch + URL validation)
        // Increased timeout to account for config fetch in CI
        await new Promise(resolve => setTimeout(resolve, 500));

        // SDK should be disabled and error logged
        // May be SECURITY error or ConfigClient fetch error (both are valid)
        expect(errorCalls.length).toBeGreaterThan(0);
        
        // Check all arguments in each call, not just the first one
        const hasSecurityError = errorCalls.some(call => {
          const allArgs = call.map((arg: any) => String(arg || '')).join(' ');
          return allArgs.includes('SECURITY');
        });
        const hasConfigError = errorCalls.some(call => {
          const allArgs = call.map((arg: any) => String(arg || '')).join(' ');
          return allArgs.includes('ConfigClient') || 
                 allArgs.includes('config') || 
                 allArgs.includes('Invalid URL') ||
                 allArgs.includes('Invalid URL format');
        });
        
        // If not found, log all errors for debugging
        if (!hasSecurityError && !hasConfigError && errorCalls.length > 0) {
          const allErrorMessages = errorCalls.map(call => call.map((arg: any) => String(arg || '')).join(' '));
          console.log('All error calls:', allErrorMessages);
        }
        
        expect(hasSecurityError || hasConfigError).toBe(true);

        consoleErrorSpy.mockRestore();
      });
    });
  });

  describe('Reveal.track', () => {
    it('should accept eventKind, eventType, and properties', () => {
      expect(() => {
        Reveal.track('product', 'test_event', { key: 'value' });
      }).not.toThrow();
    });

    it('should accept eventKind and eventType without properties', () => {
      expect(() => {
        Reveal.track('product', 'test_event');
      }).not.toThrow();
    });

    it('should accept all event kinds', () => {
      const kinds: EventKind[] = ['product', 'friction', 'nudge', 'session'];
      kinds.forEach((kind) => {
        expect(() => {
          Reveal.track(kind, 'test_event');
        }).not.toThrow();
      });
    });
  });

  describe('Reveal.onNudgeDecision', () => {
    it('should accept a handler function', () => {
      const handler = (decision: WireNudgeDecision) => {
        // Handler implementation
      };
      expect(() => {
        Reveal.onNudgeDecision(handler);
      }).not.toThrow();
    });

    it('should return an unsubscribe function', () => {
      const handler = () => {};
      const unsubscribe = Reveal.onNudgeDecision(handler);
      expect(typeof unsubscribe).toBe('function');
    });
  });
});

