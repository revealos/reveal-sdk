# Overlay Positioning Strategy

This document explains how Reveal overlays are positioned in the viewport.

---

## Quadrant-Based Positioning

Reveal overlays use a **quadrant-based positioning strategy** to ensure nudges appear in optimal locations without blocking critical UI elements.

### Quadrant Options

Overlays can be positioned in one of four viewport quadrants:

- **`top-left`** - Top-left corner of the viewport
- **`top-right`** - Top-right corner of the viewport
- **`bottom-left`** - Bottom-left corner of the viewport
- **`bottom-right`** - Bottom-right corner of the viewport
- **`auto`** - SDK automatically selects the quadrant with the most available space

### How Quadrants Are Determined

**Backend-Specified (Recommended):**
- Backend can explicitly specify a quadrant in the `WireNudgeDecision`:
  ```typescript
  {
    nudgeId: "nudge_123",
    templateId: "tooltip",
    title: "Try this feature",
    quadrant: "top-right"  // Explicit quadrant preference
  }
  ```

**Auto-Detection (Fallback):**
- When `quadrant` is `"auto"` or not provided, the SDK automatically:
  1. Calculates available space in each quadrant
  2. Considers viewport boundaries and other UI elements
  3. Selects the quadrant with the most available space
  4. Falls back to `top-right` if no clear winner

### Benefits of Quadrant-Based Positioning

1. **Prevents UI Blocking**: Overlays won't cover critical UI elements (buttons, forms, navigation)
2. **Consistent Placement**: Users can predict where nudges will appear
3. **Flexible**: Backend can control placement or let SDK optimize
4. **Viewport-Aware**: Automatically adapts to different screen sizes and orientations

### Migration from Target Element Positioning

**Previous Approach (Deprecated):**
- Overlays attached to specific DOM elements via `targetId`
- Positioned relative to target element (e.g., above, below, centered)
- Required target elements to exist in DOM

**New Approach (Current):**
- Overlays positioned in viewport quadrants
- No dependency on specific DOM elements
- More flexible and predictable placement

---

## Template-Specific Positioning

Different templates may use quadrants differently:

### Tooltip
- Positions in specified quadrant
- Can still reference a target element for context (if `targetId` provided)
- Arrow/connector may point to target element if available

### Banner
- Typically uses `top-left` or `top-right` quadrants
- Full-width banners may span across top or bottom of viewport

### Modal
- Centers in viewport (not quadrant-based)
- Uses overlay/backdrop pattern

### Spotlight
- Highlights target element with overlay
- Uses quadrant for positioning callout/annotation

### Inline Hint
- Positions inline with content (not quadrant-based)
- Uses document flow positioning

---

## Implementation Details

**Position Calculation:**
- Pure function: `computeQuadrantPosition(quadrant, viewport, overlaySize)`
- Returns `{ top: number, left: number }` coordinates
- Accounts for viewport boundaries, padding, and safe zones

**Responsive Behavior:**
- Automatically adjusts on viewport resize
- Recalculates position on scroll (if target element provided)
- Handles mobile/desktop viewport differences

**No-Go Zones:**
- Future enhancement: Define areas where overlays should never appear
- Examples: Navigation bars, critical action buttons, form inputs

---

## Configuration

Quadrant preference can be set:

1. **Backend Decision** (Primary): `WireNudgeDecision.quadrant`
2. **SDK Config** (Fallback): `Reveal.init({ defaultQuadrant: 'top-right' })`
3. **Auto-Detection** (Default): SDK selects best quadrant automatically

---

## Examples

**Backend specifies quadrant:**
```json
{
  "nudgeId": "nudge_123",
  "templateId": "tooltip",
  "title": "New feature available",
  "body": "Check out our latest update",
  "quadrant": "top-right"
}
```

**Auto-detection (no quadrant specified):**
```json
{
  "nudgeId": "nudge_456",
  "templateId": "banner",
  "title": "Welcome back!",
  "body": "Here's what's new"
  // quadrant not specified → SDK auto-detects
}
```

---

For technical implementation details, see:
- `packages/overlay-react/src/layout/computeQuadrantPosition.ts` (when implemented)
- `packages/overlay-react/src/components/OverlayManager.tsx`

