/**
 * TooltipNudge Component
 * 
 * Renders a tooltip nudge based on a UINudgeDecision.
 * Positions itself above a target element (identified by targetId).
 * Supports title, body, CTA button, and dismiss functionality.
 */

"use client"

import { useEffect, useState, useRef } from "react"
import type { UINudgeDecision } from "../../types/NudgeDecision"
import { computeTooltipPosition } from "../../layout/computeTooltipPosition"
import { useKeyboardDismiss } from "../../hooks/useKeyboardDismiss"

interface TooltipNudgeProps {
  /** The nudge decision containing content and configuration */
  decision: UINudgeDecision
  /** Optional target rect (if provided, will use this instead of computing from targetId) */
  targetRect?: DOMRect | null
  /** Callback when nudge is dismissed */
  onDismiss: (id: string) => void
  /** Optional callback when CTA button is clicked */
  onActionClick?: (id: string) => void
  /** Optional callback for tracking events (e.g., Reveal.track) */
  onTrack?: (kind: string, name: string, payload?: Record<string, any>) => void
}

/**
 * TooltipNudge
 * 
 * A tooltip that attaches to a target element and displays nudge content.
 * Positions itself above the target element by default.
 */
export function TooltipNudge({
  decision,
  targetRect: providedTargetRect,
  onDismiss,
  onActionClick,
  onTrack,
}: TooltipNudgeProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  // Handle ESC key dismiss
  useKeyboardDismiss(() => {
    onDismiss(decision.id)
  }, true)

  // Compute and update position
  useEffect(() => {
    // Find target element by ID
    const targetId = decision.targetId
    if (!targetId) {
      setPosition(null)
      return
    }

    // Remove # prefix if present
    const id = targetId.startsWith("#") ? targetId.slice(1) : targetId
    const targetElement = document.getElementById(id)

    if (!targetElement) {
      console.warn(`[TooltipNudge] Target element not found: ${targetId}`)
      setPosition(null)
      return
    }

    // Compute position using utility function
    const newPosition = computeTooltipPosition(
      targetElement,
      tooltipRef.current
    )

    setPosition(newPosition)

    // Update position on scroll/resize (since computeTooltipPosition is pure)
    const updatePosition = () => {
      const updatedPosition = computeTooltipPosition(
        targetElement,
        tooltipRef.current
      )
      setPosition(updatedPosition)
    }

    window.addEventListener("scroll", updatePosition, true)
    window.addEventListener("resize", updatePosition)

    return () => {
      window.removeEventListener("scroll", updatePosition, true)
      window.removeEventListener("resize", updatePosition)
    }
  }, [decision.targetId])

  // If no position, don't render
  if (!position) {
    return null
  }

  // Determine content to display
  const displayBody = decision.body || decision.title || ""
  const hasTitle = decision.title && decision.title !== decision.body

  // Handle dismiss
  const handleDismiss = () => {
    onDismiss(decision.id)
  }

  // Handle action click
  const handleActionClick = () => {
    if (onActionClick) {
      onActionClick(decision.id)
    }
  }

  return (
    <>
      {/* Tooltip - non-blocking, no backdrop overlay */}
      <div
        ref={tooltipRef}
        className="fixed z-50 max-w-xs bg-popover border border-border rounded-lg shadow-lg p-3 pointer-events-auto"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          transform: "translate(-50%, -100%)", // Center horizontally, position above
        }}
        role="tooltip"
        aria-labelledby={hasTitle ? `tooltip-title-${decision.id}` : undefined}
      >
        {/* Arrow pointing down to target */}
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-popover"
          style={{ borderTopColor: "var(--border)" }}
        />

        {/* Title (if present and different from body) */}
        {hasTitle && (
          <h3
            id={`tooltip-title-${decision.id}`}
            className="text-sm font-semibold text-popover-foreground mb-2"
          >
            {decision.title}
          </h3>
        )}

        {/* Body/Message */}
        {displayBody && (
          <p className="text-sm text-popover-foreground mb-2">{displayBody}</p>
        )}

        {/* CTA Button (if present) - primary action */}
        {decision.ctaText && (
          <button
            onClick={handleActionClick}
            className="text-xs font-medium text-primary hover:text-primary/80 underline mb-2"
            aria-label={decision.ctaText}
          >
            {decision.ctaText}
          </button>
        )}

        {/* Got it button (only if dismissible AND no CTA) */}
        {/* If CTA exists, user can dismiss via ESC */}
        {/* If no CTA, show subtle "Got it" option */}
        {decision.dismissible !== false && !decision.ctaText && (
          <button
            onClick={handleDismiss}
            className="text-xs text-muted-foreground hover:text-foreground underline"
            aria-label="Got it"
          >
            Got it
          </button>
        )}
      </div>
    </>
  )
}

