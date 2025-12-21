# Event Types Reference

This document describes all event types that can be tracked using the Reveal SDK.

---

## Event Structure

All events follow this structure:

```typescript
Reveal.track(
  eventKind: "product" | "friction" | "nudge" | "session",
  eventType: string,
  properties?: EventPayload
)
```

**Event Payload Constraints:**
- Flat object structure (no nested objects or arrays)
- Values must be primitives: `string | number | boolean | null`
- Must be JSON-serializable
- Recommended max size: 10KB
- PII-like keys are automatically redacted

---

## Event Kinds

### 1. Product Events (`"product"`)

Product events track user actions and feature usage in your application.

**Common Event Types:**
- `button_clicked` - User clicked a button
- `page_viewed` - User viewed a page
- `checkout_started` - User started checkout process
- `checkout_completed` - User completed checkout
- `feature_used` - User used a specific feature
- `form_submitted` - User submitted a form
- `link_clicked` - User clicked a link

**Semantic IDs:**

We recommend including semantic identifiers in product event payloads to enable better analytics and targeting:

- `action_id` or `feature_id` (string, recommended) - Stable identifier for the action or feature
- `flow_id` (string, optional) - Identifier for the user flow or journey
- `step` (string | number, optional) - Step number or identifier within a flow
- `success` (boolean, required for submits/checkout/completion events) - Whether the action succeeded or failed

**Example:**
```typescript
Reveal.track('product', 'checkout_started', {
  action_id: 'checkout_started',
  flow_id: 'purchase',
  step: 1,
  cartValue: 99.99,
  itemCount: 3,
  currency: 'USD',
  hasDiscount: true,
  page: '/checkout',
});

// Form submission with success indicator
Reveal.track('product', 'form_submitted', {
  action_id: 'signup_form_submit',
  flow_id: 'onboarding',
  step: 2,
  success: true,
  formId: 'signup',
});
```

**Invalid Example:**
```typescript
// ❌ Nested objects not allowed
Reveal.track('product', 'event', {
  user: { id: '123', name: 'John' }
});

// ❌ Arrays not allowed
Reveal.track('product', 'event', {
  items: ['item1', 'item2']
});
```

---

### 2. Friction Events (`"friction"`)

Friction events track user hesitation, confusion, or difficulty. These can be:
- **Auto-generated** by the SDK's friction detectors (stall, rage click, backtrack)
- **Manually tracked** by developers when they detect friction patterns

**Auto-Generated Event Types:**
- `friction_stall` - User inactive for threshold duration (default: 20 seconds)
- `friction_rageclick` - Multiple rapid clicks on same element (planned)
- `friction_backtrack` - User navigated backward (planned)

**Manual Friction Events:**
You can manually track friction when you detect patterns in your application:

```typescript
Reveal.track('friction', 'form_abandoned', {
  formId: 'signup',
  fieldsCompleted: 2,
  totalFields: 5,
  timeSpentMs: 45000,
});
```

**Auto-Generated Example:**
```typescript
// Automatically sent by SDK when stall is detected
// Event type: "friction_stall"
// Payload includes:
{
  page_url: '/checkout',
  selector: '#submit-button',
  stall_duration_ms: 20000,
}
```

---

### 3. Nudge Events (`"nudge"`)

Nudge events track interactions with nudges displayed by the OverlayManager.

**Event Types:**
- `nudge_shown` - Nudge was displayed to the user
- `nudge_clicked` - User clicked the nudge's CTA button
- `nudge_dismissed` - User dismissed the nudge (clicked X or auto-dismiss)

**Example:**
```typescript
// Automatically tracked by OverlayManager
// Event type: "nudge_clicked"
// Payload includes:
{
  nudgeId: 'nudge_123',
  templateId: 'tooltip',
  action: 'cta_clicked',
}
```

**Manual Tracking:**
You can also manually track nudge interactions:

