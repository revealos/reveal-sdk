/**
 * Event Transformer Module
 * 
 * Transforms SDK internal BaseEvent format to backend EventModelContract format.
 * 
 * Responsibilities:
 * - Convert BaseEvent to backend event format
 * - Generate event_id (UUID)
 * - Map field names (kind → event_kind, name → event_type)
 * - Convert timestamp (number → ISO string)
 * - Extract page context from window/document
 * - Handle friction event special cases
 * 
 * @module modules/eventTransformer
 */

import type { BaseEvent } from "../types/events";
import { generateAnonymousId } from "../utils/anonymousId";

/**
 * Page context information
 */
export interface PageContext {
  url: string | null;
  title: string | null;
  referrer: string | null;
}

/**
 * Backend event format (matches EventModelContract.Event, but without project_id and server_timestamp)
 */
export interface BackendEventFormat {
  event_id: string;
  session_id: string;
  timestamp: string; // ISO string
  event_kind: "product" | "friction" | "nudge" | "session";
  event_type: string;
  event_source: "system" | "user";
  anonymous_id: string;
  sdk_version: string;
  properties: Record<string, any> | null;
  page_url: string | null;
  page_title: string | null;
  referrer: string | null;
  selector: string | null;
  element_text: string | null;
  friction_type: "stall" | "rageclick" | "backtrack" | null;
  user_key: string | null;
  environment: string | null;
  batch_id: string | null;
  path?: string | null; // Optional: pathname extracted from pageUrl
  referrer_path?: string | null; // Optional: pathname from referrer URL
  activation_context?: string | null; // Optional: activation context label
  client_ts_ms?: number | null; // Client timestamp in milliseconds
  seq?: number | null; // Monotonic sequence number per tab
  tab_id?: string | null; // Unique identifier per browser tab
}

/**
 * Transformation options
 */
export interface TransformOptions {
  anonymousId: string;
  sdkVersion: string;
  getPageContext: () => PageContext;
}

/**
 * Extract selector from payload
 */
function extractSelectorFromPayload(payload: Record<string, any> | undefined | null): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload.selector || payload.pageUrl || null;
}

/**
 * Extract element text from payload
 */
function extractElementTextFromPayload(payload: Record<string, any> | undefined | null): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  return payload.element_text || payload.elementText || payload.text || null;
}

/**
 * Extract friction type from payload
 */
function extractFrictionType(payload: Record<string, any> | undefined | null): "stall" | "rageclick" | "backtrack" | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }
  const type = payload.type || payload.friction_type || payload.frictionType;
  if (type === "stall" || type === "rageclick" || type === "backtrack") {
    return type;
  }
  return null;
}

/**
 * Extract pathname from URL
 */
function extractPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch {
    // Fallback: try simple string extraction
    const match = url.match(/\/\/[^\/]+(\/.*)?$/);
    return match && match[1] ? match[1] : "/";
  }
}

/**
 * Extract pathname from referrer URL
 */
function extractReferrerPath(referrer: string | null): string | null {
  if (!referrer) return null;
  try {
    const urlObj = new URL(referrer);
    return urlObj.pathname;
  } catch {
    return null;
  }
}

/**
 * Flatten properties for backend ingestion
 *
 * Backend validation requires properties to be flat (no nested objects/arrays).
 * This function converts nested structures to primitives:
 * - Arrays → length count + optional summary
 * - Objects → JSON string (truncated if needed)
 * - Primitives → pass through unchanged
 *
 * @param props - Raw properties object
 * @returns Flattened properties suitable for backend validation
 */
function flattenProperties(props: Record<string, any> | null | undefined): Record<string, string | number | boolean | null> | null {
  if (!props || typeof props !== "object" || Object.keys(props).length === 0) {
    return null;
  }

  const flattened: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(props)) {
    // Skip undefined values
    if (value === undefined) {
      continue;
    }

    // Null passes through
    if (value === null) {
      flattened[key] = null;
      continue;
    }

    // Primitives pass through
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      flattened[key] = value;
      continue;
    }

    // Arrays: convert to summary
    if (Array.isArray(value)) {
      // Store array length
      flattened[`${key}_count`] = value.length;

      // For arrays of primitives, optionally store first few items
      const isPrimitiveArray = value.length > 0 && value.every((item) =>
        typeof item === "string" || typeof item === "number" || typeof item === "boolean" || item === null
      );

      if (isPrimitiveArray && value.length > 0) {
        // For numeric arrays, compute min/max/avg if useful (e.g., interClickMs)
        const isNumericArray = value.every((item) => typeof item === "number");
        if (isNumericArray && key === "interClickMs") {
          const nums = value as number[];
          flattened[`${key}_min`] = Math.min(...nums);
          flattened[`${key}_max`] = Math.max(...nums);
          flattened[`${key}_avg`] = Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
        }
      }

      continue;
    }

    // Objects: JSON stringify (truncated to 200 chars max)
    if (typeof value === "object") {
      try {
        const jsonStr = JSON.stringify(value);
        flattened[`${key}_json`] = jsonStr.length > 200 ? jsonStr.substring(0, 200) + "..." : jsonStr;
      } catch {
        flattened[`${key}_json`] = "[object]";
      }
      continue;
    }
  }

  return Object.keys(flattened).length > 0 ? flattened : null;
}

