/**
 * Constants
 * 
 * Shared constants used across the overlay-react package.
 * 
 * @module utils/constants
 */

/**
 * Template ID constants
 */
export const TEMPLATE_IDS = {
  TOOLTIP: "tooltip",
  MODAL: "modal",
  BANNER: "banner",
  SPOTLIGHT: "spotlight",
  INLINE_HINT: "inline_hint",
} as const;

/**
 * Nudge severity constants
 */
export const NUDGE_SEVERITY = {
  INFO: "info",
  SUCCESS: "success",
  WARNING: "warning",
  DANGER: "danger",
} as const;

/**
 * Z-index constants for overlay layering
 * 
 * These values ensure overlays render above host app content while
 * maintaining proper layering between different overlay types.
 */
export const Z_INDEX = {
  OVERLAY_ROOT: 9999,      // Portal container (base layer)
  BACKDROP: 10000,         // Modal/banner backdrops
  TOOLTIP: 10001,          // Tooltips (above backdrop)
  MODAL: 10002,            // Modals (highest priority)
} as const;

