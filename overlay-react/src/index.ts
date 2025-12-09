// packages/overlay-react/src/index.ts

/**
 * Reveal Nudge UI - React-based nudges library
 * 
 * This package provides React components for rendering nudges in React applications.
 * It is a React-only library - no DOM helper APIs are provided.
 */

// Main host component
export { RevealNudgeHost } from "./components/RevealNudgeHost";
export type { RevealNudgeHostProps } from "./components/RevealNudgeHost";

// Template components (optional - RevealNudgeHost handles routing internally)
// export { SpotlightNudge } from "./components/templates/SpotlightNudge";
// export { BannerNudge } from "./components/templates/BannerNudge";
export { TooltipNudge } from "./components/templates/TooltipNudge";
// export { InlineHint } from "./components/templates/InlineHint";
// export { ModalNudge } from "./components/templates/ModalNudge";

// Types
export type {
  WireNudgeDecision,
  UINudgeDecision,
  NudgeDecision,
  NudgeTemplateId,
  NudgeSeverity,
} from "./types/NudgeDecision";

export { mapWireToUI } from "./types/NudgeDecision";
