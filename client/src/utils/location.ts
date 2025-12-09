/**
 * Location Utility
 * 
 * Helpers for getting current page location information.
 * 
 * @module utils/location
 */

/**
 * Location information
 */
export interface Location {
  path: string | null;
  route: string | null;
  screen: string | null;
}

/**
 * Get current page location
 * 
 * @returns Location information
 */
export function getCurrentLocation(): Location {
  // TODO: Extract path from window.location
  // TODO: Extract route if available (SPA frameworks)
  // TODO: Extract screen name if available
  return {
    path: null,
    route: null,
    screen: null,
  };
}

