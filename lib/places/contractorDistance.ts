import { haversineDistanceKm } from "@/lib/geo/haversine";
import { clampSearchRadiusKm, isValidSearchCoordinate } from "@/lib/project-location/parse";

/**
 * Places Text Search treats location/radius as a bias, not a hard fence.
 * Contractor results are therefore distance-filtered here against the
 * persisted project coordinates. Store-domain discovery is unchanged.
 *
 * Missing / invalid coordinates: excluded. Distance is never inferred
 * from address text.
 */
export const CONTRACTOR_RADIUS_TOLERANCE_KM = 2;
export const CONTRACTOR_RADIUS_TOLERANCE_RATIO = 0.1;

export type GeoPoint = {
  lat: number;
  lng: number;
};

export function contractorDistanceLimitKm(radiusKm: number): number {
  const radius = clampSearchRadiusKm(radiusKm);
  return radius + Math.max(CONTRACTOR_RADIUS_TOLERANCE_KM, radius * CONTRACTOR_RADIUS_TOLERANCE_RATIO);
}

export function readPlaceCoordinates(place: unknown): GeoPoint | null {
  if (!place || typeof place !== "object") return null;
  const record = place as {
    geometry?: { location?: { lat?: unknown; lng?: unknown } };
    location?: { lat?: unknown; lng?: unknown };
    lat?: unknown;
    lng?: unknown;
  };
  const loc = record.geometry?.location ?? record.location ?? record;
  const lat = typeof loc.lat === "number" ? loc.lat : Number(loc.lat);
  const lng = typeof loc.lng === "number" ? loc.lng : Number(loc.lng);
  if (!isValidSearchCoordinate(lat, lng)) return null;
  return { lat, lng };
}

export function contractorDistanceKm(origin: GeoPoint, point: GeoPoint | null): number | null {
  if (!isValidSearchCoordinate(origin.lat, origin.lng)) return null;
  if (!point || !isValidSearchCoordinate(point.lat, point.lng)) return null;
  return haversineDistanceKm(origin.lat, origin.lng, point.lat, point.lng);
}

export function isContractorWithinRequestedRadius(
  origin: GeoPoint,
  point: GeoPoint | null,
  radiusKm: number
): boolean {
  const distanceKm = contractorDistanceKm(origin, point);
  if (distanceKm == null) return false;
  return distanceKm <= contractorDistanceLimitKm(radiusKm);
}

export function filterContractorsByRequestedRadius<T>(
  items: T[],
  origin: GeoPoint,
  radiusKm: number,
  coordinatesOf: (item: T) => GeoPoint | null
): T[] {
  return items.filter((item) => isContractorWithinRequestedRadius(origin, coordinatesOf(item), radiusKm));
}
