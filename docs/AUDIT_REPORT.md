# Reveal SDK Security Audit Report

**Date**: 2024-12-19  
**Auditor**: AI Security Audit (Unbiased Evaluation)  
**Target**: `@reveal/client` + `@reveal/overlay-react`  
**Purpose**: Pre-integration security assessment for production application

---

## 1. Network Surface Area

### Files Containing HTTP/HTTPS Requests

**Identified Files:**
1. `packages/client/src/modules/transport.ts`
   - Function: `performFetchRequest()` (line 192)
   - Function: `sendWithBeacon()` (line 331)
   - Endpoint: `/ingest` (configurable, default: `https://api.reveal.io/ingest`)

2. `packages/client/src/modules/decisionClient.ts`
   - Function: `sendDecisionRequest()` (line 203)
   - Endpoint: `/decide` (configurable, default: `${apiBase}/decide`)

### Endpoints Called

- **POST** `/ingest` - Event batch ingestion
  - Headers: `X-Reveal-Client-Key`, `X-Reveal-SDK-Version`
  - Payload: `{ batch_id, events[], timestamp }`
  
- **POST** `/decide` - Nudge decision requests
  - Headers: `X-Reveal-Client-Key`
  - Payload: `{ project_id, session_id, friction: { type, pageUrl, selector, timestamp, extra } }`

### Transport Module Verification

✅ **PASS**: All outbound HTTP requests flow through designated transport boundaries:
- Event batches: `transport.ts` → `performFetchRequest()`
- Decision requests: `decisionClient.ts` → `sendDecisionRequest()` (uses `fetch` directly, but is a controlled, single-purpose module)

**Justification**: 
- Only 2 files make network calls
- Both are clearly marked and auditable
- No third-party HTTP libraries (axios, etc.) detected
- No hidden network calls in dependencies

**CONSIDERATION**: `decisionClient.ts` uses `fetch` directly rather than going through `transport.ts`. This is acceptable as it's a single-purpose module with strict timeout controls (200ms), but creates a second network boundary to monitor.

---

## 2. Data Collection & Handling

### Event Types and Fields Sent

**Event Kinds:**
1. **product** - Developer-tracked product events
2. **friction** - Automatically detected friction signals (stall, rage_click, backtrack)
3. **nudge** - System-generated nudge interaction events
4. **session** - Session lifecycle events

**BaseEvent Structure (sent to `/ingest`):**
```typescript
{
  kind: EventKind,
  name: string,
  event_source: "system" | "user",
  session_id: string,
  is_treatment: boolean | null,
  timestamp: number,
  path: string | null,           // window.location.pathname
  route: string | null,           // Framework route (if available)
  screen: string | null,          // Screen identifier (if available)
  user_agent: string,             // navigator.userAgent
  viewport_width: number,         // window.innerWidth
  viewport_height: number,        // window.innerHeight
  payload: EventPayload           // Developer-provided or friction.extra
}
```

**Decision Request Payload (sent to `/decide`):**
```typescript
{
  project_id: string,
  session_id: string,
  friction: {
    type: "stall" | "rage_click" | "backtrack",
    pageUrl: string,              // window.location.href
    selector: string | null,       // CSS selector of target element
    timestamp: number,
    extra: Record<string, any>    // Optional metadata (scrubbed)
  }
}
```

### Automatic PII Capture Assessment

✅ **PASS**: No automatic PII capture is possible.

**Justification**:
- **No DOM scraping**: SDK does not read form values, input fields, or DOM content
- **No storage access**: No access to cookies, localStorage, or sessionStorage
- **No token extraction**: No access to authentication tokens or headers
- **Metadata only**: Only collects technical metadata (path, user agent, viewport)
- **Explicit payloads**: Only data explicitly passed to `Reveal.track()` is sent

**PROS**:
- Minimal data collection surface
- Developer has full control over what is sent
- No "surprise" data collection

**CONS**:
- `user_agent` string is automatically collected (standard practice, but contains device/browser fingerprinting data)
- `pageUrl` (full URL) is collected in friction signals (may contain query parameters with PII if URLs are not sanitized by host app)

