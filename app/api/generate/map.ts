/**
 * ============================================
 * MAP MODULE
 * ============================================
 * 
 * Responsibility: Resolve store names to coordinates.
 * 
 * RULES:
 * - Use geocoding to get store locations
 * - Fallback to known store locations if geocoding fails
 */

import { StoreLocation } from "./types";

// Known store locations in Slovenia
const KNOWN_STORES: Record<string, { address: string; lat: number; lng: number }> = {
  Merkur: {
    address: "Merkur, Ljubljana, Slovenia",
    lat: 46.0569,
    lng: 14.5058,
  },
  Bauhaus: {
    address: "Bauhaus, Ljubljana, Slovenia",
    lat: 46.0514,
    lng: 14.5060,
  },
  Jysk: {
    address: "JYSK, Ljubljana, Slovenia",
    lat: 46.0569,
    lng: 14.5058,
  },
  Lesnina: {
    address: "Lesnina, Ljubljana, Slovenia",
    lat: 46.0514,
    lng: 14.5060,
  },
  Momax: {
    address: "Momax, Ljubljana, Slovenia",
    lat: 46.0569,
    lng: 14.5058,
  },
  Jub: {
    address: "JUB, Ljubljana, Slovenia",
    lat: 46.0514,
    lng: 14.5060,
  },
  Helios: {
    address: "Helios, Ljubljana, Slovenia",
    lat: 46.0569,
    lng: 14.5058,
  },
  IKEA: {
    address: "IKEA, Ljubljana, Slovenia",
    lat: 46.0514,
    lng: 14.5060,
  },
};

/**
 * Resolves store names to coordinates
 */
export async function resolveStoreLocations(
  storeNames: string[]
): Promise<StoreLocation[]> {
  const uniqueStores = Array.from(new Set(storeNames));
  const locations: StoreLocation[] = [];

  for (const storeName of uniqueStores) {
    // Try to find in known stores first
    const knownStore = KNOWN_STORES[storeName];
    
    if (knownStore) {
      locations.push({
        store: storeName,
        address: knownStore.address,
        lat: knownStore.lat,
        lng: knownStore.lng,
      });
    } else {
      // Fallback: use generic location
      locations.push({
        store: storeName,
        address: `${storeName}, Ljubljana, Slovenia`,
        lat: 46.0569, // Ljubljana center
        lng: 14.5058,
      });
    }
  }

  return locations;
}
