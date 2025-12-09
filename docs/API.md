# Public API Documentation

## Reveal.init()

Initialize the Reveal SDK. **Call this once at app startup.**

```typescript
Reveal.init(clientKey: string, options?: InitOptions): Promise<void>
```

**Parameters:**
- `clientKey` (string, **required**) - Your Reveal client key (identifies your project)
- `options` (object, optional) - Configuration options

**Init Options:**

| Option | Type | Default | Who Sets It? | Description |
|--------|------|---------|--------------|-------------|
| `clientKey` | `string` | - | **You (required)** | Your project's client key from Reveal dashboard |
| `apiBase` | `string` | `"https://api.reveal.io"` | You (if self-hosting) | Backend API base URL. Only needed if self-hosting or using non-default URL |
| `ingestEndpoint` | `string` | `"{apiBase}/ingest"` | You (if custom) | Explicit event ingestion endpoint. Overrides `apiBase` |
| `decisionEndpoint` | `string` | `"{apiBase}/decide"` | You (if custom) | Explicit decision endpoint. Overrides `apiBase` |
| `decisionTimeoutMs` | `number` | `200` | You (if custom) | Timeout for decision requests in milliseconds |
| `debug` | `boolean` | `false` | You (dev only) | Enable debug logging. Set to `true` in development |
| `environment` | `string` | `"development"` | You | Environment: `"production"` \| `"staging"` \| `"development"` |

**Note:** The backend **decides** which nudges to show, but the SDK still needs to know **where** to send events and requests. In production apps, you typically only set `clientKey` (and optionally `apiBase` if self-hosting). The harness app sets all options because it mocks backend endpoints for local testing.

**Examples:**

```typescript
// Minimal setup (most common)
await Reveal.init('proj_abc123');

// With custom API base (self-hosting)
await Reveal.init('proj_abc123', {
  apiBase: 'https://your-api.example.com',
});

// Development setup with debug logging
await Reveal.init('proj_abc123', {
  debug: process.env.NODE_ENV === 'development',
  environment: 'development',
});
```

## Reveal.track()

Track an event.

```typescript
Reveal.track(
  eventKind: EventKind,
  eventType: string,
  properties?: EventPayload
): void
```

**Examples:**

```typescript
// Product event with payload
Reveal.track('product', 'checkout_started', {
  cartValue: 99.99,
  itemCount: 3,
  currency: 'USD',
  hasDiscount: true,
});

// Friction event with payload
Reveal.track('friction', 'stall_detected', {
  stallDurationMs: 20000,
  pageUrl: '/checkout',
  selector: '#submit-button',
});

// Nudge event with payload
Reveal.track('nudge', 'nudge_clicked', {
  nudgeId: 'nudge_123',
  templateId: 'tooltip',
  action: 'cta_clicked',
});

// Event without payload
Reveal.track('product', 'page_viewed');
```

## Handling Nudge Decisions

There are two paths for handling nudge decisions, depending on your framework:

### Path A: React Apps (Recommended)

Use the `useNudgeDecision` hook for the simplest integration:

```typescript
import { useNudgeDecision } from '@reveal/client';
import { OverlayManager } from '@reveal/overlay-react';

function App() {
  const { decision, handlers } = useNudgeDecision();
  
  return (
    <>
      {/* Your app content */}
      <OverlayManager 
        decision={decision} 
        onDismiss={handlers.onDismiss}
        onActionClick={handlers.onActionClick}
        onTrack={handlers.onTrack}
      />
    </>
  );
}
```

**Why this path?** The hook automatically:
- Subscribes to nudge decisions
- Converts wire format to UI format
- Provides tracking handlers
- Handles cleanup on unmount

### Path B: Framework-Agnostic

Use `Reveal.onNudgeDecision` for vanilla JS, Vue, Angular, or custom implementations:

```typescript
import { Reveal } from '@reveal/client';

const unsubscribe = Reveal.onNudgeDecision((decision) => {
  // decision is a WireNudgeDecision from backend
  // Render the nudge using your UI framework
  renderNudge(decision);
});

// Later, to unsubscribe:
unsubscribe();
```

**Note:** In this path, you're responsible for:
- Converting `WireNudgeDecision` to your UI format (if needed)
- Rendering the nudge in your UI
- Tracking nudge interactions
- Managing subscription lifecycle

## Reveal.onNudgeDecision()

Subscribe to nudge decisions from the backend. **Use this for framework-agnostic apps** (vanilla JS, Vue, Angular, etc.).

```typescript
Reveal.onNudgeDecision(
  handler: (decision: WireNudgeDecision) => void
): () => void
```

**Parameters:**
- `handler` (function) - Callback that receives `WireNudgeDecision` objects

**Returns:** Unsubscribe function

**When to use:**
- Vanilla JavaScript apps
- Vue, Angular, or other non-React frameworks
- Custom UI implementations
- When you need full control over nudge rendering

**Example:**
```typescript
const unsubscribe = Reveal.onNudgeDecision((decision) => {
  // decision is a WireNudgeDecision from backend
  if (decision.templateId === 'tooltip') {
    showTooltip(decision);
  } else if (decision.templateId === 'modal') {
    showModal(decision);
  }
});

// Later, to unsubscribe:
unsubscribe();
```

**Note:** If you're using React, prefer `useNudgeDecision()` hook instead.

## useNudgeDecision() (React Hook)

