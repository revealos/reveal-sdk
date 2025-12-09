/**
 * computeTooltipPosition
 * 
 * Pure function that calculates the position for a tooltip relative to a target element.
 * Positions the tooltip above the target element, centered horizontally.
 * 
 * @param targetElement - The DOM element the tooltip should attach to, or null
 * @param tooltipElement - The tooltip DOM element (for size calculations), or null
 * @returns Position object with top and left coordinates, or null if target not found
 */
export function computeTooltipPosition(
  targetElement: Element | null,
  tooltipElement: HTMLElement | null
): { top: number; left: number } | null {
  // If target not found, return null (component will handle gracefully)
  if (!targetElement) {
    return null;
  }

  // Get target element's bounding rect
  const targetRect = targetElement.getBoundingClientRect();
  const scrollY = window.scrollY;
  const scrollX = window.scrollX;

  // Calculate tooltip width for centering (use actual width if available, otherwise estimate)
  const tooltipWidth = tooltipElement?.offsetWidth || 200; // Default estimate: 200px

  // Position tooltip above the target element, centered horizontally
  // Gap: 8px above target
  const gap = 8;
  const top = targetRect.top + scrollY - gap;
  const left = targetRect.left + scrollX + targetRect.width / 2;

  return {
    top,
    left,
  };
}

