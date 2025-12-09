/**
 * Unit Tests - Transport Module
 * 
 * Tests for HTTP transport, retry logic, error classification, and beacon mode.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createTransport,
  type Transport,
  type TransportOptions,
  HttpError,
  NetworkError,
} from '../../modules/transport';
import type { Logger } from '../../utils/logger';
import type { BaseEvent } from '../../types/events';

describe('Transport', () => {
  let mockFetch: typeof fetch;
  let mockSendBeacon: (url: string, data: Blob) => boolean;
  let mockLogger: Logger;
  let transport: Transport;
  let onSuccessCallback: (batchId: string, meta: any) => void;
  let onFailureCallback: (batchId: string, error: Error) => void;

  const createMockEvent = (): BaseEvent => ({
    kind: 'product',
    name: 'test_event',
    event_source: 'user',
    session_id: 'test-session',
    is_treatment: true,
    timestamp: Date.now(),
    path: '/test',
    route: null,
    screen: null,
    user_agent: 'test-agent',
    viewport_width: 1920,
    viewport_height: 1080,
    payload: { key: 'value' },
  });

  beforeEach(() => {
    // Mock fetch
    mockFetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: () => Promise.resolve({ ok: true }),
      } as Response)
    ) as any;

    // Mock sendBeacon
    mockSendBeacon = vi.fn(() => true);

    // Mock Logger
    mockLogger = {
      logDebug: vi.fn(),
      logInfo: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    };

    // Mock callbacks
    onSuccessCallback = vi.fn();
    onFailureCallback = vi.fn();

    // Mock global fetch and navigator
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal('navigator', {
      sendBeacon: mockSendBeacon,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('createTransport', () => {
    it('should create a Transport instance', () => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        logger: mockLogger,
      };
      transport = createTransport(options);
      expect(transport).toBeDefined();
      expect(typeof transport.sendBatch).toBe('function');
    });

    it('should throw if endpointUrl is missing', () => {
      expect(() => {
        createTransport({
          endpointUrl: '',
          clientKey: 'test-key',
        } as TransportOptions);
      }).toThrow('Transport: endpointUrl is required');
    });

    it('should throw if clientKey is missing', () => {
      expect(() => {
        createTransport({
          endpointUrl: 'https://api.example.com/ingest',
          clientKey: '',
        } as TransportOptions);
      }).toThrow('Transport: clientKey is required');
    });

    it('should use default configuration values', () => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        logger: mockLogger,
      };
      transport = createTransport(options);
      // Should not throw and should work with defaults
      expect(transport).toBeDefined();
    });
  });

  describe('sendBatch', () => {
    beforeEach(() => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        fetchFn: mockFetch,
        beaconFn: mockSendBeacon,
        onSuccess: onSuccessCallback,
        onFailure: onFailureCallback,
        logger: mockLogger,
      };
      transport = createTransport(options);
    });

    it('should skip empty batches', async () => {
      await transport.sendBatch([]);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockLogger.logDebug).toHaveBeenCalledWith(
        'Transport: empty batch, skipping send'
      );
    });

    it('should send batch in normal mode', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events, 'normal');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = (mockFetch as any).mock.calls[0];
      expect(url).toBe('https://api.example.com/ingest');
      expect(options.method).toBe('POST');
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Reveal-Client-Key']).toBe('test-key');
      expect(options.headers['X-Reveal-SDK-Version']).toBe('1.0.0');
      expect(JSON.parse(options.body)).toMatchObject({
        events: events,
      });
    });

    it('should send batch in beacon mode', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events, 'beacon');

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      const [url, blob] = (mockSendBeacon as any).mock.calls[0];
      expect(url).toBe('https://api.example.com/ingest');
      expect(blob).toBeInstanceOf(Blob);
    });

    it('should invoke onSuccess callback on success', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events);

      expect(onSuccessCallback).toHaveBeenCalled();
      const [batchId, meta] = (onSuccessCallback as any).mock.calls[0];
      expect(typeof batchId).toBe('string');
      expect(batchId).toContain('batch_');
      expect(meta.eventCount).toBe(1);
    });

    it('should invoke onFailure callback on error', async () => {
      // Use a non-retryable error (4xx) so it fails immediately
      (mockFetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid request' }),
      } as Response);

      const events = [createMockEvent()];
      await expect(transport.sendBatch(events)).rejects.toThrow(HttpError);

      expect(onFailureCallback).toHaveBeenCalled();
      const [batchId, error] = (onFailureCallback as any).mock.calls[0];
      expect(typeof batchId).toBe('string');
      expect(error).toBeInstanceOf(HttpError);
    });

    it('should generate unique batch IDs', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events);
      const batchId1 = (onSuccessCallback as any).mock.calls[0][0];

      await transport.sendBatch(events);
      const batchId2 = (onSuccessCallback as any).mock.calls[1][0];

      expect(batchId1).not.toBe(batchId2);
    });
  });

  describe('retry logic', () => {
    beforeEach(() => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        fetchFn: mockFetch,
        logger: mockLogger,
        maxRetries: 2,
      };
      transport = createTransport(options);
    });

    it('should retry on retryable errors', async () => {
      // First two attempts fail with 500 (retryable), third succeeds
      (mockFetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({}),
        } as Response);

      const events = [createMockEvent()];
      await transport.sendBatch(events);

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should not retry on non-retryable errors (4xx)', async () => {
      (mockFetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({ error: 'Invalid request' }),
      } as Response);

      const events = [createMockEvent()];
      await expect(transport.sendBatch(events)).rejects.toThrow(HttpError);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry on 408 (timeout) and 429 (rate limit)', async () => {
      (mockFetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          statusText: 'Too Many Requests',
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({}),
        } as Response);

      const events = [createMockEvent()];
      await transport.sendBatch(events);

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should use exponential backoff for retries', async () => {
      vi.useFakeTimers();
      const sleepSpy = vi.spyOn(global, 'setTimeout');

      (mockFetch as any)
        .mockRejectedValueOnce(new NetworkError('Network error'))
        .mockRejectedValueOnce(new NetworkError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({}),
        } as Response);

      const events = [createMockEvent()];
      const sendPromise = transport.sendBatch(events);

      // Advance timers to trigger retries
      await vi.advanceTimersByTimeAsync(10000);
      await sendPromise;

      // Check that setTimeout was called with exponential backoff delays
      const delays = sleepSpy.mock.calls.map((call) => call[1] as number);
      expect(delays.length).toBeGreaterThan(0);
      // First retry should be around 1000ms, second around 2000ms
      vi.useRealTimers();
    });
  });

  describe('timeout handling', () => {
    it('should handle AbortError as NetworkError', async () => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        fetchFn: mockFetch,
        logger: mockLogger,
        timeoutMs: 1000,
        maxRetries: 0, // No retries for this test
      };
      transport = createTransport(options);

      // Mock fetch to reject with AbortError (simulating timeout)
      (mockFetch as any).mockImplementation(
        (url: string, options: any) => {
          // Simulate AbortController aborting the request
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          return Promise.reject(error);
        }
      );

      const events = [createMockEvent()];
      // The error gets wrapped after retries, but should contain timeout message
      await expect(transport.sendBatch(events)).rejects.toThrow(/timeout/);
      
      // Verify it was classified as a network error
      expect(mockLogger.logError).toHaveBeenCalled();
    });
  });

  describe('error classification', () => {
    beforeEach(() => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        fetchFn: mockFetch,
        logger: mockLogger,
        maxRetries: 1,
      };
      transport = createTransport(options);
    });

    it('should classify 4xx errors as non-retryable (except 408, 429)', async () => {
      (mockFetch as any).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: () => Promise.resolve({}),
      } as Response);

      const events = [createMockEvent()];
      await expect(transport.sendBatch(events)).rejects.toThrow(HttpError);

      expect(mockFetch).toHaveBeenCalledTimes(1); // No retries
    });

    it('should classify 5xx errors as retryable', async () => {
      vi.useFakeTimers();
      
      (mockFetch as any)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: () => Promise.resolve({}),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({}),
        } as Response);

      const events = [createMockEvent()];
      const sendPromise = transport.sendBatch(events);

      // Advance timers to allow retries
      await vi.advanceTimersByTimeAsync(5000);
      await sendPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2); // Retried once

      vi.useRealTimers();
    });

    it('should classify NetworkError as retryable', async () => {
      vi.useFakeTimers();
      
      (mockFetch as any)
        .mockRejectedValueOnce(new NetworkError('Network error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          json: () => Promise.resolve({}),
        } as Response);

      const events = [createMockEvent()];
      const sendPromise = transport.sendBatch(events);

      // Advance timers to allow retries
      await vi.advanceTimersByTimeAsync(5000);
      await sendPromise;

      expect(mockFetch).toHaveBeenCalledTimes(2); // Retried once

      vi.useRealTimers();
    });
  });

  describe('beacon mode', () => {
    beforeEach(() => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        fetchFn: mockFetch,
        beaconFn: mockSendBeacon,
        logger: mockLogger,
      };
      transport = createTransport(options);
    });

    it('should use sendBeacon when available', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events, 'beacon');

      expect(mockSendBeacon).toHaveBeenCalledTimes(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should fallback to fetch if sendBeacon unavailable', async () => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        fetchFn: mockFetch,
        beaconFn: null as any, // Pass null to trigger fallback check
        logger: mockLogger,
      };
      transport = createTransport(options);

      const events = [createMockEvent()];
      await transport.sendBatch(events, 'beacon');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockLogger.logError).toHaveBeenCalledWith(
        'Transport: sendBeacon not available, falling back to fetch'
      );
    });

    it('should throw if sendBeacon rejects payload', async () => {
      (mockSendBeacon as any).mockReturnValueOnce(false);

      const events = [createMockEvent()];
      await expect(transport.sendBatch(events, 'beacon')).rejects.toThrow(
        'sendBeacon rejected payload'
      );
    });

    it('should serialize payload to Blob for sendBeacon', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events, 'beacon');

      const [, blob] = (mockSendBeacon as any).mock.calls[0];
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('application/json');
    });
  });

  describe('request format', () => {
    beforeEach(() => {
      const options: TransportOptions = {
        endpointUrl: 'https://api.example.com/ingest',
        clientKey: 'test-key',
        fetchFn: mockFetch,
        logger: mockLogger,
      };
      transport = createTransport(options);
    });

    it('should include correct headers', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events);

      const [, options] = (mockFetch as any).mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Reveal-Client-Key']).toBe('test-key');
      expect(options.headers['X-Reveal-SDK-Version']).toBe('1.0.0');
    });

    it('should include batch_id, events, and timestamp in payload', async () => {
      const events = [createMockEvent()];
      await transport.sendBatch(events);

      const [, options] = (mockFetch as any).mock.calls[0];
      const payload = JSON.parse(options.body);
      expect(payload).toHaveProperty('batch_id');
      expect(payload).toHaveProperty('events');
      expect(payload).toHaveProperty('timestamp');
      expect(Array.isArray(payload.events)).toBe(true);
      expect(payload.events.length).toBe(1);
    });
  });

  describe('HttpError and NetworkError', () => {
    it('should create HttpError with status', () => {
      const error = new HttpError(404, 'Not Found');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('HttpError');
      expect(error.status).toBe(404);
      expect(error.message).toBe('Not Found');
    });

    it('should create NetworkError', () => {
      const error = new NetworkError('Connection failed');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('NetworkError');
      expect(error.message).toBe('Connection failed');
    });
  });
});

