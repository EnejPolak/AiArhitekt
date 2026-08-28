/**
 * Single-shot Google Geocoding client.
 * Never retries (quota / denied / malformed would only create more spend).
 */

import { googleGeocodeResponseSchema } from "@/lib/schemas/geocode";
import { GEOCODING_ERROR_CODES, type GeocodeFailure, type GeocodeSuccess } from "./types";

const GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const TIMEOUT_MS = 10_000;

export type GoogleGeocodeQuery =
  | { kind: "address"; address: string }
  | { kind: "latlng"; lat: number; lng: number };

function failure(code: GeocodeFailure["code"], message: string, httpStatus: number): GeocodeFailure {
  return { ok: false, code, message, httpStatus };
}

function mapGoogleStatus(status: string): GeocodeFailure | null {
  switch (status) {
    case "OK":
      return null;
    case "ZERO_RESULTS":
      return failure(
        GEOCODING_ERROR_CODES.NOT_FOUND,
        "Address not found.",
        404
      );
    case "OVER_QUERY_LIMIT":
      return failure(
        GEOCODING_ERROR_CODES.QUOTA_REACHED,
        "Geocoding request limit reached.",
        429
      );
    case "REQUEST_DENIED":
      return failure(
        GEOCODING_ERROR_CODES.REQUEST_DENIED,
        "Geocoding request was denied.",
        503
      );
    case "INVALID_REQUEST":
      return failure(
        GEOCODING_ERROR_CODES.INVALID_REQUEST,
        "Geocoding request was invalid.",
        400
      );
    default:
      return failure(
        GEOCODING_ERROR_CODES.ERROR,
        "Geocoding failed.",
        502
      );
  }
}

function extractCountryCode(result: {
  address_components?: Array<{ short_name?: string; types?: string[] }>;
}): string | null {
  const components = result.address_components;
  if (!Array.isArray(components)) return null;
  const country = components.find((component) => component.types?.includes("country"));
  const code = (country?.short_name ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

/**
 * Call Google Geocoding once. Caller must ensure the feature is enabled and an API key exists.
 * Does not retry. Does not include provider error_message in the result.
 */
export async function fetchGoogleGeocode(
  query: GoogleGeocodeQuery,
  apiKey: string,
  fetchFn: typeof fetch = fetch
): Promise<GeocodeSuccess | GeocodeFailure> {
  const params = new URLSearchParams({ key: apiKey });
  if (query.kind === "address") {
    params.set("address", query.address);
  } else {
    params.set("latlng", `${query.lat},${query.lng}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetchFn(`${GOOGLE_GEOCODE_URL}?${params.toString()}`, {
      signal: controller.signal,
      cache: "no-store",
    });

    if (response.status === 429) {
      return failure(
        GEOCODING_ERROR_CODES.QUOTA_REACHED,
        "Geocoding request limit reached.",
        429
      );
    }
    if (response.status === 403) {
      return failure(
        GEOCODING_ERROR_CODES.REQUEST_DENIED,
        "Geocoding request was denied.",
        503
      );
    }
    if (!response.ok) {
      return failure(GEOCODING_ERROR_CODES.ERROR, "Geocoding failed.", 502);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return failure(GEOCODING_ERROR_CODES.MALFORMED, "Geocoding failed.", 502);
    }

    const parsed = googleGeocodeResponseSchema.safeParse(json);
    if (!parsed.success) {
      return failure(GEOCODING_ERROR_CODES.MALFORMED, "Geocoding failed.", 502);
    }

    const statusFailure = mapGoogleStatus(parsed.data.status);
    if (statusFailure) return statusFailure;

    const first = parsed.data.results?.[0];
    const location = first?.geometry?.location;
    if (!first || !location || !first.formatted_address) {
      return failure(GEOCODING_ERROR_CODES.MALFORMED, "Geocoding failed.", 502);
    }

    return {
      ok: true,
      formattedAddress: first.formatted_address,
      lat: location.lat,
      lng: location.lng,
      countryCode: extractCountryCode(first),
    };
  } catch (error: unknown) {
    const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
    if (name === "AbortError") {
      return failure(
        GEOCODING_ERROR_CODES.TIMEOUT,
        "Geocoding request timed out.",
        504
      );
    }
    return failure(GEOCODING_ERROR_CODES.ERROR, "Geocoding failed.", 502);
  } finally {
    clearTimeout(timeout);
  }
}
