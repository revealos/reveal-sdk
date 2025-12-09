/**
 * Transport Module
 * 
 * Handles HTTP transport of event batches to the backend /ingest endpoint.
 * 
 * Responsibilities:
 * - Send event batches via HTTP (fetch)
 * - Use sendBeacon for page unload scenarios
 * - Handle timeouts and network errors
 * - Retry failed requests with exponential backoff
 * - Classify errors as retryable vs non-retryable
 * 
 * Note: This module does NOT transform events or make decisions.
 * It is a simple, fire-and-forget sender.
 * 
 * @module modules/transport
 */

import type { BaseEvent } from "../types/events";
import type { Logger } from "../utils/logger";

/**
 * Transport options
 */
export interface TransportOptions {
  endpointUrl: string;
  clientKey: string;
  fetchFn?: typeof fetch;
  beaconFn?: (url: string, data: Blob) => boolean;
  onSuccess?: (batchId: string, meta: any) => void;
  onFailure?: (batchId: string, error: Error) => void;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  logger?: Logger;
}

/**
 * Transport interface
 */
export interface Transport {
  sendBatch(events: BaseEvent[], mode?: "normal" | "beacon"): Promise<void>;
}

/**
 * HTTP error class for 4xx/5xx responses
 */
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/**
 * Network error class for timeouts, DNS failures, etc.
 */
export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NetworkError";
  }
}

/**
 * Create a new Transport instance
 * 
 * @param options - Configuration options
 * @returns Transport instance
 */