**Recommended for React apps.** React hook that subscribes to nudge decisions and provides UI-ready decision state with tracking handlers.

**Requirements:** 
- React >= 18.0.0 (peer dependency)
- `@reveal/overlay-react` package (for `OverlayManager` component)

**Returns:** Object with:
- `decision` (`UINudgeDecision | null`) - Current nudge decision in UI format (automatically converted from wire format)
- `handlers` - Object containing:
  - `onDismiss` - Handler for nudge dismissal (automatically tracks `nudge_dismissed` event)
  - `onActionClick` - Handler for nudge action/CTA clicks (automatically tracks `nudge_clicked` event)
  - `onTrack` - Handler for tracking custom events

**What it does automatically:**
- ✅ Subscribes to `Reveal.onNudgeDecision` on mount
- ✅ Converts `WireNudgeDecision` to `UINudgeDecision` using `mapWireToUI`
- ✅ Unsubscribes on unmount
- ✅ Provides tracking handlers that call `Reveal.track` internally

**Example:**
```typescript
import { useNudgeDecision } from '@reveal/client';
import { OverlayManager } from '@reveal/overlay-react';

function App() {
  const { decision, handlers } = useNudgeDecision();
  
  return (
    <>
      {/* Your app content */}
      <OverlayManager 
        decision={decision} 
        {...handlers} 
      />
    </>
  );
}
```

## Types

### Core Types

- **EventKind**: `"product" | "friction" | "nudge" | "session"`
- **EventPayload**: `Record<string, any>` - Event-specific properties (flat object with primitive values)
- **FrictionSignal**: Friction detection signal emitted by detectors

### Nudge Terminology

Understanding the naming conventions helps when working with nudges:

- **Nudge** - A contextual message/UI element shown to guide users (tooltip, modal, banner, etc.)
- **WireNudgeDecision** - Raw decision format from backend (canonical wire protocol between SDK and backend)
- **UINudgeDecision** - UI-ready decision format (mapped from wire format, includes computed fields like `severity`)
- **NudgeDecision** - Type alias for `UINudgeDecision` (the UI-facing type you'll use)
- **Template** - Pre-built nudge UI component (tooltip, modal, banner, spotlight, inline_hint)
- **TemplateId** - Identifier for template type: `"tooltip" | "modal" | "banner" | "spotlight" | "inline_hint"`
- **OverlayManager** - React component that renders the appropriate template based on decision
- **useNudgeDecision** - React hook that manages nudge subscription and provides UI-ready state
- **Quadrant Positioning** - Overlay positioning strategy using viewport quadrants (top-left, top-right, bottom-left, bottom-right)
  - Replaces target element attachment approach for better flexibility
  - Backend can specify quadrant preference or SDK can auto-detect best quadrant based on available space
  - Prevents overlays from blocking critical UI elements

**Flow:**
1. Backend sends `WireNudgeDecision` → SDK receives it
2. SDK converts to `UINudgeDecision` (via `mapWireToUI`) → UI-ready format
3. `OverlayManager` renders appropriate template → User sees nudge

### Nudge Types

- **WireNudgeDecision** - Wire-level decision format (from backend, canonical protocol)
- **UINudgeDecision** - UI-facing decision format (for React components, includes computed fields)
- **NudgeDecision** - Type alias for `UINudgeDecision` (the UI-facing type)
- **NudgeTemplateId** - Template identifier union type: `"tooltip" | "modal" | "banner" | "spotlight" | "inline_hint"`
- **NudgeSeverity** - Severity level union type
- **mapWireToUI()** - Function to convert `WireNudgeDecision` to `UINudgeDecision`

### EventPayload

Event payload type for event-specific properties.

**Type Definition:**
```typescript
type EventPayload = Record<string, any>;
```

**Constraints:**
- Flat object structure (no nested objects or arrays)
- Values must be primitives: `string | number | boolean | null`
- Must be JSON-serializable
- Recommended max size: 10KB

**Valid Examples:**

```typescript
// Product event payload
Reveal.track('product', 'checkout_started', {
  cartValue: 99.99,
  itemCount: 3,
  currency: 'USD',
  hasDiscount: true,
  userId: 'user_123',
  timestamp: null, // null values are allowed
});

// Friction event payload
Reveal.track('friction', 'stall_detected', {
  stallDurationMs: 20000,
  pageUrl: '/checkout',
  selector: '#submit-button',
  context: 'checkout_form',
});

// Nudge event payload
Reveal.track('nudge', 'nudge_clicked', {
  nudgeId: 'nudge_123',
  templateId: 'tooltip',
  action: 'cta_clicked',
  frictionType: 'stall',
});
```

**Invalid Examples:**

```typescript
// ❌ Nested objects not allowed
Reveal.track('product', 'event', {
  user: { id: '123', name: 'John' } // Invalid: nested object
});

// ❌ Arrays not allowed
Reveal.track('product', 'event', {
  items: ['item1', 'item2'] // Invalid: array value
});

// ❌ Functions not allowed
Reveal.track('product', 'event', {
  callback: () => {} // Invalid: function value
});

// ❌ Dates must be converted to strings or numbers
Reveal.track('product', 'event', {
  createdAt: new Date() // Invalid: Date object
  // ✅ Valid: createdAt: Date.now() or createdAt: new Date().toISOString()
});
```

See `src/types/` for complete type definitions.

