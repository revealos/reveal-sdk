/**
 * useTargetRect Hook
 * 
 * Tracks a target element's bounding rectangle and updates on scroll/resize.
 * Returns null if target element is not found.
 * 
 * @param targetId - The ID of the target element (without # prefix), or null/undefined
 * @returns The target element's DOMRect, or null if not found
 */

"use client";

import { useEffect, useState } from "react";

export function useTargetRect(
  targetId: string | null | undefined
): DOMRect | null {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    // If no targetId, return null
    if (!targetId) {
      setTargetRect(null);
      return;
    }

    // Find target element by ID (with or without # prefix)
    const id = targetId.startsWith("#") ? targetId.slice(1) : targetId;
    const targetElement = document.getElementById(id);

    if (!targetElement) {
      setTargetRect(null);
      return;
    }

    // Update position function
    const updateRect = () => {
      const rect = targetElement.getBoundingClientRect();
      setTargetRect(rect);
    };

    // Initial position
    updateRect();

    // Update on scroll/resize
    window.addEventListener("scroll", updateRect, true);
    window.addEventListener("resize", updateRect);

    return () => {
      window.removeEventListener("scroll", updateRect, true);
      window.removeEventListener("resize", updateRect);
    };
  }, [targetId]);

  return targetRect;
}

