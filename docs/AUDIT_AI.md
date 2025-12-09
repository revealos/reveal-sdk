# Reveal SDK – AI Security Audit Guide

This document is designed for **AI-driven security teams** and automated audit tools. It provides a ready-to-use AI prompt for rapid security audits of the Reveal SDK, along with comprehensive security boundary documentation.

> **Quick Start**: Jump to the [AI Audit Prompt](#ai-audit-prompt) section below to run an immediate security audit.

---

## For AI-Driven Teams

This guide is optimized for:
- **Automated security audits** using AI tools (Claude, GPT-4, etc.)
- **Rapid compliance checks** for risk committees
- **Continuous security monitoring** in CI/CD pipelines
- **AI-assisted code reviews** for security boundaries

The AI prompt below can be copy-pasted directly into your security auditing workflow. It performs a comprehensive check of:
- Network request boundaries
- PII scrubbing implementation
- Audit logging coverage
- XSS prevention in overlay rendering
- Dependency security

**Audit Structure**: The prompt follows a 5-section structure designed for risk committee reporting:
1. Network Surface Area
2. Data Collection & Handling
3. DOM Interaction Surface (Overlay Only)
4. Dependency & Permissions Check
5. Final Audit Verdict (Slide-Ready Summary)

---

## AI Audit Prompt

**Copy this prompt into your AI security auditing tool:**

```
You are an AI security auditor. You are evaluating the Reveal SDK + overlay repository to determine whether it is safe to integrate into your production application.

Your goal: Identify security risks, data collection practices, and potential attack surfaces. Think critically about PROS and CONs from a security perspective.

Audit the following 5 sections, in this exact order and structure:

1. **Network Surface Area**

Identify all outbound network calls and verify invariants.

- List all files containing fetch/HTTP requests.
- List all endpoints called.
- Confirm all outbound calls go through the designated transport module (packages/client/src/modules/transport.ts).
- Verify that decisionClient.ts also uses a controlled fetch path.

PASS / WARN / FAIL with short justification.

2. **Data Collection & Handling**

Identify what data is collected, transformed, and sent.

- List event types and fields sent (product, friction, nudge, session events).
- State whether any automatic PII capture is possible.
- Confirm whether a sanitisation function (scrubPII) is consistently applied.
- Verify PII scrubbing happens at: eventPipeline.enrichEvent() and decisionClient.buildRequestPayload().
- Check what metadata is automatically collected (session ID, user agent, viewport, path).

PASS / WARN / FAIL with justification.

3. **DOM Interaction Surface (Overlay Only)**

Assess how server-sent data interacts with the DOM.

- List components that render server-provided content (OverlayManager, TooltipNudge, etc.).
- Flag any dangerouslySetInnerHTML, HTML injection, eval, or dynamic code execution.
- Verify that WireNudgeDecision contains only plain string fields (title, body, ctaText).
- Confirm React text node rendering (no HTML injection possible).
- Check positioning strategy (quadrant-based or target element attachment).

PASS / WARN / FAIL with justification.

4. **Dependency & Permissions Check**

List dependencies and browser APIs used.

- List all npm dependencies relevant to security (check packages/client/package.json and packages/overlay-react/package.json).
- State whether any dependency includes telemetry or network calls.
- Identify any access to cookies, localStorage, sessionStorage, or sensitive browser APIs.
- Check for any third-party scripts or CDN dependencies.

PASS / WARN / FAIL with justification.

5. **Final Audit Verdict (Slide-Ready Summary)**

Provide a short executive summary suitable for a risk committee slide.

- Overall status: PASS / WARN / FAIL
- Key findings (1–3 bullets)
- Residual risks (if any)
- Recommended mitigations (if any)

Output Format:
- For each section, provide a concise pass/warn/fail verdict with justification
- Include specific file paths and line numbers for any issues
- Be critical and identify both strengths and weaknesses
- Think about real-world attack scenarios and blast radius
```

---

## Security Boundaries Reference

### HTTP/HTTPS Request Boundaries

**The only files that send HTTP/HTTPS requests are:**

1. `packages/client/src/modules/transport.ts`
   - Function: `performFetchRequest()` (line 191)
   - Purpose: Send event batches to `/ingest` endpoint
   - Also uses: `sendWithBeacon()` for page unload (line 331)

2. `packages/client/src/modules/decisionClient.ts`
   - Function: `sendDecisionRequest()` (line 200)
   - Purpose: Request nudge decisions from `/decide` endpoint

**Verification**: Search the codebase for `fetch(`, `XMLHttpRequest`, `axios`, `http.`, `https.` - only these two files should contain network calls.

### PII Scrubbing Boundaries

**PII scrubbing happens at these choke points:**

1. `packages/client/src/modules/eventPipeline.ts` → `enrichEvent()` function (line 131)
   - All event payloads are scrubbed via `scrubPII()` before creating `BaseEvent`
   - Location: After payload transformation, before BaseEvent construction

2. `packages/client/src/modules/decisionClient.ts` → `buildRequestPayload()` function (line 175)
   - Friction signal `extra` metadata is scrubbed via `scrubPII()` before building request
   - Location: When constructing `friction.extra` field

**Implementation**: `packages/client/src/security/dataSanitization.ts` → `scrubPII()` function
- Removes/masks known PII keys (email, phone, password, token, etc.)
- Replaces values with `"[REDACTED]"`
- Case-insensitive matching
- Handles nested objects defensively

### Audit Logging Boundaries

**Audit logging happens at these choke points:**

1. `packages/client/src/modules/transport.ts` → `performFetchRequest()` function (line 191)
   - Logs before sending event batch to `/ingest`
   - Metadata: `batchId`, `eventCount`, `endpoint` (no raw PII)
   - Note: Low-severity audit logs only appear in debug mode (not production console)

2. `packages/client/src/modules/decisionClient.ts` → `sendDecisionRequest()` function (line 200)
   - Logs before sending decision request to `/decide`
   - Metadata: `frictionType`, `endpoint` (no raw PII)

**Implementation**: `packages/client/src/security/auditLogger.ts` → `logAuditEvent()` function
- Forwards to SDK logger (if configured)
- Creates structured audit events with severity levels
- Low-severity events use `logDebug()` (only visible in debug mode)
- No-op if logger not configured (safe for all environments)

### Overlay XSS Prevention

**How overlay data is guaranteed to avoid executing arbitrary code:**

1. **Backend Decision Format**: `WireNudgeDecision` contains only plain string fields:
   - `title?: string`
   - `body?: string`
   - `ctaText?: string`
   - No HTML fields, no executable code fields

2. **React Rendering**: All content rendered as React text nodes:
   - `decision.title` → `<h3>{decision.title}</h3>` (React escapes automatically)
   - `decision.body` → `<p>{decision.body}</p>` (React escapes automatically)
   - `decision.ctaText` → `<button>{decision.ctaText}</button>` (React escapes automatically)

3. **No HTML Injection**: 
   - No `dangerouslySetInnerHTML` used anywhere in overlay package
   - No `innerHTML` manipulation
   - No `eval()` or `Function()` calls
   - No dynamic code execution

4. **Verification**: Search overlay package for:
   - `dangerouslySetInnerHTML` → should return 0 results
   - `innerHTML` → should return 0 results
   - `eval(` → should return 0 results
   - `Function(` → should return 0 results

**Location**: `packages/overlay-react/src/components/OverlayManager.tsx` (see security comment block at top of file)

---

## Dataflow Overview

### What Gets Tracked

The Reveal SDK tracks three types of data:

1. **Explicit Events** - Data explicitly passed by developers via `Reveal.track(eventKind, eventType, properties)`
   - Event payloads are flat objects with primitive values only
   - No automatic data collection
   - All payloads pass through PII scrubbing before transmission

2. **Friction Signals** - Automatically detected user behavior patterns
   - Stall detection (user inactivity)
   - Rage click detection (rapid repeated clicks)
   - Backtrack detection (navigation backward)
   - Contains: `pageUrl`, `selector`, `timestamp`, optional `extra` metadata
   - Does NOT contain: user text, form values, cookies, tokens, DOM content

3. **Session Metadata** - Technical context for events
   - Session ID (generated UUID)
   - Page path, route, screen identifiers
   - User agent string
   - Viewport dimensions
   - Timestamps

### Data Flow Through the SDK

```
User Action / Developer Call
    ↓
Reveal.track() or Friction Detector
    ↓
EventPipeline.enrichEvent()
    ↓
[PII SCRUBBING] ← scrubPII() called here
    ↓
BaseEvent created (with scrubbed payload)
    ↓
EventPipeline buffers events
    ↓
Transport.sendBatch()
    ↓
[AUDIT LOGGING] ← logAuditEvent() called here (debug mode only)
    ↓
HTTPS POST to /ingest endpoint
```

### Decision Request Flow

```
Friction Signal Detected
    ↓
DecisionClient.buildRequestPayload()
    ↓
[PII SCRUBBING] ← scrubPII() called on friction.extra
    ↓
DecisionClient.sendDecisionRequest()
    ↓
[AUDIT LOGGING] ← logAuditEvent() called here (debug mode only)
    ↓
HTTPS POST to /decide endpoint
    ↓
WireNudgeDecision returned (plain text only)
    ↓
OverlayManager renders via React (text nodes, no HTML injection)
```

---

## Notes for Risk / Compliance Committees

### Why the SDK is Safe by Design

1. **Lightweight & Minimal**
   - Zero runtime dependencies
   - ~25KB gzipped bundle size
   - Framework-agnostic core (optional React overlay)

2. **Security-First Architecture**
   - Single transport layer (all network calls auditable)
   - PII scrubbing at defined choke points
   - Audit logging for all outbound requests (debug mode only for low-severity)
   - No automatic data collection (only explicit events)

3. **XSS Prevention**
   - Overlay renders plain text only (no HTML injection)
   - React's automatic escaping
   - No executable code from backend decisions
   - Worst-case scenario: incorrect text display (cannot execute code)

4. **Fail-Open Behavior**
   - SDK errors never break the host application
   - Network failures handled gracefully
   - Missing logger = safe no-op (not a security risk)

### Auditability

- **Single Transport Boundary**: Only 2 files make HTTP requests
- **Single PII Scrubbing Point**: All payloads scrubbed in `eventPipeline.enrichEvent()`
- **Single Audit Logging Point**: All requests logged before network calls
- **Clear Code Comments**: Security boundaries marked with `SECURITY:` comments

### Running the Audit AI Prompt

1. Clone the repository
2. Use your preferred AI security auditing tool (Claude, GPT-4, etc.)
3. Paste the "AI Audit Prompt" section above
4. Review the output for any failures or suspicious patterns
5. All items should pass for a production-ready SDK

### Compliance Considerations

- **GDPR**: PII scrubbing ensures no automatic PII collection
- **SOC2**: Audit logging provides compliance trail (structured, scrubbed metadata)
- **Data Minimization**: Only explicit event payloads sent (no DOM scraping)
- **Transparency**: All network calls go through single auditable layer

---

## Summary

The Reveal SDK is designed with security and auditability as first-class concerns:

- ✅ **Single transport boundary** - Only 2 files make HTTP requests
- ✅ **PII scrubbing implemented** - All payloads scrubbed before transmission
- ✅ **Audit logging implemented** - All requests logged with structured events (low-severity in debug mode only)
- ✅ **XSS prevention** - Overlay renders plain text only, no HTML injection possible
- ✅ **Fail-open behavior** - SDK errors never break host applications

For questions or security concerns, contact: security@revealos.com