```typescript
Reveal.track('nudge', 'nudge_custom_action', {
  nudgeId: 'nudge_123',
  action: 'learn_more_clicked',
  templateId: 'modal',
});
```

---

### 4. Session Events (`"session"`)

Session events track session lifecycle.

**Event Types:**
- `session_start` - New session started
- `session_end` - Session ended
- `session_heartbeat` - Session activity heartbeat (auto-generated)

**Example:**
```typescript
// Automatically tracked by SDK
// Event type: "session_start"
// Payload includes:
{
  sessionId: 'session_abc123',
  timestamp: 1234567890,
}
```

---

## Event Payload Best Practices

### ✅ Do

```typescript
// Flat structure with primitives and semantic IDs
Reveal.track('product', 'purchase_completed', {
  action_id: 'purchase_completed',
  flow_id: 'checkout',
  step: 3,
  success: true,
  orderId: 'order_123',
  totalAmount: 99.99,
  currency: 'USD',
  itemCount: 3,
  hasDiscount: true,
  discountAmount: 10.00,
});

// Use descriptive property names with semantic IDs
Reveal.track('product', 'button_clicked', {
  action_id: 'signup_button_click',
  flow_id: 'onboarding',
  buttonId: 'signup',
  buttonText: 'Sign Up',
  page: '/onboarding',
  section: 'header',
});
```

### ❌ Don't

```typescript
// ❌ Nested objects
Reveal.track('product', 'event', {
  user: { id: '123', email: 'user@example.com' }
});

// ❌ Arrays
Reveal.track('product', 'event', {
  items: ['item1', 'item2', 'item3']
});

// ❌ Functions or non-serializable values
Reveal.track('product', 'event', {
  callback: () => {},
  element: document.getElementById('button'),
});

// ❌ Sensitive data (will be redacted, but don't send it)
Reveal.track('product', 'event', {
  password: 'secret123',
  creditCard: '1234-5678-9012-3456',
});
```

---

## PII Redaction

The SDK automatically redacts known PII keys from event payloads. Common redacted keys include:

- `email`, `emailAddress`, `email_address`
- `phone`, `phoneNumber`, `phone_number`
- `password`, `passwd`, `pwd`
- `token`, `accessToken`, `access_token`, `apiKey`, `api_key`
- `ssn`, `socialSecurityNumber`
- `creditCard`, `credit_card`, `cardNumber`, `card_number`

**Redaction behavior:**
- PII values are replaced with `"[REDACTED]"`
- Event is still sent (redaction doesn't block transmission)
- Redaction happens before network transmission

---

## Event Batching

Events are automatically batched and sent to the backend:

- **Batch size**: Up to 50 events per batch
- **Batch interval**: Events are sent every 5 seconds (or on page unload)
- **Retry logic**: Failed batches are retried with exponential backoff
- **Page unload**: Uses `sendBeacon` API for reliable delivery on page navigation

## Event Ordering

Events are guaranteed to appear in correct chronological order in the database:

- **Client timestamps**: Events include `client_ts_ms` (client timestamp in milliseconds) captured at event creation time for accurate ordering
- **Database ordering**: Events are ordered by `client_ts_ms` first (actual event time), then `timestamp` as fallback
- **Rapid navigation**: Page context (`page_url`, `page_title`, `referrer`) is captured at event creation time to prevent race conditions during rapid page navigation

---

## Event Validation

The SDK validates events before sending:

- ✅ Event kind must be one of: `"product" | "friction" | "nudge" | "session"`
- ✅ Event type must be a non-empty string
- ✅ Payload must be a flat object (if provided)
- ✅ Payload values must be primitives
- ⚠️ Invalid events are logged and ignored (fail-open behavior)

---

## See Also

- [API Reference](./API.md) - Complete SDK API documentation
- [Data Flow](./DATAFLOW.md) - How events flow through the system
- [Security](./SECURITY.md) - Security guarantees and data handling

