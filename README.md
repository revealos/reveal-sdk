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
npm install @reveal/sdk
# or
pnpm add @reveal/sdk
# or
yarn add @reveal/sdk
```

## Quick Start

```typescript
import { Reveal } from '@reveal/sdk';

// Initialize the SDK
await Reveal.init('your-client-key', {
  apiBase: 'https://api.revealos.com',
  debug: false,
});

// Track a product event
Reveal.track('product', 'button_clicked', {
  buttonId: 'signup',
  page: '/onboarding',
});

// Subscribe to nudge decisions
Reveal.onNudgeDecision((decision) => {
  // Render the nudge in your UI
  console.log('Nudge received:', decision);
});

// Or use the React hook for simplified integration (React apps only)
import { useNudgeDecision } from '@reveal/sdk';
import { RevealNudgeHost } from '@reveal/overlay-ui';

function App() {
  const { decision, handlers } = useNudgeDecision();
  return <RevealNudgeHost decision={decision} {...handlers} />;
}
```

## API Reference

### `Reveal.init(clientKey, options?)`

Initialize the Reveal SDK.

**Parameters:**
- `clientKey` (string) - Your Reveal client key (identifies your project)
- `options` (object, optional):
  - `apiBase` (string) - Backend API base URL
  - `debug` (boolean) - Enable debug logging (default: `false`)
  - `environment` (string) - Environment: `'production'` | `'staging'` | `'development'`

**Example:**
```typescript
await Reveal.init('proj_abc123', {
  apiBase: 'https://api.revealos.com',
  debug: process.env.NODE_ENV === 'development',
});
```

### `Reveal.track(eventKind, eventType, properties?)`

Track an event.

**Parameters:**
- `eventKind` (`'product'` | `'friction'` | `'nudge'` | `'session'`) - Event category
- `eventType` (string) - Specific event type identifier
- `properties` (object, optional) - Event properties (must be JSON-serializable)

**Example:**
```typescript
Reveal.track('product', 'checkout_started', {
  cartValue: 99.99,
  itemCount: 3,
});
```

### `Reveal.onNudgeDecision(handler)`

Subscribe to nudge decisions from the backend.

**Parameters:**
- `handler` (function) - Callback that receives `NudgeDecision` objects

**Returns:** Unsubscribe function

**Example:**
```typescript
const unsubscribe = Reveal.onNudgeDecision((decision) => {
  if (decision.templateId === 'tooltip') {
    showTooltip(decision);
  }
});

// Later, to unsubscribe:
unsubscribe();
```

### `useNudgeDecision()` (React Hook)

React hook that subscribes to nudge decisions and provides UI-ready decision state with tracking handlers. Reduces integration boilerplate from 30+ lines to 3 lines.

**Requirements:** React >= 18.0.0 (peer dependency)

**Returns:** Object with:
- `decision` (`UINudgeDecision | null`) - Current nudge decision in UI format
- `handlers` - Object containing:
  - `onDismiss` - Handler for nudge dismissal
  - `onActionClick` - Handler for nudge action/CTA clicks
  - `onTrack` - Handler for tracking events

**Note:** The hook automatically converts `WireNudgeDecision` to `UINudgeDecision` using `mapWireToUI` (exported from SDK).

**Example:**
```typescript
import { useNudgeDecision } from '@reveal/sdk';
import { RevealNudgeHost } from '@reveal/overlay-ui';

function App() {
  const { decision, handlers } = useNudgeDecision();
  
  return (
    <>
      {children}
      <RevealNudgeHost decision={decision} {...handlers} />
    </>
  );
}
```

**Note:** This hook automatically:
- Subscribes to `Reveal.onNudgeDecision` on mount
- Converts `WireNudgeDecision` to `UINudgeDecision` using `mapWireToUI`
- Unsubscribes on unmount
- Provides tracking handlers that call `Reveal.track` internally

## Type Exports

The SDK exports the following types for use in host applications:

- `WireNudgeDecision` - Wire-level decision format (from backend)
- `UINudgeDecision` - UI-facing decision format (for React components)
- `NudgeDecision` - Alias for `UINudgeDecision` (UI-facing)
- `NudgeTemplateId` - Template identifier union type
- `NudgeSeverity` - Severity level union type
- `mapWireToUI()` - Function to convert `WireNudgeDecision` to `UINudgeDecision`

**Example:**
```typescript
import { mapWireToUI, type UINudgeDecision } from '@reveal/sdk';

Reveal.onNudgeDecision((wireDecision) => {
  const uiDecision = mapWireToUI(wireDecision);
  // Use uiDecision with your UI components
});
```

The SDK also exports other types:

```typescript
import type {
  EventKind,
  FrictionSignal,
  WireNudgeDecision,
  UINudgeDecision,
  NudgeDecision,
} from '@reveal/sdk';
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

