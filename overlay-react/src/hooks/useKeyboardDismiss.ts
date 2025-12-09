/**
 * useKeyboardDismiss Hook
 * 
 * Listens for ESC key press and calls onDismiss when ESC is pressed.
 * Only active when enabled is true.
 * 
 * @param onDismiss - Callback to call when ESC is pressed
 * @param enabled - Whether keyboard dismiss is enabled (default: true)
 */

"use client";

import { useEffect } from "react";

export function useKeyboardDismiss(
  onDismiss: () => void,
  enabled: boolean = true
): void {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onDismiss();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss, enabled]);
}

