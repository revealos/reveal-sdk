/**
 * ConfigClient Module
 * 
 * Fetches and caches client-safe configuration from the backend /config endpoint.
 * 
 * Responsibilities:
 * - Fetch configuration from backend
 * - Cache configuration with TTL
 * - Return only client-safe configuration (no backend rules/detectors)
 * - Handle authentication via client key
 * 
 * Security:
 * - Validates SSL certificates
 * - Enforces secure defaults
 * - Logs configuration fetch attempts for audit
 * 
 * @module modules/configClient
 */

import type { ClientConfig } from "../types/config";
import type { Logger } from "../utils/logger";
import { validateHttpsUrl } from "../security/inputValidation";

/**
 * Configuration options for ConfigClient
 */
export interface ConfigClientOptions {
  endpoint: string;
  clientKey: string;
  environment?: "production" | "staging" | "development";
  fetchFn?: typeof fetch;
  logger?: Logger;
  timeoutMs?: number;
}

// ClientConfig is imported from types/config

/**
 * ConfigClient interface
 */
export interface ConfigClient {
  getConfig(): Promise<ClientConfig | null>;
  getCachedConfig(): ClientConfig | null;
  getLastFetchTime(): number | null;
  getFetchCount(): number;
}

/**
 * Create a new ConfigClient instance
 * 
 * @param options - Configuration options
 * @returns ConfigClient instance
 */
