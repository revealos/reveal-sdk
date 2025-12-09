# Reveal SDK – Data Flow Overview

This document explains **exactly what the Reveal SDK sends**, **when it sends it**, and **how data moves through the system**. It is designed for engineering, security, and risk-review teams.

---

## High-Level Architecture

**Client (SDK) → Backend (Ingest + Decision Engine) → Client (Overlay UI)**

The SDK has two responsibilities:

1. **Capture user interaction signals** (explicit events + friction events)
2. **Request contextual nudge decisions** from the backend

The Overlay has one responsibility:

- **Render plain-text nudges** chosen by the backend, with no executable code.

---

## Data Flow Diagram

```mermaid
flowchart TD
    A[User Browser] 
    --> B[Reveal SDK]
    B -->|Event Payload (JSON)| C[Transport Layer (Single File)]
    C -->|HTTPS POST /ingest| D[Reveal Backend - Ingest Service]
    D --> E[Event Processor]
    E --> F[(Decision Engine)]
    F -->|Nudge Decision (JSON)| G[Overlay Manager]
    G --> H[Rendered Nudge UI]
```

---

## What the SDK Collects

### 1. Explicit Events

Sent when developers call `Reveal.track(eventKind, eventType, payload)`.

**Payload rules:**
- Flat JSON (no nested objects)
- Primitive values only (`string`, `number`, `boolean`, `null`)
- No automatic PII collection
- Known PII keys (`email`, `phone`, `password`, `token`, etc.) are redacted by default

**Event Kinds:**
- `product` - Product events (user actions, feature usage)
- `friction` - Friction signals (auto-detected or manual)
- `nudge` - Nudge interaction events (shown, clicked, dismissed)
- `session` - Session lifecycle events (start, end)

### 2. Friction Signals (Auto-Generated)

Automatically detected friction patterns:

- **Stall events** - No user interaction for X seconds (default: 20 seconds)
- **Rage clicks** - Multiple rapid clicks on the same element (planned)
- **Backtracking** - Returning to previous step or view (planned)

**Contains:**
- `timestamp` - When the friction was detected
- `pageUrl` - Current page URL
- `selector` - CSS selector of the element (if applicable)
- `type` - Friction type: `"stall" | "rageclick" | "backtrack"`
- `extra` - Additional metadata (optional)

**Does NOT contain:**
- User text input
- Form values
- Cookies
- Tokens
- DOM content
- Screenshots

---

## What Leaves the Browser

Outbound data is strictly limited to:

```typescript
{
  projectId: string,
  sessionId: string,
  event: {
    kind: "product" | "friction" | "nudge" | "session",
    name: string,
    event_source: "sdk" | "detector" | "overlay",
    session_id: string,
    is_treatment: boolean | null,
    timestamp: number,
    path: string | null,
    route: string | null,
    screen: string | null,
    user_agent: string,
    viewport_width: number,
    viewport_height: number,
    payload: Record<string, string | number | boolean | null>
  }
}
```

**All outbound calls go through:**
- `packages/client/src/modules/transport.ts`

This is the **single auditable file** for all network requests. No other file in the SDK may call `fetch`, `XMLHttpRequest`, or any network API.

---

## Backend Processing

1. **Ingest** receives the event and attaches session context
2. **Decision Engine** checks user state + friction level
3. If needed, it returns a plain JSON nudge decision containing:
   - `nudgeId` - Unique identifier
   - `templateId` - Template type: `"tooltip" | "modal" | "banner" | "spotlight" | "inline_hint"`
   - `title` - Message title (plain text)
   - `body` - Message body (plain text)
   - `ctaText` - Call-to-action label (optional, plain text)
   - `quadrant` - Positioning quadrant: `"top-left" | "top-right" | "bottom-left" | "bottom-right" | "auto"` (optional, replaces target element positioning)
   - `frictionType` - Type of friction that triggered this (optional)
   - `expiresAt` - ISO timestamp when decision expires (optional)
   - `extra` - Additional metadata (optional, flat JSON only)

**No HTML. No executable code.**

---

## What Returns to the Browser

The Overlay receives a strict JSON object:

```typescript
{
  nudgeId: string,
  templateId: "tooltip" | "modal" | "banner" | "spotlight" | "inline_hint",
  title?: string,
  body?: string,
  ctaText?: string,
  quadrant?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "auto",
  frictionType?: "stall" | "rageclick" | "backtrack",
  expiresAt?: string,
  extra?: Record<string, string | number | boolean | null>
}
```

**Rendered via React using plain props** — no HTML injection, no `dangerouslySetInnerHTML`, no dynamic code execution.

---

## Summary of Guarantees

✅ **No automatic PII collection** - Only data explicitly passed to `Reveal.track()` is sent

✅ **No DOM scraping** - The SDK does not read or transmit DOM content, form values, or page HTML

✅ **No HTML or JS returned from the backend** - All nudge content is plain text in JSON

✅ **All network interactions flow through one auditable file** - `packages/client/src/modules/transport.ts`

✅ **All decisions rendered via safe React components** - No HTML injection, no code execution

✅ **Structured JSON only** - Both inbound and outbound data follows strict schemas

✅ **Single transport layer** - All network calls (ingest and decision requests) go through the same transport module

