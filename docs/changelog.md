# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed
- **Spotlight Template selectorPattern**: Fixed bug where `selectorPattern` field was dropped during wire-to-UI decision mapping, causing spotlight templates to fail with "target_not_found" error. The `mapWireToUI()` function now correctly preserves `selectorPattern` from `WireNudgeDecision` to `UINudgeDecision`.

### Added
- **Decision Event Linking**: SDK now links friction events to their decision requests for better traceability
  - Added `frictionEventId` parameter to decision requests sent to `/decide` endpoint
  - SDK captures `event_id` when creating friction events and includes it in decision requests
  - Enables backend to trace which friction event triggered each nudge decision
  - Type: optional field (`frictionEventId?: string`) in `DecideRequestPayload` interface
- **Activation Context Support**: SDK now supports optional `activationContext` field in event payloads and friction signals. Apps can provide a task/flow label (e.g., "checkout", "onboarding") to help disambiguate nudges on the same page. Templates can specify `activation_contexts` array to only match when the resolved context is in the list. Generic templates (no `activation_contexts`) match regardless of context. This is a routing/filtering mechanism only - it does not affect eligibility scoring.
- **Nudge Active State Management**: SDK now tracks when a nudge is active and prevents multiple nudges from appearing simultaneously. Decision requests are blocked while a nudge is visible, and a 2-second cooldown period after dismissal prevents immediate re-triggering. Friction events continue to be tracked for analytics even when decision requests are blocked.
- **Event Transformation**: SDK now automatically transforms internal event format to standardized wire format before sending to `/ingest` endpoint. This ensures events are properly formatted for validation and storage.
- **Anonymous ID Management**: Added persistent anonymous user identification via `anonymousId` utility. Anonymous ID is stored in `localStorage` and persists across browser sessions for user tracking.
- **EventTransformer Module**: New module (`packages/client/src/modules/eventTransformer.ts`) that converts SDK internal event format to wire format, including field name mapping, timestamp conversion, and page context extraction.
- **Event Format Standardization**: Events now include required wire format fields: `event_id` (UUID), `event_kind`, `event_type`, `anonymous_id`, `sdk_version`, and proper ISO 8601 timestamps.

### Changed
- **Transport Module**: Now accepts optional `transformEvent` function to transform events before sending. If provided, events are transformed to wire format. If not provided, events are sent as-is (backward compatibility).
- **Event Format**: Events sent to `/ingest` now use standardized wire format (`event_kind`, `event_type`, ISO timestamps) instead of SDK internal format (`kind`, `name`, numeric timestamps). This is an internal change - SDK API (`Reveal.track()`) remains unchanged.

### Fixed
- **Multiple Nudges Issue**: Fixed issue where multiple nudges could appear in sequence without dismissal events, caused by meaningful activity resetting the stall detector while a nudge was visible. SDK now blocks decision requests when a nudge is active.
- **Event Ordering Race Condition**: Fixed rare race condition where `nudge_shown` events could appear before `friction` events when both events were captured in the same millisecond. Friction events now trigger immediate flush to preserve causality (friction → decision → nudge), and events are sorted during batch flush to ensure friction events always precede nudge events.
- Friction events now include required fields (`selector`, `page_url`, `friction_type`) extracted from friction signal payload. Added fallback to use `context` field or `"__global__"` when selector is null for global friction events.

## [Unreleased]

### Added
- **ConfigClient Implementation**: SDK now fetches configuration from `/config` endpoint
  - Fetches client-safe configuration during SDK initialization
  - Caches config with TTL (from response `ttlSeconds` or default 60s)
  - Falls back to minimalConfig if fetch fails (maintains backward compatibility)
  - Config endpoint resolution: `configEndpoint` → `${apiBase}/config` → `https://api.revealos.com/config`
  - Includes `X-Reveal-Client-Key` header and `environment` query param
  - Validates endpoint URL for HTTPS (with localhost exception)
  - Comprehensive error handling: network errors, HTTP errors, invalid responses all handled gracefully
  - SDK continues to work even if config endpoint is unavailable (uses fallback config)
  - Implementation: `modules/configClient.ts` with full caching and validation
  - Comprehensive test coverage: 29 unit tests for ConfigClient, integration tests in index.test.ts
