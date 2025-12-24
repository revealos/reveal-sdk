import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock @reveal/overlay-wc to prevent real Web Components from loading
vi.mock('@reveal/overlay-wc', () => ({}));

// Define minimal test stub for reveal-overlay-manager
// This stub ONLY needs to:
// 1. Accept the `decision` property from React
// 2. Dispatch CustomEvents that React listens to
// NO Shadow DOM, NO rendering logic, NO visuals

class RevealOverlayManagerStub extends HTMLElement {
  _decision: any = null;

  set decision(value: any) {
    this._decision = value;
  }

  get decision() {
    return this._decision;
  }

  connectedCallback() {
    // Stub is connected - ready to receive events/properties from React
  }
}

// Register stub before tests run
if (!customElements.get('reveal-overlay-manager')) {
  customElements.define('reveal-overlay-manager', RevealOverlayManagerStub);
}
