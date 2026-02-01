/**
 * Tests for distance filtering in placesService
 */

import { searchPlaces, type SearchParams } from "./placesService";
import { haversineDistanceKm } from "@/lib/geo/haversine";

// Mock fetch
global.fetch = jest.fn() as jest.Mock;

describe("placesService distance filtering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    (process.env as Record<string, string>).NODE_ENV = "test";
  });

  it("should filter out places outside radius (Ljubljana from Velenje)", async () => {
    // Velenje coordinates
    const velenjeLat = 46.3592;
    const velenjeLng = 15.1103;

    // Ljubljana coordinates (outside 50km radius)
    const ljubljanaLat = 46.0569;
    const ljubljanaLng = 14.5058;

    const distance = haversineDistanceKm(velenjeLat, velenjeLng, ljubljanaLat, ljubljanaLng);
    expect(distance).toBeGreaterThan(50); // Verify Ljubljana is indeed outside 50km

    const params: SearchParams = {
      lat: velenjeLat,
      lng: velenjeLng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    };

    // Mock Google response with Ljubljana place
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            place_id: "ChIJLjubljana",
            name: "Store in Ljubljana",
            geometry: { location: { lat: ljubljanaLat, lng: ljubljanaLng } },
            types: ["store"],
            vicinity: "Ljubljana",
          },
          {
            place_id: "ChIJVelenje",
            name: "Store in Velenje",
            geometry: { location: { lat: velenjeLat, lng: velenjeLng } },
            types: ["store"],
            vicinity: "Velenje",
          },
        ],
      }),
    });

    const result = await searchPlaces(params);

    // Ljubljana should be filtered out
    const ljubljanaPlace = result.places.find((p) => p.place_id === "ChIJLjubljana");
    expect(ljubljanaPlace).toBeUndefined();

    // Velenje place should remain (distance = 0)
    const velenjePlace = result.places.find((p) => p.place_id === "ChIJVelenje");
    expect(velenjePlace).toBeDefined();
    expect(velenjePlace?.distanceMeters).toBe(0);
  });

  it("should keep places within radius (10km from Velenje)", async () => {
    const velenjeLat = 46.3592;
    const velenjeLng = 15.1103;

    // Point approximately 10km away
    const nearbyLat = 46.3592 + 0.09; // ~10km north
    const nearbyLng = 15.1103;

    const params: SearchParams = {
      lat: velenjeLat,
      lng: velenjeLng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            place_id: "ChIJNearby",
            name: "Store nearby",
            geometry: { location: { lat: nearbyLat, lng: nearbyLng } },
            types: ["store"],
            vicinity: "Near Velenje",
          },
        ],
      }),
    });

    const result = await searchPlaces(params);

    // Nearby place should remain
    const nearbyPlace = result.places.find((p) => p.place_id === "ChIJNearby");
    expect(nearbyPlace).toBeDefined();
    expect(nearbyPlace?.distanceMeters).toBeLessThanOrEqual(50 * 1000);
    expect(nearbyPlace?.distanceKm).toBeLessThanOrEqual(50);
  });

  it("should include distanceMeters and distanceKm in response", async () => {
    const lat = 46.3592;
    const lng = 15.1103;

    const params: SearchParams = {
      lat,
      lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            place_id: "ChIJTest",
            name: "Test Store",
            geometry: { location: { lat: lat + 0.01, lng: lng } },
            types: ["store"],
            vicinity: "Test",
          },
        ],
      }),
    });

    const result = await searchPlaces(params);

    expect(result.places.length).toBeGreaterThan(0);
    result.places.forEach((place) => {
      expect(place.distanceMeters).toBeDefined();
      expect(place.distanceKm).toBeDefined();
      expect(typeof place.distanceMeters).toBe("number");
      expect(typeof place.distanceKm).toBe("number");
    });
  });

  it("should include filteredOutCount in meta when places are filtered", async () => {
    const velenjeLat = 46.3592;
    const velenjeLng = 15.1103;
    const ljubljanaLat = 46.0569;
    const ljubljanaLng = 14.5058;

    const params: SearchParams = {
      lat: velenjeLat,
      lng: velenjeLng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            place_id: "ChIJLjubljana",
            name: "Store in Ljubljana",
            geometry: { location: { lat: ljubljanaLat, lng: ljubljanaLng } },
            types: ["store"],
            vicinity: "Ljubljana",
          },
          {
            place_id: "ChIJVelenje",
            name: "Store in Velenje",
            geometry: { location: { lat: velenjeLat, lng: velenjeLng } },
            types: ["store"],
            vicinity: "Velenje",
          },
        ],
      }),
    });

    const result = await searchPlaces(params);

    // Should have filtered out at least Ljubljana
    expect(result.meta.filteredOutCount).toBeGreaterThan(0);
    expect(
      result.meta.executionNotes?.some((n) => n.includes("Post-filter removed"))
    ).toBe(true);
  });

  it("should include usedLocation in meta", async () => {
    const lat = 46.3592;
    const lng = 15.1103;

    const params: SearchParams = {
      lat,
      lng,
      radiusKm: 50,
      mode: "category",
      dryRun: false,
    };

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [],
      }),
    });

    const result = await searchPlaces(params);

    expect(result.meta.usedLocation).toBeDefined();
    expect(result.meta.usedLocation?.lat).toBe(lat);
    expect(result.meta.usedLocation?.lng).toBe(lng);
  });
});
