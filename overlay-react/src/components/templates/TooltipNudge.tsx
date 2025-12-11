/**
 * TooltipNudge Component
 * 
 * Renders a tooltip nudge based on a UINudgeDecision.
 * Positions itself in a viewport quadrant (defaults to topCenter).
 * Supports title, body, CTA button, and dismiss functionality.
 */

"use client"

import { useEffect, useState, useRef, type CSSProperties } from "react"
import type { UINudgeDecision, NudgeQuadrant } from "../../types/NudgeDecision"
import { computeQuadrantPosition } from "../../layout/computeQuadrantPosition"
import { useKeyboardDismiss } from "../../hooks/useKeyboardDismiss"
import { Z_INDEX } from "../../utils/constants"


interface TooltipNudgeProps {
  /** The nudge decision containing content and configuration */
  decision: UINudgeDecision
  /** Callback when nudge is dismissed */
  onDismiss: (id: string) => void
  /** Optional callback when CTA button is clicked */
  onActionClick?: (id: string) => void
  /** Optional callback for tracking events (e.g., Reveal.track) */
  onTrack?: (kind: string, name: string, payload?: Record<string, any>) => void
}

/**
 * Determines arrow placement based on quadrant.
 * Upper row → arrow on bottom edge pointing down
 * Lower row → arrow on top edge pointing up
 * Left/middle/right control horizontal alignment
 */
function getArrowPlacement(quadrant: NudgeQuadrant): {
  edge: "top" | "bottom"
  align: "start" | "center" | "end"
  direction: "up" | "down"
} {
  if (quadrant.startsWith("top")) {
    return {
      edge: "bottom",
      align: quadrant === "topLeft" ? "start" : quadrant === "topCenter" ? "center" : "end",
      direction: "down", // Top quadrants: arrow on bottom edge, pointing DOWN
    }
  } else {
    return {
      edge: "top",
      align: quadrant === "bottomLeft" ? "start" : quadrant === "bottomCenter" ? "center" : "end",
      direction: "up", // Bottom quadrants: arrow on top edge, pointing UP
    }
  }
}

/**
 * TooltipNudge
 * 
 * A tooltip that displays nudge content in a viewport quadrant.
 * Defaults to topCenter positioning.
 */