- **HTTPS URL Validation at Initialization**: Security hard requirement enforcement
  - All API URLs (`ingestEndpoint`, `decisionEndpoint`, `apiBase`) are validated for HTTPS at SDK initialization
  - SDK disables itself (`isDisabled = true`) if any non-HTTPS URL is detected
  - Clear error messages logged when validation fails
  - Localhost exception: `http://localhost` and `http://127.0.0.1` allowed for local development
  - Validation happens before any modules are created, ensuring no network requests with insecure URLs
  - Implementation: `validateHttpsUrl()` and `validateAllBackendUrls()` in `security/inputValidation.ts`
  - Comprehensive test coverage: 15 unit tests for validation, 7 integration tests for SDK init
- **URL PII Scrubbing (Email Redaction)**: Prevents email addresses leaking via URL strings
  - Scrubs known URL fields before sending (e.g. friction `pageUrl`, event `path`)
  - Redacts obvious email-like substrings, including percent-encoded `@` (`%40`)
  - Uses the same redaction marker: `"[REDACTED]"`
  - Implemented in `security/dataSanitization.ts` (`scrubUrlPII()`) and applied at SDK choke points

### Changed
- **Environment-Aware Decision Request Timeout**: More realistic timeout defaults for production
  - Production default: 400ms (was 200ms) - accounts for network latency and processing time
  - Development default: 2000ms (unchanged) - allows for CORS preflight and logging overhead
  - Timeout is automatically set based on `environment` option in `Reveal.init()`
  - Still configurable via `decisionTimeoutMs` option if needed
  - Aligns with architecture target of 100-400ms end-to-end decision time
  - Reduces timeout failures in production while maintaining fail-fast behavior
- **Unified Transport Architecture**: Consolidated Transport and DecisionClient HTTP logic into single Transport module
  - Transport now provides two methods: `sendBatch()` for event batches and `sendDecisionRequest()` for decision requests
  - Single `globalFetch()` wrapper eliminates duplicate fetch implementations (fixes audit concern)
  - Single audit logging point for all network requests in `transport.ts`
  - DecisionClient now delegates HTTP requests to Transport instead of using its own fetch wrapper
  - Maintains architectural separation: EventPipeline uses `sendBatch()`, DecisionClient uses `sendDecisionRequest()`
  - Performance characteristics preserved: 10s timeout with retries for events, 400ms (production) / 2000ms (development) environment-aware timeout for decisions
  - No breaking changes: all public APIs remain unchanged
  - Updated all documentation to reflect single transport boundary
  - Comprehensive test coverage: 114 tests passing (31 transport tests, 14 decisionClient tests)

### Added
- **Glassmorphic Tooltip Design**: Modern glassmorphic styling for tooltip nudges
  - Translucent dark background with backdrop blur for depth
  - Subtle borders and shadows for polished appearance
  - Responsive width (85% of original, clamped between 238px and 408px)
  - Self-contained inline styles (no CSS imports or global style injection required)
- **Arrow Bubble Indicator**: Visual indicator for tooltip positioning
  - Glassmorphic circular bubble (56px) with arrow icon (24px)
  - Appears above tooltip for bottom quadrants (pointing up) or below tooltip for top quadrants (pointing down)
  - Always centered horizontally on the tooltip regardless of quadrant
  - Features floating animation (12px vertical displacement) via Web Animations API (respects `prefers-reduced-motion`)
  - 24px spacing between tooltip and arrow bubble
- **SDK Safety Hardening**: Comprehensive error handling and crash prevention
  - Detector initialization wrapped in `safeTry` to prevent `Reveal.init()` crashes
  - All detector event listeners wrapped in try-catch blocks to prevent crashes from unexpected errors
  - Nudge decision deduplication in `notifyNudgeSubscribers()` and `useNudgeDecision()` hook to prevent duplicate renders
  - Event pipeline flush safety: `destroy()` waits for final flush completion with 5-second timeout
  - React portal isolation for overlays: `OverlayManager` renders in isolated portal container (`#reveal-overlay-root`)
  - Systematic z-index layering: Z_INDEX constants (OVERLAY_ROOT: 9999, BACKDROP: 10000, TOOLTIP: 10001, MODAL: 10002) to prevent conflicts with host app
- **Security Hardening**: Comprehensive PII scrubbing and audit logging implementation
  - `scrubPII()` function in `packages/client/src/security/dataSanitization.ts` with 30+ PII key patterns
  - PII scrubbing applied at choke points: `eventPipeline.enrichEvent()` and `decisionClient.buildRequestPayload()`
  - `logAuditEvent()` function in `packages/client/src/security/auditLogger.ts` for structured audit logging
  - Audit logging integrated into transport layer (event batches) and decision client (decision requests)
  - Low-severity audit logs use `logDebug()` (only visible in debug mode, not production console)
  - Error handling integrated with audit logging via `errorHandler.ts`
