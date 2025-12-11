/**
 * TooltipNudge Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipNudge } from '../../components/templates/TooltipNudge';
import type { UINudgeDecision } from '../../types/NudgeDecision';

// Mock the hooks
// Note: useTrackNudgeShown is no longer used in TooltipNudge
// It's handled by OverlayManager instead

vi.mock('../../hooks/useKeyboardDismiss', () => ({
  useKeyboardDismiss: vi.fn(),
}));

describe('TooltipNudge', () => {
  const mockOnDismiss = vi.fn();
  const mockOnActionClick = vi.fn();
  const mockOnTrack = vi.fn();

  beforeEach(() => {
    // Mock window dimensions for quadrant positioning
    Object.defineProperty(window, 'innerWidth', { 
      value: 1024, 
      writable: true, 
      configurable: true 
    });
    Object.defineProperty(window, 'innerHeight', { 
      value: 768, 
      writable: true, 
      configurable: true 
    });

    vi.clearAllMocks();
  });

  const createMockDecision = (overrides?: Partial<UINudgeDecision>): UINudgeDecision => ({
    id: 'test-nudge-1',
    templateId: 'tooltip',
    body: 'Test body text',
    quadrant: 'topCenter', // Default quadrant
    ...overrides,
  });

  it('renders with UINudgeDecision containing body', async () => {
    const decision = createMockDecision({ 
      body: 'Test body',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Wait for position to be calculated and tooltip to render
    await waitFor(() => {
      expect(screen.getByText('Test body')).toBeInTheDocument();
    });
  });

  it('renders with title and body', async () => {
    const decision = createMockDecision({
      title: 'Test Title',
      body: 'Test body',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Wait for tooltip to render
    await waitFor(() => {
      expect(screen.getByText('Test Title')).toBeInTheDocument();
      expect(screen.getByText('Test body')).toBeInTheDocument();
    });
  });

  it('renders with ctaText button', async () => {
    const decision = createMockDecision({
      body: 'Test body',
      ctaText: 'Click me',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
        onActionClick={mockOnActionClick}
      />
    );

    // Wait for tooltip to render
    await waitFor(() => {
      const ctaButton = screen.getByText('Click me');
      expect(ctaButton).toBeInTheDocument();
    });
  });

  it('calls onActionClick when CTA button clicked', async () => {
    const decision = createMockDecision({
      body: 'Test body',
      ctaText: 'Click me',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
        onActionClick={mockOnActionClick}
      />
    );

    // Wait for tooltip to render, then click
    await waitFor(() => {
      const ctaButton = screen.getByText('Click me');
      fireEvent.click(ctaButton);
    });

    expect(mockOnActionClick).toHaveBeenCalledWith('test-nudge-1');
  });

  it('calls onDismiss when "Got it" button clicked', async () => {
    const decision = createMockDecision({ 
      body: 'Test body',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Wait for tooltip to render, then click "Got it"
    await waitFor(() => {
      const gotItButton = screen.getByText('✔️ Got it');
      fireEvent.click(gotItButton);
    });

    expect(mockOnDismiss).toHaveBeenCalledWith('test-nudge-1');
  });

  it('hides "Got it" button when dismissible is false', () => {
    const decision = createMockDecision({
      body: 'Test body',
      dismissible: false,
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    expect(screen.queryByText('✔️ Got it')).not.toBeInTheDocument();
  });

  it('renders tooltip in topCenter by default when quadrant not specified', async () => {
    const decision = createMockDecision({
      body: 'Test body',
      quadrant: undefined, // No quadrant specified
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Should render tooltip in default topCenter position
    await waitFor(() => {
      expect(screen.getByText('Test body')).toBeInTheDocument();
    });
    
    const tooltip = screen.getByRole('tooltip');
    expect(tooltip).toBeInTheDocument();
    // Should have positioning styles (top and left from inline styles)
    // Top value is calculated by centering tooltip in quadrant, not a fixed value
    const style = tooltip.getAttribute('style');
    expect(style).toContain('top:');
    expect(style).toMatch(/top:\s*[\d.]+px/);
    // Should have left style set (exact value depends on viewport width)
    expect(style).toContain('left:');
    expect(style).toMatch(/left:\s*[\d.]+px/);
    // Should have fixed positioning (inline styles)
    expect(style).toContain('position: fixed');
  });

  it('positions tooltip in specified quadrant', async () => {
    const decision = createMockDecision({
      body: 'Test body',
      quadrant: 'topRight',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    await waitFor(() => {
      const tooltip = screen.getByRole('tooltip');
      expect(tooltip).toBeInTheDocument();
      // Should be positioned (top and left styles set)
      // Top value is calculated by centering tooltip in quadrant, not a fixed value
      const style = tooltip.getAttribute('style');
      expect(style).toContain('top:');
      expect(style).toMatch(/top:\s*[\d.]+px/);
      // Should have left style set (exact value depends on viewport width and quadrant)
      expect(style).toContain('left:');
      expect(style).toMatch(/left:\s*[\d.]+px/);
      // Should have fixed positioning (inline styles)
      expect(style).toContain('position: fixed');
    });
  });

  it('renders tooltip with onTrack callback available', async () => {
    // Note: useTrackNudgeShown is no longer called in TooltipNudge
    // Tracking is handled by OverlayManager instead
    const decision = createMockDecision({ 
      body: 'Test body',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
        onTrack={mockOnTrack}
      />
    );

    // Wait for component to mount
    await waitFor(() => {
      expect(screen.getByText('Test body')).toBeInTheDocument();
    });

    // Verify tooltip renders correctly
    // Tracking is handled by OverlayManager, not TooltipNudge
    expect(screen.getByText('Test body')).toBeInTheDocument();
  });

  it('uses body as fallback when title is not provided', async () => {
    const decision = createMockDecision({
      body: 'Test body only',
      title: undefined,
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Wait for tooltip to render
    await waitFor(() => {
      expect(screen.getByText('Test body only')).toBeInTheDocument();
      // Should not render title heading
      expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    });
  });

  it('does not render a backdrop overlay (tooltip is non-blocking)', async () => {
    const decision = createMockDecision({ 
      body: 'Test body',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Wait for tooltip to render
    await waitFor(() => {
      expect(screen.getByText('Test body')).toBeInTheDocument();
    });

    // Verify no backdrop overlay exists (tooltip should be non-blocking)
    const backdrop = document.querySelector('.fixed.inset-0');
    expect(backdrop).not.toBeInTheDocument();
  });
});

