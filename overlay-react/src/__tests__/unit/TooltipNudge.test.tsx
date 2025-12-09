/**
 * TooltipNudge Component Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TooltipNudge } from '../../components/templates/TooltipNudge';
import type { UINudgeDecision } from '../../types/NudgeDecision';

// Mock the hooks
// Note: useTrackNudgeShown is no longer used in TooltipNudge
// It's handled by RevealNudgeHost instead

vi.mock('../../hooks/useKeyboardDismiss', () => ({
  useKeyboardDismiss: vi.fn(),
}));

describe('TooltipNudge', () => {
  const mockOnDismiss = vi.fn();
  const mockOnActionClick = vi.fn();
  const mockOnTrack = vi.fn();

  beforeEach(() => {
    // Create a target element in the DOM
    const targetElement = document.createElement('div');
    targetElement.id = 'test-target';
    targetElement.textContent = 'Target Element';
    // Set position and size so getBoundingClientRect works
    targetElement.style.position = 'absolute';
    targetElement.style.top = '100px';
    targetElement.style.left = '200px';
    targetElement.style.width = '100px';
    targetElement.style.height = '50px';
    document.body.appendChild(targetElement);

    // Mock window.scrollY and scrollX for consistent positioning
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
    Object.defineProperty(window, 'scrollX', { value: 0, writable: true });

    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up DOM
    const target = document.getElementById('test-target');
    if (target) {
      document.body.removeChild(target);
    }
  });

  const createMockDecision = (overrides?: Partial<UINudgeDecision>): UINudgeDecision => ({
    id: 'test-nudge-1',
    templateId: 'tooltip',
    body: 'Test body text',
    ...overrides,
  });

  it('renders with UINudgeDecision containing body', async () => {
    const decision = createMockDecision({ 
      body: 'Test body',
      targetId: 'test-target',
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
      targetId: 'test-target',
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
      targetId: 'test-target',
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
      targetId: 'test-target',
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
      targetId: 'test-target',
    });
    
    render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Wait for tooltip to render, then click "Got it"
    await waitFor(() => {
      const gotItButton = screen.getByText('Got it');
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

    expect(screen.queryByText('Got it')).not.toBeInTheDocument();
  });

  it('handles missing targetId gracefully', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decision = createMockDecision({
      body: 'Test body',
      targetId: null,
    });
    
    const { container } = render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Should not crash, but may not render tooltip without target
    expect(container.firstChild).toBeNull();
    
    consoleSpy.mockRestore();
  });

  it('handles target element not found (warns, does not crash)', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const decision = createMockDecision({
      body: 'Test body',
      targetId: 'non-existent-target',
    });
    
    const { container } = render(
      <TooltipNudge
        decision={decision}
        onDismiss={mockOnDismiss}
      />
    );

    // Should warn but not crash
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[TooltipNudge] Target element not found')
    );
    
    // Should not render tooltip
    expect(container.firstChild).toBeNull();
    
    consoleSpy.mockRestore();
  });

  it('renders tooltip with onTrack callback available', async () => {
    // Note: useTrackNudgeShown is no longer called in TooltipNudge
    // Tracking is handled by RevealNudgeHost instead
    const decision = createMockDecision({ 
      body: 'Test body',
      targetId: 'test-target',
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
    // Tracking is handled by RevealNudgeHost, not TooltipNudge
    expect(screen.getByText('Test body')).toBeInTheDocument();
  });

  it('uses body as fallback when title is not provided', async () => {
    const decision = createMockDecision({
      body: 'Test body only',
      title: undefined,
      targetId: 'test-target',
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
      targetId: 'test-target',
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