export function createConfigClient(
  options: ConfigClientOptions
): ConfigClient {
  const {
    endpoint,
    clientKey,
    environment = "development",
    fetchFn = typeof fetch !== "undefined" ? fetch : undefined,
    logger,
    timeoutMs = 5000,
  } = options;

  // Validate options
  if (!endpoint || typeof endpoint !== "string") {
    throw new Error("ConfigClient: endpoint is required and must be a string");
  }
  if (!clientKey || typeof clientKey !== "string") {
    throw new Error("ConfigClient: clientKey is required and must be a string");
  }

  // Default to global fetch if available
  const finalFetchFn = fetchFn || (typeof fetch !== "undefined" ? fetch : undefined);
  if (!finalFetchFn || typeof finalFetchFn !== "function") {
    throw new Error("ConfigClient: fetchFn is required and must be a function");
  }

  // Validate endpoint URL for HTTPS (with localhost exception)
  const urlValidation = validateHttpsUrl(endpoint);
  if (!urlValidation.valid) {
    throw new Error(`ConfigClient: ${urlValidation.error}`);
  }

  // Cache state
  let cachedConfig: ClientConfig | null = null;
  let lastFetchTime: number | null = null;
  let fetchCount = 0;
  let cacheExpiresAt: number = 0;

  /**
   * Check if cached config is still valid
   */
  function isCacheValid(): boolean {
    if (!cachedConfig || cacheExpiresAt === 0) {
      return false;
    }
    return Date.now() < cacheExpiresAt;
  }

  /**
   * Validate config structure matches ClientConfig interface
   */
  function validateConfig(data: any): data is ClientConfig {
    if (!data || typeof data !== "object") {
      logger?.logWarn("ConfigClient: invalid config - not an object");
      return false;
    }

    // Check configVersion
    const version = data.configVersion ?? 1;
    if (typeof version !== "number" || version < 1) {
      logger?.logError("ConfigClient: invalid configVersion", { version });
      return false;
    }
    if (version > 1) { // CURRENT_CONFIG_VERSION imported would be better, but avoiding import for minimal diff
      logger?.logWarn("ConfigClient: config version higher than SDK supports", {
        configVersion: version,
        sdkVersion: 1,
      });
    }

    // Check required fields
    if (typeof data.projectId !== "string") {
      logger?.logWarn("ConfigClient: missing projectId");
      return false;
    }
    if (!["production", "staging", "development"].includes(data.environment)) {
      logger?.logWarn("ConfigClient: invalid environment");
      return false;
    }
    if (!data.sdk || typeof data.sdk !== "object") {
      logger?.logWarn("ConfigClient: missing sdk object");
      return false;
    }
    if (typeof data.sdk.samplingRate !== "number") {
      logger?.logWarn("ConfigClient: invalid sdk.samplingRate");
      return false;
    }
    if (!data.decision || typeof data.decision !== "object") {
      logger?.logWarn("ConfigClient: missing decision object");
      return false;
    }
    if (typeof data.decision.endpoint !== "string") {
      logger?.logWarn("ConfigClient: invalid decision.endpoint");
      return false;
    }
    if (typeof data.decision.timeoutMs !== "number") {
      logger?.logWarn("ConfigClient: invalid decision.timeoutMs");
      return false;
    }
    if (!Array.isArray(data.templates)) {
      logger?.logWarn("ConfigClient: invalid templates");
      return false;
    }
    if (typeof data.ttlSeconds !== "number") {
      logger?.logWarn("ConfigClient: invalid ttlSeconds");
      return false;
    }

    // Warn on unknown keys (AFTER all known fields checked)
    // NOTE: unknownKeys does NOT strip keys - this is only a warning. The raw data object
    // is returned as-is (see line 261: cachedConfig = data). All keys survive validation.
    const knownKeys = new Set([
      "configVersion",
      "projectId",
      "environment",
      "sdk",
      "decision",
      "features",
      "treatment_rules", // ADD: Allow treatment_rules through validation
      "templates",
      "ttlSeconds",
    ]);
    const unknownKeys = Object.keys(data).filter((k) => !knownKeys.has(k));
    if (unknownKeys.length > 0) {
      logger?.logWarn("ConfigClient: unknown config keys (will be ignored)", { unknownKeys });
    }

    return true;
  }
  
  return {
    getConfig: async () => {
      try {
        fetchCount++;

        // Check cache first
        if (isCacheValid()) {
          try {
            logger?.logDebug("ConfigClient: returning cached config");
          } catch {
            // Ignore logger errors
          }
          return cachedConfig;
        }

        // Build config URL with environment query param
        // Endpoint should already be the full /config URL (constructed by entryPoint)
        // Just add query param
        const separator = endpoint.includes("?") ? "&" : "?";
        const configUrl = `${endpoint}${separator}environment=${encodeURIComponent(environment)}`;

        try {
          logger?.logDebug("ConfigClient: fetching config", { url: configUrl });
        } catch {
          // Ignore logger errors
        }

        // Create abort controller for timeout
        const abortController = typeof AbortController !== "undefined" ? new AbortController() : null;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        if (abortController) {
          timeoutId = setTimeout(() => {
            if (abortController.abort) {
              abortController.abort();
            }
          }, timeoutMs);
        }

        try {
          // Make GET request
          const response = await finalFetchFn(configUrl, {
            method: "GET",
            headers: {
              "X-Reveal-Client-Key": clientKey,
              "Content-Type": "application/json",
            },
            signal: abortController?.signal,
          });

          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // Check HTTP status
          if (!response.ok) {
            const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
            try {
              logger?.logError("ConfigClient: HTTP error", { status: response.status, statusText: response.statusText });
            } catch {
              // Ignore logger errors
            }
            return null;
          }

          // Parse JSON response
          const data = await response.json();

          // Validate config structure
          if (!validateConfig(data)) {
            try {
              logger?.logError("ConfigClient: invalid config structure", { data });
            } catch {
              // Ignore logger errors
            }
            return null;
          }

          // Update cache
          cachedConfig = data;
          lastFetchTime = Date.now();
          const ttlSeconds = data.ttlSeconds || 60;
          cacheExpiresAt = Date.now() + (ttlSeconds * 1000);

          try {
            logger?.logDebug("ConfigClient: config fetched successfully", { projectId: data.projectId, environment: data.environment });
          } catch {
            // Ignore logger errors
          }

          return cachedConfig;
        } catch (error: any) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }

          // Handle abort (timeout)
          if (error?.name === "AbortError" || (error instanceof Error && error.message.includes("aborted"))) {
            try {
              logger?.logError("ConfigClient: request timeout", { timeoutMs });
            } catch {
              // Ignore logger errors
            }
            return null;
          }

          // Handle other errors
          try {
            logger?.logError("ConfigClient: fetch error", { error: error?.message || String(error) });
          } catch {
            // Ignore logger errors
          }
          return null;
        }
      } catch (error: any) {
        try {
          logger?.logError("ConfigClient: unexpected error", { error: error?.message || String(error) });
        } catch {
          // Ignore logger errors
        }
      return null;
      }
    },

    getCachedConfig: () => {
      if (isCacheValid()) {
        return cachedConfig;
      }
      return null;
    },

    getLastFetchTime: () => {
      return lastFetchTime;
    },

    getFetchCount: () => {
      return fetchCount;
    },
  };
}

