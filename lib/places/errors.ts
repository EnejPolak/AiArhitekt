/**
 * Structured Places (D) failures. User-facing copy lives in discovery errors.
 * Do not leak provider internals into UI.
 */

export const PLACES_ERROR_CODES = {
  PLACES_PROVIDER_ERROR: "PLACES_PROVIDER_ERROR",
  PLACES_QUOTA_EXCEEDED: "PLACES_QUOTA_EXCEEDED",
  PLACES_RATE_LIMITED: "PLACES_RATE_LIMITED",
  NO_PLACES_CANDIDATES: "NO_PLACES_CANDIDATES",
  STORES_FOUND_BUT_FILTERED: "STORES_FOUND_BUT_FILTERED",
  NO_VALID_STORE_DOMAINS: "NO_VALID_STORE_DOMAINS",
} as const;

export type PlacesErrorCode = (typeof PLACES_ERROR_CODES)[keyof typeof PLACES_ERROR_CODES];

export type PlacesQuotaCode = typeof PLACES_ERROR_CODES.PLACES_QUOTA_EXCEEDED;
export type PlacesProviderCode = typeof PLACES_ERROR_CODES.PLACES_PROVIDER_ERROR;
export type PlacesEmptyOutcome =
  | typeof PLACES_ERROR_CODES.NO_PLACES_CANDIDATES
  | typeof PLACES_ERROR_CODES.STORES_FOUND_BUT_FILTERED
  | typeof PLACES_ERROR_CODES.NO_VALID_STORE_DOMAINS;

export type PlacesOutcome = "OK" | PlacesEmptyOutcome;

export class PlacesError extends Error {
  readonly code: PlacesErrorCode;
  readonly httpStatus?: number;
  readonly providerStatus?: string;

  constructor(
    code: PlacesErrorCode,
    message: string,
    extras?: { httpStatus?: number; providerStatus?: string }
  ) {
    super(message);
    this.name = "PlacesError";
    this.code = code;
    this.httpStatus = extras?.httpStatus;
    this.providerStatus = extras?.providerStatus;
  }
}

export function isPlacesQuotaStatus(httpStatus?: number, providerStatus?: string): boolean {
  const status = (providerStatus ?? "").toUpperCase();
  return status === "OVER_QUERY_LIMIT" || status === "RESOURCE_EXHAUSTED";
}

export function isPlacesRateLimitedStatus(httpStatus?: number, providerStatus?: string): boolean {
  const status = (providerStatus ?? "").toUpperCase();
  return httpStatus === 429 || status === "RATE_LIMIT_EXCEEDED";
}

export function placesErrorFromHttp(
  httpStatus: number,
  providerStatus?: string
): PlacesError {
  if (isPlacesQuotaStatus(httpStatus, providerStatus)) {
    return new PlacesError(PLACES_ERROR_CODES.PLACES_QUOTA_EXCEEDED, "Places quota exceeded", {
      httpStatus,
      providerStatus,
    });
  }
  if (isPlacesRateLimitedStatus(httpStatus, providerStatus)) {
    return new PlacesError(PLACES_ERROR_CODES.PLACES_RATE_LIMITED, "Places rate limited", {
      httpStatus,
      providerStatus,
    });
  }
  return new PlacesError(PLACES_ERROR_CODES.PLACES_PROVIDER_ERROR, "Places provider error", {
    httpStatus,
    providerStatus,
  });
}
