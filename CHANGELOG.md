# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
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
- Full PII scrubbing implementation
- Complete audit logging system
- Comprehensive test coverage
- Production-ready error handling
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