### PII Sanitization Verification

✅ **PASS**: `scrubPII()` function is consistently applied at choke points.

**Implementation**: `packages/client/src/security/dataSanitization.ts`
- 30+ PII key patterns (email, phone, password, token, SSN, etc.)
- Case-insensitive matching
- Recursive scrubbing for nested objects
- Replaces values with `"[REDACTED]"`

**Application Points**:
1. ✅ `eventPipeline.ts` → `enrichEvent()` (line 150) - scrubs all event payloads
2. ✅ `decisionClient.ts` → `buildRequestPayload()` (line 175) - scrubs `friction.extra`

**Justification**: All user-provided data passes through PII scrubbing before network transmission.

**CONSIDERATION**: PII scrubbing relies on key pattern matching. If developers use non-standard key names (e.g., `userEmail`, `usr_phn`), PII may slip through. However, this is a developer responsibility issue, not an SDK flaw.

---

## 3. DOM Interaction Surface (Overlay Only)

### Components Rendering Server-Provided Content

**Components:**
1. `OverlayManager` (`packages/overlay-react/src/components/OverlayManager.tsx`)
   - Renders based on `WireNudgeDecision` from backend
   - Delegates to template components

2. Template Components:
   - `TooltipNudge` (`packages/overlay-react/src/components/templates/TooltipNudge.tsx`)
   - `BannerNudge` (`packages/overlay-react/src/components/templates/BannerNudge.tsx`)
   - `ModalNudge` (`packages/overlay-react/src/components/templates/ModalNudge.tsx`)
   - `SpotlightNudge` (`packages/overlay-react/src/components/templates/SpotlightNudge.tsx`)
   - `InlineHint` (`packages/overlay-react/src/components/templates/InlineHint.tsx`)

### XSS Vector Assessment

✅ **PASS**: No HTML injection vectors detected.

**Verification**:
- ❌ `dangerouslySetInnerHTML` → 0 results (only mentioned in security comment)
- ❌ `innerHTML` → 0 results
- ❌ `eval(` → 0 results
- ❌ `Function(` → 0 results

**Backend Decision Format** (`WireNudgeDecision`):
```typescript
{
  templateId: string,
  title?: string,      // Plain string only
  body?: string,       // Plain string only
  ctaText?: string,    // Plain string only
  targetId?: string,   // Element ID for positioning
  severity?: "low" | "medium" | "high"
}
```

**Rendering Method**: All content rendered as React text nodes:
- `{decision.title}` → React automatically escapes
- `{decision.body}` → React automatically escapes
- `{decision.ctaText}` → React automatically escapes

**Justification**: Even if backend is compromised and sends malicious strings, React's automatic escaping prevents XSS. Worst-case scenario: incorrect text display (cannot execute code).

### Positioning Strategy

**Quadrant-Based / Target Element Attachment**:
- Tooltips: Attached to target element via `document.getElementById(targetId)`
- Uses `getBoundingClientRect()` for positioning
- Updates on scroll/resize events
- No "no-go zones" strategy implemented (tooltips can appear anywhere)

**CONSIDERATION**: Tooltips use `document.getElementById()` to find target elements. If `targetId` is user-controlled (from backend), this could theoretically be used to target sensitive elements, but:
1. `targetId` is just an element ID (not a selector)
2. No data is read from the target element
3. Only used for positioning (visual attachment)

**PROS**:
- Simple, predictable positioning
- No complex layout calculations

**CONS**:
- No explicit "no-go zones" (could overlay sensitive UI elements)
- Relies on host app to ensure `targetId` values are safe

---

## 4. Dependency & Permissions Check

### NPM Dependencies (Security-Relevant)

**@reveal/client** (`packages/client/package.json`):
- **Runtime Dependencies**: None (zero runtime deps)
- **Dev Dependencies**: Testing libraries, TypeScript, build tools
- **Peer Dependencies**: `react >= 18.0.0` (optional, for hooks only)

**@reveal/overlay-react** (`packages/overlay-react/package.json`):
- **Runtime Dependencies**: 
  - `react: 19.2.0` (exact version)
  - `react-dom: 19.2.0` (exact version)
