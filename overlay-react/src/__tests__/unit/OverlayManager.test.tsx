/**
 * OverlayManager Component Tests
 *
 * These tests verify the React ↔ Web Component INTEGRATION CONTRACT:
 * 1. OverlayManager renders <reveal-overlay-manager> custom element
 * 2. React passes `decision` prop correctly to WC
 * 3. React listens to CustomEvents from WC and calls callbacks
 * 4. Event listeners are stable (no double-firing in React StrictMode)
 *
 * We do NOT test:
 * - Shadow DOM rendering (tested in @reveal/overlay-wc)
 * - Visual layout or styles (tested in @reveal/overlay-wc)
 * - Template-specific behavior (tested in @reveal/overlay-wc)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { OverlayManager } from '../../components/OverlayManager';
import type { NudgeDecision } from '../../types/NudgeDecision';

describe('OverlayManager - React/WC Integration Contract', () => {
  const mockOnDismiss = vi.fn();
  const mockOnActionClick = vi.fn();
  const mockOnTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up portal container
    const portal = document.getElementById('reveal-overlay-root');
    portal?.remove();
  });

  const createMockDecision = (overrides?: Partial<NudgeDecision>): NudgeDecision => ({
    id: 'test-nudge-1',
    templateId: 'tooltip',
    body: 'Test body',
    ...overrides,
  });

  // Helper to wait for React effects and ref assignments to complete
  const flushEffects = async () => {
    await act(async () => {
      // Wait for multiple animation frames to ensure all effects have run
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  };

  describe('Portal and Element Rendering', () => {
    it('creates portal container when mounted', async () => {
      const decision = createMockDecision();
      render(<OverlayManager decision={decision} />);

      await waitFor(() => {
        const portal = document.getElementById('reveal-overlay-root');
        expect(portal).toBeInTheDocument();
        expect(portal).toHaveStyle({ position: 'fixed', zIndex: '9999' });
      });
    });

    it('renders reveal-overlay-manager custom element in portal', async () => {
      const decision = createMockDecision();
      render(<OverlayManager decision={decision} />);

      await waitFor(() => {
        const portal = document.getElementById('reveal-overlay-root');
        const wcElement = portal?.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });
    });

    it('renders WC element even when decision is null', async () => {
      render(<OverlayManager decision={null} />);

      // Portal should exist and WC element is rendered (but decision property is null)
      await waitFor(() => {
        const portal = document.getElementById('reveal-overlay-root');
        expect(portal).toBeInTheDocument();
        const wcElement = portal?.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });
    });
  });

  describe('Decision Property Passing', () => {
    it('sets decision property on WC element', async () => {
      const decision = createMockDecision({ id: 'test-123', body: 'Test content' });
      render(<OverlayManager decision={decision} />);

      // Wait for WC element to be rendered
      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });

      // Flush all effects (portal container creation, ref assignment, decision sync)
      await flushEffects();

      // Then wait for decision property to be set (happens in separate effect after ref assignment)
      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager') as any;
        expect(wcElement.decision).toBeTruthy();
        expect(wcElement.decision).toEqual(expect.objectContaining({
          nudgeId: 'test-123',
          body: 'Test content',
        }));
      }, { timeout: 3000 });
    });

    it('updates decision property when prop changes', async () => {
      const decision1 = createMockDecision({ id: 'decision-1' });
      const { rerender } = render(<OverlayManager decision={decision1} />);

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });

      await flushEffects();

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager') as any;
        expect(wcElement.decision).toBeTruthy();
        expect(wcElement.decision).toEqual(expect.objectContaining({ nudgeId: 'decision-1' }));
      }, { timeout: 3000 });

      const decision2 = createMockDecision({ id: 'decision-2' });
      rerender(<OverlayManager decision={decision2} />);

      await flushEffects();

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager') as any;
        expect(wcElement.decision).toEqual(expect.objectContaining({ nudgeId: 'decision-2' }));
      }, { timeout: 3000 });
    });

    it('sets decision property to null when decision becomes null', async () => {
      const decision = createMockDecision();
      const { rerender } = render(<OverlayManager decision={decision} />);

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });

      await flushEffects();

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager') as any;
        expect(wcElement.decision).toBeTruthy();
      }, { timeout: 3000 });

      rerender(<OverlayManager decision={null} />);

      await flushEffects();

      // WC element still exists but decision property is null
      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager') as any;
        expect(wcElement).toBeInTheDocument();
        expect(wcElement.decision).toBeNull();
      }, { timeout: 3000 });
    });
  });

  describe('CustomEvent Handling', () => {
    it('calls onDismiss when reveal:dismiss event is fired', async () => {
      const decision = createMockDecision({ id: 'nudge-123' });
      render(<OverlayManager decision={decision} onDismiss={mockOnDismiss} />);

      // Wait for WC element to be rendered
      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });

      // Wait for listeners to be attached (happens in requestAnimationFrame)
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // Simulate WC firing reveal:dismiss event
      const wcElement = document.querySelector('reveal-overlay-manager')!;
      wcElement.dispatchEvent(new CustomEvent('reveal:dismiss', {
        detail: { id: 'nudge-123' },
        bubbles: true,
        composed: true,
      }));

      await waitFor(() => {
        expect(mockOnDismiss).toHaveBeenCalledTimes(1);
        expect(mockOnDismiss).toHaveBeenCalledWith('nudge-123');
      });
    });

    it('calls onActionClick when reveal:action-click event is fired', async () => {
      const decision = createMockDecision({ id: 'nudge-456' });
      render(<OverlayManager decision={decision} onActionClick={mockOnActionClick} />);

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });

      // Wait for listeners to be attached
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // Simulate WC firing reveal:action-click event
      const wcElement = document.querySelector('reveal-overlay-manager')!;
      wcElement.dispatchEvent(new CustomEvent('reveal:action-click', {
        detail: { id: 'nudge-456' },
        bubbles: true,
        composed: true,
      }));

      await waitFor(() => {
        expect(mockOnActionClick).toHaveBeenCalledTimes(1);
        expect(mockOnActionClick).toHaveBeenCalledWith('nudge-456');
      });
    });

    it('calls onTrack when reveal:shown event is fired', async () => {
      const decision = createMockDecision({ id: 'nudge-789' });
      render(<OverlayManager decision={decision} onTrack={mockOnTrack} />);

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });

      // Wait for listeners to be attached
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // Simulate WC firing reveal:shown event
      const wcElement = document.querySelector('reveal-overlay-manager')!;
      wcElement.dispatchEvent(new CustomEvent('reveal:shown', {
        detail: { id: 'nudge-789' },
        bubbles: true,
        composed: true,
      }));

      await waitFor(() => {
        expect(mockOnTrack).toHaveBeenCalledTimes(1);
        expect(mockOnTrack).toHaveBeenCalledWith('nudge', 'nudge_shown', { nudgeId: 'nudge-789' });
      });
    });

    it('only fires event callbacks once (React StrictMode safety)', async () => {
      const decision = createMockDecision({ id: 'strict-mode-test' });
      render(<OverlayManager decision={decision} onDismiss={mockOnDismiss} />);

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-overlay-manager');
        expect(wcElement).toBeInTheDocument();
      });

      // Wait for listeners to be attached
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      // Fire the same event multiple times
      const wcElement = document.querySelector('reveal-overlay-manager')!;
      wcElement.dispatchEvent(new CustomEvent('reveal:dismiss', {
        detail: { id: 'strict-mode-test' },
        bubbles: true,
        composed: true,
      }));
      wcElement.dispatchEvent(new CustomEvent('reveal:dismiss', {
        detail: { id: 'strict-mode-test' },
        bubbles: true,
        composed: true,
      }));

      await waitFor(() => {
        // Each dispatch should call the handler (this tests React doesn't double-attach listeners)
        expect(mockOnDismiss).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('showQuadrants Prop', () => {
    it('sets show-quadrants attribute when showQuadrants is true', () => {
      const decision = createMockDecision();
      render(<OverlayManager decision={decision} showQuadrants={true} />);

      const wcElement = document.querySelector('reveal-overlay-manager');
      expect(wcElement).toHaveAttribute('show-quadrants');
    });

    it('does not set show-quadrants attribute when showQuadrants is false', () => {
      const decision = createMockDecision();
      render(<OverlayManager decision={decision} showQuadrants={false} />);

      const wcElement = document.querySelector('reveal-overlay-manager');
      expect(wcElement).not.toHaveAttribute('show-quadrants');
    });
  });
});
