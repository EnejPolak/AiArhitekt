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
  | "serp_failed"
  | "rate_limited"
  | "failed";

export class DiscoveryError extends Error {
  readonly code: DiscoveryErrorCode;
  readonly retryAfterSeconds?: number;

  constructor(code: DiscoveryErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = "DiscoveryError";
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
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
      return "Store search is temporarily unavailable. Try again later.";
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
      return "Product search is not configured.";
    case "serp_failed":
      return "Could not search products. Try again.";
    case "rate_limited":
      return "Please wait a moment before searching products again.";
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
