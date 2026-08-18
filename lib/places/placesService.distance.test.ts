/**
 * Tests for distance calculation, radius filtering, and discarded tracking.
 * Nearby Search is mocked; Place Details is mocked so in-radius furniture stores
 * enter `stores[]` (`places[]` is always empty by design).
 *
 * Unique lat/lng per test: searchPlaces caches Nearby Search by rounded coordinates.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPlaces } from "./placesService";
import { resetPlacesDelay, setPlacesDelay } from "./runtime";

global.fetch = vi.fn();

const LJUBLJANA = { lat: 46.0569, lng: 14.5058 };

function nearbyResult(id: string, name: string, loc: { lat: number; lng: number }) {
  return {
    place_id: id,
    name,
    geometry: { location: loc },
    types: ["furniture_store", "store"],
    vicinity: name,
  };
}

function mockGoogle(nearbyResults: unknown[]) {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async (url: unknown) => {
    const u = String(url);
    if (u.includes("place/details")) {
      return {
        ok: true,
        json: async () => ({
          status: "OK",
          result: {
            name: "Merkur Velenje",
            website: "https://www.merkur.si/",
            types: ["furniture_store", "home_goods_store", "store", "point_of_interest"],
            formatted_address: "Velenje, Slovenia",
            geometry: { location: { lat: 46.3592, lng: 15.1103 } },
            rating: 4.2,
            user_ratings_total: 80,
          },
        }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        status: "OK",
        results: nearbyResults,
      }),
    };
  });
}

describe("Places Service - Distance Calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    setPlacesDelay(async () => {});
  });

  afterEach(() => {
    resetPlacesDelay();
  });

  it("should calculate distance correctly using haversine formula", async () => {
    const origin = { lat: 46.351, lng: 15.101 };
    mockGoogle([nearbyResult("ChIJDistCalc", "Merkur Velenje", origin)]);

    const result = await searchPlaces({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    });

    expect(result.places).toHaveLength(0);
    expect(result.stores.length).toBeGreaterThan(0);
    const store = result.stores[0];
    expect(store.distanceKm).toBeDefined();
    expect(typeof store.distanceKm).toBe("number");
    expect(store.distanceKm).toBeLessThan(0.1);
  });

  it("should include in-radius stores and discard out-of-radius nearby hits", async () => {
    const origin = { lat: 46.352, lng: 15.102 };
    mockGoogle([
      nearbyResult("ChIJInRadius", "Merkur Velenje", origin),
      nearbyResult("ChIJOutRadius", "Store in Ljubljana", LJUBLJANA),
    ]);

    const result = await searchPlaces({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    });

    expect(result.stores.some((s) => s.place_id === "ChIJInRadius")).toBe(true);
    expect(result.stores.some((s) => s.place_id === "ChIJOutRadius")).toBe(false);
    expect(result.meta.discardedOutOfRadius).toBeGreaterThan(0);
    expect(result.meta.filteredOutCount).toBeGreaterThan(0);
  });

  it("should exclude all stores when every nearby result is outside radius", async () => {
    const origin = { lat: 46.353, lng: 15.103 };
    mockGoogle([nearbyResult("ChIJOnlyLjubljana", "Store in Ljubljana", LJUBLJANA)]);

    const result = await searchPlaces({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    });

    expect(result.stores.length).toBe(0);
    expect(result.meta.discardedOutOfRadius).toBeGreaterThan(0);
    expect(result.meta.filteredOutCount).toBeGreaterThan(0);
  });

  it("should include numeric distance fields on stores", async () => {
    const origin = { lat: 46.354, lng: 15.104 };
    mockGoogle([nearbyResult("ChIJDistFields", "Merkur Velenje", origin)]);

    const result = await searchPlaces({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    });

    expect(result.stores.length).toBeGreaterThan(0);
    result.stores.forEach((store) => {
      expect(store.distanceKm).toBeDefined();
      expect(typeof store.distanceKm).toBe("number");
    });
  });

  it("should include filteredOutCount in meta when places are filtered", async () => {
    const origin = { lat: 46.355, lng: 15.105 };
    mockGoogle([
      nearbyResult("ChIJFilterLj", "Store in Ljubljana", LJUBLJANA),
      nearbyResult("ChIJFilterVe", "Merkur Velenje", origin),
    ]);

    const result = await searchPlaces({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    });

    expect(result.meta.filteredOutCount).toBeGreaterThan(0);
    expect(result.meta.executionNotes?.some((n) => n.includes("Post-filter removed"))).toBe(
      true
    );
  });

  it("should include usedLocation in meta", async () => {
    const origin = { lat: 46.356, lng: 15.106 };
    mockGoogle([]);

    const result = await searchPlaces({
      lat: origin.lat,
      lng: origin.lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    });

    expect(result.meta.usedLocation).toBeDefined();
    expect(result.meta.usedLocation?.lat).toBe(origin.lat);
    expect(result.meta.usedLocation?.lng).toBe(origin.lng);
  });
});
