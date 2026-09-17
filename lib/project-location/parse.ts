import { normalizeLatLng } from "@/lib/geocode/normalize";
import {
  DEFAULT_DISCOVERY_RADIUS_KM,
  MAX_DISCOVERY_RADIUS_KM,
  MAX_LOCATION_INPUT_LENGTH,
  MIN_DISCOVERY_RADIUS_KM,
  MIN_LOCATION_INPUT_LENGTH,
} from "@/lib/discovery/constants";

export type ProjectLocation = {
  locationInput: string;
  formattedAddress: string | null;
  latitude: number;
  longitude: number;
  radiusKm: number;
  countryCode: string | null;
};

export type ProjectLocationFields = {
  locationInput: string | null;
  formattedAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  radiusKm: number | null;
  countryCode: string | null;
};

export function clampSearchRadiusKm(value: number | undefined | null): number {
  const n = Number.isFinite(value) ? Math.round(Number(value)) : DEFAULT_DISCOVERY_RADIUS_KM;
  return Math.min(MAX_DISCOVERY_RADIUS_KM, Math.max(MIN_DISCOVERY_RADIUS_KM, n));
}

export function isValidSearchCoordinate(lat: unknown, lng: unknown): boolean {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function normalizeCountryCode(value: string | null | undefined): string | null {
  const code = (value ?? "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function normalizeLocationInput(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
  if (trimmed.length < MIN_LOCATION_INPUT_LENGTH || trimmed.length > MAX_LOCATION_INPUT_LENGTH) {
    return null;
  }
  return trimmed;
}

export function parseProjectLocation(
  row: Partial<ProjectLocationFields> | null | undefined
): ProjectLocation | null {
  if (!row) return null;
  const locationInput = normalizeLocationInput(row.locationInput);
  if (!locationInput) return null;
  if (!isValidSearchCoordinate(row.latitude, row.longitude)) return null;
  const radiusKm = clampSearchRadiusKm(row.radiusKm);
  const formatted = normalizeLocationInput(row.formattedAddress) ?? locationInput;
  return {
    locationInput,
    formattedAddress: formatted,
    latitude: row.latitude as number,
    longitude: row.longitude as number,
    radiusKm,
    countryCode: normalizeCountryCode(row.countryCode),
  };
}

export function projectLocationLabel(location: ProjectLocation): string {
  return location.formattedAddress || location.locationInput;
}

export function searchLocationsMatch(
  stored: { latitude: number; longitude: number; radiusKm: number },
  current: { latitude: number; longitude: number; radiusKm: number }
): boolean {
  if (stored.radiusKm !== current.radiusKm) return false;
  return (
    normalizeLatLng(stored.latitude, stored.longitude).key ===
    normalizeLatLng(current.latitude, current.longitude).key
  );
}
