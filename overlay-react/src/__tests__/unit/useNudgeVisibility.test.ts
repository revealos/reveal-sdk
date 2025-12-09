/**
 * useNudgeVisibility Hook Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNudgeVisibility } from '../../hooks/useNudgeVisibility';
import type { NudgeDecision } from '../../types/NudgeDecision';

describe('useNudgeVisibility', () => {
  const createMockDecision = (overrides?: Partial<NudgeDecision>): NudgeDecision => ({
    id: 'test-nudge-1',
    templateId: 'tooltip',
    body: 'Test body',
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isVisible: true initially', () => {
    const decision = createMockDecision();
    const { result } = renderHook(() =>
      useNudgeVisibility({
        decision,
      })
    );

    expect(result.current.isVisible).toBe(true);
  });

  it('returns handleManualDismiss function', () => {
    const decision = createMockDecision();
    const { result } = renderHook(() =>
      useNudgeVisibility({
        decision,
      })
    );

    expect(typeof result.current.handleManualDismiss).toBe('function');
  });

  it('handleManualDismiss sets isVisible to false', () => {
    const decision = createMockDecision();
    const { result } = renderHook(() =>
      useNudgeVisibility({
        decision,
      })
    );

    expect(result.current.isVisible).toBe(true);

    act(() => {
      result.current.handleManualDismiss();
    });

    expect(result.current.isVisible).toBe(false);
  });

  it('handleManualDismiss calls onDismiss with decision.id', () => {
    const decision = createMockDecision();
    const mockOnDismiss = vi.fn();
    const { result } = renderHook(() =>
      useNudgeVisibility({
        decision,
        onDismiss: mockOnDismiss,
      })
    );

    act(() => {
      result.current.handleManualDismiss();
    });

    expect(mockOnDismiss).toHaveBeenCalledWith('test-nudge-1');
    expect(mockOnDismiss).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after autoDismissMs if set', () => {
    const decision = createMockDecision({
      autoDismissMs: 1000,
    });
    const mockOnDismiss = vi.fn();
    const { result } = renderHook(() =>
      useNudgeVisibility({
        decision,
        onDismiss: mockOnDismiss,
      })
    );

    expect(result.current.isVisible).toBe(true);

    // Advance time by 1000ms
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.isVisible).toBe(false);
    expect(mockOnDismiss).toHaveBeenCalledWith('test-nudge-1');
  });

  it('does not auto-dismiss if autoDismissMs is not set', () => {
    const decision = createMockDecision({
      autoDismissMs: undefined,
    });
    const mockOnDismiss = vi.fn();
    const { result } = renderHook(() =>
      useNudgeVisibility({
        decision,
        onDismiss: mockOnDismiss,
      })
    );

    expect(result.current.isVisible).toBe(true);

    // Advance time significantly
    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(result.current.isVisible).toBe(true);
    expect(mockOnDismiss).not.toHaveBeenCalled();
  });

  it('cleans up timeout on unmount', () => {
    const decision = createMockDecision({
      autoDismissMs: 1000,
    });
    const mockOnDismiss = vi.fn();
    const { unmount } = renderHook(() =>
      useNudgeVisibility({
        decision,
        onDismiss: mockOnDismiss,
      })
    );

    // Unmount before timeout
    unmount();

    // Advance time past timeout
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should not have called onDismiss after unmount
    expect(mockOnDismiss).not.toHaveBeenCalled();
  });

  it('resets visibility when decision.id changes', () => {
    const decision1 = createMockDecision({ id: 'nudge-1' });
    const { result, rerender } = renderHook(
      ({ decision }) => useNudgeVisibility({ decision }),
      {
        initialProps: { decision: decision1 },
      }
    );

    // Dismiss first decision
    act(() => {
      result.current.handleManualDismiss();
    });
    expect(result.current.isVisible).toBe(false);

    // Change to new decision
    const decision2 = createMockDecision({ id: 'nudge-2' });
    rerender({ decision: decision2 });

    // Should be visible again for new decision
    expect(result.current.isVisible).toBe(true);
  });

  it('cancels previous timeout when autoDismissMs changes', () => {
    const decision = createMockDecision({
      autoDismissMs: 2000,
    });
    const mockOnDismiss = vi.fn();
    const { rerender, result } = renderHook(
      ({ decision }) => useNudgeVisibility({ decision, onDismiss: mockOnDismiss }),
      {
        initialProps: { decision },
      }
    );

    // Advance time by 1000ms (halfway)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Change autoDismissMs
    const updatedDecision = createMockDecision({
      id: decision.id, // Same ID
      autoDismissMs: 3000,
    });
    rerender({ decision: updatedDecision });

    // Advance another 2000ms (total 3000ms, but new timeout is 3000ms from change)
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should not have dismissed yet (new timeout is 3000ms)
    expect(mockOnDismiss).not.toHaveBeenCalled();
    expect(result.current.isVisible).toBe(true);

    // Advance another 1000ms (total 4000ms, 3000ms since change)
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    // Should have dismissed now
    expect(mockOnDismiss).toHaveBeenCalledWith(decision.id);
    expect(result.current.isVisible).toBe(false);
  });

  it('handles null decision gracefully', () => {
    const { result } = renderHook(() =>
      useNudgeVisibility({
        decision: null,
      })
    );

    // Should return isVisible: false for null decision
    expect(result.current.isVisible).toBe(false);
    expect(typeof result.current.handleManualDismiss).toBe('function');

    // handleManualDismiss should not crash with null decision
    act(() => {
      result.current.handleManualDismiss();
    });

    expect(result.current.isVisible).toBe(false);
  });

  it('transitions from null to decision correctly', () => {
    const { result, rerender } = renderHook(
      ({ decision }) => useNudgeVisibility({ decision }),
      {
        initialProps: { decision: null },
      }
    );

    expect(result.current.isVisible).toBe(false);

    // Change to valid decision
    const decision = createMockDecision();
    rerender({ decision });

    // Should be visible for new decision
    expect(result.current.isVisible).toBe(true);
  });
});

