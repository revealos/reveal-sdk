/**
 * Logger Utility
 * 
 * Provides debug and error logging without crashing the host app.
 * Production-silent by default.
 * 
 * @module utils/logger
 */

/**
 * Logger interface
 */
export interface Logger {
  logDebug(message: string, meta?: any): void;
  logInfo(message: string, meta?: any): void;
  logWarn(message: string, meta?: any): void;
  logError(message: string, error?: any): void;
}

/**
 * Logger options
 */
export interface LoggerOptions {
  debug?: boolean;
  prefix?: string;
}

/**
 * Create a logger instance
 * 
 * @param options - Logger options
 * @returns Logger instance
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const { debug = false, prefix = "[Reveal SDK]" } = options;
  const hasConsole = typeof console !== "undefined";
  
  return {
    logDebug: (message: string, meta?: any) => {
      if (debug && hasConsole) {
        console.log(`${prefix} [DEBUG] ${message}`, meta || "");
      }
    },
    logInfo: (message: string, meta?: any) => {
      if (hasConsole) {
        console.info(`${prefix} [INFO] ${message}`, meta || "");
      }
    },
    logWarn: (message: string, meta?: any) => {
      if (hasConsole) {
        console.warn(`${prefix} [WARN] ${message}`, meta || "");
      }
    },
    logError: (message: string, error?: any) => {
      if (hasConsole) {
        console.error(`${prefix} [ERROR] ${message}`, error || "");
      }
    },
  };
}

