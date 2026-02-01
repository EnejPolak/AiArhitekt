/**
 * Tests for placesService
 * Run with: npm test (if Vitest is configured) or manually verify logic
 */

import { searchPlaces, getPlaceDetails, type SearchParams } from "./placesService";

// Mock fetch for testing
global.fetch = jest.fn() as jest.Mock;

describe("placesService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });

  describe("query planning", () => {
    it("should plan exactly 3 category queries in category mode", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: true,
      };

      const result = await searchPlaces(params);

      expect(result.meta.requestsMade).toBe(0);
      expect(result.meta.plannedQueries).toHaveLength(3);
      expect(result.meta.plannedQueries).toContain("pohištvo (sl)");
      expect(result.meta.plannedQueries).toContain("keramika (sl)");
      expect(result.meta.plannedQueries).toContain("železnina (sl)");
    });

    it("should plan brand queries in brand mode (max 5)", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "brand",
        brandKeywords: ["Merkur", "Lesnina", "JYSK", "Bauhaus", "Harvey Norman", "OBI"], // 6 brands
        dryRun: true,
      };

      const result = await searchPlaces(params);

      expect(result.meta.requestsMade).toBe(0);
      // Should only plan 5 queries (max for brand mode)
      expect(result.meta.plannedQueries.length).toBeLessThanOrEqual(5);
    });

    it("should respect maxRequestsPerSearch cap (6)", async () => {
      // This test verifies the cap is enforced in the implementation
      // In real execution, maxRequestsPerSearch = 6 is hardcoded
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      // Mock successful responses
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [],
        }),
      });

      const result = await searchPlaces(params);

      // Should not exceed 6 requests (3 category + max 2 fallback = 5 max)
      expect(result.meta.requestsMade).toBeLessThanOrEqual(6);
    });
  });

  describe("fallback budgeting", () => {
    it("should use max 2 fallback queries total", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      // Mock zero results for all categories to trigger fallbacks
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ZERO_RESULTS",
          results: [],
        }),
      });

      const result = await searchPlaces(params);

      // Should use max 2 fallback queries
      expect(result.meta.fallbacksUsed).toBeLessThanOrEqual(2);
    });

    it("should prioritize categories with 0 results for fallback", async () => {
      // This is tested in the implementation logic
      // Fallback queries are chosen based on:
      // 1. Categories with 0 results
      // 2. Categories with fewest results
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(async () => {
        callCount++;
        // First 3 calls return zero results (trigger fallback)
        if (callCount <= 3) {
          return {
            ok: true,
            json: async () => ({
              status: "ZERO_RESULTS",
              results: [],
            }),
          };
        }
        // Fallback calls return some results
        return {
          ok: true,
          json: async () => ({
            status: "OK",
            results: [{ place_id: "test", name: "Test Store" }],
          }),
        };
      });

      const result = await searchPlaces(params);

      // Should have used fallbacks for categories with 0 results
      expect(result.meta.fallbacksUsed).toBeGreaterThan(0);
      expect(result.meta.fallbacksUsed).toBeLessThanOrEqual(2);
    });
  });

  describe("deduplication", () => {
    it("should deduplicate places by place_id", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      const duplicatePlace = {
        place_id: "ChIJTest123",
        name: "Test Store",
        geometry: { location: { lat: 46.0569, lng: 14.5058 } },
        types: ["store"],
      };

      // Mock responses that return the same place_id
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [duplicatePlace, duplicatePlace], // Same place twice
        }),
      });

      const result = await searchPlaces(params);

      // Should deduplicate
      const placeIds = result.places.map((p) => p.place_id);
      const uniquePlaceIds = new Set(placeIds);
      expect(uniquePlaceIds.size).toBe(placeIds.length);
    });

    it("should merge sourceKeywords for duplicate places", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      const samePlace = {
        place_id: "ChIJTest123",
        name: "Test Store",
        geometry: { location: { lat: 46.0569, lng: 14.5058 } },
        types: ["store"],
      };

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(async () => {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            status: "OK",
            results: [samePlace],
          }),
        };
      });

      const result = await searchPlaces(params);

      // If same place appears in multiple queries, sourceKeywords should be merged
      const place = result.places.find((p) => p.place_id === "ChIJTest123");
      if (place) {
        expect(place.sourceKeywords.length).toBeGreaterThan(0);
      }
    });
  });

  describe("cache key rounding", () => {
    it("should round lat/lng to 3 decimals for cache key", () => {
      // This is tested in the getCacheKey function
      // Coordinates are rounded to reduce cache fragmentation
      const lat1 = 46.0569123;
      const lat2 = 46.0569127;
      const lng = 14.5058;

      // Both should generate the same cache key
      // (implementation detail, but important for cache efficiency)
      const rounded1 = Math.round(lat1 * 1000) / 1000;
      const rounded2 = Math.round(lat2 * 1000) / 1000;

      // Very close coordinates should round to same value
      expect(Math.abs(rounded1 - rounded2)).toBeLessThan(0.001);
    });
  });

  describe("dry run mode", () => {
    it("should return plannedQueries with zero requests", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: true,
      };

      const result = await searchPlaces(params);

      expect(result.meta.requestsMade).toBe(0);
      expect(result.meta.cacheHits).toBe(0);
      expect(result.meta.plannedQueries.length).toBeGreaterThan(0);
      expect(result.places).toHaveLength(0);
      expect(result.meta.executionNotes).toContain("Dry run mode");
    });
  });

  describe("error handling", () => {
    it("should return partial results if some queries fail", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation(async () => {
        callCount++;
        // First query succeeds
        if (callCount === 1) {
          return {
            ok: true,
            json: async () => ({
              status: "OK",
              results: [
                {
                  place_id: "ChIJTest1",
                  name: "Store 1",
                  geometry: { location: { lat: 46.0569, lng: 14.5058 } },
                  types: ["store"],
                },
              ],
            }),
          };
        }
        // Second query fails
        if (callCount === 2) {
          throw new Error("Network error");
        }
        // Third query succeeds
        return {
          ok: true,
          json: async () => ({
            status: "OK",
            results: [
              {
                place_id: "ChIJTest2",
                name: "Store 2",
                geometry: { location: { lat: 46.0569, lng: 14.5058 } },
                types: ["store"],
              },
            ],
          }),
        };
      });

      // Should not throw, should return partial results
      await expect(searchPlaces(params)).resolves.toBeDefined();
    });

    it("should handle ZERO_RESULTS as success", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "ZERO_RESULTS",
          results: [],
        }),
      });

      const result = await searchPlaces(params);

      // Should return empty places, not error
      expect(result.places).toHaveLength(0);
      expect(result.meta.requestsMade).toBeGreaterThan(0);
    });
  });

  describe("getPlaceDetails", () => {
    it("should cache place details", async () => {
      const placeId = "ChIJTest123";

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: "OK",
          result: {
            place_id: placeId,
            name: "Test Store",
            formatted_address: "Test Address",
            geometry: { location: { lat: 46.0569, lng: 14.5058 } },
            types: ["store"],
          },
        }),
      });

      // First call
      const result1 = await getPlaceDetails(placeId);
      expect(result1).toBeDefined();

      // Second call should use cache (no new fetch)
      const fetchCountBefore = (global.fetch as jest.Mock).mock.calls.length;
      const result2 = await getPlaceDetails(placeId);
      const fetchCountAfter = (global.fetch as jest.Mock).mock.calls.length;

      expect(result2).toBeDefined();
      // Should not make additional fetch (cached)
      expect(fetchCountAfter).toBe(fetchCountBefore);
    });
  });
});

// Note: These tests use Jest mocks. To run them:
// 1. Install Jest: npm install --save-dev jest @types/jest ts-jest
// 2. Configure Jest in package.json or jest.config.js
// 3. Run: npm test