- **AUDIT_AI.md**: AI-driven security audit guide with 5-section audit prompt
  - Network Surface Area verification
  - Data Collection & Handling verification
  - DOM Interaction Surface verification
  - Dependency & Permissions verification
  - Final Audit Verdict (slide-ready summary)
  - Designed for AI-driven security teams and automated audit tools
- **INTEGRATION_AI.md**: AI IDE integration prompt for Cursor/Claude
  - Step-by-step integration guide with hard constraints
  - Self-check auditability verification steps
  - Event tracking templates for common patterns (navigation, forms, buttons, entity creation, state changes)
  - Framework-specific instructions (Next.js App Router, Pages Router, Create React App, Vite)
  - Reference to harness app implementation
- **Quadrant-Based Positioning Strategy** (Implemented)
  - Overlay positioning uses quadrant-based strategy instead of target element attachment
  - Supports 6 viewport-relative quadrants: topLeft, topCenter, topRight, bottomLeft, bottomCenter, bottomRight
  - Quadrant preference can be specified via `WireNudgeDecision.quadrant` field
  - Defaults to `"topCenter"` if not specified
  - Replaces target element positioning approach for better flexibility and predictability
  - Tooltip positioning automatically centers within the selected quadrant
  - Responsive positioning that recalculates on viewport resize using ResizeObserver
- **EventPayload type**: Explicit type export for event properties (`Record<string, any>`)
  - Provides clear type definition for event payloads throughout the SDK
  - Exported from `@reveal/client` for use in host applications
  - Used consistently across `Reveal.track()`, `EventPipeline`, and internal event handling

### Changed
- **SDK Initialization Safety**: Detector initialization now wrapped in error handling to prevent crashes
  - `detectorManager.initDetectors()` wrapped in `safeTry` to ensure SDK initialization never throws
  - SDK continues to function even if detector initialization fails
- **Nudge Callback Deduplication**: Nudge decisions are now deduplicated to prevent duplicate renders
  - `notifyNudgeSubscribers()` tracks last decision ID and skips duplicates
  - `useNudgeDecision()` hook tracks last decision ID to prevent duplicate state updates
  - Prevents duplicate nudge renders and duplicate tracking events
- **Detector Error Handling**: All detector event listeners now wrapped in try-catch blocks
  - `onKeyboardActivity`, `onMouseClickActivity`, `onFormSubmit`, `onNavigationChange` all protected
  - Errors in event listeners no longer crash the host application
- **Event Pipeline Flush Safety**: `destroy()` now waits for final flush completion
  - Final flush uses Promise.race with 5-second timeout to prevent hanging
  - Ensures events are not lost during SDK shutdown
- **Overlay DOM Isolation**: Overlays now render in isolated React portal
  - `OverlayManager` creates/finds `#reveal-overlay-root` portal container
  - Prevents DOM conflicts with host application
  - Portal container cleaned up on unmount if empty
- **Z-Index Layering**: Systematic z-index strategy implemented
  - Z_INDEX constants defined in `packages/overlay-react/src/utils/constants.ts`
  - TooltipNudge uses `Z_INDEX.TOOLTIP` instead of hardcoded `z-50`
  - Portal container uses `Z_INDEX.OVERLAY_ROOT` for base layer
- **Audit Logging Visibility**: Low-severity audit events now use `logDebug()` instead of `logInfo()`
  - Low-severity audit logs only appear in debug mode (not production console)
  - Prevents console noise in production while maintaining audit trail in debug mode
  - Updated `auditLogger.test.ts` to expect `logDebug()` for low-severity events
- **Error handling**: Wrapped `createDecisionClient` initialization in `safeTry` to prevent host app crashes
  - DecisionClient validation errors now fail safely instead of throwing
  - SDK continues to function even if DecisionClient initialization fails
  - Aligns with SDK boundary requirements (errors must not crash host app)
- **Type consistency**: Updated all event payload types to use `EventPayload` instead of `Record<string, any>`
  - `Reveal.track()` now uses `EventPayload` type
  - `EventPipeline.captureEvent()` now uses `EventPayload` type
  - Internal event enrichment functions use `EventPayload` type
  - Improves type clarity and consistency across the SDK

