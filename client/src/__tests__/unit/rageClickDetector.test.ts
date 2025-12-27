import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createRageClickDetector, type RageClickDetector } from "../../detectors/rageClickDetector";

describe("RageClickDetector", () => {
  let detector: RageClickDetector;
  let mockEmit: any;
  let mockLogger: any;
  let mockWindow: any;
  let mockDocument: any;
  let clickHandler: ((e: MouseEvent) => void) | null;

  beforeEach(() => {
    mockEmit = vi.fn();
    mockLogger = {
      logDebug: vi.fn(),
      logError: vi.fn(),
    };

    mockDocument = {
      addEventListener: vi.fn((event, handler) => {
        if (event === "click") {
          clickHandler = handler;
        }
      }),
      removeEventListener: vi.fn(),
    };

    mockWindow = {
      location: { href: "https://test.com/page" },
    };

    clickHandler = null;

    detector = createRageClickDetector({
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

  // Trigger conditions
  describe("Trigger conditions", () => {
    it("should emit friction signal after 4 clicks within 900ms on same target", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "submit-btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200); // 200ms apart
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      expect(mockEmit).toHaveBeenCalledTimes(1);
      expect(mockEmit).toHaveBeenCalledWith({
        type: "rageclick",
        pageUrl: "https://test.com/page",
        selector: "#submit-btn",
        extra: expect.objectContaining({
          targetKey: "id:submit-btn",
          target_id: "id:submit-btn",
          clickCount: 4,
          windowMs: 900,
          debugCode: expect.stringMatching(/^RC_4C_900MS_/),
        }),
      });
    });

    it("should include all required evidence fields", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "test-btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100 + i,
          clientY: 200 + i,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.extra).toHaveProperty("targetKey");
      expect(call.extra).toHaveProperty("target_id");
      expect(call.extra).toHaveProperty("clickCount");
      expect(call.extra).toHaveProperty("windowMs");
      // Flattened properties (no arrays)
      expect(call.extra).toHaveProperty("interClickMs_min");
      expect(call.extra).toHaveProperty("interClickMs_max");
      expect(call.extra).toHaveProperty("interClickMs_avg");
      expect(call.extra).toHaveProperty("positions_count");
      expect(call.extra).toHaveProperty("driftPx");
      expect(call.extra).toHaveProperty("debugCode");

      // Verify no confidence_score or raw arrays
      expect(call.extra).not.toHaveProperty("confidence_score");
      expect(call.extra).not.toHaveProperty("interClickMs");
      expect(call.extra).not.toHaveProperty("positions");
    });
  });

  // Non-trigger conditions
  describe("Non-trigger conditions", () => {
    it("should NOT emit with only 3 clicks", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 3; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("should NOT emit if clicks exceed time window", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      // 4 clicks but spread over 1100ms (exceeds 900ms window)
      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 350);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("should NOT emit if drift exceeds maxTargetDriftPx", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      // Clicks with > 24px drift
      const positions = [
        { x: 100, y: 100 },
        { x: 105, y: 105 },
        { x: 110, y: 110 },
        { x: 150, y: 150 }, // > 24px from first
      ];

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: positions[i].x,
          clientY: positions[i].y,
          composedPath: () => [mockTarget],
        } as any);
      }

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("should NOT emit during cooldown period", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      let baseTime = Date.now();

      // First rage click
      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      expect(mockEmit).toHaveBeenCalledTimes(1);

      // Try again within cooldown (2000ms)
      baseTime = baseTime + 1500; // 1.5s later (within cooldown)
      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      // Should still be only 1 emission
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });
  });

  // Overlay exclusion
  describe("Overlay exclusion (using composedPath)", () => {
    it("should NOT emit for clicks on #reveal-overlay-root", () => {
      detector.init();

      const overlayRoot = {
        tagName: "DIV",
        id: "reveal-overlay-root",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: overlayRoot,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget, overlayRoot],
        } as any);
      }

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("should NOT emit for clicks on reveal-* web components", () => {
      detector.init();

      const revealComponent = {
        tagName: "REVEAL-TOOLTIP-NUDGE",
        id: "",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: revealComponent,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget, revealComponent],
        } as any);
      }

      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("should emit for clicks on normal app elements", () => {
      detector.init();

      const normalDiv = {
        tagName: "DIV",
        id: "app-root",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: normalDiv,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget, normalDiv],
        } as any);
      }

      expect(mockEmit).toHaveBeenCalledTimes(1);
    });
  });

  // Selector field honesty
  describe("Selector field honesty", () => {
    it("should set selector = #id when element.id exists", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "my-button",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.selector).toBe("#my-button");
    });

    it("should set selector = [data-testid] when data-testid exists", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "",
        getAttribute: vi.fn((attr) => (attr === "data-testid" ? "my-test-id" : null)),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.selector).toBe('[data-testid="my-test-id"]');
    });

    it("should set selector = null when no stable CSS selector available", () => {
      detector.init();

      const mockTarget = {
        tagName: "DIV",
        id: "",
        getAttribute: vi.fn(() => null),
        parentElement: {
          children: [{}, {}],
          parentElement: null,
        },
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.selector).toBeNull();
    });

    it("should NEVER put domPath strings in selector field", () => {
      detector.init();

      const mockTarget = {
        tagName: "SPAN",
        id: "",
        getAttribute: vi.fn(() => null),
        parentElement: {
          tagName: "DIV",
          children: [{}, {}],
          parentElement: null,
        },
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.selector).toBeNull();
      // targetKey should have domPath, but selector should be null
      expect(call.extra.targetKey).toContain("path:");
    });
  });

  // Target key strategy
  describe("Target key strategy (no attribute dependency)", () => {
    it("should use element.id as targetKey priority 1", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "my-btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.extra.targetKey).toBe("id:my-btn");
    });

    it("should use data-testid as priority 2 (opportunistic)", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "",
        getAttribute: vi.fn((attr) => (attr === "data-testid" ? "test-btn" : null)),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.extra.targetKey).toBe("testid:test-btn");
    });

    it("should use role+aria as priority 3", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "",
        getAttribute: vi.fn((attr) => {
          if (attr === "role") return "button";
          if (attr === "aria-label") return "Submit Form";
          return null;
        }),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.extra.targetKey).toBe("button:Submit Form");
    });

    it("should fall back to domPath for generic elements", () => {
      detector.init();

      const mockTarget = {
        tagName: "DIV",
        id: "",
        getAttribute: vi.fn(() => null),
        parentElement: {
          tagName: "SECTION",
          children: [{}, {}],
          parentElement: null,
        },
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call.extra.targetKey).toContain("path:");
    });
  });

  // Edge cases
  describe("Edge cases", () => {
    it("should ignore ultra-fast duplicates (< 30ms)", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      // 5 clicks but 2 are < 30ms apart (should be ignored)
      const intervals = [0, 20, 220, 420, 620]; // 20ms is too fast
      for (let i = 0; i < 5; i++) {
        vi.setSystemTime(baseTime + intervals[i]);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      // Should only count 4 (skipped the 20ms one)
      expect(mockEmit).toHaveBeenCalledTimes(1);
    });

    it("should reset state after window expires", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      let baseTime = Date.now();

      // 3 clicks
      for (let i = 0; i < 3; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      // Wait > 900ms (window expires)
      baseTime = baseTime + 1000;

      // New click (should reset)
      vi.setSystemTime(baseTime);
      clickHandler?.({
        target: mockTarget,
        clientX: 100,
        clientY: 200,
        composedPath: () => [mockTarget],
      } as any);

      // Should not emit (only 1 click in new window)
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("should handle rapid clicks across different targets independently", () => {
      detector.init();

      const target1 = {
        tagName: "BUTTON",
        id: "btn1",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      const target2 = {
        tagName: "BUTTON",
        id: "btn2",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      // 2 clicks on each target (alternating)
      for (let i = 0; i < 4; i++) {
        const target = i % 2 === 0 ? target1 : target2;
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target,
          clientX: 100,
          clientY: 200,
          composedPath: () => [target],
        } as any);
      }

      // Should not emit (only 2 clicks per target)
      expect(mockEmit).not.toHaveBeenCalled();
    });

    it("should limit positions array to maxPositions (5)", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      // 6 clicks (should limit to 5)
      for (let i = 0; i < 6; i++) {
        vi.setSystemTime(baseTime + i * 150);
        clickHandler?.({
          target: mockTarget,
          clientX: 100 + i,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      // First emission happens on 4th click with 4 positions
      // (We emit as soon as minClicks threshold is reached)
      const call = mockEmit.mock.calls[0][0];
      expect(call.extra.positions_count).toBe(4);

      // The positions count reflects the number of clicks
      // (No longer emitting raw positions array)
    });

    it("should cleanup on destroy", () => {
      detector.init();
      expect(mockDocument.addEventListener).toHaveBeenCalledWith("click", expect.any(Function), true);

      detector.destroy();
      expect(mockDocument.removeEventListener).toHaveBeenCalledWith("click", expect.any(Function), true);
    });
  });

  // Type drift prevention
  describe("Type drift prevention", () => {
    it("should emit FrictionSignal with EXACT shape as StallDetector", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      // Verify expected shape
      expect(call).toHaveProperty("type");
      expect(call).toHaveProperty("pageUrl");
      expect(call).toHaveProperty("selector");
      expect(call).toHaveProperty("extra");
      // Should NOT have top-level fields like confidence_score
      expect(call).not.toHaveProperty("confidence_score");
    });

    it("should use existing extra field (not new top-level fields)", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      // All evidence in extra field
      expect(typeof call.extra).toBe("object");
      expect(call.extra).toHaveProperty("targetKey");
      expect(call.extra).toHaveProperty("target_id");
      expect(call.extra).toHaveProperty("clickCount");
    });

    it("should NOT introduce new confidence_score concept", () => {
      detector.init();

      const mockTarget = {
        tagName: "BUTTON",
        id: "btn",
        getAttribute: vi.fn(() => null),
        parentElement: null,
      };

      vi.useFakeTimers();
      const baseTime = Date.now();

      for (let i = 0; i < 4; i++) {
        vi.setSystemTime(baseTime + i * 200);
        clickHandler?.({
          target: mockTarget,
          clientX: 100,
          clientY: 200,
          composedPath: () => [mockTarget],
        } as any);
      }

      const call = mockEmit.mock.calls[0][0];
      expect(call).not.toHaveProperty("confidence_score");
      expect(call.extra).not.toHaveProperty("confidence_score");
    });
  });
});
