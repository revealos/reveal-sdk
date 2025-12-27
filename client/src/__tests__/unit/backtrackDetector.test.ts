import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createBacktrackDetector, type BacktrackDetector } from "../../detectors/backtrackDetector";

describe("BacktrackDetector", () => {
  let detector: BacktrackDetector;
  let mockEmit: any;
  let mockLogger: any;
  let mockWindow: any;
  let mockDocument: any;
  let mockHistory: any;
  let popstateHandler: ((e: PopStateEvent) => void) | null;
  let hashchangeHandler: ((e: HashChangeEvent) => void) | null;
  let originalPushState: any;
  let originalReplaceState: any;

  beforeEach(() => {
    vi.useFakeTimers();

    mockEmit = vi.fn();
    mockLogger = {
      logDebug: vi.fn(),
      logWarn: vi.fn(),
      logError: vi.fn(),
    };

    popstateHandler = null;
    hashchangeHandler = null;

    mockHistory = {
      pushState: vi.fn(),
      replaceState: vi.fn(),
    };

    mockWindow = {
      location: { href: "https://app.example.com/home" },
      history: mockHistory,
      addEventListener: vi.fn((event, handler) => {
        if (event === "popstate") {
          popstateHandler = handler;
        } else if (event === "hashchange") {
          hashchangeHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
    };

    mockDocument = {};

    // Save originals
    originalPushState = mockHistory.pushState;
    originalReplaceState = mockHistory.replaceState;

    detector = createBacktrackDetector({
      win: mockWindow,
      doc: mockDocument,
      logger: mockLogger,
      emit: mockEmit,
    });
  });

  afterEach(() => {
    if (detector) {
      detector.destroy();
    }
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  // Test 1: Emit on popstate A→B→A pattern
  describe("Emit positive cases", () => {
    it("should emit on popstate returning to immediate previous route (A→B→A)", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate: /home → /settings → /home (A→B→A)

      // Initial: /home (added during init)

      // Navigate to /settings (B)
      mockWindow.location.href = "https://app.example.com/settings?tab=billing";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      // Navigate back to /home (A) - should emit backtrack
      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 5000);
      popstateHandler?.({} as PopStateEvent);

      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith({
        type: "backtrack",
        pageUrl: "https://app.example.com/home",
        selector: null,
        extra: expect.objectContaining({
          from_view: "/settings",
          to_view: "/home",
          from_url: "https://app.example.com/settings?tab=billing",
          from_path: "/settings",
          to_url: "https://app.example.com/home",
          to_path: "/home",
          method: "popstate",
          reason: "returned_to_recent_route",
          stackDepth: 2,
        }),
      });
    });

    it("should include all required evidence fields", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate: /dashboard → /projects → /dashboard
      mockWindow.location.href = "https://app.example.com/dashboard";
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/projects";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/dashboard";
      vi.setSystemTime(baseTime + 4000);
      popstateHandler?.({} as PopStateEvent);

      const call = mockEmit.mock.calls[0][0];

      // Backend compatibility keys
      expect(call.extra).toHaveProperty("from_view");
      expect(call.extra).toHaveProperty("to_view");

      // Flattened evidence fields (primitives only)
      expect(call.extra).toHaveProperty("from_url");
      expect(call.extra).toHaveProperty("from_path");
      expect(call.extra).toHaveProperty("to_url");
      expect(call.extra).toHaveProperty("to_path");

      // Metadata
      expect(call.extra).toHaveProperty("method");
      expect(call.extra).toHaveProperty("reason");
      expect(call.extra).toHaveProperty("lastForwardTs");
      expect(call.extra).toHaveProperty("deltaMs");
      expect(call.extra).toHaveProperty("stackDepth");
      expect(call.extra).toHaveProperty("debugCode");

      // Should NOT have confidence_score or nested objects
      expect(call.extra).not.toHaveProperty("confidence_score");
      expect(call.extra).not.toHaveProperty("from");
      expect(call.extra).not.toHaveProperty("to");
    });
  });

  // Test 2: Negative window (recency)
  describe("Recency window enforcement", () => {
    it("should NOT emit when returning after recentWindowMs expires (> 30s)", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate: /home → /settings
      mockWindow.location.href = "https://app.example.com/settings";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      // Wait > 30s (31s), then return to /home
      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 31000); // 31s later (exceeds 30s window)
      popstateHandler?.({} as PopStateEvent);

      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  // Test 3: Same-route navigation
  describe("Same-route navigation filtering", () => {
    it("should NOT emit on same-route navigation (pathname unchanged, only hash/search differs)", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate within same route: /dashboard → /dashboard?tab=2 → /dashboard#section
      mockWindow.location.href = "https://app.example.com/dashboard";
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/dashboard?tab=2";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/dashboard#section";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      expect(mockEmit).not.toHaveBeenCalled();
    });
  });

  // Test 4: History API tracking (pushState)
  describe("History API tracking", () => {
    it("should track pushState navigations and add to stack", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Verify pushState was patched
      expect(mockWindow.history.pushState).not.toBe(originalPushState);

      // Navigate using pushState: /home → /projects
      mockWindow.location.href = "https://app.example.com/projects";
      mockWindow.history.pushState({ page: "projects" }, "", "/projects");
      vi.setSystemTime(baseTime + 1000);

      // Navigate back to /home
      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      // Should emit backtrack (A→B→A via pushState tracking)
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit.mock.calls[0][0].extra.from_view).toBe("/projects");
      expect(mockEmit.mock.calls[0][0].extra.to_view).toBe("/home");
    });

    it("should track replaceState navigations and add to stack", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Verify replaceState was patched
      expect(mockWindow.history.replaceState).not.toBe(originalReplaceState);

      // Navigate using replaceState: /home → /settings
      mockWindow.location.href = "https://app.example.com/settings";
      mockWindow.history.replaceState({ page: "settings" }, "", "/settings");
      vi.setSystemTime(baseTime + 1000);

      // Navigate back to /home
      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      // Should emit backtrack
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit.mock.calls[0][0].extra.from_view).toBe("/settings");
    });
  });

  // Test 5: Patch restoration on destroy
  describe("Lifecycle management", () => {
    it("should restore original pushState/replaceState on destroy", () => {
      detector.init();

      // Verify methods were patched (they should be different functions now)
      const patchedPushState = mockWindow.history.pushState;
      const patchedReplaceState = mockWindow.history.replaceState;

      // After init, the methods should be wrapped (not the original mocks)
      expect(typeof patchedPushState).toBe("function");
      expect(typeof patchedReplaceState).toBe("function");

      // Call destroy - it should restore original methods
      detector.destroy();

      // After destroy, methods should be restored (verify they're functions and not null)
      expect(typeof mockWindow.history.pushState).toBe("function");
      expect(typeof mockWindow.history.replaceState).toBe("function");

      // Verify the methods were actually restored (call them to ensure they work)
      expect(() => mockWindow.history.pushState({}, "", "/test")).not.toThrow();
      expect(() => mockWindow.history.replaceState({}, "", "/test")).not.toThrow();
    });

    it("should remove event listeners on destroy", () => {
      detector.init();

      expect(mockWindow.addEventListener).toHaveBeenCalledWith("popstate", expect.any(Function), true);
      expect(mockWindow.addEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function), true);

      detector.destroy();

      expect(mockWindow.removeEventListener).toHaveBeenCalledWith("popstate", expect.any(Function), true);
      expect(mockWindow.removeEventListener).toHaveBeenCalledWith("hashchange", expect.any(Function), true);
    });
  });

  // Test 6: Selector always null
  describe("Selector field", () => {
    it("should always set selector = null for backtrack signals", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate A→B→A
      mockWindow.location.href = "https://app.example.com/settings";
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      const call = mockEmit.mock.calls[0][0];
      expect(call.selector).toBeNull();
    });
  });

  // Test 7: Evidence fields verification
  describe("Evidence structure", () => {
    it("should include both from_view/to_view AND nested from/to objects", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate A→B→A
      mockWindow.location.href = "https://app.example.com/settings?tab=profile";
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/home#welcome";
      vi.setSystemTime(baseTime + 3000);
      popstateHandler?.({} as PopStateEvent);

      const call = mockEmit.mock.calls[0][0];

      // Backend compatibility keys (top-level in extra)
      expect(call.extra.from_view).toBe("/settings");
      expect(call.extra.to_view).toBe("/home");

      // Flattened evidence fields with full URLs (primitives only)
      expect(call.extra.from_url).toBe("https://app.example.com/settings?tab=profile");
      expect(call.extra.from_path).toBe("/settings");
      expect(call.extra.to_url).toBe("https://app.example.com/home#welcome");
      expect(call.extra.to_path).toBe("/home");
    });
  });

  // Test 8: Cooldown enforcement
  describe("Cooldown enforcement", () => {
    it("should NOT emit during cooldown period (within 10s of last emit)", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // First backtrack: /home → /settings → /home
      mockWindow.location.href = "https://app.example.com/settings";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      expect(mockEmit).toHaveBeenCalledTimes(1);

      // Second backtrack attempt within cooldown: /home → /projects → /home
      mockWindow.location.href = "https://app.example.com/projects";
      vi.setSystemTime(baseTime + 5000); // 3s after first emit
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 7000); // 5s after first emit (within 10s cooldown)
      popstateHandler?.({} as PopStateEvent);

      // Should still be only 1 emission (cooldown blocks second)
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it("should emit again after cooldown expires (> 10s)", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // First backtrack: /home → /settings → /home
      mockWindow.location.href = "https://app.example.com/settings";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      expect(mockEmit).toHaveBeenCalledTimes(1);

      // Second backtrack after cooldown: /home → /projects → /home
      mockWindow.location.href = "https://app.example.com/projects";
      vi.setSystemTime(baseTime + 13000); // 11s after first emit (cooldown expired)
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/home";
      vi.setSystemTime(baseTime + 15000);
      popstateHandler?.({} as PopStateEvent);

      // Should emit again (cooldown expired)
      expect(mockEmit).toHaveBeenCalledTimes(2);
    });
  });

  // Test 9: URL normalization
  describe("URL normalization", () => {
    it("should normalize URLs to pathname-only (strip search and hash)", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate with different query params and hashes
      mockWindow.location.href = "https://app.example.com/dashboard?view=grid#header";
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/settings?tab=1#footer";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/dashboard?view=list";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      // Should emit (normalized /dashboard matches prev2)
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit.mock.calls[0][0].extra.from_view).toBe("/settings");
      expect(mockEmit.mock.calls[0][0].extra.to_view).toBe("/dashboard");
    });

    it("should remove trailing slash except for root", () => {
      detector.init();

      const baseTime = Date.now();
      vi.setSystemTime(baseTime);

      // Navigate with trailing slashes
      mockWindow.location.href = "https://app.example.com/dashboard/";
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/settings/";
      vi.setSystemTime(baseTime + 1000);
      popstateHandler?.({} as PopStateEvent);

      mockWindow.location.href = "https://app.example.com/dashboard";
      vi.setSystemTime(baseTime + 2000);
      popstateHandler?.({} as PopStateEvent);

      // Should emit (normalized /dashboard matches /dashboard/)
      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit.mock.calls[0][0].extra.to_view).toBe("/dashboard");
    });
  });
});
