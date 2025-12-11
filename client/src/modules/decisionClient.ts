/**
 * DecisionClient Module
 *
 * Sends friction decision requests from the SDK to the backend /decide endpoint.
 *
 * Responsibilities:
 * - Send FrictionSignal to backend /decide endpoint via Transport
 * - Include minimal context (projectId, sessionId, friction)
 * - Validate and parse WireNudgeDecision response
 * - Return WireNudgeDecision or null
 * - Handle errors gracefully (never throw)
 *
 * Note: This module does NOT cache decisions or apply rule logic.
 * HTTP transport is delegated to Transport module (single auditable boundary).
 *
 * @module modules/decisionClient
 */

import type { FrictionSignal } from "../types/friction";
import type { WireNudgeDecision } from "../types/decisions";
import type { Logger } from "../utils/logger";
import type { Transport, DecideRequestPayload } from "./transport";
import { scrubPII, scrubUrlPII } from "../security/dataSanitization";

/**
 * DecisionClient options
 */
export interface DecisionClientOptions {
  endpoint: string;
  timeoutMs: number;
  projectId: string;
  environment: string;
  clientKey?: string;
  logger?: Logger;
  transport: Transport;
}

/**
 * Decision context
 */
export interface DecisionContext {
  projectId: string;
  sessionId: string;
}

/**
 * DecisionClient interface
 */
export interface DecisionClient {
  requestDecision(
    signal: FrictionSignal,
    context: DecisionContext
  ): Promise<WireNudgeDecision | null>;
}

// DecideRequestPayload is now exported from transport.ts

/**
 * Create a new DecisionClient instance
 *
 * @param options - Configuration options
 * @returns DecisionClient instance
 */