### Added
- **EventPipeline**: Complete event buffering and enrichment module
  - Buffers events in memory with configurable batch size and flush intervals
  - Enriches events with session context, location, viewport, and user agent metadata
  - Transforms nudge payloads from camelCase to snake_case for wire format compatibility
  - Automatic batch flushing based on size threshold (20 events) or time interval (5 seconds)
  - Retry logic with exponential backoff for failed sends
  - Buffer overflow protection with critical event prioritization (friction, session events preserved)
  - Final flush on destroy using beacon mode for page unload scenarios
  - Comprehensive unit test coverage (40 tests)
- **Transport**: HTTP transport layer for event batches
  - Sends event batches to `/ingest` endpoint via `fetch` API
  - Supports `fetch` mode (with retries) and `sendBeacon` mode (for page unload)
  - Classifies network and HTTP errors (retryable vs. non-retryable)
  - Implements exponential backoff for retryable errors
  - Handles request timeouts via `AbortController`
  - Custom `HttpError` and `NetworkError` classes for error handling
  - Comprehensive unit test coverage (66 tests)
- **EntryPoint wiring**: Integrated EventPipeline, Transport, and SessionManager into SDK core flow
  - EventPipeline and Transport initialized during SDK `init()`
  - Automatic periodic flush started on initialization
  - `ingestEndpoint` configuration option for event ingestion URL
  - Proper cleanup on SDK `destroy()` (flushes events, destroys modules)
- **StallDetector**: Friction detection for user hesitation/idle behavior
  - Detects when users remain idle for 20+ seconds without meaningful activity
  - Distinguishes between meaningful activity (clicks, keyboard input, form submissions, navigation) and meaningless activity (mouse movement, scrolling, hover)
  - Context-based idle watching with `Reveal.startIdleWatch()`, `Reveal.stopIdleWatch()`, and `Reveal.markContextClosed()` APIs
  - Auto-starts global stall detection on SDK initialization
  - Emits `friction_idle` events when stall conditions are detected
- **DecisionClient**: Complete vertical slice for friction → decision → nudge flow
  - Implements HTTP client for `/decide` endpoint with environment-aware timeout enforcement (400ms production, 2000ms development)
  - Handles null decisions, timeouts, and network errors gracefully (never throws)
  - Validates decision responses and extracts `WireNudgeDecision`
  - Integrated into EntryPoint friction signal flow
- **SessionManager**: Minimal stub implementation
  - Generates session IDs for decision context
  - Provides `getCurrentSession()` and `markActivity()` APIs
  - Session persistence and idle timeout pending (v0 minimal implementation)
- **New Public APIs**:
  - `Reveal.startIdleWatch({ context, selector, timeoutMs })` - Start watching a specific context for idle behavior
  - `Reveal.stopIdleWatch(context)` - Stop watching a context
  - `Reveal.markContextClosed(context)` - Mark a context as closed and reset timers
- **Logger utility**: Internal logging system with debug mode support
- **Safe error handling**: Wrappers to prevent SDK errors from crashing host applications
- Improved SDK initialization to prevent race conditions with `Reveal.track()`
- Consolidated meaningful activity detection to prevent duplicate event logging
- Nudge subscriber integration in harness app for testing

### Changed
- TypeScript configuration now includes DOM types for browser API support
- SDK initialization is now async-safe
- Fixed TypeScript error in `safe.ts` return type to support `Promise<T | undefined>`

### Planned
- Quadrant-based overlay positioning implementation
- Comprehensive test coverage expansion
- Performance optimizations

## [0.1.0] - 2025-12-03

### Added
- Initial SDK release
- Core API: `Reveal.init()`, `Reveal.track()`, `Reveal.onNudgeDecision()`
- TypeScript type definitions
- Security module structure (input validation, data sanitization, audit logging)
- Friction detection framework (stall, rage click, backtrack detectors)
- Event pipeline architecture
- Session management
- Transport layer for API communication
- Comprehensive documentation (API, Architecture, Security, Compliance)

### Security
- Secure default configuration values
- Input validation framework
- Data sanitization structure
- Audit logging interface

### Documentation
- README with quick start guide
- API documentation
- Architecture documentation
- Security considerations
- SOC2 compliance notes

[Unreleased]: https://github.com/revealos/reveal-sdk/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/revealos/reveal-sdk/releases/tag/v0.1.0

