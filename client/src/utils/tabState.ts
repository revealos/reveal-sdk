/**
 * Tab State Utility
 * 
 * Manages tab_id and seq counter per browser tab.
 * 
 * Responsibilities:
 * - Generate tab_id once per page load (UUID v4)
 * - Maintain seq counter in sessionStorage (monotonic per tab)
 * - Increment seq on each track() call
 * 
 * @module utils/tabState
 */

const STORAGE_KEY = "reveal_tab_state";

interface TabState {
  tab_id: string;
  seq: number;
}

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: simple UUID v4 generation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create tab state (tab_id and seq counter)
 * 
 * - Generates tab_id once per page load
 * - Maintains seq counter in sessionStorage (monotonic per tab)
 * - Returns existing state if available, creates new if missing
 * 
 * @returns TabState with tab_id and current seq value
 */
export function getOrCreateTabState(): TabState {
  try {
    if (typeof sessionStorage !== "undefined") {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as TabState;
          if (parsed.tab_id && typeof parsed.seq === "number") {
            return parsed;
          }
        } catch {
          // Invalid JSON, fall through to create new
        }
      }

      // Create new tab state
      const newState: TabState = {
        tab_id: generateUUID(),
        seq: 0,
      };
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
      return newState;
    }
  } catch (error) {
    // sessionStorage may be disabled or unavailable (private browsing, etc.)
    // Fall through to in-memory fallback
  }

  // Fallback: in-memory state (not persisted, resets on page reload)
  // This ensures seq still works even if sessionStorage is unavailable
  if (typeof window !== "undefined" && (window as any).__revealTabState) {
    return (window as any).__revealTabState;
  }

  const fallbackState: TabState = {
    tab_id: generateUUID(),
    seq: 0,
  };
  if (typeof window !== "undefined") {
    (window as any).__revealTabState = fallbackState;
  }
  return fallbackState;
}

/**
 * Increment seq counter and save to sessionStorage
 * 
 * @returns New seq value
 */
export function incrementSeq(): number {
  const state = getOrCreateTabState();
  state.seq += 1;

  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  } catch {
    // sessionStorage unavailable, state is in-memory only
  }

  // Update in-memory fallback if using it
  if (typeof window !== "undefined" && (window as any).__revealTabState) {
    (window as any).__revealTabState = state;
  }

  return state.seq;
}

/**
 * Get current tab state without incrementing
 * 
 * @returns TabState with current tab_id and seq
 */
export function getTabState(): TabState {
  return getOrCreateTabState();
}