export function TooltipNudge({
  decision,
  onDismiss,
  onActionClick,
  onTrack,
}: TooltipNudgeProps) {
  const quadrant = decision.quadrant ?? "topCenter"
  const [position, setPosition] = useState<{ top: number; left: number } | null>(() => {
    // Set initial position with estimated dimensions
    return computeQuadrantPosition(quadrant, null)
  })
  const [arrowPosition, setArrowPosition] = useState<{ top: number; left: number } | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const arrowWrapperRef = useRef<HTMLDivElement>(null)
  const arrowAnimationRef = useRef<Animation | null>(null)

  // Arrow float animation (WAAPI)
  // - Avoids global CSS/keyframes and reduces interference with host apps.
  // - Respects prefers-reduced-motion.
  useEffect(() => {
    // Only animate when the arrow is actually rendered
    if (!arrowPosition) {
      // If arrow disappears, stop any prior animation
      arrowAnimationRef.current?.cancel()
      arrowAnimationRef.current = null
      return
    }

    if (typeof window === "undefined") {
      return
    }

    const el = arrowWrapperRef.current
    if (!el) {
      return
    }

    // Respect reduced motion
    try {
      if (typeof window.matchMedia === "function") {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        if (reduceMotion) {
          return
        }
      }
    } catch {
      // If matchMedia fails, proceed without reduced-motion optimization
    }

    const animateFn = (el as any).animate
    if (typeof animateFn !== "function") {
      // WAAPI not available (e.g., some test environments)
      return
    }

    // Cancel any previous animation before starting a new one
    arrowAnimationRef.current?.cancel()
    arrowAnimationRef.current = null

    const anim = animateFn.call(
      el,
      [
        { transform: "translateY(0px)" },
        { transform: "translateY(-12px)" },
        { transform: "translateY(0px)" },
      ],
      { duration: 6000, iterations: Infinity, easing: "ease-in-out" }
    )

    arrowAnimationRef.current = anim

    return () => {
      arrowAnimationRef.current?.cancel()
      arrowAnimationRef.current = null
    }
  }, [!!arrowPosition])

  // Handle ESC key dismiss
  useKeyboardDismiss(() => {
    onDismiss(decision.id)
  }, true)

  // Compute and update position based on quadrant
  useEffect(() => {
    // Update position function
    const updatePosition = () => {
      const updatedPosition = computeQuadrantPosition(quadrant, tooltipRef.current)
      setPosition(updatedPosition)

      // Calculate arrow position
      if (tooltipRef.current) {
        const arrowPlacement = getArrowPlacement(quadrant)
        const tooltipHeight = tooltipRef.current.offsetHeight
        const tooltipWidth = tooltipRef.current.offsetWidth
        const ARROW_SPACING = 24
        const ARROW_SIZE = 56 // Arrow bubble size

        let arrowTop = 0
        let arrowLeft = 0

        if (arrowPlacement.edge === "bottom") {
          arrowTop = updatedPosition.top + tooltipHeight + ARROW_SPACING
          // Always center the arrow horizontally, regardless of quadrant alignment
          arrowLeft = updatedPosition.left + tooltipWidth / 2 - ARROW_SIZE / 2
        } else {
          arrowTop = updatedPosition.top - ARROW_SPACING - ARROW_SIZE
          // Always center the arrow horizontally, regardless of quadrant alignment
          arrowLeft = updatedPosition.left + tooltipWidth / 2 - ARROW_SIZE / 2
        }

        setArrowPosition({ top: arrowTop, left: arrowLeft })
      }
    }

    // Use ResizeObserver to recalculate when element dimensions change
    let resizeObserver: ResizeObserver | null = null
    if (tooltipRef.current && typeof window !== 'undefined' && typeof ResizeObserver !== 'undefined') {
      try {
        resizeObserver = new ResizeObserver(() => {
          updatePosition()
        })
        resizeObserver.observe(tooltipRef.current)
      } catch (e) {
        // ResizeObserver not supported, fall back to timeout
      }
    }

    // Recalculate after brief delays to ensure element is rendered with correct dimensions
    const timeoutId1 = setTimeout(updatePosition, 10)
    const timeoutId2 = setTimeout(updatePosition, 50)
    let rafId: number | null = null
    if (typeof requestAnimationFrame !== 'undefined') {
      rafId = requestAnimationFrame(() => {
        if (typeof requestAnimationFrame !== 'undefined') {
          requestAnimationFrame(updatePosition)
        }
      })
    }

    // Update position on window resize
    window.addEventListener("resize", updatePosition)

    return () => {
      clearTimeout(timeoutId1)
      clearTimeout(timeoutId2)
      if (rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
        cancelAnimationFrame(rafId)
      }
      resizeObserver?.disconnect()
      window.removeEventListener("resize", updatePosition)
    }
  }, [quadrant])

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

  // If no position, don't render
  if (!position) {
    return null
  }

  // Get arrow placement
  const arrowPlacement = getArrowPlacement(quadrant)
  const ARROW_SIZE = 56 // Size of the circular arrow chip

  // Inline styles (self-contained: no dependency on host CSS/Tailwind)
  const tooltipStyle: CSSProperties = {
    position: "fixed",
    top: `${position.top}px`,
    left: `${position.left}px`,
    zIndex: Z_INDEX.TOOLTIP,
    pointerEvents: "auto",
    boxSizing: "border-box",
    width: "clamp(238px, 34vw, 408px)", // 85% of original sizing
    background: "hsla(240, 15%, 14%, 0.32)",
    backdropFilter: "blur(6px)",
    WebkitBackdropFilter: "blur(6px)",
    borderRadius: "20px",
    padding: "24px",
    border: "1px solid rgba(255, 255, 255, 0.22)",
    boxShadow:
      "0 0 0 1px rgba(0, 0, 0, 0.30) inset, 0 0 8px rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.40)",
    color: "#ffffff",
    textAlign: "center",
  }

  const titleStyle: CSSProperties = {
    margin: "0 0 12px 0",
    fontSize: "20px",
    fontWeight: 600,
    lineHeight: 1.25,
    color: "#ffffff",
    textShadow: "0 0 6px rgba(255, 255, 255, 0.18)",
  }

  const bodyStyle: CSSProperties = {
    margin: "0 0 12px 0",
    fontSize: "18px",
    fontWeight: 700,
    lineHeight: 1.35,
    color: "rgba(255, 255, 255, 0.92)",
  }

  const ctaButtonStyle: CSSProperties = {
    display: "inline-block",
    margin: "0 0 12px 0",
    padding: 0,
    border: "none",
    background: "transparent",
    fontSize: "16px",
    fontWeight: 500,
    lineHeight: 1.3,
    color: "#ffffff",
    cursor: "pointer",
  }

  const gotItButtonStyle: CSSProperties = {
    display: "inline-block",
    margin: 0,
    padding: 0,
    border: "none",
    background: "transparent",
    fontSize: "16px",
    fontWeight: 500,
    lineHeight: 1.3,
    color: "rgba(255, 255, 255, 0.80)",
    cursor: "pointer",
  }

  return (
    <>
      {/* Arrow bubble - glassmorphic chip with float animation */}
      {arrowPosition && (
        <div
          ref={arrowWrapperRef}
          style={{
            position: "fixed",
            pointerEvents: "none",
            top: `${arrowPosition.top}px`,
            left: `${arrowPosition.left}px`,
            width: `${ARROW_SIZE}px`,
            height: `${ARROW_SIZE}px`,
            zIndex: Z_INDEX.TOOLTIP,
            willChange: "transform",
          }}
          aria-hidden="true"
        >
        <div
          style={{
            width: "100%",
            height: "100%",
            borderRadius: "50%",
            background: "hsla(240, 15%, 14%, 0.32)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
            boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.30) inset, 0 0 8px rgba(255, 255, 255, 0.08), 0 8px 24px rgba(0, 0, 0, 0.40)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 12 12"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {arrowPlacement.direction === "down" ? (
              <path
                d="M6 10L10 5H2L6 10Z"
                fill="rgba(255, 255, 255, 0.92)"
                stroke="rgba(255, 255, 255, 0.5)"
                strokeWidth="0.5"
              />
            ) : (
              <path
                d="M6 2L2 7H10L6 2Z"
                fill="rgba(255, 255, 255, 0.92)"
                stroke="rgba(255, 255, 255, 0.5)"
                strokeWidth="0.5"
              />
            )}
          </svg>
        </div>
      </div>
      )}

      {/* Tooltip - glassmorphic floating panel */}
      <div
        ref={tooltipRef}
        style={tooltipStyle}
        role="tooltip"
        aria-labelledby={hasTitle ? `tooltip-title-${decision.id}` : undefined}
      >

        {/* Title (if present and different from body) */}
        {hasTitle && (
          <h3
            id={`tooltip-title-${decision.id}`}
            style={titleStyle}
          >
            {decision.title}
          </h3>
        )}

        {/* Body/Message */}
        {displayBody && (
          <p style={bodyStyle}>{displayBody}</p>
        )}

        {/* CTA Button (if present) - primary action */}
        {decision.ctaText && (
          <button
            onClick={handleActionClick}
            style={ctaButtonStyle}
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
            style={gotItButtonStyle}
            aria-label="Got it"
          >
            ✔️ Got it
          </button>
        )}
      </div>
    </>
  )
}

