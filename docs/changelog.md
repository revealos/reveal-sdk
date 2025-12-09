# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- **Quadrant-Based Positioning Strategy** (Planned)
  - Overlay positioning will use quadrant-based strategy instead of target element attachment
  - Supports viewport-relative quadrants (top-left, top-right, bottom-left, bottom-right)
  - Backend can specify quadrant preference or SDK can auto-detect best quadrant
  - Replaces current target element positioning approach for better flexibility
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
  - Transforms nudge payloads from camelCase to snake_case for backend compatibility
  - Automatic batch flushing based on size threshold (20 events) or time interval (5 seconds)
  - Retry logic with exponential backoff for failed sends
  - Buffer overflow protection with critical event prioritization (friction, session events preserved)
  - Final flush on destroy using beacon mode for page unload scenarios
  - Comprehensive unit test coverage (40 tests)
- **Transport**: HTTP transport layer for event batches
  - Sends event batches to backend `/ingest` endpoint via `fetch` API
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
  - Implements HTTP client for `/decide` endpoint with 200ms timeout enforcement
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
- Engine logging improved with pino-pretty for readable development logs

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
- Transport layer for backend communication
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