/**
 * Transform BaseEvent to backend format
 * 
 * @param baseEvent - SDK internal event format
 * @param options - Transformation options (anonymousId, sdkVersion, getPageContext)
 * @returns Backend event format
 */
export function transformBaseEventToBackendFormat(
  baseEvent: BaseEvent,
  options: TransformOptions
): BackendEventFormat {
  const pageContext = options.getPageContext();

  // Handle friction events specially - they require selector, page_url, and friction_type
  let selector: string | null = null;
  let pageUrl: string | null = null;
  let frictionType: "stall" | "rageclick" | "backtrack" | null = null;

  // Extract path, referrerPath, and activationContext from payload or page context
  let path: string | null = null;
  let referrerPath: string | null = null;
  let activationContext: string | null = null;

  if (baseEvent.kind === "friction") {
    // Friction events must have selector and page_url from payload
    // These come from the friction signal, not from BaseEvent.path
    selector = baseEvent.payload?.selector || null;
    pageUrl = baseEvent.payload?.pageUrl || baseEvent.payload?.page_url || pageContext.url || null;
    frictionType = extractFrictionType(baseEvent.payload);
    
    // Extract path from payload or pageUrl
    path = baseEvent.payload?.path || (pageUrl ? extractPathFromUrl(pageUrl) : null);
    
    // Extract referrerPath from payload or document referrer
    referrerPath = baseEvent.payload?.referrerPath !== undefined 
      ? baseEvent.payload?.referrerPath 
      : extractReferrerPath(pageContext.referrer);
    
    // Extract activationContext from payload (optional, can be null)
    activationContext = baseEvent.payload?.activationContext || null;
    
    // FALLBACK: If frictionType is null, try to extract from event name (e.g., "friction_stall" -> "stall")
    if (!frictionType && baseEvent.name && baseEvent.name.startsWith("friction_")) {
      const extractedType = baseEvent.name.replace("friction_", "") as "stall" | "rageclick" | "backtrack";
      if (extractedType === "stall" || extractedType === "rageclick" || extractedType === "backtrack") {
        frictionType = extractedType;
      }
    }
    
    // FALLBACK: If selector is null/empty (global friction), use context from extra or default to "__global__"
    // Backend validation requires non-empty selector, so we provide a default for global friction events
    if (!selector || selector.trim() === "") {
      selector = baseEvent.payload?.context || "__global__";
    }
  } else {
    // For non-friction events, extract selector from payload if present
    selector = extractSelectorFromPayload(baseEvent.payload);
    
    // Use captured page context from BaseEvent if available (Issue A fix)
    // This prevents race conditions when page navigation happens between event creation and transformation
    pageUrl = baseEvent.page_url ?? pageContext.url;
    const pageTitle = baseEvent.page_title ?? pageContext.title;
    const referrer = baseEvent.referrer ?? pageContext.referrer;
    
    // Extract path from payload or pageUrl
    path = baseEvent.payload?.path || (pageUrl ? extractPathFromUrl(pageUrl) : null);
    
    // Extract referrerPath from payload or document referrer
    referrerPath = baseEvent.payload?.referrerPath !== undefined
      ? baseEvent.payload?.referrerPath
      : extractReferrerPath(referrer);
    
    // Extract activationContext from payload (optional, can be null)
    activationContext = baseEvent.payload?.activationContext || null;
  }

  // Determine page title and referrer to use
  // For friction events, use pageContext (friction signals may not have these)
  // For non-friction events, use captured values from BaseEvent
  const finalPageTitle = baseEvent.kind === "friction" 
    ? pageContext.title 
    : (baseEvent.page_title ?? pageContext.title);
  const finalReferrer = baseEvent.kind === "friction"
    ? pageContext.referrer
    : (baseEvent.referrer ?? pageContext.referrer);

  // Flatten properties for friction events (backend validation requires flat structure)
  // For non-friction events, use payload as-is
  const properties = baseEvent.kind === "friction"
    ? flattenProperties(baseEvent.payload)
    : (baseEvent.payload && Object.keys(baseEvent.payload).length > 0 ? baseEvent.payload : null);

  // Build backend event format
  // Use event_id from BaseEvent if available (generated at creation time), otherwise generate new
  const backendEvent: BackendEventFormat = {
    event_id: baseEvent.event_id || generateAnonymousId(),
    session_id: baseEvent.session_id, // Already UUID from sessionManager
    timestamp: new Date(baseEvent.timestamp).toISOString(),
    event_kind: baseEvent.kind,
    event_type: baseEvent.name,
    event_source: baseEvent.event_source,
    anonymous_id: options.anonymousId,
    sdk_version: options.sdkVersion,
    properties: properties,
    page_url: pageUrl,
    page_title: finalPageTitle,
    referrer: finalReferrer,
    selector: selector,
    element_text: extractElementTextFromPayload(baseEvent.payload),
    friction_type: frictionType,
    user_key: null, // Not available in BaseEvent
    environment: null, // Backend will override from project context
    batch_id: null, // Transport will add this
    path: path || null, // Pathname extracted from pageUrl
    referrer_path: referrerPath, // Pathname from referrer URL
    activation_context: activationContext, // Optional activation context from app
    client_ts_ms: baseEvent.client_ts_ms ?? null, // Client timestamp in milliseconds (Issue B fix)
    seq: baseEvent.seq ?? null, // Monotonic sequence number per tab
    tab_id: baseEvent.tab_id ?? null, // Unique identifier per browser tab
  };

  return backendEvent;
}




