/**
 * Unit Tests - DecisionClient Module
 * 
 * Tests for decision request handling, validation, and Transport integration.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createDecisionClient,
  type DecisionClient,
  type DecisionClientOptions,
} from '../../modules/decisionClient';
import type { Transport } from '../../modules/transport';
import type { Logger } from '../../utils/logger';
import type { FrictionSignal } from '../../types/friction';

describe('DecisionClient', () => {
  let mockTransport: Transport;
  let mockLogger: Logger;
  let decisionClient: DecisionClient;

  const createMockFrictionSignal = (): FrictionSignal => ({
    type: 'stall',
    pageUrl: 'https://example.com',
    selector: null,
    timestamp: Date.now(),
    extra: {},
  });

  beforeEach(() => {
    // Mock Transport
    mockTransport = {
      sendBatch: vi.fn(),
      sendDecisionRequest: vi.fn(),
    };

    // Mock Logger
    mockLogger = {
      logDebug: vi.fn(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createDecisionClient', () => {
    it('should create a DecisionClient instance', () => {
      const options: DecisionClientOptions = {
        endpoint: 'https://api.example.com/decide',
        timeoutMs: 200,
        projectId: 'test-project',
        environment: 'development',
        transport: mockTransport,
        logger: mockLogger,
      };
      decisionClient = createDecisionClient(options);
      expect(decisionClient).toBeDefined();
      expect(typeof decisionClient.requestDecision).toBe('function');
    });

    it('should throw if endpoint is missing', () => {
      expect(() => {
        createDecisionClient({
          endpoint: '',
          timeoutMs: 200,
          projectId: 'test-project',
          environment: 'development',
          transport: mockTransport,
        } as DecisionClientOptions);
      }).toThrow('DecisionClient: endpoint is required');
    });

    it('should throw if projectId is missing', () => {
      expect(() => {
        createDecisionClient({
          endpoint: 'https://api.example.com/decide',
          timeoutMs: 200,
          projectId: '',
          environment: 'development',
          transport: mockTransport,
        } as DecisionClientOptions);
      }).toThrow('DecisionClient: projectId is required');
    });

    it('should throw if timeoutMs is invalid', () => {
      expect(() => {
        createDecisionClient({
          endpoint: 'https://api.example.com/decide',
          timeoutMs: -1,
          projectId: 'test-project',
          environment: 'development',
          transport: mockTransport,
        } as DecisionClientOptions);
      }).toThrow('DecisionClient: timeoutMs must be a positive number');
    });
  });

  describe('requestDecision', () => {
    beforeEach(() => {
      decisionClient = createDecisionClient({
        endpoint: 'https://api.example.com/decide',
        timeoutMs: 200,
        projectId: 'test-project',
        environment: 'development',
        transport: mockTransport,
        logger: mockLogger,
      });
    });

    it('should request decision successfully', async () => {
      const signal = createMockFrictionSignal();
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue({
        decision: {
          nudgeId: 'nudge_1',
          templateId: 'tooltip',
          title: 'Test nudge',
          body: 'Test body',
        },
      });

      const result = await decisionClient.requestDecision(signal, context);

      expect(result).toBeDefined();
      expect(result?.nudgeId).toBe('nudge_1');
      expect(result?.templateId).toBe('tooltip');
      expect(mockTransport.sendDecisionRequest).toHaveBeenCalledTimes(1);
    });

    it('should return null when backend returns no decision', async () => {
      const signal = createMockFrictionSignal();
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue({
        decision: null,
      });

      const result = await decisionClient.requestDecision(signal, context);

      expect(result).toBeNull();
    });

    it('should return null when transport returns null', async () => {
      const signal = createMockFrictionSignal();
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue(null);

      const result = await decisionClient.requestDecision(signal, context);

      expect(result).toBeNull();
    });

    it('should return null for invalid signal', async () => {
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      const result = await decisionClient.requestDecision({} as FrictionSignal, context);

      expect(result).toBeNull();
      expect(mockLogger.logError).toHaveBeenCalled();
      expect(mockTransport.sendDecisionRequest).not.toHaveBeenCalled();
    });

    it('should return null for invalid context', async () => {
      const signal = createMockFrictionSignal();

      const result = await decisionClient.requestDecision(signal, {} as any);

      expect(result).toBeNull();
      expect(mockLogger.logError).toHaveBeenCalled();
      expect(mockTransport.sendDecisionRequest).not.toHaveBeenCalled();
    });

    it('should scrub PII from friction.extra before sending', async () => {
      const signal: FrictionSignal = {
        type: 'stall',
        pageUrl: 'https://example.com?email=test@example.com',
        selector: null,
        timestamp: Date.now(),
        extra: {
          email: 'test@example.com',
          phone: '123-456-7890',
          safeField: 'safe-value',
        },
      };
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue({
        decision: null,
      });

      await decisionClient.requestDecision(signal, context);

      const callArgs = (mockTransport.sendDecisionRequest as any).mock.calls[0];
      const payload = callArgs[1];
      expect(payload.friction.pageUrl).toBe('https://example.com?email=[REDACTED]');
      expect(payload.friction.extra.email).toBe('[REDACTED]');
      expect(payload.friction.extra.phone).toBe('[REDACTED]');
      expect(payload.friction.extra.safeField).toBe('safe-value');
    });

    it('should handle transport errors gracefully', async () => {
      const signal = createMockFrictionSignal();
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue(null);

      const result = await decisionClient.requestDecision(signal, context);

      expect(result).toBeNull();
      // Should not throw
    });

    it('should validate decision response correctly', async () => {
      const signal = createMockFrictionSignal();
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue({
        decision: {
          nudgeId: 'nudge_1',
          templateId: 'tooltip',
        },
      });

      const result = await decisionClient.requestDecision(signal, context);

      expect(result).toBeDefined();
      expect(result?.nudgeId).toBe('nudge_1');
      expect(result?.templateId).toBe('tooltip');
    });

    it('should return null for invalid decision response (missing nudgeId)', async () => {
      const signal = createMockFrictionSignal();
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue({
        decision: {
          templateId: 'tooltip',
          // missing nudgeId
        },
      });

      const result = await decisionClient.requestDecision(signal, context);

      expect(result).toBeNull();
      expect(mockLogger.logError).toHaveBeenCalled();
    });

    it('should return null for invalid decision response (missing templateId)', async () => {
      const signal = createMockFrictionSignal();
      const context = {
        projectId: 'test-project',
        sessionId: 'test-session',
      };

      (mockTransport.sendDecisionRequest as any).mockResolvedValue({
        decision: {
          nudgeId: 'nudge_1',
          // missing templateId
        },
      });

      const result = await decisionClient.requestDecision(signal, context);

      expect(result).toBeNull();
      expect(mockLogger.logError).toHaveBeenCalled();
    });
  });
});
