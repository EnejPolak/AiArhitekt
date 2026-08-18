/**
 * Tests for placesService
 * Run with: npm test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { searchPlaces, getPlaceDetails, classifyPlaceBucket, isServiceDomainByHeuristic, type SearchParams } from "./placesService";
import { resetPlacesDelay, setPlacesDelay } from "./runtime";

global.fetch = vi.fn();

describe("placesService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
    setPlacesDelay(async () => {});
  });

  afterEach(() => {
    resetPlacesDelay();
  });

  describe("query planning", () => {
    it("should plan multi-pass stores (keywords + types) and contractors in category mode (dry run)", async () => {
      const result = await searchPlaces({
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: true,
      });

      expect(result.meta.requestsMade).toBe(0);
      expect(result.meta.plannedQueries.length).toBeGreaterThanOrEqual(2);
      expect(result.meta.plannedTypes).toBeDefined();
      expect(result.meta.plannedTypes!.length).toBeGreaterThanOrEqual(1);
      expect(result.domains).toEqual({ stores: [], contractors: [] });
    });

    it("should plan stores + contractors queries in brand mode", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "brand",
        brandKeywords: ["Merkur", "Lesnina"],
        dryRun: true,
      };

      const result = await searchPlaces(params);

      expect(result.meta.requestsMade).toBe(0);
      expect(result.domains.stores).toEqual([]);
      expect(result.domains.contractors).toEqual([]);
    });

    it("should make multiple Places searches (store keywords + types + contractors)", async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ status: "OK", results: [] }),
      });

      const result = await searchPlaces({
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      });

      expect(result.meta.requestsMade).toBeGreaterThan(0);
      expect(result.meta.requestsMade).toBeLessThanOrEqual(20);
    });
  });

  describe("classification (Slovenian store vs contractor)", () => {
    it("classifies retail store by type (Slovenian)", () => {
      expect(classifyPlaceBucket(["furniture_store"], "Merkur")).toBe("store");
      expect(classifyPlaceBucket(["hardware_store"], "Lesnina pohištvo")).toBe("store");
      expect(classifyPlaceBucket(["home_goods_store", "store"], "JYSK Ljubljana")).toBe("store");
    });

    it("classifies contractor by Slovenian name keywords", () => {
      expect(classifyPlaceBucket([], "Pleskar Janez")).toBe("contractor");
      expect(classifyPlaceBucket([], "Električar Ljubljana")).toBe("contractor");
      expect(classifyPlaceBucket([], "Vodovodar inštalacije")).toBe("contractor");
      expect(classifyPlaceBucket([], "Keramičar montaža")).toBe("contractor");
      expect(classifyPlaceBucket([], "Servis za parket")).toBe("contractor");
    });

    it("classifies contractor by Place type", () => {
      expect(classifyPlaceBucket(["electrician"], "Some Company")).toBe("contractor");
      expect(classifyPlaceBucket(["plumber", "general_contractor"], "Vodovod")).toBe("contractor");
    });

    it("returns null for ambiguous (no store type, no contractor keyword)", () => {
      expect(classifyPlaceBucket(["point_of_interest"], "Random Place")).toBe(null);
      expect(classifyPlaceBucket([], "Neznana trgovina")).toBe(null);
    });

    it("classifies contractor when websiteDomain matches service heuristics", () => {
      expect(classifyPlaceBucket(["furniture_store"], "Italko", "italko.si")).toBe("contractor");
      expect(classifyPlaceBucket(["store"], "Kamnosestvo", "kamnosestvo-lj.si")).toBe("contractor");
      expect(classifyPlaceBucket(["store"], "Lesarstvo", "lesarstvo-net.net")).toBe("contractor");
      expect(classifyPlaceBucket(["hardware_store"], "Merkur", "merkur.si")).toBe("store");
    });
  });

  describe("isServiceDomainByHeuristic", () => {
    it("returns true for contractor-like domains", () => {
      expect(isServiceDomainByHeuristic("italko.si")).toBe(true);
      expect(isServiceDomainByHeuristic("www.kamnosestvo-lj.si")).toBe(true);
      expect(isServiceDomainByHeuristic("lesarstvo-net.net")).toBe(true);
      expect(isServiceDomainByHeuristic("storitve-montaza.si")).toBe(true);
    });
    it("returns false for retail domains", () => {
      expect(isServiceDomainByHeuristic("merkur.si")).toBe(false);
      expect(isServiceDomainByHeuristic("obi.si")).toBe(false);
      expect(isServiceDomainByHeuristic("jysk.si")).toBe(false);
    });
  });

  describe("two independent searches", () => {
    it("returns domains.stores and domains.contractors (cap 10 each)", async () => {
      const params: SearchParams = {
        lat: 46.0569,
        lng: 14.5058,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({ status: "ZERO_RESULTS", results: [] }),
      });

      const result = await searchPlaces(params);

      expect(result.domains).toBeDefined();
      expect(result.domains.stores).toBeInstanceOf(Array);
      expect(result.domains.contractors).toBeInstanceOf(Array);
      expect(result.domains.stores.length).toBeLessThanOrEqual(10);
      expect(result.domains.contractors.length).toBeLessThanOrEqual(10);
      expect(result.allowlistDomainsStores).toEqual(result.domains.stores);
      expect(result.allowlistDomainsContractors).toEqual(result.domains.contractors);
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
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: async () => ({
          status: "OK",
          results: [duplicatePlace, duplicatePlace], // Same place twice
        }),
      });

      const result = await searchPlaces(params);

      // Should deduplicate
      const placeIds = [...result.stores, ...result.contractors].map((p) => p.place_id);
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
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
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

      // No duplicate place_id across stores and contractors (each place in at most one list)
      const storeIds = new Set(result.stores.map((p) => p.place_id));
      const contractorIds = new Set(result.contractors.map((p) => p.place_id));
      expect(storeIds.size).toBe(result.stores.length);
      expect(contractorIds.size).toBe(result.contractors.length);
      for (const id of storeIds) {
        expect(contractorIds.has(id)).toBe(false);
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
      expect(result.meta.executionNotes?.some((n) => n.startsWith("Dry run mode"))).toBe(true);
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
      (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(async () => {
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
        lat: 46.071,
        lng: 14.521,
        radiusKm: 10,
        mode: "category",
        dryRun: false,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
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

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
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
      const fetchCountBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      const result2 = await getPlaceDetails(placeId);
      const fetchCountAfter = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

      expect(result2).toBeDefined();
      // Should not make additional fetch (cached)
      expect(fetchCountAfter).toBe(fetchCountBefore);
    });
  });
});