export function createDecisionClient(
  options: DecisionClientOptions
): DecisionClient {
  // ──────────────────────────────────────────────────────────────────────
  // EXTRACT OPTIONS
  // ──────────────────────────────────────────────────────────────────────
  const {
    endpoint,
    projectId,
    timeoutMs = 400, // Default: 400ms (production-optimized, configurable via entryPoint)
    clientKey,
    logger,
    transport,
  } = options;

  // ──────────────────────────────────────────────────────────────────────
  // VALIDATE CONFIGURATION
  // ──────────────────────────────────────────────────────────────────────
  if (!endpoint || typeof endpoint !== "string") {
    throw new Error("DecisionClient: endpoint is required");
  }

  if (!projectId || typeof projectId !== "string") {
    throw new Error("DecisionClient: projectId is required");
  }

  if (typeof timeoutMs !== "number" || timeoutMs <= 0) {
    throw new Error("DecisionClient: timeoutMs must be a positive number");
  }

  // ──────────────────────────────────────────────────────────────────────
  // PUBLIC API: requestDecision()
  // ──────────────────────────────────────────────────────────────────────
  async function requestDecision(
    signal: FrictionSignal,
    context: DecisionContext
  ): Promise<WireNudgeDecision | null> {
    // Wrap entire function in safe error boundary
    try {
      logger?.logDebug("DecisionClient: requesting decision", {
        frictionType: signal.type,
        sessionId: context.sessionId,
      });

      // ────────────────────────────────────────────────────────────────
      // VALIDATE INPUTS
      // ────────────────────────────────────────────────────────────────
      if (!signal || !signal.type) {
        logger?.logError("DecisionClient: invalid signal", { signal });
        return null;
      }

      if (!context || !context.sessionId) {
        logger?.logError("DecisionClient: invalid context", { context });
        return null;
      }

      // ────────────────────────────────────────────────────────────────
      // BUILD REQUEST PAYLOAD
      // ────────────────────────────────────────────────────────────────
      const payload = buildRequestPayload(signal, context);

      // ────────────────────────────────────────────────────────────────
      // SEND HTTP REQUEST WITH TIMEOUT
      // ────────────────────────────────────────────────────────────────
      const response = await sendDecisionRequest(payload);

      if (!response) {
        // Request failed (timeout, network error, etc.)
        return null;
      }

      // ────────────────────────────────────────────────────────────────
      // VALIDATE AND RETURN DECISION
      // ────────────────────────────────────────────────────────────────
      const decision = validateDecision(response);

      if (decision) {
        logger?.logDebug("DecisionClient: decision received", {
          nudgeId: decision.nudgeId,
          templateId: decision.templateId,
        });
      } else {
        logger?.logDebug("DecisionClient: no valid decision returned");
      }

      return decision;
    } catch (error) {
      // Final safety net - should never reach here due to internal error handling
      // but catch anyway to guarantee we never throw to caller
      logger?.logError("DecisionClient: unexpected error in requestDecision", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: buildRequestPayload()
  // ──────────────────────────────────────────────────────────────────────
  function buildRequestPayload(
    signal: FrictionSignal,
    context: DecisionContext
  ): DecideRequestPayload {
    return {
      // Project identification
      projectId: projectId || context.projectId,

      // Session identifier
      sessionId: context.sessionId,

      // Friction signal (canonical shape matching SDK FrictionSignal)
      // SECURITY: Scrub PII from friction.extra before sending
      friction: {
        type: signal.type,
        // SECURITY: Scrub obvious PII embedded in URL strings (email-in-URL)
        pageUrl: scrubUrlPII(signal.pageUrl),
        selector: signal.selector ?? null,
        timestamp: signal.timestamp,
        extra: signal.extra ? scrubPII(signal.extra) : {},
      },
    };
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: sendDecisionRequest()
  // ──────────────────────────────────────────────────────────────────────
  async function sendDecisionRequest(
    payload: DecideRequestPayload
  ): Promise<any | null> {
    // Delegate HTTP request to Transport module
    // Transport handles: timeout, audit logging, error handling
    const response = await transport.sendDecisionRequest(
      endpoint,
      payload,
      {
        timeoutMs,
        clientKey,
      }
    );

    // Response is already parsed JSON or null (Transport handles parsing)
    return response;
  }

  // ──────────────────────────────────────────────────────────────────────
  // INTERNAL: validateDecision()
  // ──────────────────────────────────────────────────────────────────────
  function validateDecision(response: any): WireNudgeDecision | null {
    try {
      // ────────────────────────────────────────────────────────────────
      // CHECK FOR NO-DECISION RESPONSE
      // ────────────────────────────────────────────────────────────────
      if (!response || response.decision === null || response.decision === false) {
        logger?.logDebug("DecisionClient: backend returned no decision");
        return null;
      }

      const decision = response.decision || response;

      // ────────────────────────────────────────────────────────────────
      // VALIDATE REQUIRED FIELDS
      // ────────────────────────────────────────────────────────────────
      if (!decision.nudgeId || typeof decision.nudgeId !== "string") {
        logger?.logError("DecisionClient: missing or invalid nudgeId");
        return null;
      }

      if (!decision.templateId || typeof decision.templateId !== "string") {
        logger?.logError("DecisionClient: missing or invalid templateId");
        return null;
      }

      // Note: WireNudgeDecision has body?: string directly (not nested in content)
      // body is optional, but if present must be a string
      if (decision.body !== undefined && typeof decision.body !== "string") {
        logger?.logError("DecisionClient: invalid body");
        return null;
      }

      // ────────────────────────────────────────────────────────────────
      // CHECK EXPIRATION
      // ────────────────────────────────────────────────────────────────
      if (decision.expiresAt) {
        const currentTime = now();
        const expiresAt = new Date(decision.expiresAt).getTime();

        if (expiresAt < currentTime) {
          logger?.logDebug("DecisionClient: decision expired", {
            expiresAt: decision.expiresAt,
            currentTime,
          });
          return null;
        }
      }

      // ────────────────────────────────────────────────────────────────
      // RETURN VALIDATED DECISION (as-is, WireNudgeDecision shape)
      // ────────────────────────────────────────────────────────────────
      const validatedDecision: WireNudgeDecision = {
        nudgeId: decision.nudgeId,
        templateId: decision.templateId,
        title: decision.title,
        body: decision.body,
        ctaText: decision.ctaText,
        slotId: decision.slotId,
        quadrant: decision.quadrant,
        frictionType: decision.frictionType,
        expiresAt: decision.expiresAt,
        extra: decision.extra,
      };

      return validatedDecision;
    } catch (error) {
      logger?.logError("DecisionClient: error validating decision", {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  // UTILITIES
  // ──────────────────────────────────────────────────────────────────────
  function now(): number {
    return Date.now();
  }

  // ──────────────────────────────────────────────────────────────────────
  // RETURN PUBLIC API
  // ──────────────────────────────────────────────────────────────────────
  return {
    requestDecision,
  };
}
