import type { ProjectRoomAnalysisRow } from "@/lib/analysis/queries";
import { normalizeGeocodeAddress } from "@/lib/geocode/normalize";
import { searchLocationsMatch } from "@/lib/project-location/parse";
import { shoppingPreferencesMatch } from "./preferences";
import type { ProductDiscoveryView } from "./types";

export type DiscoverySearchContext = {
  locationInput?: string;
  latitude?: number;
  longitude?: number;
  radiusKm?: number;
  preferences?: unknown;
};

export function isDiscoveryAnalysisCurrent(
  discovery: ProductDiscoveryView,
  analysis: ProjectRoomAnalysisRow
): boolean {
  return (
    discovery.sourceAnalysisId === analysis.id &&
    discovery.sourceAnalysisUpdatedAt === analysis.updated_at
  );
}

function discoveryMatchesSearchLocation(
  discovery: ProductDiscoveryView,
  current: DiscoverySearchContext
): boolean {
  if (current.radiusKm !== undefined && discovery.radiusKm !== current.radiusKm) {
    return false;
  }
  if (
    typeof current.latitude === "number" &&
    typeof current.longitude === "number" &&
    Number.isFinite(current.latitude) &&
    Number.isFinite(current.longitude)
  ) {
    return searchLocationsMatch(
      {
        latitude: discovery.latitude,
        longitude: discovery.longitude,
        radiusKm: discovery.radiusKm,
      },
      {
        latitude: current.latitude,
        longitude: current.longitude,
        radiusKm: current.radiusKm ?? discovery.radiusKm,
      }
    );
  }
  if (current.locationInput !== undefined) {
    return (
      normalizeGeocodeAddress(discovery.locationInput) ===
      normalizeGeocodeAddress(current.locationInput)
    );
  }
  return true;
}

export function discoveryMatchesShoppingSource(
  discovery: ProductDiscoveryView,
  current: DiscoverySearchContext
): boolean {
  if (!discoveryMatchesSearchLocation(discovery, current)) return false;
  return shoppingPreferencesMatch(discovery.sourcePreferences, current.preferences);
}

export function isCurrentProductDiscovery(
  discovery: ProductDiscoveryView,
  analysis: ProjectRoomAnalysisRow,
  current?: DiscoverySearchContext
): boolean {
  if (!isDiscoveryAnalysisCurrent(discovery, analysis)) return false;
  if (!current) return true;
  return discoveryMatchesShoppingSource(discovery, current);
}