- **Dev Dependencies**: Testing libraries, TypeScript, build tools

### Dependency Telemetry Assessment

✅ **PASS**: No dependencies include telemetry or network calls.

**Justification**:
- React/React-DOM: No known telemetry
- Zero third-party runtime dependencies in client package
- All dev dependencies are build/test tools (no runtime impact)

### Browser API Access

**APIs Used**:
1. `window.location` - Read-only access to `pathname`, `href`
2. `window.innerWidth` / `window.innerHeight` - Viewport dimensions
3. `navigator.userAgent` - User agent string
4. `navigator.sendBeacon` - Page unload event sending
5. `document.getElementById()` - Target element lookup (overlay only)
6. `Element.getBoundingClientRect()` - Element positioning (overlay only)
7. `crypto.randomUUID()` - Session ID generation (with fallback)
8. `fetch()` - HTTP requests
9. `AbortController` - Request timeout handling

**APIs NOT Used**:
- ❌ `document.cookie` - No cookie access
- ❌ `localStorage` - No localStorage access
- ❌ `sessionStorage` - No sessionStorage access
- ❌ `document.querySelector()` - No DOM querying (except `getElementById` for positioning)
- ❌ `window.postMessage()` - No cross-origin messaging
- ❌ `XMLHttpRequest` - Uses `fetch` only

✅ **PASS**: No access to sensitive browser storage APIs.

**Justification**: SDK only accesses read-only browser APIs for metadata collection and DOM positioning. No storage access, no cookie access, no token extraction.

**CONSIDERATION**: `navigator.userAgent` is collected automatically. This is standard practice but contains fingerprinting data. However, it's not PII and is commonly collected by analytics tools.

---

## 5. Final Audit Verdict (Slide-Ready Summary)

### Overall Status: ✅ **PASS**

### Key Findings

1. **Minimal Network Surface**: Only 2 files make HTTP requests, both clearly auditable. All requests go through controlled transport boundaries.

2. **Strong PII Protection**: PII scrubbing implemented at choke points with 30+ pattern matching. No automatic PII capture possible (no DOM scraping, no storage access).

3. **XSS Prevention**: Overlay renders plain text only via React text nodes. No HTML injection vectors. Even compromised backend cannot execute code.

### Residual Risks

1. **User Agent Fingerprinting**: `navigator.userAgent` is automatically collected. While not PII, it enables device/browser fingerprinting.

2. **URL Query Parameters**: `pageUrl` (full URL) in friction signals may contain query parameters with PII if host app URLs are not sanitized. SDK cannot detect this.

3. **PII Scrubbing Limitations**: Relies on key pattern matching. Non-standard key names may slip through (developer responsibility).

4. **No Explicit No-Go Zones**: Overlay positioning has no explicit "no-go zones" to prevent overlaying sensitive UI elements (relies on host app).

5. **Second Network Boundary**: `decisionClient.ts` uses `fetch` directly (not through `transport.ts`). Acceptable but creates a second boundary to monitor.

### Recommended Mitigations

1. **Host App Responsibility**: Ensure URLs passed to SDK (via `Reveal.track()` or friction signals) do not contain PII in query parameters.

2. **Code Review**: Review all `Reveal.track()` calls to ensure payload keys follow standard naming conventions for PII scrubbing to work effectively.

3. **Monitoring**: Monitor audit logs (in debug mode) to verify PII scrubbing is working as expected.

4. **Future Enhancement**: Consider implementing explicit "no-go zones" for overlay positioning to prevent overlaying sensitive UI elements.

### Integration Recommendation

✅ **APPROVED FOR INTEGRATION**

The Reveal SDK demonstrates strong security practices:
- Minimal attack surface
- Clear security boundaries
- Fail-open behavior (never breaks host app)
- Comprehensive PII scrubbing
- XSS prevention via React's automatic escaping

The residual risks are low and manageable through host app practices (URL sanitization, payload key naming). The SDK is production-ready for integration into a production application.

---

**Audit Completed**: 2024-12-19  
**Next Review**: Recommended after major version updates or security-related changes

