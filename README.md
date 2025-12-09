# Reveal SDK

[![CI](https://github.com/revealos/reveal-sdk/workflows/CI/badge.svg)](https://github.com/revealos/reveal-sdk/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
<!-- npm badge will be added when package is published -->

A lightweight, framework-agnostic SDK that detects user friction and displays contextual nudges to guide users toward value.

## Features

- 🔍 **Friction Detection** - Automatically detects user hesitation, rage clicks, and backtracking
- 🎯 **Contextual Nudges** - Receives and displays targeted nudges from backend decisions
- 📊 **Event Tracking** - Tracks product events, friction signals, and user interactions
- 🔒 **Security-First** - Built with SOC2 compliance and data privacy in mind
- 📦 **Lightweight** - Minimal bundle size with zero dependencies
- 🎨 **Framework Agnostic** - Works with React, Vue, Angular, or vanilla JavaScript

## Installation

```bash
npm install @reveal/client
# or
pnpm add @reveal/client
# or
yarn add @reveal/client
```

## Quick Start

### 1. Initialize the SDK

```typescript
import { Reveal } from '@reveal/client';

// Initialize once at app startup
await Reveal.init('your-client-key', {
  apiBase: 'https://api.revealos.com', // Optional: only if self-hosting
  debug: false, // Optional: enable debug logging
});
```

**Note:** Most apps only need `clientKey`. The `apiBase` option is only needed if you're self-hosting the backend or using a non-default API URL.

### 2. Track Events

```typescript
// Track product events
Reveal.track('product', 'button_clicked', {
  buttonId: 'signup',
  page: '/onboarding',
});
```

### 3. Handle Nudge Decisions

Choose one of two paths based on your framework:

#### Path A: React Apps (Recommended)

If you're using React, use the `useNudgeDecision` hook for the simplest integration:

```typescript
import { useNudgeDecision } from '@reveal/client';
import { RevealNudgeHost } from '@reveal/overlay-react';

function App() {
  const { decision, handlers } = useNudgeDecision();
  
  return (
    <>
      {/* Your app content */}
      <RevealNudgeHost 
        decision={decision} 
        {...handlers} 
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

#### Path B: Framework-Agnostic (Vanilla JS, Vue, Angular, etc.)

If you're not using React, subscribe to decisions manually:

```typescript
import { Reveal } from '@reveal/client';

// Subscribe to nudge decisions
const unsubscribe = Reveal.onNudgeDecision((decision) => {
  // decision is a WireNudgeDecision from the backend
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

## API Reference

### `Reveal.init(clientKey, options?)`

Initialize the Reveal SDK. **Call this once at app startup.**

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

// Full control (rarely needed)
await Reveal.init('proj_abc123', {
  apiBase: 'https://api.revealos.com',
  ingestEndpoint: 'https://api.revealos.com/ingest',
  decisionEndpoint: 'https://api.revealos.com/decide',
  decisionTimeoutMs: 200,
  debug: false,
  environment: 'production',
});
```

### `Reveal.track(eventKind, eventType, properties?)`

Track an event.

**Parameters:**
- `eventKind` (`'product'` | `'friction'` | `'nudge'` | `'session'`) - Event category
- `eventType` (string) - Specific event type identifier
- `properties` (`EventPayload`, optional) - Event properties (flat object with primitive values, must be JSON-serializable)

**Event Payload Constraints:**
- Flat object structure (no nested objects or arrays)
- Values must be primitives: `string | number | boolean | null`
- Must be JSON-serializable
- Recommended max size: 10KB

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

**Invalid Payload Examples:**

```typescript
// ❌ Nested objects not allowed
Reveal.track('product', 'event', {
  user: { id: '123', name: 'John' } // Invalid
});

// ❌ Arrays not allowed
Reveal.track('product', 'event', {
  items: ['item1', 'item2'] // Invalid
});

// ❌ Functions not allowed
Reveal.track('product', 'event', {
  callback: () => {} // Invalid
});
```

### `Reveal.onNudgeDecision(handler)`

Subscribe to nudge decisions from the backend. **Use this for framework-agnostic apps** (vanilla JS, Vue, Angular, etc.).

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

**Note:** If you're using React, prefer `useNudgeDecision()` hook instead (see below).

### `useNudgeDecision()` (React Hook)

**Recommended for React apps.** React hook that subscribes to nudge decisions and provides UI-ready decision state with tracking handlers. Reduces integration boilerplate from 30+ lines to 3 lines.

**Requirements:** 
- React >= 18.0.0 (peer dependency)
- `@reveal/overlay-react` package (for `RevealNudgeHost` component)

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
import { RevealNudgeHost } from '@reveal/overlay-react';

function App() {
  const { decision, handlers } = useNudgeDecision();
  
  return (
    <>
      {/* Your app content */}
      <RevealNudgeHost 
        decision={decision} 
        onDismiss={handlers.onDismiss}
        onActionClick={handlers.onActionClick}
        onTrack={handlers.onTrack}
      />
    </>
  );
}
```

**Why use this over `Reveal.onNudgeDecision`?**
- Less boilerplate (3 lines vs 30+)
- Automatic type conversion (wire → UI format)
- Built-in tracking handlers
- React lifecycle management
- Type-safe with TypeScript

## Nudge Terminology

Understanding the naming conventions helps when working with nudges:

- **Nudge** - A contextual message/UI element shown to guide users (tooltip, modal, banner, etc.)
- **WireNudgeDecision** - Raw decision format from backend (canonical wire protocol between SDK and backend)
- **UINudgeDecision** - UI-ready decision format (mapped from wire format, includes computed fields like `severity`)
- **NudgeDecision** - Type alias for `UINudgeDecision` (the UI-facing type you'll use)
- **Template** - Pre-built nudge UI component (tooltip, modal, banner, spotlight, inline_hint)
- **TemplateId** - Identifier for template type: `"tooltip"` | `"modal"` | `"banner"` | `"spotlight"` | `"inline_hint"`
- **RevealNudgeHost** - React component that renders the appropriate template based on decision
- **useNudgeDecision** - React hook that manages nudge subscription and provides UI-ready state

**Flow:**
1. Backend sends `WireNudgeDecision` → SDK receives it
2. SDK converts to `UINudgeDecision` (via `mapWireToUI`) → UI-ready format
3. `RevealNudgeHost` renders appropriate template → User sees nudge

## Type Exports

The SDK exports the following types for use in host applications:

- `WireNudgeDecision` - Wire-level decision format (from backend, canonical protocol)
- `UINudgeDecision` - UI-facing decision format (for React components, includes computed fields)
- `NudgeDecision` - Type alias for `UINudgeDecision` (the UI-facing type)
- `NudgeTemplateId` - Template identifier union type: `"tooltip" | "modal" | "banner" | "spotlight" | "inline_hint"`
- `NudgeSeverity` - Severity level union type
- `mapWireToUI()` - Function to convert `WireNudgeDecision` to `UINudgeDecision`

**Example:**
```typescript
import { mapWireToUI, type UINudgeDecision } from '@reveal/client';

Reveal.onNudgeDecision((wireDecision) => {
  const uiDecision = mapWireToUI(wireDecision);
  // Use uiDecision with your UI components
});
```

The SDK also exports other types:

```typescript
import type {
  EventKind,
  EventPayload,
  FrictionSignal,
  WireNudgeDecision,
  UINudgeDecision,
  NudgeDecision,
} from '@reveal/client';
```

See [`docs/API.md`](./docs/API.md) for complete API documentation.

## Security & Compliance

### SOC2 Compliance

The Reveal SDK is designed with SOC2 compliance requirements in mind:

- **Data Privacy** - PII minimization and scrubbing
- **Access Controls** - Client keys identify projects only (no write access)
- **Audit Logging** - Structured logging for compliance requirements
- **Transport Security** - HTTPS enforced, SSL validation enabled
- **Secure Defaults** - Safe configuration defaults prevent misconfiguration

See [`docs/SECURITY.md`](./docs/SECURITY.md) and [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) for detailed information.

### Reporting Security Issues

If you discover a security vulnerability, please report it to: **security@revealos.com**

We aim to respond within 48 hours and provide regular updates on the status of the issue.

## Architecture

The SDK follows a "client as sensors, backend as brain" architecture:

- **Client** - Detects friction, tracks events, displays nudges
- **Backend** - Makes decisions, analyzes patterns, determines nudge content
- **Strict Contracts** - Well-defined interfaces between client and backend

See [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) for detailed architecture documentation.

## Current Status

This SDK is in **active development**. Current capabilities:

- ✅ Core API (`init`, `track`, `onNudgeDecision`)
- ✅ TypeScript types and definitions
- ✅ Security module structure
- ✅ Friction detection framework
- 🚧 Security features (PII scrubbing, audit logging) - *in progress*
- 🚧 Full test coverage - *in progress*
- 🚧 Production-ready error handling - *in progress*

See [`CHANGELOG.md`](./CHANGELOG.md) for version history and planned features.

## Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Performance

- **Bundle Size**: < 50KB (gzipped)
- **Zero Dependencies**: No external runtime dependencies
- **Lazy Loading**: Detectors and modules load on demand

## Development

```bash
# Install dependencies
npm install
# or
pnpm install

# Build
npm run build
# or
pnpm build

# Run tests
npm test
# or
pnpm test

# Run tests in watch mode
npm run test:watch
# or
pnpm test:watch
```

## Documentation

- [`docs/API.md`](./docs/API.md) - Complete API reference
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - Architecture overview
- [`docs/SECURITY.md`](./docs/SECURITY.md) - Security considerations
- [`docs/COMPLIANCE.md`](./docs/COMPLIANCE.md) - SOC2 compliance notes

## License

MIT License - see [LICENSE](./LICENSE) file for details.

## Support

- **Documentation**: [docs/](./docs/)
- **Issues**: [GitHub Issues](https://github.com/revealos/reveal-sdk/issues)
- **Security**: security@revealos.com

---

Built with ❤️ by the Reveal team

