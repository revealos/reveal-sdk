# @reveal/overlay-react

React-based nudges library for rendering nudges in React applications.

## Overview

This package provides React components for rendering nudges based on decisions from the Reveal SDK. It is a **React-only library** - no DOM helper APIs are provided.

## Installation

```bash
pnpm add @reveal/overlay-react
```

## Usage

```tsx
import { RevealNudgeHost } from '@reveal/overlay-react';
import { mapWireToUI } from '@reveal/overlay-react';

// In your component
function App() {
  const [nudgeDecision, setNudgeDecision] = useState(null);

  // Subscribe to SDK nudge decisions
  useEffect(() => {
    const unsubscribe = Reveal.onNudgeDecision((wireDecision) => {
      const uiDecision = mapWireToUI(wireDecision);
      setNudgeDecision(uiDecision);
    });

    return unsubscribe;
  }, []);

  return (
    <RevealNudgeHost
      decision={nudgeDecision}
      onDismiss={(id) => {
        Reveal.track('nudge', 'nudge_dismissed', { nudgeId: id });
        setNudgeDecision(null);
      }}
      onActionClick={(id) => {
        Reveal.track('nudge', 'nudge_clicked', { nudgeId: id });
        setNudgeDecision(null);
      }}
    />
  );
}
```

## Components

- **RevealNudgeHost** - Main host component that renders the appropriate nudge template
- **Templates** - SpotlightNudge, BannerNudge, TooltipNudge, InlineHint, ModalNudge
- **Primitives** - Overlay, NudgeCard, NudgeCTAButton, ElementGlow

## Types

- `WireNudgeDecision` - Wire-level decision from SDK/backend
- `UINudgeDecision` - UI-facing decision (mapped from wire)
- `NudgeDecision` - Alias for UINudgeDecision
- `mapWireToUI()` - Function to map wire decision to UI decision

**Note:** `mapWireToUI` and `UINudgeDecision` are also available from `@reveal/client` for use in React hooks. Overlay-react keeps its own copy to maintain independence, but both implementations are identical.

## Development

```bash
# Build
pnpm build

# Test
pnpm test
```

