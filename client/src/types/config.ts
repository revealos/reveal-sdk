/**
 * Config Types
 * 
 * Type definitions for configuration.
 * 
 * @module types/config
 */

/**
 * Client-safe configuration from backend
 */
export interface ClientConfig {
  projectId: string;
  environment: "production" | "staging" | "development";
  sdk: {
    samplingRate: number;
  };
  decision: {
    endpoint: string;
    timeoutMs: number;
  };
  templates: any[];
  ttlSeconds: number;
}

