/**
 * Geocoding service: kill switch, normalized in-memory cache, one Google call per miss.
 * No persistent request counter (no database). Google Cloud quota is the hard cap.
 */

import { TTLCache } from "@/lib/cache";
import { fetchGoogleGeocode } from "./client";
import { getGeocodingConfig } from "./config";
import { normalizeGeocodeAddress, normalizeLatLng } from "./normalize";
import { GEOCODING_ERROR_CODES, type GeocodeResult, type GeocodeSuccess } from "./types";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const successCache = new TTLCache<GeocodeSuccess>(CACHE_TTL_MS);

export function clearGeocodeCache(): void {
  successCache.clear();
}

function disabledResult(): GeocodeResult {
  return {
    ok: false,
    code: GEOCODING_ERROR_CODES.DISABLED,
    message: "Google geocoding is disabled.",
    httpStatus: 503,
  };
}

function notConfigured(): GeocodeResult {
  return {
    ok: false,
    code: GEOCODING_ERROR_CODES.NOT_CONFIGURED,
    message: "Geocoding is not configured.",
    httpStatus: 503,
  };
}

function invalidAddress(): GeocodeResult {
  return {
    ok: false,
    code: GEOCODING_ERROR_CODES.INVALID_REQUEST,
    message: "address must be at least 3 characters",
    httpStatus: 400,
  };
}

export async function geocodeAddress(
  address: string,
  fetchFn: typeof fetch = fetch
): Promise<GeocodeResult> {
  const config = getGeocodingConfig();
  if (!config.enabled) return disabledResult();

  const normalized = normalizeGeocodeAddress(address);
  if (normalized.length < 3) return invalidAddress();

  const cached = successCache.get(normalized);
  if (cached) return cached;

  if (!config.apiKey) return notConfigured();

  const result = await fetchGoogleGeocode(
    { kind: "address", address: normalized },
    config.apiKey,
    fetchFn
  );
  if (result.ok) {
    successCache.set(normalized, result);
  }
  return result;
}

export async function reverseGeocode(
  lat: number,
  lng: number,
  fetchFn: typeof fetch = fetch
): Promise<GeocodeResult> {
  const config = getGeocodingConfig();
  if (!config.enabled) return disabledResult();

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return {
      ok: false,
      code: GEOCODING_ERROR_CODES.INVALID_REQUEST,
      message: "Invalid coordinates.",
      httpStatus: 400,
    };
  }

  const { lat: nLat, lng: nLng, key } = normalizeLatLng(lat, lng);
  const cached = successCache.get(key);
  if (cached) return cached;

  if (!config.apiKey) return notConfigured();

  const result = await fetchGoogleGeocode(
    { kind: "latlng", lat: nLat, lng: nLng },
    config.apiKey,
    fetchFn
  );
  if (result.ok) {
    successCache.set(key, result);
  }
  return result;
}