export function createTransport(options: TransportOptions): Transport {
  // ──────────────────────────────────────────────────────────────────────
  // EXTRACT OPTIONS
  // ──────────────────────────────────────────────────────────────────────
  const {
    endpointUrl,
    clientKey,
    fetchFn = globalFetch,
    beaconFn = globalSendBeacon,
    onSuccess = () => {},
    onFailure = () => {},
    maxRetries = 2,
    retryDelayMs = 1000,
    timeoutMs = 10000,
    logger,
  } = options;

  // ──────────────────────────────────────────────────────────────────────
  // VALIDATE CONFIGURATION
  // ──────────────────────────────────────────────────────────────────────
  if (!endpointUrl || typeof endpointUrl !== "string") {
    throw new Error("Transport: endpointUrl is required");
  }

  if (!clientKey || typeof clientKey !== "string") {
    throw new Error("Transport: clientKey is required");
  }

  // ──────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────────────────
  function now(): number {
    return Date.now();
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function generateBatchId(): string {
    // Simple unique ID: timestamp + random
    return `batch_${now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  function createAbortController(): AbortController | { abort: () => void; signal: AbortSignal | null } {
    // In real implementation: return new AbortController()
    // For older browsers: fallback
    if (typeof AbortController !== "undefined") {
      return new AbortController();
    }
    // Fallback for older browsers
    return {
      abort: () => {},
      signal: null,
    };
  }

  function globalFetch(...args: Parameters<typeof fetch>): Promise<Response> {
    if (typeof fetch === "undefined") {
      throw new NetworkError("fetch is not available in this environment");
    }
    return fetch(...args);
  }

  function globalSendBeacon(url: string, data: Blob): boolean {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      return navigator.sendBeacon(url, data);
    }
    return false;
  }

  function safeTry<T>(fn: () => T, logger?: Logger, context?: string): T | null {
    try {
      return fn();
    } catch (error) {
      logger?.logError(`Error in ${context}:`, error);
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: classifyError()
  // ──────────────────────────────────────────────────────────────────────
  function classifyError(error: Error): "retryable" | "non-retryable" {
    if (error instanceof HttpError) {
      const status = error.status;

      // 4xx errors are non-retryable (client error)
      if (status >= 400 && status < 500) {
        // Exception: 408 (timeout), 429 (rate limit) are retryable
        if (status === 408 || status === 429) {
          return "retryable";
        }
        return "non-retryable";
      }

      // 5xx errors are retryable (server error)
      if (status >= 500 && status < 600) {
        return "retryable";
      }

      // Other HTTP errors default to non-retryable
      return "non-retryable";
    }

    if (error instanceof NetworkError) {
      // Network errors (timeout, offline, DNS) are retryable
      return "retryable";
    }

    // Unknown errors default to retryable (conservative)
    return "retryable";
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: performFetchRequest()
  // ──────────────────────────────────────────────────────────────────────
  async function performFetchRequest(
    events: BaseEvent[],
    batchId: string
  ): Promise<void> {
    // Create abort controller for timeout
    const abortController = createAbortController();
    const timeoutId = setTimeout(() => {
      if (abortController.abort) {
        abortController.abort();
      }
    }, timeoutMs);

    try {
      // Build request payload
      const payload = {
        batch_id: batchId,
        events: events,
        timestamp: now(),
      };

      // Make HTTP request
      const response = await fetchFn(endpointUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Reveal-Client-Key": clientKey,
          "X-Reveal-SDK-Version": "1.0.0",
        },
        body: JSON.stringify(payload),
        signal: abortController.signal as AbortSignal | undefined,
      });

      clearTimeout(timeoutId);

      // Check HTTP status
      if (!response.ok) {
        // Extract error details if available
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

        try {
          const errorBody = await response.json();
          if (errorBody.error) {
            errorMessage = errorBody.error;
          }
        } catch (parseError) {
          // Ignore JSON parse errors
        }

        throw new HttpError(response.status, errorMessage);
      }

      // Success - optionally parse response
      try {
        const result = await response.json();
        logger?.logDebug("Transport: server response", result);
      } catch (parseError) {
        // Non-JSON response is fine for 2xx
        logger?.logDebug("Transport: non-JSON success response");
      }
    } catch (error) {
      clearTimeout(timeoutId);

      // Classify and re-throw
      if (error instanceof Error && error.name === "AbortError") {
        throw new NetworkError(`Request timeout after ${timeoutMs}ms`);
      } else if (error instanceof HttpError) {
        throw error;
      } else if (error instanceof NetworkError) {
        throw error;
      } else {
        // Network error (DNS, offline, etc.)
        const message = error instanceof Error ? error.message : String(error);
        throw new NetworkError(message);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: sendWithFetch()
  // ──────────────────────────────────────────────────────────────────────
  async function sendWithFetch(events: BaseEvent[], batchId: string): Promise<void> {
    let attempt = 0;
    let lastError: Error | null = null;

    while (attempt <= maxRetries) {
      attempt++;

      try {
        logger?.logDebug(`Transport: fetch attempt ${attempt}/${maxRetries + 1}`, {
          batchId,
        });

        // Attempt to send
        await performFetchRequest(events, batchId);

        // Success
        logger?.logDebug("Transport: fetch successful", { batchId });
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Classify error
        const errorType = classifyError(lastError);

        logger?.logError(`Transport: fetch attempt ${attempt} failed`, {
          batchId,
          errorType,
          message: lastError.message,
        });

        // Check if error is retryable
        if (errorType === "non-retryable") {
          logger?.logError("Transport: non-retryable error, aborting", { batchId });
          throw lastError;
        }

        // If this wasn't the last attempt, wait before retrying
        if (attempt <= maxRetries) {
          // Exponential backoff: 1s, 2s, 4s (capped at 8s)
          const delayMs = Math.min(
            retryDelayMs * Math.pow(2, attempt - 1),
            8000
          );

          logger?.logDebug(`Transport: retrying in ${delayMs}ms`, { batchId });
          await sleep(delayMs);
        }
      }
    }

    // All retries exhausted
    logger?.logError(`Transport: all retries exhausted for batch ${batchId}`);
    throw new Error(
      `Failed after ${maxRetries + 1} attempts: ${lastError?.message || "Unknown error"}`
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: sendWithBeacon()
  // ──────────────────────────────────────────────────────────────────────
  async function sendWithBeacon(events: BaseEvent[], batchId: string): Promise<void> {
    logger?.logDebug("Transport: attempting sendBeacon", { batchId });

    // Check if sendBeacon is available
    if (typeof beaconFn !== "function") {
      logger?.logError("Transport: sendBeacon not available, falling back to fetch");

      // Fallback to fetch (best effort, no retries)
      try {
        await performFetchRequest(events, batchId);
        return;
      } catch (error) {
        logger?.logError("Transport: beacon fallback fetch failed", error);
        throw error;
      }
    }

    try {
      // Build request payload
      const payload = {
        batch_id: batchId,
        events: events,
        timestamp: now(),
      };

      // Serialize to Blob (required for sendBeacon)
      const blob = new Blob([JSON.stringify(payload)], {
        type: "application/json",
      });

      // Attempt to queue beacon
      const queued = beaconFn(endpointUrl, blob);

      if (!queued) {
        // sendBeacon returns false if payload too large or queue full
        logger?.logError("Transport: sendBeacon rejected (payload too large?)");
        throw new Error("sendBeacon rejected payload");
      }

      logger?.logDebug("Transport: sendBeacon queued successfully", { batchId });

      // Note: sendBeacon is fire-and-forget, we can't know if it actually succeeded
      // But we treat queuing as success for our purposes
    } catch (error) {
      logger?.logError("Transport: sendBeacon failed", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API: sendBatch()
  // ──────────────────────────────────────────────────────────────────────
  async function sendBatch(
    events: BaseEvent[],
    mode: "normal" | "beacon" = "normal"
  ): Promise<void> {
    // Guard: empty batch
    if (!events || !Array.isArray(events) || events.length === 0) {
      logger?.logDebug("Transport: empty batch, skipping send");
      return Promise.resolve();
    }

    logger?.logDebug("Transport: sending batch", {
      eventCount: events.length,
      mode,
    });

    // Generate batch ID for tracking
    const batchId = generateBatchId();

    try {
      if (mode === "beacon") {
        await sendWithBeacon(events, batchId);
      } else {
        await sendWithFetch(events, batchId);
      }

      // Success callback
      safeTry(
        () => {
          onSuccess(batchId, { eventCount: events.length });
        },
        logger,
        "onSuccess callback"
      );
    } catch (error) {
      // Failure callback
      safeTry(
        () => {
          onFailure(batchId, error instanceof Error ? error : new Error(String(error)));
        },
        logger,
        "onFailure callback"
      );

      // Re-throw so EventPipeline can handle re-queueing
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // RETURN PUBLIC API
  // ──────────────────────────────────────────────────────────────────────
  return {
    sendBatch,
  };
}

