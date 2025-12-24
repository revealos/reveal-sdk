/**
 * RevealTooltipNudge Web Component
 *
 * A glassmorphic tooltip that displays nudge content in a viewport quadrant.
 * Features:
 * - Shadow DOM for style encapsulation
 * - Quadrant-based positioning
 * - Auto-dismiss support
 * - ESC key dismissal
 * - Float animation for arrow (respects prefers-reduced-motion)
 * - Responsive positioning with ResizeObserver
 */

import type { NudgeDecision, NudgeQuadrant } from "../types/nudge-decision";
import { computeQuadrantPosition } from "../utils/position";

const Z_INDEX_TOOLTIP = 10001;
const ARROW_SIZE = 56;
const ARROW_SPACING = 24;

/**
 * Determines arrow placement based on quadrant.
 */
function getArrowPlacement(quadrant: NudgeQuadrant): {
  edge: "top" | "bottom";
  direction: "up" | "down";
} {
  if (quadrant.startsWith("top")) {
    return { edge: "bottom", direction: "down" };
  } else {
    return { edge: "top", direction: "up" };
  }
}

// Conditional base class to support SSR
const HTMLElementBase = (typeof HTMLElement !== 'undefined' ? HTMLElement : Object) as typeof HTMLElement;

export class RevealTooltipNudge extends HTMLElementBase {
  private _decision: NudgeDecision | null = null;
  private _shadowRoot: ShadowRoot;
  private _tooltipElement: HTMLElement | null = null;
  private _arrowElement: HTMLElement | null = null;
  private _autoDismissTimeout: number | null = null;
  private _resizeObserver: ResizeObserver | null = null;
  private _animation: Animation | null = null;
  private _isShown: boolean = false;
  private _isRendered: boolean = false;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super();
    this._shadowRoot = this.attachShadow({ mode: "open" });
  }

  get decision(): NudgeDecision | null {
    return this._decision;
  }

  set decision(value: NudgeDecision | null) {
    this._decision = value;
    this._isRendered = false; // Reset render flag when decision changes
    this._isShown = false; // Reset shown flag for new decision
    this._render();
  }

  connectedCallback() {
    // Only render if not already rendered (prevents double-render on initial mount)
    if (this._decision && !this._isRendered) {
      this._render();
    }

    // Dispatch shown event after component is connected to DOM
    // This ensures React listeners are attached before event fires
    if (this._decision && !this._isShown) {
      this._isShown = true;
      console.log("[RevealTooltipNudge] Dispatching reveal:shown event (from connectedCallback)", { nudgeId: this._decision.nudgeId });
      this.dispatchEvent(
        new CustomEvent("reveal:shown", {
          detail: { id: this._decision.nudgeId },
          bubbles: true,
          composed: true,
        })
      );
    }
  }

  disconnectedCallback() {
    this._cleanup();
  }

  private _render() {
    // Prevent duplicate renders (fixes double event listener attachment)
    if (this._isRendered) {
      return;
    }

    if (!this._decision) {
      this._shadowRoot.innerHTML = "";
      return;
    }

    this._isRendered = true; // Mark as rendered

    const quadrant = this._decision.quadrant || "topCenter";
    const arrowPlacement = getArrowPlacement(quadrant);
    const displayBody = this._decision.body || this._decision.title || "";
    const hasTitle = this._decision.title && this._decision.title !== this._decision.body;

    // Render shadow DOM with styles and content
    this._shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .tooltip-container {
          position: fixed;
          z-index: ${Z_INDEX_TOOLTIP};
          pointer-events: auto;
          box-sizing: border-box;
          width: clamp(238px, 34vw, 408px);
          background: hsla(240, 15%, 14%, 0.32);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border-radius: 20px;
          padding: 24px;
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.30) inset,
            0 0 8px rgba(255, 255, 255, 0.08),
            0 8px 24px rgba(0, 0, 0, 0.40);
          color: #ffffff;
          text-align: center;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Ubuntu', 'Open Sans', 'Helvetica Neue', sans-serif;
        }

        .tooltip-title {
          margin: 0 0 12px 0;
          font-size: 20px;
          font-weight: 600;
          line-height: 1.25;
          color: #ffffff;
          text-shadow: 0 0 6px rgba(255, 255, 255, 0.18);
        }

        .tooltip-body {
          margin: 0 0 12px 0;
          font-size: 18px;
          font-weight: 700;
          line-height: 1.35;
          color: rgba(255, 255, 255, 0.92);
        }

        .tooltip-actions {
          display: flex;
          flex-direction: column;
          gap: 12px;
          align-items: center;
        }

        .cta-button,
        .dismiss-button {
          display: inline-block;
          margin: 0;
          padding: 0;
          border: none;
          background: transparent;
          font-size: 16px;
          font-weight: 500;
          line-height: 1.3;
          cursor: pointer;
        }

        .cta-button {
          color: #ffffff;
        }

        .dismiss-button {
          color: rgba(255, 255, 255, 0.80);
        }

        .arrow-wrapper {
          position: fixed;
          pointer-events: none;
          width: ${ARROW_SIZE}px;
          height: ${ARROW_SIZE}px;
          z-index: ${Z_INDEX_TOOLTIP};
          will-change: transform;
        }

        .arrow-bubble {
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: hsla(240, 15%, 14%, 0.32);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.30) inset,
            0 0 8px rgba(255, 255, 255, 0.08),
            0 8px 24px rgba(0, 0, 0, 0.40);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .debug-code {
          position: fixed;
          bottom: 8px;
          right: 12px;
          font-size: 10px;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: rgba(156, 163, 175, 0.2);
          pointer-events: none;
          user-select: none;
          z-index: 999999;
          line-height: 1;
          padding: 4px 6px;
          border-radius: 3px;
        }
      </style>

      ${this._decision.debugCode ? `
        <div class="debug-code" aria-hidden="true">
          reveal: ${this._decision.debugCode}
        </div>
      ` : ''}

      <div class="arrow-wrapper">
        <div class="arrow-bubble">
          <svg width="24" height="24" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
            ${
              arrowPlacement.direction === "down"
                ? '<path d="M6 10L10 5H2L6 10Z" fill="rgba(255, 255, 255, 0.92)" stroke="rgba(255, 255, 255, 0.5)" stroke-width="0.5"/>'
                : '<path d="M6 2L2 7H10L6 2Z" fill="rgba(255, 255, 255, 0.92)" stroke="rgba(255, 255, 255, 0.5)" stroke-width="0.5"/>'
            }
          </svg>
        </div>
      </div>

      <div class="tooltip-container" role="tooltip" ${hasTitle ? `aria-labelledby="tooltip-title-${this._decision.nudgeId}"` : ''}>
        ${hasTitle ? `<h3 id="tooltip-title-${this._decision.nudgeId}" class="tooltip-title">${this._escape(this._decision.title!)}</h3>` : ''}
        ${displayBody ? `<p class="tooltip-body">${this._escape(displayBody)}</p>` : ''}
        <div class="tooltip-actions">
          ${this._decision.ctaText ? `<button class="cta-button" aria-label="${this._escape(this._decision.ctaText)}">${this._escape(this._decision.ctaText)}</button>` : ''}
          ${this._decision.dismissible !== false && !this._decision.ctaText ? '<button class="dismiss-button" aria-label="Got it">✔️ Got it</button>' : ''}
        </div>
      </div>
    `;

    // Get references
    this._tooltipElement = this._shadowRoot.querySelector(".tooltip-container");
    this._arrowElement = this._shadowRoot.querySelector(".arrow-wrapper");

    // Position tooltip and arrow
    this._updatePosition();

    // Setup auto-dismiss
    if (this._decision.autoDismissMs) {
      this._autoDismissTimeout = window.setTimeout(() => {
        this._handleDismiss();
      }, this._decision.autoDismissMs);
    }

    // Start arrow animation
    this._startArrowAnimation();

    // Setup resize observer
    this._observeResize();

    // Attach event listeners
    this._attachEventListeners();

    // NOTE: reveal:shown event moved to connectedCallback() to ensure
    // React listeners are attached before event is dispatched
  }

  private _escape(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private _updatePosition() {
    if (!this._tooltipElement || !this._arrowElement || !this._decision) return;

    const quadrant = this._decision.quadrant || "topCenter";
    const position = computeQuadrantPosition(quadrant, this._tooltipElement);

    this._tooltipElement.style.top = `${position.top}px`;
    this._tooltipElement.style.left = `${position.left}px`;

    // Calculate arrow position
    const arrowPlacement = getArrowPlacement(quadrant);
    const tooltipHeight = this._tooltipElement.offsetHeight;
    const tooltipWidth = this._tooltipElement.offsetWidth;

    let arrowTop = 0;
    let arrowLeft = 0;

    if (arrowPlacement.edge === "bottom") {
      arrowTop = position.top + tooltipHeight + ARROW_SPACING;
      arrowLeft = position.left + tooltipWidth / 2 - ARROW_SIZE / 2;
    } else {
      arrowTop = position.top - ARROW_SPACING - ARROW_SIZE;
      arrowLeft = position.left + tooltipWidth / 2 - ARROW_SIZE / 2;
    }

    this._arrowElement.style.top = `${arrowTop}px`;
    this._arrowElement.style.left = `${arrowLeft}px`;
  }

  private _startArrowAnimation() {
    if (!this._arrowElement) return;

    // Respect reduced motion
    try {
      if (typeof window.matchMedia === "function") {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (reduceMotion) {
          return;
        }
      }
    } catch {
      // If matchMedia fails, proceed without reduced-motion optimization
    }

    if (typeof this._arrowElement.animate !== "function") {
      // WAAPI not available
      return;
    }

    // Cancel any previous animation
    this._animation?.cancel();

    this._animation = this._arrowElement.animate(
      [
        { transform: "translateY(0px)" },
        { transform: "translateY(-12px)" },
        { transform: "translateY(0px)" },
      ],
      { duration: 6000, iterations: Infinity, easing: "ease-in-out" }
    );
  }

  private _observeResize() {
    if (!this._tooltipElement) return;

    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver = new ResizeObserver(() => {
        this._updatePosition();
      });
      this._resizeObserver.observe(this._tooltipElement);
    }

    // Also listen to window resize
    window.addEventListener("resize", this._handleResize);
  }

  private _handleResize = () => {
    this._updatePosition();
  };

  private _attachEventListeners() {
    // ESC key listener
    this._keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this._handleDismiss();
      }
    };
    window.addEventListener("keydown", this._keydownHandler);

    // Button click listeners
    const ctaButton = this._shadowRoot.querySelector(".cta-button");
    if (ctaButton) {
      console.log("[RevealTooltipNudge] Attaching click listener to CTA button");
      ctaButton.addEventListener("click", () => this._handleActionClick());
    }

    const dismissButton = this._shadowRoot.querySelector(".dismiss-button");
    if (dismissButton) {
      console.log("[RevealTooltipNudge] Attaching click listener to dismiss button");
      dismissButton.addEventListener("click", () => this._handleDismiss());
    }
  }

  private _handleDismiss() {
    console.log("[RevealTooltipNudge] _handleDismiss called, dispatching reveal:dismiss");
    this.dispatchEvent(
      new CustomEvent("reveal:dismiss", {
        detail: { id: this._decision?.nudgeId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handleActionClick() {
    console.log("[RevealTooltipNudge] _handleActionClick called, dispatching reveal:action-click");
    this.dispatchEvent(
      new CustomEvent("reveal:action-click", {
        detail: { id: this._decision?.nudgeId },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _cleanup() {
    if (this._autoDismissTimeout) {
      clearTimeout(this._autoDismissTimeout);
      this._autoDismissTimeout = null;
    }
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this._animation) {
      this._animation.cancel();
      this._animation = null;
    }
    if (this._keydownHandler) {
      window.removeEventListener("keydown", this._keydownHandler);
      this._keydownHandler = null;
    }
    window.removeEventListener("resize", this._handleResize);
  }
}

// Register custom element
if (typeof customElements !== "undefined") {
  customElements.define("reveal-tooltip-nudge", RevealTooltipNudge);
}
