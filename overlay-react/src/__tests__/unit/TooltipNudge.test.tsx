/**
 * TooltipNudge Component Tests
 *
 * These tests verify the React ↔ Web Component INTEGRATION CONTRACT:
 * 1. TooltipNudge renders <reveal-tooltip-nudge> custom element
 * 2. React passes `decision` prop correctly to WC
 * 3. React listens to CustomEvents from WC and calls callbacks
 * 4. Event listeners are stable (no double-firing in React StrictMode)
 *
 * We do NOT test:
 * - Shadow DOM rendering (tested in @reveal/overlay-wc)
 * - Visual layout, positioning, or styles (tested in @reveal/overlay-wc)
 * - Tooltip-specific behavior (tested in @reveal/overlay-wc)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { TooltipNudge } from '../../components/templates/TooltipNudge';
import type { NudgeDecision } from '../../types/NudgeDecision';

describe('TooltipNudge - React/WC Integration Contract', () => {
  const mockOnDismiss = vi.fn();
  const mockOnActionClick = vi.fn();
  const mockOnTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Ensure stub Web Component is registered
    if (!customElements.get('reveal-tooltip-nudge')) {
      class RevealTooltipNudgeStub extends HTMLElement {
        _decision: any = null;

        set decision(value: any) {
          this._decision = value;
        }

        get decision() {
          return this._decision;
        }
      }
      customElements.define('reveal-tooltip-nudge', RevealTooltipNudgeStub);
    }
  });

  const createMockDecision = (overrides?: Partial<NudgeDecision>): NudgeDecision => ({
    id: 'test-nudge-1',
    templateId: 'tooltip',
    body: 'Test body',
    ...overrides,
  });

  describe('Element Rendering', () => {
    it('renders reveal-tooltip-nudge custom element', () => {
      const decision = createMockDecision();
      render(
        <TooltipNudge
          decision={decision}
          onDismiss={mockOnDismiss}
        />
      );

      const wcElement = document.querySelector('reveal-tooltip-nudge');
      expect(wcElement).toBeInTheDocument();
    });
  });

  describe('Decision Property Passing', () => {
    it('sets decision property on WC element', async () => {
      const decision = createMockDecision({ id: 'test-123', body: 'Test tooltip' });
      render(
        <TooltipNudge
          decision={decision}
          onDismiss={mockOnDismiss}
        />
      );

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-tooltip-nudge') as any;
        expect(wcElement).toBeTruthy();
        expect(wcElement.decision).toEqual(expect.objectContaining({
          id: 'test-123',
          body: 'Test tooltip',
        }));
      });
    });

    it('updates decision property when prop changes', async () => {
      const decision1 = createMockDecision({ id: 'decision-1', body: 'First' });
      const { rerender } = render(
        <TooltipNudge
          decision={decision1}
          onDismiss={mockOnDismiss}
        />
      );

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-tooltip-nudge') as any;
        expect(wcElement.decision.body).toBe('First');
      });

      const decision2 = createMockDecision({ id: 'decision-2', body: 'Second' });
      rerender(
        <TooltipNudge
          decision={decision2}
          onDismiss={mockOnDismiss}
        />
      );

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-tooltip-nudge') as any;
        expect(wcElement.decision.body).toBe('Second');
      });
    });
  });

  describe('CustomEvent Handling', () => {
    it('calls onDismiss when reveal:dismiss event is fired', async () => {
      const decision = createMockDecision({ id: 'nudge-123' });
      render(
        <TooltipNudge
          decision={decision}
          onDismiss={mockOnDismiss}
        />
      );

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-tooltip-nudge');
        expect(wcElement).toBeInTheDocument();
      });

      // Simulate WC firing reveal:dismiss event
      const wcElement = document.querySelector('reveal-tooltip-nudge')!;
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
      render(
        <TooltipNudge
          decision={decision}
          onDismiss={mockOnDismiss}
          onActionClick={mockOnActionClick}
        />
      );

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-tooltip-nudge');
        expect(wcElement).toBeInTheDocument();
      });

      // Simulate WC firing reveal:action-click event
      const wcElement = document.querySelector('reveal-tooltip-nudge')!;
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
      render(
        <TooltipNudge
          decision={decision}
          onDismiss={mockOnDismiss}
          onTrack={mockOnTrack}
        />
      );

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-tooltip-nudge');
        expect(wcElement).toBeInTheDocument();
      });

      // Simulate WC firing reveal:shown event
      const wcElement = document.querySelector('reveal-tooltip-nudge')!;
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

    it('handles events fired before listeners attached', async () => {
      const decision = createMockDecision({ id: 'early-event' });
      const { container } = render(
        <TooltipNudge
          decision={decision}
          onDismiss={mockOnDismiss}
        />
      );

      // Fire event immediately (before listeners might be attached)
      const wcElement = container.querySelector('reveal-tooltip-nudge')!;
      wcElement.dispatchEvent(new CustomEvent('reveal:dismiss', {
        detail: { id: 'early-event' },
        bubbles: true,
        composed: true,
      }));

      // Wait for React to attach listeners
      await waitFor(() => {
        // Fire again after listeners should be attached
        wcElement.dispatchEvent(new CustomEvent('reveal:dismiss', {
          detail: { id: 'early-event' },
          bubbles: true,
          composed: true,
        }));

        expect(mockOnDismiss).toHaveBeenCalledWith('early-event');
      });
    });
  });

  describe('Event Listener Cleanup', () => {
    it('removes listeners on unmount', async () => {
      const decision = createMockDecision({ id: 'cleanup-test' });
      const { unmount } = render(
        <TooltipNudge
          decision={decision}
          onDismiss={mockOnDismiss}
        />
      );

      await waitFor(() => {
        const wcElement = document.querySelector('reveal-tooltip-nudge');
        expect(wcElement).toBeInTheDocument();
      });

      // Fire event before unmount
      const wcElement = document.querySelector('reveal-tooltip-nudge')!;
      wcElement.dispatchEvent(new CustomEvent('reveal:dismiss', {
        detail: { id: 'cleanup-test' },
        bubbles: true,
        composed: true,
      }));

      await waitFor(() => {
        expect(mockOnDismiss).toHaveBeenCalledTimes(1);
      });

      // Unmount component
      unmount();

      // Fire event after unmount - should not call handler again
      wcElement.dispatchEvent(new CustomEvent('reveal:dismiss', {
        detail: { id: 'cleanup-test' },
        bubbles: true,
        composed: true,
      }));

      // Wait a bit to ensure no additional calls
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockOnDismiss).toHaveBeenCalledTimes(1); // Still only 1 call
    });
  });
});
