/**
 * RevealNudgeHost Component Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RevealNudgeHost } from '../../components/RevealNudgeHost';
import type { NudgeDecision } from '../../types/NudgeDecision';

// Mock the hooks
const mockUseNudgeVisibility = vi.fn((args: any) => {
  const handleManualDismiss = vi.fn(() => {
    if (args.onDismiss) {
      args.onDismiss(args.decision.id);
    }
  });
  return {
    isVisible: true,
    handleManualDismiss,
  };
});

const mockUseTargetRect = vi.fn(() => null);

const mockUseTrackNudgeShown = vi.fn();

vi.mock('../../hooks/useNudgeVisibility', () => ({
  useNudgeVisibility: (...args: any[]) => mockUseNudgeVisibility(...args),
}));

vi.mock('../../hooks/useTargetRect', () => ({
  useTargetRect: (...args: any[]) => mockUseTargetRect(...args),
}));

vi.mock('../../hooks/useTrackNudgeShown', () => ({
  useTrackNudgeShown: (...args: any[]) => mockUseTrackNudgeShown(...args),
}));

// Mock TooltipNudge
vi.mock('../../components/templates/TooltipNudge', () => ({
  TooltipNudge: ({ decision, onDismiss, onActionClick }: any) => (
    <div data-testid="tooltip-nudge">
      <div>{decision.body}</div>
      <button onClick={() => onDismiss(decision.id)}>Got it</button>
      {decision.ctaText && (
        <button onClick={() => onActionClick?.(decision.id)}>{decision.ctaText}</button>
      )}
    </div>
  ),
}));

describe('RevealNudgeHost', () => {
  const mockOnDismiss = vi.fn();
  const mockOnActionClick = vi.fn();
  const mockOnTrack = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset mock implementations
    mockUseNudgeVisibility.mockImplementation((args: any) => {
      const handleManualDismiss = vi.fn(() => {
        if (args.onDismiss) {
          args.onDismiss(args.decision.id);
        }
      });
      return {
        isVisible: true,
        handleManualDismiss,
      };
    });
    mockUseTargetRect.mockReturnValue(null);
    mockUseTrackNudgeShown.mockClear();
  });

  const createMockDecision = (overrides?: Partial<NudgeDecision>): NudgeDecision => ({
    id: 'test-nudge-1',
    templateId: 'tooltip',
    body: 'Test body',
    ...overrides,
  });

  it('renders nothing when decision is null', () => {
    const { container } = render(
      <RevealNudgeHost decision={null} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders TooltipNudge when decision.templateId is "tooltip"', () => {
    const decision = createMockDecision({
      templateId: 'tooltip',
      body: 'Test tooltip body',
    });

    render(
      <RevealNudgeHost
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.getByTestId('tooltip-nudge')).toBeInTheDocument();
    expect(screen.getByText('Test tooltip body')).toBeInTheDocument();
  });

  it('returns null for unimplemented templateIds', () => {
    mockUseNudgeVisibility.mockReturnValue({
      isVisible: true,
      handleManualDismiss: vi.fn(),
    });

    const decision = createMockDecision({
      templateId: 'modal',
    });

    const { container } = render(
      <RevealNudgeHost decision={decision} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('logs warning for unknown templateId in dev mode', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockUseNudgeVisibility.mockReturnValue({
      isVisible: true,
      handleManualDismiss: vi.fn(),
    });

    const decision = createMockDecision({
      templateId: 'unknown-template' as any,
    });

    render(
      <RevealNudgeHost decision={decision} />
    );

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[RevealNudgeHost] Unknown templateId:'),
      'unknown-template'
    );

    consoleSpy.mockRestore();
  });

  it('calls onDismiss with decision.id when nudge is dismissed', () => {
    const decision = createMockDecision();

    render(
      <RevealNudgeHost
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    const gotItButton = screen.getByText('Got it');
    gotItButton.click();

    expect(mockOnDismiss).toHaveBeenCalledWith('test-nudge-1');
  });

  it('calls onActionClick with decision.id when action is clicked', () => {
    const decision = createMockDecision({
      ctaText: 'Click me',
    });

    render(
      <RevealNudgeHost
        decision={decision}
        onActionClick={mockOnActionClick}
      />
    );

    const actionButton = screen.getByText('Click me');
    actionButton.click();

    expect(mockOnActionClick).toHaveBeenCalledWith('test-nudge-1');
  });

  it('uses useNudgeVisibility to manage visibility', () => {
    const mockHandleManualDismiss = vi.fn();
    mockUseNudgeVisibility.mockReturnValue({
      isVisible: false, // Not visible
      handleManualDismiss: mockHandleManualDismiss,
    });

    const decision = createMockDecision();

    const { container } = render(
      <RevealNudgeHost decision={decision} />
    );

    // Should not render when not visible
    expect(container.firstChild).toBeNull();
    expect(mockUseNudgeVisibility).toHaveBeenCalledWith({
      decision,
      onDismiss: undefined,
    });
  });

  it('uses useTargetRect to get target rect', () => {
    const mockRect = new DOMRect(100, 200, 50, 30);
    mockUseTargetRect.mockReturnValue(mockRect);

    const decision = createMockDecision({
      targetId: 'test-target',
    });

    render(
      <RevealNudgeHost decision={decision} />
    );

    expect(mockUseTargetRect).toHaveBeenCalledWith('test-target');
  });

  it('passes correct props to TooltipNudge', () => {
    const decision = createMockDecision({
      body: 'Test body',
      title: 'Test title',
      ctaText: 'Test CTA',
    });

    render(
      <RevealNudgeHost
        decision={decision}
        onDismiss={mockOnDismiss}
        onActionClick={mockOnActionClick}
        onTrack={mockOnTrack}
      />
    );

    // Verify TooltipNudge received the decision
    expect(screen.getByText('Test body')).toBeInTheDocument();
  });

  it('handles null targetId gracefully', () => {
    mockUseTargetRect.mockReturnValue(null);

    const decision = createMockDecision({
      targetId: null,
    });

    render(
      <RevealNudgeHost decision={decision} />
    );

    expect(mockUseTargetRect).toHaveBeenCalledWith(null);
    // Should still render (TooltipNudge handles null targetId)
    expect(screen.getByTestId('tooltip-nudge')).toBeInTheDocument();
  });

  it('calls useTrackNudgeShown with decision.id and onTrack', () => {
    const decision = createMockDecision();

    render(
      <RevealNudgeHost
        decision={decision}
        onTrack={mockOnTrack}
      />
    );

    expect(mockUseTrackNudgeShown).toHaveBeenCalledWith('test-nudge-1', mockOnTrack);
  });
});

