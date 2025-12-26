/**
 * Unit tests for uiDecision mapping utilities
 */

import { describe, it, expect } from "vitest";
import { mapWireToUI, type UINudgeDecision } from "../../types/uiDecision";
import type { WireNudgeDecision } from "../../types/decisions";

describe("mapWireToUI", () => {
  it("should map all wire fields to UI format", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "nudge-123",
      templateId: "tooltip",
      title: "Test Title",
      body: "Test Body",
      ctaText: "Click Me",
      selectorPattern: "[data-test='target']",
      slotId: "slot-1",
      quadrant: "topCenter",
      frictionType: "stall",
      debugCode: "ABC123",
      expiresAt: "2024-12-31T23:59:59Z",
      extra: { customField: "value" },
    };

    const uiDecision = mapWireToUI(wireDecision);

    expect(uiDecision.id).toBe("nudge-123");
    expect(uiDecision.templateId).toBe("tooltip");
    expect(uiDecision.title).toBe("Test Title");
    expect(uiDecision.body).toBe("Test Body");
    expect(uiDecision.ctaText).toBe("Click Me");
    expect(uiDecision.selectorPattern).toBe("[data-test='target']");
    expect(uiDecision.targetId).toBe("slot-1");
    expect(uiDecision.quadrant).toBe("topCenter");
    expect(uiDecision.debugCode).toBe("ABC123");
    expect(uiDecision.extra).toEqual({ customField: "value" });
  });

  it("should preserve selectorPattern for spotlight decisions", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "spotlight-nudge-456",
      templateId: "spotlight",
      title: "Spotlight Title",
      body: "Click the highlighted button",
      selectorPattern: "[data-reveal='spotlight-target']",
      quadrant: "bottomCenter",
      debugCode: "XYZ789",
    };

    const uiDecision = mapWireToUI(wireDecision);

    expect(uiDecision.templateId).toBe("spotlight");
    expect(uiDecision.selectorPattern).toBe("[data-reveal='spotlight-target']");
    expect(uiDecision.quadrant).toBe("bottomCenter");
  });

  it("should handle optional fields being undefined", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "nudge-minimal",
      templateId: "banner",
    };

    const uiDecision = mapWireToUI(wireDecision);

    expect(uiDecision.id).toBe("nudge-minimal");
    expect(uiDecision.templateId).toBe("banner");
    expect(uiDecision.title).toBeUndefined();
    expect(uiDecision.body).toBeUndefined();
    expect(uiDecision.ctaText).toBeUndefined();
    expect(uiDecision.selectorPattern).toBeUndefined();
    expect(uiDecision.debugCode).toBeUndefined();
    expect(uiDecision.extra).toBeUndefined();
  });

  it("should apply UI-specific overrides from options", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "nudge-override",
      templateId: "tooltip",
      quadrant: "topLeft",
    };

    const uiDecision = mapWireToUI(wireDecision, {
      severity: "warning",
      quadrant: "bottomRight",
      dismissible: false,
      autoDismissMs: 5000,
    });

    expect(uiDecision.severity).toBe("warning");
    expect(uiDecision.quadrant).toBe("bottomRight"); // Override wins
    expect(uiDecision.dismissible).toBe(false);
    expect(uiDecision.autoDismissMs).toBe(5000);
  });

  it("should default quadrant to topCenter when not specified", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "nudge-default-quadrant",
      templateId: "inline_hint",
    };

    const uiDecision = mapWireToUI(wireDecision);

    expect(uiDecision.quadrant).toBe("topCenter");
  });

  it("should default dismissible to true when not specified", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "nudge-default-dismissible",
      templateId: "modal",
    };

    const uiDecision = mapWireToUI(wireDecision);

    expect(uiDecision.dismissible).toBe(true);
  });

  it("should default autoDismissMs to null when not specified", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "nudge-default-autodismiss",
      templateId: "banner",
    };

    const uiDecision = mapWireToUI(wireDecision);

    expect(uiDecision.autoDismissMs).toBe(null);
  });

  it("should use slotId as targetId fallback", () => {
    const wireDecision: WireNudgeDecision = {
      nudgeId: "nudge-slotid",
      templateId: "tooltip",
      slotId: "deprecated-slot-123",
    };

    const uiDecision = mapWireToUI(wireDecision);

    expect(uiDecision.targetId).toBe("deprecated-slot-123");
  });
});
