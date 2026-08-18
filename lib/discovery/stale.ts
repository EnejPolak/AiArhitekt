import type { ProjectRoomAnalysisRow } from "@/lib/analysis/queries";
import { normalizeGeocodeAddress } from "@/lib/geocode/normalize";
import { shoppingPreferencesMatch } from "./preferences";
import type { ProductDiscoveryView } from "./types";

export function isDiscoveryAnalysisCurrent(
  discovery: ProductDiscoveryView,
  analysis: ProjectRoomAnalysisRow
): boolean {
  return (
    discovery.sourceAnalysisId === analysis.id &&
    discovery.sourceAnalysisUpdatedAt === analysis.updated_at
  );
}

export function discoveryMatchesShoppingSource(
  discovery: ProductDiscoveryView,
  current: { locationInput: string; preferences?: unknown }
): boolean {
  if (
    normalizeGeocodeAddress(discovery.locationInput) !==
    normalizeGeocodeAddress(current.locationInput)
  ) {
    return false;
  }
  return shoppingPreferencesMatch(discovery.sourcePreferences, current.preferences);
}

export function isCurrentProductDiscovery(
  discovery: ProductDiscoveryView,
  analysis: ProjectRoomAnalysisRow,
  current?: {
    locationInput?: string;
    preferences?: unknown;
  }
): boolean {
  if (!isDiscoveryAnalysisCurrent(discovery, analysis)) return false;
  if (current?.locationInput !== undefined) {
    if (
      normalizeGeocodeAddress(discovery.locationInput) !==
      normalizeGeocodeAddress(current.locationInput)
    ) {
      return false;
    }
  }
  if (current && "preferences" in current) {
    if (!shoppingPreferencesMatch(discovery.sourcePreferences, current.preferences)) {
      return false;
    }
  }
  return true;
}
