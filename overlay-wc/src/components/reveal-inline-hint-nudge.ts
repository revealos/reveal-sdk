/**
 * RevealInlineHintNudge Component
 *
 * Lightweight inline hint nudge with glassmorphic styling.
 * Simpler than tooltip - no title, no CTA, no arrow, just body text.
 *
 * Features:
 * - Glassmorphic design (same as tooltip but thinner)
 * - Supports topCenter and bottomCenter quadrants only (MVP)
 * - Dismisses on ANY meaningful engagement: click, focus, scroll (>16px), ESC key
 * - Emits reveal:shown once on mount
 * - Emits reveal:dismiss with reason (click|focus|scroll|esc|navigation|tab_hidden)
 * - Idempotent dismissal (only one dismiss event per nudgeId)
 *
 * @module components/reveal-inline-hint-nudge
 */

import type { NudgeDecision, NudgeQuadrant } from "../types/nudge-decision";
import { computeQuadrantPosition } from "../utils/position";

// SSR-safe base class
const HTMLElementBase = (typeof HTMLElement !== 'undefined' ? HTMLElement : Object) as typeof HTMLElement;

export class RevealInlineHintNudge extends HTMLElementBase {
  private _shadowRoot!: ShadowRoot;
  private _decision: NudgeDecision | null = null;
  private _isRendered = false;
  private _isShown = false;
  private _isDismissed = false; // Idempotency guard

  // Event handler references for cleanup
  private _clickHandler: ((e: MouseEvent) => void) | null = null;
  private _focusHandler: ((e: FocusEvent) => void) | null = null;
  private _scrollHandler: (() => void) | null = null;
  private _keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  constructor() {
    super();
    if (typeof this.attachShadow !== 'undefined') {
      this._shadowRoot = this.attachShadow({ mode: "open" });
    }
  }

  get decision(): NudgeDecision | null {
    return this._decision;
  }

  set decision(value: NudgeDecision | null) {
    this._decision = value;
    this._isRendered = false;
    this._isShown = false;
    this._isDismissed = false;
    this._render();
  }

  connectedCallback() {
    if (this._decision && !this._isRendered) {
      this._render();
    }

    // Dispatch shown event after connected (React listeners ready)
    if (this._decision && !this._isShown) {
      this._isShown = true;
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
    if (!this._decision || this._isRendered) return;

    const quadrant = this._decision.quadrant || "topCenter";

    // Only support topCenter and bottomCenter for MVP
    if (quadrant !== "topCenter" && quadrant !== "bottomCenter") {
      console.warn(`[reveal-inline-hint] Quadrant "${quadrant}" not supported. Using topCenter.`);
    }

    this._shadowRoot.innerHTML = `
      <style>
        :host {
          all: initial;
          display: block;
        }

        .inline-hint-container {
          position: fixed;
          z-index: 10001;

          /* Glassmorphic design - same as tooltip */
          background: hsla(240, 15%, 14%, 0.32);
          backdrop-filter: blur(6px);
          -webkit-backdrop-filter: blur(6px);
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow:
            0 0 0 1px rgba(0, 0, 0, 0.30) inset,
            0 0 8px rgba(255, 255, 255, 0.08),
            0 8px 24px rgba(0, 0, 0, 0.40);

          /* Generous padding for breathability */
          padding: 16px 24px;
          border-radius: 8px;
          width: clamp(200px, 35vw, 450px);

          pointer-events: auto;

          /* Fade-in animation */
          opacity: 0;
          animation: fadeIn 400ms ease-out forwards;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        /* Respect reduced motion preference */
        @media (prefers-reduced-motion: reduce) {
          .inline-hint-container {
            animation: none;
            opacity: 1;
          }
        }

        .hint-text {
          color: #e8e8eb;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 17px;
          line-height: 1.4;
          margin: 0;
          text-align: center;
          font-weight: 500;
        }

        .debug-code {
          position: fixed;
          bottom: 8px;
          right: 8px;
          font-size: 9px;
          color: rgba(255, 255, 255, 0.28);
          font-family: ui-monospace, monospace;
          pointer-events: none;
          user-select: none;
          z-index: 10002;
        }
      </style>

      <div class="inline-hint-container">
        <p class="hint-text">${this._escape(this._decision.body || '')}</p>
      </div>

      ${this._decision.debugCode ? `
        <div class="debug-code" aria-hidden="true">
          reveal: ${this._decision.debugCode}
        </div>
      ` : ''}
    `;

    this._isRendered = true;

    // Update position after render
    requestAnimationFrame(() => {
      this._updatePosition();
      this._attachEventListeners();
    });
  }

  private _updatePosition() {
    const container = this._shadowRoot.querySelector('.inline-hint-container') as HTMLElement;
    if (!container || !this._decision) return;

    const quadrant = this._decision.quadrant || "topCenter";
    const position = computeQuadrantPosition(quadrant, container);

    container.style.top = `${position.top}px`;
    container.style.left = `${position.left}px`;
  }

  private _attachEventListeners() {
    // Click anywhere dismisses
    this._clickHandler = (e: MouseEvent) => {
      this._handleDismiss("click");
    };
    document.addEventListener("click", this._clickHandler, true);

    // Focus anywhere dismisses
    this._focusHandler = (e: FocusEvent) => {
      this._handleDismiss("focus");
    };
    document.addEventListener("focusin", this._focusHandler, true);

    // Scroll dismisses (with threshold)
    let lastScrollY = window.scrollY;
    this._scrollHandler = () => {
      const scrollDelta = Math.abs(window.scrollY - lastScrollY);
      if (scrollDelta > 16) {
        this._handleDismiss("scroll");
      }
    };
    window.addEventListener("scroll", this._scrollHandler, { passive: true });

    // ESC key dismisses
    this._keydownHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        this._handleDismiss("esc");
      }
    };
    window.addEventListener("keydown", this._keydownHandler);
  }

  private _handleDismiss(reason: string) {
    if (this._isDismissed) return; // Idempotency
    this._isDismissed = true;

    this.dispatchEvent(
      new CustomEvent("reveal:dismiss", {
        detail: {
          id: this._decision?.nudgeId,
          reason
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _cleanup() {
    if (this._clickHandler) {
      document.removeEventListener("click", this._clickHandler, true);
    }
    if (this._focusHandler) {
      document.removeEventListener("focusin", this._focusHandler, true);
    }
    if (this._scrollHandler) {
      window.removeEventListener("scroll", this._scrollHandler);
    }
    if (this._keydownHandler) {
      window.removeEventListener("keydown", this._keydownHandler);
    }
  }

  private _escape(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }
}

// Auto-register
if (typeof customElements !== 'undefined') {
  customElements.define("reveal-inline-hint-nudge", RevealInlineHintNudge);
}
