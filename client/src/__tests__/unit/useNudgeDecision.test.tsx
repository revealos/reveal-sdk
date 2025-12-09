/**
 * Unit Tests - useNudgeDecision Hook
 * 
 * Tests for the useNudgeDecision React hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useNudgeDecision } from '../../hooks/useNudgeDecision';
import * as entryPoint from '../../core/entryPoint';
import * as uiDecision from '../../types/uiDecision';

// Mock entryPoint
vi.mock('../../core/entryPoint', () => ({
  onNudgeDecision: vi.fn(),
  track: vi.fn(),
}));

// Mock uiDecision (mapWireToUI)
vi.mock('../../types/uiDecision', () => ({
  mapWireToUI: vi.fn((wire) => ({
    id: wire.nudgeId,
    templateId: wire.templateId,
    title: wire.title,
    body: wire.body,
    ctaText: wire.ctaText,
    targetId: wire.slotId ?? null,
    dismissible: true,
    autoDismissMs: null,
    extra: wire.extra,
  })),
}));

describe('useNudgeDecision', () => {
  let mockUnsubscribe: () => void;
  let mockHandler: (decision: any) => void;

  beforeEach(() => {
    mockUnsubscribe = vi.fn();
    mockHandler = vi.fn();

    // Setup onNudgeDecision mock to capture handler and return unsubscribe
    vi.mocked(entryPoint.onNudgeDecision).mockImplementation((handler) => {
      mockHandler = handler as any;
      return mockUnsubscribe;
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should subscribe to onNudgeDecision on mount', () => {
    renderHook(() => useNudgeDecision());

    expect(entryPoint.onNudgeDecision).toHaveBeenCalledTimes(1);
    expect(typeof mockHandler).toBe('function');
  });

  it('should unsubscribe on unmount', () => {
    const { unmount } = renderHook(() => useNudgeDecision());

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('should return null decision initially', () => {
    const { result } = renderHook(() => useNudgeDecision());

    expect(result.current.decision).toBeNull();
    expect(result.current.handlers).toBeDefined();
    expect(typeof result.current.handlers.onDismiss).toBe('function');
    expect(typeof result.current.handlers.onActionClick).toBe('function');
    expect(typeof result.current.handlers.onTrack).toBe('function');
  });

  it('should convert wire decision to UI decision when decision received', async () => {
    const { result } = renderHook(() => useNudgeDecision());

    const wireDecision = {
      nudgeId: 'test-nudge-001',
      templateId: 'tooltip' as const,
      title: 'Test Title',
      body: 'Test Body',
      slotId: 'test-target',
    };

    // Simulate decision received
    mockHandler(wireDecision);

    await waitFor(() => {
      expect(result.current.decision).not.toBeNull();
    });

    expect(uiDecision.mapWireToUI).toHaveBeenCalledWith(wireDecision);
    expect(result.current.decision).toEqual({
      id: 'test-nudge-001',
      templateId: 'tooltip',
      title: 'Test Title',
      body: 'Test Body',
      targetId: 'test-target',
      dismissible: true,
      autoDismissMs: null,
    });
  });

  it('should handle onDismiss handler', () => {
    const { result } = renderHook(() => useNudgeDecision());

    // Set a decision first
    const wireDecision = {
      nudgeId: 'test-nudge-001',
      templateId: 'tooltip' as const,
    };
    mockHandler(wireDecision);

    // Call dismiss handler
    result.current.handlers.onDismiss('test-nudge-001');

    expect(entryPoint.track).toHaveBeenCalledWith('nudge', 'nudge_dismissed', {
      nudgeId: 'test-nudge-001',
    });
  });

  it('should handle onActionClick handler', () => {
    const { result } = renderHook(() => useNudgeDecision());

    // Set a decision first
    const wireDecision = {
      nudgeId: 'test-nudge-001',
      templateId: 'tooltip' as const,
    };
    mockHandler(wireDecision);

    // Call action click handler
    result.current.handlers.onActionClick('test-nudge-001');

    expect(entryPoint.track).toHaveBeenCalledWith('nudge', 'nudge_clicked', {
      nudgeId: 'test-nudge-001',
    });
  });

  it('should handle onTrack handler', () => {
    const { result } = renderHook(() => useNudgeDecision());

    result.current.handlers.onTrack('product', 'button_clicked', {
      buttonId: 'signup',
    });

    expect(entryPoint.track).toHaveBeenCalledWith('product', 'button_clicked', {
      buttonId: 'signup',
    });
  });

  it('should clear decision when onDismiss is called', async () => {
    const { result } = renderHook(() => useNudgeDecision());

    // Set a decision first
    const wireDecision = {
      nudgeId: 'test-nudge-001',
      templateId: 'tooltip' as const,
    };
    mockHandler(wireDecision);

    await waitFor(() => {
      expect(result.current.decision).not.toBeNull();
    });

    // Call dismiss handler
    result.current.handlers.onDismiss('test-nudge-001');

    await waitFor(() => {
      expect(result.current.decision).toBeNull();
    });
  });

  it('should clear decision when onActionClick is called', async () => {
    const { result } = renderHook(() => useNudgeDecision());

    // Set a decision first
    const wireDecision = {
      nudgeId: 'test-nudge-001',
      templateId: 'tooltip' as const,
    };
    mockHandler(wireDecision);

    await waitFor(() => {
      expect(result.current.decision).not.toBeNull();
    });

    // Call action click handler
    result.current.handlers.onActionClick('test-nudge-001');

    await waitFor(() => {
      expect(result.current.decision).toBeNull();
    });
  });

  it('should handle multiple decisions correctly', async () => {
    const { result } = renderHook(() => useNudgeDecision());

    // First decision
    const wireDecision1 = {
      nudgeId: 'test-nudge-001',
      templateId: 'tooltip' as const,
      title: 'First Decision',
    };
    mockHandler(wireDecision1);

    await waitFor(() => {
      expect(result.current.decision?.id).toBe('test-nudge-001');
    });

    // Second decision
    const wireDecision2 = {
      nudgeId: 'test-nudge-002',
      templateId: 'tooltip' as const,
      title: 'Second Decision',
    };
    mockHandler(wireDecision2);

    await waitFor(() => {
      expect(result.current.decision?.id).toBe('test-nudge-002');
    });
  });

  it('should auto-dismiss nudge on navigation (pathname change)', async () => {
    // Mock window.location using Object.defineProperty to properly override read-only property
    const originalLocation = window.location;
    let currentPathname = '/initial-page';

    Object.defineProperty(window, 'location', {
      writable: true,
      value: {
        ...originalLocation,
        get pathname() {
          return currentPathname;
        },
      },
    });

    const { result } = renderHook(() => useNudgeDecision());

    // Set a decision
    const wireDecision = {
      nudgeId: 'test-nudge-001',
      templateId: 'tooltip' as const,
    };
    mockHandler(wireDecision);

    await waitFor(() => {
      expect(result.current.decision).not.toBeNull();
    });

    // Simulate navigation by changing pathname
    currentPathname = '/new-page';

    // Trigger popstate event to simulate navigation
    window.dispatchEvent(new PopStateEvent('popstate'));

    // Wait for navigation detection (polling happens every 100ms)
    await waitFor(
      () => {
        expect(result.current.decision).toBeNull();
        expect(entryPoint.track).toHaveBeenCalledWith('nudge', 'nudge_dismissed', {
          nudgeId: 'test-nudge-001',
          reason: 'navigation',
        });
      },
      { timeout: 200 }
    );

    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    });
  });
});

