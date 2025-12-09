/**
 * Unit Tests - Audit Logger
 * 
 * Tests for audit logging functionality.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logAuditEvent, createAuditEvent, setAuditLogger } from '../../security/auditLogger';
import type { Logger } from '../../utils/logger';

describe('auditLogger', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      logDebug: vi.fn(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    };
    setAuditLogger(mockLogger);
  });

  describe('createAuditEvent', () => {
    it('should create audit event with all fields', () => {
      const event = createAuditEvent(
        'data_access',
        'low',
        'Test message',
        { key: 'value' }
      );
      expect(event.type).toBe('data_access');
      expect(event.severity).toBe('low');
      expect(event.message).toBe('Test message');
      expect(event.metadata).toEqual({ key: 'value' });
      expect(event.timestamp).toBeTypeOf('number');
    });

    it('should create audit event without metadata', () => {
      const event = createAuditEvent('error', 'high', 'Error occurred');
      expect(event.metadata).toBeUndefined();
    });
  });

  describe('logAuditEvent', () => {
    it('should log low severity events as info', () => {
      const event = createAuditEvent('data_access', 'low', 'Test message');
      logAuditEvent(event);
      expect(mockLogger.logInfo).toHaveBeenCalledWith(
        '[AUDIT] DATA_ACCESS: Test message',
        expect.objectContaining({
          severity: 'low',
        })
      );
    });

    it('should log medium severity events as warn', () => {
      const event = createAuditEvent('error', 'medium', 'Test message');
      logAuditEvent(event);
      expect(mockLogger.logWarn).toHaveBeenCalledWith(
        '[AUDIT] ERROR: Test message',
        expect.objectContaining({
          severity: 'medium',
        })
      );
    });

    it('should log high severity events as error', () => {
      const event = createAuditEvent('error', 'high', 'Test message');
      logAuditEvent(event);
      expect(mockLogger.logError).toHaveBeenCalledWith(
        '[AUDIT] ERROR: Test message',
        expect.objectContaining({
          severity: 'high',
        })
      );
    });

    it('should log critical severity events as error', () => {
      const event = createAuditEvent('error', 'critical', 'Test message');
      logAuditEvent(event);
      expect(mockLogger.logError).toHaveBeenCalledWith(
        '[AUDIT] ERROR: Test message',
        expect.objectContaining({
          severity: 'critical',
        })
      );
    });

    it('should be no-op when logger not set', () => {
      setAuditLogger(undefined);
      const event = createAuditEvent('data_access', 'low', 'Test message');
      expect(() => logAuditEvent(event)).not.toThrow();
    });

    it('should handle logger errors gracefully', () => {
      const throwingLogger: Logger = {
        logDebug: vi.fn(),
        logInfo: vi.fn(() => {
          throw new Error('Logger error');
        }),
        logWarn: vi.fn(),
        logError: vi.fn(),
      };
      setAuditLogger(throwingLogger);
      const event = createAuditEvent('data_access', 'low', 'Test message');
      expect(() => logAuditEvent(event)).not.toThrow();
    });
  });
});

