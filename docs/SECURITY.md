# Reveal SDK – Security Model

This document outlines the Reveal SDK's security posture, threat model, and the invariants enforced across the codebase.

## Reporting Security Issues

**If you discover a security vulnerability, please report it to: security@revealos.com**

We take security seriously and will:
- Respond within 48 hours
- Provide regular updates on the status of the issue
- Work with you to coordinate disclosure

**Please do not** open public GitHub issues for security vulnerabilities.

---

## Threat Model (SDK Perspective)

### Assets We Protect

- **End-user data** (sessions, events, interactions)
- **The host application's integrity**
- **Backend decision payloads** (must not execute code)
- **The client browser environment**

### Attack Surfaces

1. **Outbound network calls**
   - **Mitigated by:** Single transport layer + strict schemas
   - **Location:** `packages/client/src/modules/transport.ts`

2. **Inbound decision payloads**
   - **Mitigated by:** Strict JSON parsing + no HTML execution
   - **Location:** `packages/client/src/modules/decisionClient.ts`

3. **Event capture pipeline**
   - **Mitigated by:** No DOM scraping, no reading form values
   - **Location:** `packages/client/src/modules/eventPipeline.ts`

4. **Third-party dependencies**
   - **Mitigated by:** Minimal dependencies + version pinning
   - **Location:** `packages/client/package.json`

---

## Hard Invariants (Code-Level Guarantees)

These are the rules the SDK **MUST** follow. These invariants are enforced at the code level and cannot be bypassed.

### 1. All network requests go through a single file

**Location:** `packages/client/src/modules/transport.ts`

No other file may call `fetch`, `XMLHttpRequest`, or any network API. This ensures:
- All outbound data can be audited in one place
- Network security policies are consistently applied
- Transport layer can be easily reviewed by security teams

### 2. No automatic PII collection

The SDK never reads:
- Cookies
- `localStorage` / `sessionStorage`
- Input values
- DOM text content
- Form field values

PII-like keys in event payloads are sanitized or redacted before transmission.

Additionally, the SDK performs **URL PII scrubbing** for **known URL fields** before sending data:
- Redacts **obvious email addresses embedded in URL strings** (e.g. `?email=user@example.com`)
- Also redacts percent-encoded forms (e.g. `user%40example.com`)
- Uses the same redaction marker: `"[REDACTED]"`

### 3. No HTML or JS execution from the backend

**Enforced by:**
- No use of `dangerouslySetInnerHTML`
- No `eval`, `Function()`, or dynamic code loaders
- Overlay components render plain text only

**Location:** `packages/overlay-react/src/components/OverlayManager.tsx`

All nudge content from the backend is rendered as plain text through React props. No HTML injection is possible.

### 4. Strict JSON schemas for both directions

**Outbound (Events):**
- `EventPayload` → enforces flat structures
- Primitive values only (`string | number | boolean | null`)
- No nested objects or arrays

**Inbound (Decisions):**
- `WireNudgeDecision` → plain-text messages only
- No executable code
- No HTML content

**Location:** `packages/client/src/types/events.ts`, `packages/client/src/types/decisions.ts`

### 5. No mutation of host app state

SDK is **passive**: captures signals, sends them, renders overlay.

It does not:
- Alter application logic
- Modify routing
- Change data
- Intercept network requests (except its own)
- Override event handlers

### 6. Minimal dependency footprint

- Dependency graph is intentionally tiny
- Dependencies pinned to specific versions
- No transitive dependencies with known vulnerabilities

**Location:** `packages/client/package.json`

---

## What If Reveal Is Compromised? (Required by Risk Committees)

If Reveal's backend were breached:

✅ **The SDK cannot execute arbitrary code from server responses**
- All decision payloads are plain JSON
- No HTML or JavaScript is returned
- Overlay renders text-only content

✅ **The Overlay cannot render HTML or scripts**
- React components use props, not `dangerouslySetInnerHTML`
- No dynamic code evaluation

✅ **The worst-case scenario is:**
- Developers receive incorrect nudge metadata (text-only)
- No JS execution or data exfiltration is possible from decision payloads

This satisfies the **"blast radius containment"** requirement for governance teams.

---

## Security Practices

### Code-Level Guarantees

- ✅ **AI-auditable structure** - See [AUDIT_AI.md](./AUDIT_AI.md) for audit prompts
- ✅ **Clear ingress/egress boundaries** - Single transport layer (Transport handles both event batches and decision requests)
- ✅ **Strict type-level guarantees** - TypeScript enforces schema compliance
- ✅ **Sanitizer ensures payload hygiene** - PII redaction before transmission

### Implementation Status

#### ✅ Implemented
- Secure default configuration values
- Transport security enforcement (HTTPS required)
- Client key validation structure
- Error handling framework (prevents stack trace exposure)
- Single transport layer enforcement
- Plain-text rendering in overlay components
- Strict JSON schema validation

#### 🚧 In Progress
- PII scrubbing implementation (`src/security/dataSanitization.ts`)
- Complete input validation (`src/security/inputValidation.ts`)
- Audit logging system (`src/security/auditLogger.ts`)

---

## Input Validation

All inputs to the SDK are validated and sanitized to prevent injection attacks.

**Status**: Framework in place, full implementation in progress.

**Location**: `packages/client/src/utils/validation.ts`

---

## Data Handling

- **PII minimization and scrubbing** (implementation in progress)
- **Data collection follows privacy-by-design principles**
- **Sensitive fields are masked in logs**
- **No automatic data collection** - Only explicit event payloads are sent

**Status**: Structure defined, implementation in progress.

**See also**: [Data Flow](./DATAFLOW.md) for details on what data is collected and transmitted.

---

## Error Handling

- Errors are handled gracefully without exposing internal details
- Stack traces are never exposed to host applications
- Security errors are logged for audit purposes
- SDK fails open (does not break host application on errors)

**Status**: Framework implemented.

---

## Transport Security

- **HTTPS is validated at initialization** for all backend URLs before any modules are created
- **SDK disables itself** if any backend URL is not HTTPS (with localhost exception for development)
- **Localhost exception** allows `http://localhost` and `http://127.0.0.1` for local development
- **SSL certificate validation** is enabled by default
- **Client keys are not secrets** (identify project only)
- **Single transport layer** - All network calls go through one auditable file

**Status**: Validated at initialization (`entryPoint.ts`) and enforced in transport layer.

**Location**: 
- Validation: `packages/client/src/core/entryPoint.ts` (init time)
- Transport: `packages/client/src/modules/transport.ts` (runtime)

---

## Secure Defaults

The SDK uses secure default configuration values to prevent misconfiguration.

**Status**: Implemented in `packages/client/src/core/entryPoint.ts`.

---

## Audit Logging

Structured audit logging is available for compliance requirements.

**Status**: Interface defined, full implementation in progress.

**See also**: [AUDIT_AI.md](./AUDIT_AI.md) for AI-assisted security audits.

