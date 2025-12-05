/**
 * Safe Wrappers
 * 
 * Utility functions to wrap risky operations and prevent host app crashes.
 * 
 * @module utils/safe
 */

import type { Logger } from "./logger";

/**
 * Safely execute a function, catching and logging errors
 * 
 * @param fn - Function to execute (can be sync or async)
 * @param logger - Logger instance
 * @param context - Context for error logging
 */
export function safeTry<T>(
  fn: () => T | Promise<T>,
  logger?: Logger,
  context?: string
): T | Promise<T> | Promise<T | undefined> | undefined {
  try {
    const result = fn();
    // If it's a promise, wrap it to catch errors
    if (result instanceof Promise) {
      return result.catch((error: any) => {
        if (logger && context) {
          logger.logError(`Error in ${context}:`, error);
        }
        return undefined;
      });
    }
    return result;
  } catch (error: any) {
    if (logger && context) {
      logger.logError(`Error in ${context}:`, error);
    }
  return undefined;
  }
}

/**
 * Safely execute an async function
 * 
 * @param fn - Async function to execute
 * @param logger - Logger instance
 * @param context - Context for error logging
 * @returns Promise that resolves to result or undefined
 */
export async function safeTryAsync<T>(
  fn: () => Promise<T>,
  logger?: Logger,
  context?: string
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error: any) {
    if (logger && context) {
      logger.logError(`Error in ${context}:`, error);
    }
  return undefined;
  }
}

