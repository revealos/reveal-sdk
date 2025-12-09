# Reveal Client SDK

[![CI](https://github.com/revealos/reveal-sdk/workflows/CI/badge.svg)](https://github.com/revealos/reveal-sdk/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
<!-- npm badge will be added when package is published -->
A lightweight, security-first SDK for detecting user friction and displaying contextual nudges in web applications.

## Core Concepts

### Lightweight & High-Performance

- **Minimal footprint**: Zero runtime dependencies, ~25KB gzipped
- **No heavy dependencies**: Framework-agnostic core, optional React overlay
- **Fast initialization**: Initializes in under 50ms
- **Efficient event batching**: Automatic batching and debouncing of events

### Security-First Architecture

- **No PII captured automatically**: Only explicit event payloads are sent
- **Single audited transport**: All outbound network calls flow through a single, auditable transport module
- **Structured JSON only**: No HTML injection, no dynamic code execution
- **Passive rendering**: Overlay renders text-only content from backend decisions

### Contextual Activation Nudges

- **Friction detection**: Automatically detects user hesitation (stall), rapid clicks (rage click), and backward navigation (backtrack)
- **Decision API**: Backend determines when and which nudges to show
- **Safe overlay rendering**: Templates render decisions through auditable, text-only components

## Quick Start

### 1. Install

```bash
npm install @reveal/client @reveal/overlay-react
```

### 2. Initialize

Create a `RevealContextProvider` component to handle SDK initialization and overlay rendering:

```tsx
// components/RevealContextProvider.tsx (or app/reveal-context-provider.tsx)
'use client';

import React, { useEffect } from 'react';
import { Reveal, useNudgeDecision } from '@reveal/client';
import { OverlayManager } from '@reveal/overlay-react';

export function RevealContextProvider({ children }: { children: React.ReactNode }) {
  const { decision, handlers } = useNudgeDecision();
  
  useEffect(() => {
    (async () => {
      await Reveal.init('your-client-key');
    })();
  }, []);
  
  return (
    <>
      {children}
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

Then wrap your app with the provider:

**Next.js (App Router):**
```tsx
// app/layout.tsx
import { RevealContextProvider } from './reveal-context-provider';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <RevealContextProvider>{children}</RevealContextProvider>
      </body>
    </html>
  );
}
```

**Next.js (Pages Router):**
```tsx
// pages/_app.tsx
import { RevealContextProvider } from '../components/RevealContextProvider';

export default function App({ Component, pageProps }) {
  return (
    <RevealContextProvider>
      <Component {...pageProps} />
    </RevealContextProvider>
  );
}
```

**React (Create React App):**
```tsx
// src/index.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { RevealContextProvider } from './components/RevealContextProvider';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <RevealContextProvider>
    <App />
  </RevealContextProvider>
);
```

### 3. Track Events & Display Nudges

Track product events:

```tsx
import { Reveal } from '@reveal/client';

// Track user actions
Reveal.track('product', 'button_clicked', {
  buttonId: 'signup',
  page: '/onboarding',
});
```

The `OverlayManager` component automatically displays contextual nudges when the backend decides to show them. No additional setup required.

For complete event type documentation, see [docs/EVENTS.md](./docs/EVENTS.md).

## Security Guarantees

- **Structured payloads only**: Only explicitly defined event payloads are sent. No automatic data collection.
- **No DOM scraping**: The SDK does not read or transmit DOM content, form values, or page HTML.
- **No storage access**: The SDK does not access cookies, localStorage, sessionStorage, or any browser storage APIs.
- **Single transport module**: All network calls flow through a single, auditable transport module (`packages/client/src/modules/transport.ts`).
- **Text-only rendering**: The overlay renders text content only. No HTML injection, no JavaScript execution, no dynamic code evaluation.
- **No automatic PII capture**: PII cannot be captured automatically. Only data explicitly passed to `Reveal.track()` is sent.

## Architecture

The SDK operates in three layers:

1. **Detection Layer**: Passive observers detect friction patterns (stall, rage click, backtrack)
2. **Decision Layer**: Backend API determines when and which nudges to show
3. **Rendering Layer**: OverlayManager renders backend decisions through safe, auditable templates

All layers are designed to fail gracefully and never break the host application.

## Documentation

- **Dataflow & Architecture** → [docs/DATAFLOW.md](./docs/DATAFLOW.md)
- **SDK API Reference** → [docs/API.md](./docs/API.md)
- **Event Types** → [docs/EVENTS.md](./docs/EVENTS.md)
- **Security** → [docs/SECURITY.md](./docs/SECURITY.md)
- **Overlay Positioning** → [docs/OVERLAY_POSITIONING.md](./docs/OVERLAY_POSITIONING.md)
- **Audit Prompts** → [docs/AUDIT_AI.md](./docs/AUDIT_AI.md)
- **Integration Prompts** → [docs/INTEGRATION_AI.md](./docs/INTEGRATION_AI.md)

## License

MIT
