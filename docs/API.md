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
| `apiBase` | `string` | `"https://api.revealos.com"` | You (if self-hosting) | Backend API base URL. Used to construct config, ingest, and decision endpoints. Only needed if self-hosting or using non-default URL |
| `configEndpoint` | `string` | `"{apiBase}/config"` | You (if custom) | Explicit config endpoint. Overrides `apiBase` for config fetch. SDK fetches client-safe configuration from this endpoint during initialization |
| `ingestEndpoint` | `string` | `"{apiBase}/ingest"` | You (if custom) | Explicit event ingestion endpoint. Overrides `apiBase` |
| `decisionEndpoint` | `string` | `"{apiBase}/decide"` | You (if custom) | Explicit decision endpoint. Overrides `apiBase`. **Note:** If backend config returns a relative path (e.g., `/decide`), SDK automatically resolves it using `apiBase` |
| `decisionTimeoutMs` | `number` | `400` (production), `2000` (development) | You (if custom) | Timeout for decision requests in milliseconds. Defaults are environment-aware: 400ms for production (realistic for network + backend processing), 2000ms for development (allows for CORS preflight + logging overhead) |
| `debug` | `boolean` | `false` | You (dev only) | Enable debug logging. Set to `true` in development |
| `environment` | `string` | `"development"` | You | Environment: `"production"` \| `"staging"` \| `"development"`. Used as query param when fetching config |

**Security Note:** All backend URLs (`configEndpoint`, `ingestEndpoint`, `decisionEndpoint`, `apiBase`) must use HTTPS protocol. The SDK will disable itself at initialization if any non-HTTPS URL is detected. Exception: `http://localhost` and `http://127.0.0.1` are allowed for local development only.

**Config Fetch Behavior:** During initialization, the SDK attempts to fetch configuration from the backend `/config` endpoint. If the fetch succeeds, the SDK uses the backend config (including `decision.endpoint` which may be a relative path like `/decide`). If the fetch fails, the SDK gracefully falls back to a minimalConfig constructed from initialization options, ensuring backward compatibility. Relative decision endpoints from backend config are automatically resolved to full URLs using `apiBase` before validation.

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

**Note:** Events are automatically transformed from SDK internal format (`BaseEvent`) to backend format (`EventModelContract.Event`) before sending to the `/ingest` endpoint. This transformation includes:
- Field name mapping (`kind` → `event_kind`, `name` → `event_type`)
- Timestamp conversion (number → ISO 8601 string)
- Addition of required fields (`event_id`, `anonymous_id`, `sdk_version`)
- Page context extraction (`page_url`, `page_title`, `referrer`)
- Friction event special handling (extracts `selector`, `page_url`, `friction_type` from payload)

The SDK API (`Reveal.track()`) remains unchanged - transformation is handled internally.

**Examples:**

```typescript
// Product event with payload and semantic IDs
Reveal.track('product', 'checkout_started', {
  action_id: 'checkout_started',
  flow_id: 'purchase',
  step: 1,
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
- **Quadrant Positioning** - Overlay positioning strategy using 6 viewport quadrants (topLeft, topCenter, topRight, bottomLeft, bottomCenter, bottomRight)
  - Replaces target element attachment approach for better flexibility
  - Backend can specify quadrant preference via `WireNudgeDecision.quadrant` field
  - Defaults to `"topCenter"` if not specified
  - Prevents overlays from blocking critical UI elements
- **selectorPattern** - CSS selector for spotlight template target element
  - Backend config uses `selector_pattern` (snake_case) in template config
  - Wire protocol uses `selectorPattern` (camelCase) in `WireNudgeDecision` and `UINudgeDecision`
  - Spotlight template uses this selector to query DOM for target element to highlight
  - If selector not found, spotlight dismisses with reason `"target_not_found"`
  - Quadrant templates (tooltip, inline_hint) do not use selectorPattern for positioning

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

**Semantic IDs (Recommended for Product Events):**

For product events, we recommend including semantic identifiers to enable better analytics and targeting:

- `action_id` or `feature_id` (string, required) - Stable identifier for the action or feature (e.g., `"create_project_click"`, `"signup_button_click"`)
- `flow_id` (string, optional) - Identifier for the user flow or journey (e.g., `"onboarding"`, `"checkout"`, `"purchase"`)
- `step` (string | number, optional) - Step number or identifier within a flow (e.g., `1`, `"step_2"`, `"payment"`)
- `success` (boolean, required for submits/checkout/completion events) - Whether the action succeeded or failed

**Valid Examples:**

```typescript
// Product event payload with semantic IDs
Reveal.track('product', 'checkout_started', {
  action_id: 'checkout_started',
  flow_id: 'purchase',
  step: 1,
  cartValue: 99.99,
  itemCount: 3,
  currency: 'USD',
  hasDiscount: true,
  userId: 'user_123',
  timestamp: null, // null values are allowed
});

// Form submission with success indicator
Reveal.track('product', 'form_submitted', {
  action_id: 'signup_form_submit',
  flow_id: 'onboarding',
  step: 2,
  success: true,
  formId: 'signup',
});

// Product event without semantic IDs (still valid)
Reveal.track('product', 'checkout_started', {
  cartValue: 99.99,
  itemCount: 3,
  currency: 'USD',
  hasDiscount: true,
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
