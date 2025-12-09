/**
 * Unit Tests - SDK Index
 * 
 * Basic tests to verify SDK exports and core functionality.
 */

import { describe, it, expect } from 'vitest';
import { Reveal, type EventKind, type FrictionSignal, type WireNudgeDecision } from '../../index';

describe('Reveal SDK', () => {
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

