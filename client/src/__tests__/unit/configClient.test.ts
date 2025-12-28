import { describe, it, expect, beforeEach, vi } from "vitest";
import { createConfigClient, type ConfigClient, type ConfigClientOptions } from "../../modules/configClient";
import type { ClientConfig } from "../../types/config";

describe("ConfigClient", () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockLogger: any;
  let client: ConfigClient;

  beforeEach(() => {
    // Reset mocks
    mockFetch = vi.fn();
    mockLogger = {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      logDebug: vi.fn(),
      logError: vi.fn(),
      logWarn: vi.fn(),
    };
  });

  describe("getConfig", () => {
    it("should fetch config from backend endpoint", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        environment: "development",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const result = await client.getConfig();

      expect(result).not.toBeNull();
      expect(result).toEqual(mockConfig);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("config?environment=development"),
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            "X-Reveal-Client-Key": "test-key",
          }),
        })
      );
    });

    it("should include X-Reveal-Client-Key header", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "custom-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            "X-Reveal-Client-Key": "custom-key",
          }),
        })
      );
    });

    it("should include environment query param", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "production",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        environment: "production",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("config?environment=production"),
        expect.any(Object)
      );
    });

    it("should default environment to development if not provided", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.reveal.io/config?environment=development",
        expect.any(Object)
      );
    });

    it("should cache config with TTL", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      // First call - should fetch
      const result1 = await client.getConfig();
      expect(result1).not.toBeNull();
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call - should use cache
      const result2 = await client.getConfig();
      expect(result2).not.toBeNull();
      expect(result2).toEqual(result1);
      expect(mockFetch).toHaveBeenCalledTimes(1); // Still 1, cache used
    });

    it("should use TTL from response", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 120, // 2 minutes
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();
      const cached = client.getCachedConfig();
      expect(cached).not.toBeNull();
    });

    it("should validate endpoint URL for HTTPS", () => {
      expect(() => {
        createConfigClient({
          endpoint: "http://example.com", // Not HTTPS
          clientKey: "test-key",
          fetchFn: mockFetch as any,
        });
      }).toThrow("ConfigClient: URL must use HTTPS protocol");
    });

    it("should allow localhost exception for HTTP", () => {
      expect(() => {
        createConfigClient({
          endpoint: "http://localhost:3000",
          clientKey: "test-key",
          fetchFn: mockFetch as any,
        });
      }).not.toThrow();
    });

    it("should handle HTTP errors (4xx, 5xx)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const result = await client.getConfig();
      expect(result).toBeNull();
      expect(mockLogger.logError).toHaveBeenCalled();
    });

    it("should handle network errors (timeout)", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      mockFetch.mockRejectedValue(abortError);

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
        timeoutMs: 1000,
      });

      const result = await client.getConfig();
      expect(result).toBeNull();
      expect(mockLogger.logError).toHaveBeenCalled();
    });

    it("should handle invalid JSON response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => {
          throw new Error("Invalid JSON");
        },
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const result = await client.getConfig();
      expect(result).toBeNull();
    });

    it("should handle invalid config structure", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          invalid: "structure",
        }),
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const result = await client.getConfig();
      expect(result).toBeNull();
      expect(mockLogger.logError).toHaveBeenCalled();
    });

    it("should return null on errors (never throw)", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await expect(client.getConfig()).resolves.toBeNull();
    });

    it("should log fetch attempts", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();

      expect(mockLogger.logDebug).toHaveBeenCalled();
    });
  });

  describe("getCachedConfig", () => {
    it("should return cached config if valid", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();
      const cached = client.getCachedConfig();
      expect(cached).not.toBeNull();
      expect(cached).toEqual(mockConfig);
    });

    it("should return null if expired", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 0.001, // Very short TTL (1ms) - expires almost immediately
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();
      // Wait for cache to expire (1ms + buffer)
      await new Promise((resolve) => setTimeout(resolve, 20));
      const cached = client.getCachedConfig();
      expect(cached).toBeNull();
    });

    it("should return null if never fetched", () => {
      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const cached = client.getCachedConfig();
      expect(cached).toBeNull();
    });
  });

  describe("getLastFetchTime", () => {
    it("should return timestamp after successful fetch", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const before = Date.now();
      await client.getConfig();
      const after = Date.now();
      const lastFetch = client.getLastFetchTime();

      expect(lastFetch).not.toBeNull();
      expect(lastFetch).toBeGreaterThanOrEqual(before);
      expect(lastFetch).toBeLessThanOrEqual(after);
    });

    it("should return null if never fetched", () => {
      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const lastFetch = client.getLastFetchTime();
      expect(lastFetch).toBeNull();
    });
  });

  describe("getFetchCount", () => {
    it("should increment on each fetch attempt", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      expect(client.getFetchCount()).toBe(0);

      await client.getConfig();
      expect(client.getFetchCount()).toBe(1);

      // Second call uses cache, but count still increments
      await client.getConfig();
      expect(client.getFetchCount()).toBe(2);
    });

    it("should track failed fetches", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      expect(client.getFetchCount()).toBe(0);

      await client.getConfig();
      expect(client.getFetchCount()).toBe(1);
    });
  });

  describe("caching behavior", () => {
    it("should respect TTL from response", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 1, // 1 second TTL
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();
      expect(client.getCachedConfig()).not.toBeNull();

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(client.getCachedConfig()).toBeNull();
    });

    it("should use default TTL if not provided", async () => {
      const mockConfig: ClientConfig = {
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1.0 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 0, // 0 means use default
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();
      // With default 60s TTL, cache should still be valid
      const cached = client.getCachedConfig();
      expect(cached).not.toBeNull();
    });
  });

  describe("error handling", () => {
    it("should never throw errors", async () => {
      mockFetch.mockRejectedValue(new Error("Unexpected error"));

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await expect(client.getConfig()).resolves.toBeNull();
    });

    it("should return null on all error cases", async () => {
      const errorCases = [
        { ok: false, status: 401 }, // HTTP error
        { ok: false, status: 500 }, // Server error
        null, // Network error (rejected promise)
      ];

      for (const errorCase of errorCases) {
        if (errorCase === null) {
          mockFetch.mockRejectedValue(new Error("Network error"));
        } else {
          mockFetch.mockResolvedValue(errorCase);
        }

        client = createConfigClient({
          endpoint: "https://api.reveal.io/config",
          clientKey: "test-key",
          fetchFn: mockFetch as any,
          logger: mockLogger,
        });

        const result = await client.getConfig();
        expect(result).toBeNull();
      }
    });

    it("should log errors appropriately", async () => {
      mockFetch.mockRejectedValue(new Error("Network error"));

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      await client.getConfig();
      expect(mockLogger.logError).toHaveBeenCalled();
    });
  });

  describe("validation", () => {
    it("should throw if endpoint is missing", () => {
      expect(() => {
        createConfigClient({
          endpoint: "",
          clientKey: "test-key",
          fetchFn: mockFetch as any,
        } as any);
      }).toThrow("ConfigClient: endpoint is required");
    });

    it("should throw if clientKey is missing", () => {
      expect(() => {
        createConfigClient({
          endpoint: "https://api.reveal.io/config",
          clientKey: "",
          fetchFn: mockFetch as any,
        } as any);
      }).toThrow("ConfigClient: clientKey is required");
    });

    it("should throw if fetchFn is missing and fetch is not available", () => {
      // In test environment, fetch might be available, so we need to test differently
      // This test verifies the validation logic exists
      const originalFetch = global.fetch;
      try {
        // Temporarily remove fetch
        (global as any).fetch = undefined;

        expect(() => {
          createConfigClient({
            endpoint: "https://api.reveal.io/config",
            clientKey: "test-key",
            fetchFn: undefined as any,
          });
        }).toThrow("ConfigClient: fetchFn is required");
      } finally {
        // Restore fetch
        (global as any).fetch = originalFetch;
      }
    });
  });

  describe("treatment_rules validation", () => {
    it("should accept treatment_rules in config without logging unknown keys", async () => {
      const mockConfig: ClientConfig = {
        configVersion: 1,
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        features: { enabled: true },
        treatment_rules: { sticky: true, treatment_percentage: 100 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const config = await client.getConfig();

      // Assert treatment_rules exists in returned config
      expect(config).toBeDefined();
      expect(config?.treatment_rules).toEqual({
        sticky: true,
        treatment_percentage: 100,
      });

      // Assert no "unknown keys" warning was logged for treatment_rules
      const warnCalls = mockLogger.logWarn.mock.calls;
      const unknownKeysWarnings = warnCalls.filter((call: any) =>
        call[0]?.includes("unknown config keys")
      );

      if (unknownKeysWarnings.length > 0) {
        const unknownKeys = unknownKeysWarnings[0][1]?.unknownKeys || [];
        expect(unknownKeys).not.toContain("treatment_rules");
      }
    });

    it("should handle config without treatment_rules", async () => {
      const mockConfig: ClientConfig = {
        configVersion: 1,
        projectId: "test-project",
        environment: "development",
        sdk: { samplingRate: 1 },
        decision: { endpoint: "/decide", timeoutMs: 2000 },
        templates: [],
        ttlSeconds: 60,
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockConfig,
      });

      client = createConfigClient({
        endpoint: "https://api.reveal.io/config",
        clientKey: "test-key",
        fetchFn: mockFetch as any,
        logger: mockLogger,
      });

      const config = await client.getConfig();

      // Assert config is valid without treatment_rules
      expect(config).toBeDefined();
      expect(config?.treatment_rules).toBeUndefined();
    });
  });
});
