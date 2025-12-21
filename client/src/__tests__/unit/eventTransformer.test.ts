/**
 * Unit tests for eventTransformer module
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { transformBaseEventToBackendFormat } from "../../modules/eventTransformer";
import type { BaseEvent } from "../../types/events";

describe("eventTransformer", () => {
  const mockPageContext = {
    url: "https://example.com/page",
    title: "Example Page",
    referrer: "https://example.com/referrer",
  };

  const baseOptions = {
    anonymousId: "anonymous-123",
    sdkVersion: "0.1.0",
    getPageContext: () => mockPageContext,
  };

  describe("transformBaseEventToBackendFormat", () => {
    it("should transform product event correctly", () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "button_clicked",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: { button_text: "Click me" },
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.event_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(result.session_id).toBe("session-123");
      expect(result.timestamp).toBe("2009-02-13T23:31:30.000Z");
      expect(result.event_kind).toBe("product");
      expect(result.event_type).toBe("button_clicked");
      expect(result.event_source).toBe("user");
      expect(result.anonymous_id).toBe("anonymous-123");
      expect(result.sdk_version).toBe("0.1.0");
      expect(result.properties).toEqual({ button_text: "Click me" });
      expect(result.page_url).toBe("https://example.com/page");
      expect(result.page_title).toBe("Example Page");
      expect(result.referrer).toBe("https://example.com/referrer");
      expect(result.friction_type).toBeNull();
      expect(result.user_key).toBeNull();
      expect(result.environment).toBeNull();
      expect(result.batch_id).toBeNull();
    });

    it("should transform friction event with required fields", () => {
      const baseEvent: BaseEvent = {
        kind: "friction",
        name: "friction_stall",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {
          selector: "#submit-button",
          pageUrl: "https://example.com/form",
          type: "stall",
        },
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.event_kind).toBe("friction");
      expect(result.event_type).toBe("friction_stall");
      expect(result.selector).toBe("#submit-button");
      expect(result.page_url).toBe("https://example.com/form");
      expect(result.friction_type).toBe("stall");
    });

    it("should handle friction event with pageUrl fallback", () => {
      const baseEvent: BaseEvent = {
        kind: "friction",
        name: "friction_stall",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {
          selector: "#submit-button",
          type: "stall",
        },
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.selector).toBe("#submit-button");
      expect(result.page_url).toBe("https://example.com/page"); // Falls back to pageContext.url
      expect(result.friction_type).toBe("stall");
    });

    it("should transform nudge event correctly", () => {
      const baseEvent: BaseEvent = {
        kind: "nudge",
        name: "nudge_shown",
        event_source: "system",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: { nudge_id: "nudge-123", template_id: "tooltip" },
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.event_kind).toBe("nudge");
      expect(result.event_type).toBe("nudge_shown");
      expect(result.event_source).toBe("system");
      expect(result.properties).toEqual({ nudge_id: "nudge-123", template_id: "tooltip" });
      expect(result.friction_type).toBeNull();
    });

    it("should transform session event correctly", () => {
      const baseEvent: BaseEvent = {
        kind: "session",
        name: "session_start",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.event_kind).toBe("session");
      expect(result.event_type).toBe("session_start");
      expect(result.properties).toBeNull(); // Empty payload becomes null
    });

    it("should handle empty payload", () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "button_clicked",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.properties).toBeNull();
    });

    it("should extract element_text from payload", () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "button_clicked",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: { element_text: "Click me", elementText: "Alternative" },
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.element_text).toBe("Click me"); // Prefers element_text over elementText
    });

    it("should handle null page context", () => {
      const options = {
        ...baseOptions,
        getPageContext: () => ({
          url: null,
          title: null,
          referrer: null,
        }),
      };

      const baseEvent: BaseEvent = {
        kind: "product",
        name: "button_clicked",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
      };

      const result = transformBaseEventToBackendFormat(baseEvent, options);

      expect(result.page_url).toBeNull();
      expect(result.page_title).toBeNull();
      expect(result.referrer).toBeNull();
    });

    it("should generate unique event_id for each event", () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "button_clicked",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
      };

      const result1 = transformBaseEventToBackendFormat(baseEvent, baseOptions);
      const result2 = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result1.event_id).not.toBe(result2.event_id);
    });

    it("should handle all friction types", () => {
      const frictionTypes: Array<"stall" | "rageclick" | "backtrack"> = ["stall", "rageclick", "backtrack"];

      frictionTypes.forEach((type) => {
        const baseEvent: BaseEvent = {
          kind: "friction",
          name: `friction_${type}`,
          event_source: "user",
          session_id: "session-123",
          is_treatment: null,
          timestamp: 1234567890000,
          path: "/page",
          route: null,
          screen: null,
          viewKey: "/page",
          user_agent: "Mozilla/5.0",
          viewport_width: 1920,
          viewport_height: 1080,
          payload: {
            selector: "#button",
            pageUrl: "https://example.com",
            type,
          },
        };

        const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);
        expect(result.friction_type).toBe(type);
      });
    });

    it("should extract path from pageUrl if not provided in payload", () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "page_viewed",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: null,
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
      };

      const result = transformBaseEventToBackendFormat(baseEvent, {
        ...baseOptions,
        getPageContext: () => ({
          url: "https://example.com/checkout",
          title: "Checkout",
          referrer: "https://example.com/pricing",
        }),
      });

      expect(result.path).toBe("/checkout");
      expect(result.referrer_path).toBe("/pricing");
    });

    it("should extract activationContext from payload if provided", () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "custom_event",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: null,
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: { activationContext: "checkout" },
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.activation_context).toBe("checkout");
    });

    it("should set activation_context to null if not provided", () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "page_viewed",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: null,
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.activation_context).toBeNull();
    });

    it('should use captured page context from BaseEvent instead of getPageContext (Issue A fix)', () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "navigation_clicked",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/settings",
        route: null,
        screen: null,
        viewKey: "/settings",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
        // Captured at event creation time
        page_url: "https://example.com/settings",
        page_title: "Settings Page",
        referrer: "https://example.com/home",
        client_ts_ms: 1234567890000,
      };

      // getPageContext returns different values (simulating page navigation)
      const differentPageContext = {
        url: "https://example.com/error-lab",
        title: "Error Lab Page",
        referrer: "https://example.com/settings",
      };

      const result = transformBaseEventToBackendFormat(baseEvent, {
        ...baseOptions,
        getPageContext: () => differentPageContext,
      });

      // Should use captured values, not getPageContext values
      expect(result.page_url).toBe("https://example.com/settings");
      expect(result.page_title).toBe("Settings Page");
      expect(result.referrer).toBe("https://example.com/home");
      expect(result.client_ts_ms).toBe(1234567890000);
    });

    it('should include client_ts_ms in backend format (Issue B fix)', () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "test_event",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
        client_ts_ms: 1234567890000,
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.client_ts_ms).toBe(1234567890000);
    });

    it('should handle missing client_ts_ms (backward compatibility)', () => {
      const baseEvent: BaseEvent = {
        kind: "product",
        name: "test_event",
        event_source: "user",
        session_id: "session-123",
        is_treatment: null,
        timestamp: 1234567890000,
        path: "/page",
        route: null,
        screen: null,
        viewKey: "/page",
        user_agent: "Mozilla/5.0",
        viewport_width: 1920,
        viewport_height: 1080,
        payload: {},
        // No client_ts_ms
      };

      const result = transformBaseEventToBackendFormat(baseEvent, baseOptions);

      expect(result.client_ts_ms).toBeNull();
    });
  });
});




