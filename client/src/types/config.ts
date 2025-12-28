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
  configVersion?: number; // Default: 1 (for schema evolution)
  projectId: string;
  environment: "production" | "staging" | "development";
  sdk: {
    samplingRate: number;
  };
  decision: {
    endpoint: string;
    timeoutMs: number;
  };

  // Feature flags for granular control
  features?: {
    enabled?: boolean; // Global kill switch (default: true)
    detectors?: {
      stall?: boolean; // Default: true
      rageclick?: boolean; // Default: true
      backtrack?: boolean; // Default: true
    };
    nudges?: {
      tooltip?: boolean; // Default: true
      inline_hint?: boolean; // Default: true
      spotlight?: boolean; // Default: true
      modal?: boolean; // Default: true
      banner?: boolean; // Default: true
    };
  };

  // Treatment rules for A/B testing (optional, backward compatible)
  treatment_rules?: {
    sticky?: boolean; // Default: true (use anonymousId for bucketing)
    treatment_percentage?: number; // Default: 0 (0-100, percent in treatment group)
  };

  templates: any[];
  ttlSeconds: number;
}

/**
 * Current config version supported by this SDK
 */
export const CURRENT_CONFIG_VERSION = 1;

/**
 * Safe defaults for feature flags (if config.features missing)
 */
export const DEFAULT_FEATURES = {
  enabled: true,
  detectors: { stall: true, rageclick: true, backtrack: true },
  nudges: { tooltip: true, inline_hint: true, spotlight: true, modal: true, banner: true },
};

