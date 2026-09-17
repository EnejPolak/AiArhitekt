export type DiscoveryErrorCode =
  | "invalid_input"
  | "unauthenticated"
  | "not_found"
  | "missing_analysis"
  | "geocoding_disabled"
  | "geocoding_quota"
  | "geocoding_denied"
  | "geocoding_failed"
  | "no_local_retailers"
  | "places_failed"
  | "places_quota"
  | "places_rate_limited"
  | "no_place_candidates"
  | "stores_found_but_filtered"
  | "no_valid_store_domains"
  | "serp_quota"
  | "serp_unconfigured"
  | "openai_unconfigured"
  | "serp_failed"
  | "search_interrupted"
  | "discovery_budget_exhausted"
  | "discovery_timeout"
  | "provider_timeout"
  | "rate_limited"
  | "location_required"
  | "location_invalid"
  | "failed";

export type DiscoveryErrorDetails = {
  stage?: string;
  errorCode?: string;
  requirementKey?: string;
  queryLevel?: number;
  elapsedMs?: number;
  serpRequests?: number;
  providerAttempts?: number;
  providerStatus?: number;
  attemptId?: string;
  resultType?: string;
  cacheHits?: number;
  logicalQueries?: number;
  canonicalError?: string;
  canonicalDetails?: unknown;
};

export class DiscoveryError extends Error {
  readonly code: DiscoveryErrorCode;
  readonly retryAfterSeconds?: number;
  readonly details?: DiscoveryErrorDetails;

  constructor(
    code: DiscoveryErrorCode,
    message: string,
    retryAfterSeconds?: number,
    details?: DiscoveryErrorDetails
  ) {
    super(message);
    this.name = "DiscoveryError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
    this.details = details;
  }
}

export function discoveryErrorMessage(code: DiscoveryErrorCode): string {
  switch (code) {
    case "invalid_input":
      return "Check the location and try again.";
    case "unauthenticated":
      return "Sign in to continue.";
    case "not_found":
      return "Project not found.";
    case "missing_analysis":
      return "Analyze the room before finding products.";
    case "geocoding_disabled":
      return "Location search is temporarily unavailable.";
    case "geocoding_quota":
      return "Location search is at capacity. Try again later.";
    case "geocoding_denied":
      return "Location search was denied. Try again later.";
    case "geocoding_failed":
      return "Could not find that location. Try a fuller address.";
    case "places_failed":
      return "We couldn't load nearby businesses right now.";
    case "places_quota":
    case "places_rate_limited":
      return "Store search is temporarily unavailable. Try again later.";
    case "no_place_candidates":
    case "no_local_retailers":
      return "No suitable nearby stores were found within 50 km.";
    case "stores_found_but_filtered":
    case "no_valid_store_domains":
      return "We found nearby businesses but could not verify suitable retailer websites.";
    case "serp_quota":
      return "Product search is at capacity for today. Try again tomorrow.";
    case "serp_unconfigured":
    case "openai_unconfigured":
      return "Product search is not configured.";
    case "serp_failed":
      return "Could not search products. Try again.";
    case "search_interrupted":
      return "Product search was interrupted. Your previous results were kept.";
    case "discovery_budget_exhausted":
      return "Product search reached its request limit. Try again later.";
    case "discovery_timeout":
      return "We couldn't finish searching in time. Your project is safe — try again.";
    case "provider_timeout":
      return "We couldn't finish searching in time. Your project is safe — try again.";
    case "rate_limited":
      return "Please wait a moment before searching products again.";
    case "location_required":
      return "Save a search location before finding products.";
    case "location_invalid":
      return "That saved location is not valid. Enter the address again.";
    default:
      return "Could not find products. Try again.";
  }
}

export function discoveryRateLimitMessage(retryAfterSeconds: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  return `${discoveryErrorMessage("rate_limited")} Try again in ${seconds} seconds.`;
}

export function mapDiscoveryDbError(error: { message?: string; code?: string } | null): DiscoveryError {
  if (!error) return new DiscoveryError("failed", discoveryErrorMessage("failed"));
  const code = (error.code ?? "").toUpperCase();
  if (code === "PGRST116" || code === "42501" || code === "PGRST301") {
    return new DiscoveryError("not_found", discoveryErrorMessage("not_found"));
  }
  return new DiscoveryError("failed", discoveryErrorMessage("failed"));
}

export function logDiscoveryError(error: DiscoveryError, context: DiscoveryErrorDetails = {}): void {
  if (process.env.NODE_ENV === "production") return;
  console.error("[discovery-error]", {
    stage: context.stage ?? "unknown",
    errorCode: error.code,
    message: error.message,
    requirementKey: context.requirementKey,
    queryLevel: context.queryLevel,
    elapsedMs: context.elapsedMs,
    serpRequests: context.serpRequests ?? context.providerAttempts,
    providerAttempts: context.providerAttempts ?? context.serpRequests,
    providerStatus: context.providerStatus,
    canonicalError: context.canonicalError,
    canonicalDetails: context.canonicalDetails,
  });
}

export function logDiscoveryTiming(timing: {
  geocodeMs: number;
  placesMs: number;
  serpMs: number;
  persistMs: number;
  totalMs: number;
  serpRequests: number;
  cacheHits?: number;
  logicalQueries?: number;
  attemptId?: string;
  resultType?: string;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[discovery-timing]", timing);
}

export function logDiscoveryAttempt(event: {
  attemptId: string;
  phase: "started" | "completed" | "failed";
  resultType?: string;
  startedAt?: string;
  completedAt?: string;
  totalMs?: number;
  errorCode?: string;
  message?: string;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.info("[discovery-attempt]", event);
}
