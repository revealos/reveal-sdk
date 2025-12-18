# SDK Architecture

## Overview

The Reveal SDK is a lightweight, framework-agnostic library that detects user friction and displays nudges based on backend decisions.

**Key Architecture Principle:** The SDK is a **headless sensor layer** by default. It detects friction, tracks events, and receives decisions, but does **not** render UI. The optional `@reveal/overlay-react` package provides React components for rendering nudges.

## Module Structure

### Core
- **EntryPoint**: Main orchestration layer - wires together all modules and provides public API

### Modules
- **ConfigClient**: Fetches client-safe configuration from backend `/config` endpoint during SDK initialization. Falls back to minimalConfig if fetch fails.
- **SessionManager**: Manages session lifecycle and context
- **EventPipeline**: Buffers and sends events to backend
- **Transport**: HTTP transport layer for event batches
- **DecisionClient**: Requests nudge decisions from backend
- **DetectorManager**: Orchestrates friction detection

### Detectors
- **StallDetector**: Detects user hesitation/idle behavior
- **RageClickDetector**: Detects rapid repeated clicks
- **BacktrackDetector**: Detects backward navigation

### Security
- Input validation and sanitization
- Data minimization and PII scrubbing
- Audit logging

### Utilities
- Logger, safe wrappers, UUID generation, location helpers

## Runtime Flow

Here's how the SDK works at runtime:

```
1. App Startup
   └─> Reveal.init(clientKey, options?)
       ├─> Initialize Logger
       ├─> Resolve config endpoint (configEndpoint → apiBase/config → default)
       ├─> Fetch config from backend (ConfigClient)
       │   └─> If fetch succeeds: use backend config
       │   └─> If fetch fails: fall back to minimalConfig from options
       ├─> Resolve relative decision endpoints (if any) using apiBase
       ├─> Validate all backend URLs (HTTPS, localhost exception)
       ├─> Initialize SessionManager (creates session)
       ├─> Initialize Transport (HTTP client)
       ├─> Initialize EventPipeline (event buffering)
       ├─> Initialize DecisionClient (decision requests, uses resolved endpoint)
       └─> Initialize DetectorManager (friction detection)
           └─> Start detectors (StallDetector, RageClickDetector, BacktrackDetector)

2. User Interaction
   └─> DetectorManager detects friction
       └─> Emits FrictionSignal
           ├─> EventPipeline.captureEvent('friction', ..., flushImmediately=true)
           │   └─> Immediately flushes friction event to preserve causality
           │       └─> Events sorted during flush: friction events always precede nudge events
           └─> DecisionClient.requestDecision(signal)
               └─> Backend checks eligibility (cooldowns, caps) using recent nudge_shown events
               └─> Backend returns WireNudgeDecision (or null if not eligible)
                   └─> EntryPoint.notifyNudgeSubscribers(decision)
                       └─> Host app receives decision via:
                           ├─> Reveal.onNudgeDecision(callback) [framework-agnostic]
                           └─> useNudgeDecision() hook [React only]
                               └─> OverlayManager renders nudge [optional React UI]

3. Event Tracking
   └─> Reveal.track(eventKind, eventType, properties?)
       └─> EventPipeline.captureEvent(...)
           └─> Buffers event, sends to backend via Transport

4. App Shutdown
   └─> Reveal.destroy()
       ├─> DetectorManager.destroy() (removes listeners)
       ├─> EventPipeline.destroy() (flushes remaining events)
       └─> SessionManager.endSession()
```

## Design Principles

1. **Client is sensors, not brain** - SDK detects and reports, backend decides
2. **Backend is source of truth** - All decisions come from backend
3. **Strict contracts** - Well-defined interfaces between SDK and backend
4. **Separation of concerns** - Each module has a single responsibility
5. **Safety & resilience** - SDK never crashes host app, fails gracefully
6. **Performance** - Minimal bundle size, lazy loading, efficient event batching

## SDK vs Overlay UI

**SDK (`@reveal/client`):**
- Framework-agnostic
- Headless (no UI rendering)
- Detects friction
- Tracks events
- Receives decisions
- Provides subscription API

**Overlay UI (`@reveal/overlay-react`):**
- React-only
- Optional UI layer
- Renders nudge templates
- Consumes decisions from SDK
- Provides `OverlayManager` component
- Provides `useNudgeDecision` hook (re-exported from SDK)

**Integration Pattern:**
```typescript
// SDK (always needed)
import { Reveal } from '@reveal/client';
await Reveal.init('client-key');

// Overlay UI (optional, React only)
import { useNudgeDecision } from '@reveal/client'; // or '@reveal/overlay-react'
import { OverlayManager } from '@reveal/overlay-react';
```
