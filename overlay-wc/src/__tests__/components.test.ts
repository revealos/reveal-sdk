/**
 * Basic tests for Web Components
 *
 * These tests verify that the Web Components are defined and can be instantiated.
 * More comprehensive testing happens in the overlay-react integration tests.
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Import to trigger component registration
import '../index';

describe('Web Components Registration', () => {
  beforeAll(() => {
    // Ensure we're in a browser-like environment
    if (typeof customElements === 'undefined') {
      throw new Error('customElements not available - tests must run in browser environment');
    }
  });

  it('should register reveal-overlay-manager component', () => {
    expect(customElements.get('reveal-overlay-manager')).toBeDefined();
  });

  it('should register reveal-tooltip-nudge component', () => {
    expect(customElements.get('reveal-tooltip-nudge')).toBeDefined();
  });

  it('should create reveal-overlay-manager instance', () => {
    const element = document.createElement('reveal-overlay-manager');
    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.tagName.toLowerCase()).toBe('reveal-overlay-manager');
  });

  it('should create reveal-tooltip-nudge instance', () => {
    const element = document.createElement('reveal-tooltip-nudge');
    expect(element).toBeInstanceOf(HTMLElement);
    expect(element.tagName.toLowerCase()).toBe('reveal-tooltip-nudge');
  });

  it('should have shadow DOM on reveal-overlay-manager', () => {
    const element = document.createElement('reveal-overlay-manager') as any;
    document.body.appendChild(element);
    expect(element.shadowRoot).toBeDefined();
    document.body.removeChild(element);
  });

  it('should have shadow DOM on reveal-tooltip-nudge', () => {
    const element = document.createElement('reveal-tooltip-nudge') as any;
    document.body.appendChild(element);
    expect(element.shadowRoot).toBeDefined();
    document.body.removeChild(element);
  });
});
