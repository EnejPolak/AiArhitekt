import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { runCanonicalSerpSearch } from "@/lib/serp/search";
import { runOpenAIProductDiscovery } from "@/lib/productDiscovery/search";
import { discoverProjectProducts } from "./discover";
import { loadReusableRoomAnalysis } from "@/lib/analysis/analyze";
import { claimProductDiscoverySlot } from "./claim";
import { persistProductDiscoveryResult, getProjectProductDiscovery } from "./queries";
import { shoppingPreferenceHash } from "./preferenceHash";

vi.mock("@/lib/serp/search", () => ({
  runCanonicalSerpSearch: vi.fn(async () => {
    throw new Error("SERPAPI should not run on the customer path");
  }),
}));

vi.mock("@/lib/productDiscovery/search", () => ({
  runOpenAIProductDiscovery: vi.fn(),
}));

vi.mock("@/lib/analysis/analyze", () => ({
  loadReusableRoomAnalysis: vi.fn(),
}));

vi.mock("./claim", () => ({
  claimProductDiscoverySlot: vi.fn(async () => undefined),
}));

vi.mock("./queries", () => ({
  getProjectProductDiscovery: vi.fn(async () => null),
  getProjectProductSelections: vi.fn(async () => []),
  deleteProjectProductDiscovery: vi.fn(async () => undefined),
  persistProductDiscoveryResult: vi.fn(),
}));

const runOpenAIProductDiscoveryMock = vi.mocked(runOpenAIProductDiscovery);
const runCanonicalSerpSearchMock = vi.mocked(runCanonicalSerpSearch);
const loadReusableRoomAnalysisMock = vi.mocked(loadReusableRoomAnalysis);
const persistMock = vi.mocked(persistProductDiscoveryResult);
const getDiscoveryMock = vi.mocked(getProjectProductDiscovery);

const projectId = randomUUID();
const analysisId = randomUUID();
const discoveryId = randomUUID();

function analysis() {
  return {
    id: analysisId,
    project_id: projectId,
    source_upload_id: randomUUID(),
    source_storage_path: "room.jpg",
    schema_version: 2,
    provider: "openai",
    model: "test",
    analysis: { roomType: "living-room" },
    updated_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    design_requirements: {
      furnitureNeeds: [
        { category: "desk", quantity: 1, placementNotes: null, constraints: ["computer desk"] },
        { category: "chair", quantity: 1, placementNotes: null, constraints: ["office chair"] },
      ],
      materialNeeds: [],
      constraints: [],
      preserve: [],
      replaceOrRemove: [],
    },
  };
}

describe("customer discovery engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getDiscoveryMock.mockResolvedValue(null);
    loadReusableRoomAnalysisMock.mockResolvedValue(analysis() as never);
    persistMock.mockImplementation(async (_client, _owner, input) => ({
      discovery: {
        id: discoveryId,
        projectId,
        sourceAnalysisId: analysisId,
        sourceAnalysisUpdatedAt: analysis().updated_at,
        locationInput: "Ljubljana",
        latitude: 46.05,
        longitude: 14.5,
        radiusKm: 50,
        searchedItemCount: input.searchedItemCount,
        notSearchedCount: input.notSearchedCount,
        allowlistDomains: input.allowlistDomains,
        unmatchedRequirements: input.unmatchedRequirements,
        sourcePreferences: {},
        sourcePreferencesHash: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      selections: input.selections.map((selection, index) => ({
        id: randomUUID(),
        projectId,
        discoveryId,
        requirementType: selection.requirementType,
        requirementKey: selection.requirementKey,
        requirementSnapshot: selection.requirementSnapshot,
        itemSpec: selection.itemSpec,
        productTitle: selection.product.productTitle,
        productUrl: selection.product.productUrl,
        productImageUrl: selection.product.productImageUrl,
        price: selection.product.price,
        currency: selection.product.currency,
        retailerDomain: selection.product.retailerDomain,
        retailerName: selection.product.retailerName,
        hasReferenceImage: selection.product.hasReferenceImage,
        isConfirmed: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      reused: false,
    }));
  });

  it("invokes OpenAI Step C with Places allowlist and does not call SerpAPI", async () => {
    runOpenAIProductDiscoveryMock.mockImplementation(async (input) => {
      expect(input.allowlistDomains).toEqual(["localhome.si"]);
      expect(input.fastMode).toBeUndefined();
      expect(input.maxRequests).toBeUndefined();
      expect(JSON.stringify(input)).not.toMatch(/merkur|bauhaus|obi|lesnina/i);
      return {
        ok: true,
        response: {
          dryRun: false,
          plannedQueries: {},
          plannedTotalQueries: input.items.length,
          effectiveMaxRequests: input.items.length,
          executedCount: input.items.length,
          dailyUsed: 0,
          dailyRemaining: 0,
          status: 200,
          results: input.items.map((item, index) =>
            index === 0
              ? {
                  item,
                  topCandidates: [],
                  picked: {
                    title: "Desk",
                    url: "https://www.localhome.si/p/desk",
                    image: "https://cdn.localhome.si/desk.jpg",
                    price: 199,
                    currency: "EUR",
                    score: 80,
                    confidence: 0.8,
                    reasons: ["desk"],
                    domain: "localhome.si",
                    snippet: null,
                  },
                }
              : { item, topCandidates: [], picked: null }
          ),
        },
      };
    });

    const result = await discoverProjectProducts(
      {} as never,
      projectId,
      "Ljubljana",
      {
        ownerUserId: randomUUID(),
        persistClient: {} as never,
        geocodeAddress: async () => ({
          ok: true,
          formattedAddress: "Ljubljana",
          lat: 46.05,
          lng: 14.5,
          countryCode: "SI",
        }),
        searchPlaces: async () =>
          ({
            stores: [
              {
                name: "Local Home Store",
                place_id: "place-1",
                website: "https://www.localhome.si",
                websiteDomain: "localhome.si",
                categoryBucket: "store",
                types: ["furniture_store"],
                qualityFlags: {
                  officialSite: true,
                  hasCatalogSignal: true,
                  isDirectoryOrSocial: false,
                  isAggregator: false,
                },
              },
            ],
            contractors: [],
            domains: { stores: ["localhome.si"], contractors: [] },
            allowlistDomainsStores: ["localhome.si"],
            allowlistDomainsContractors: [],
            status: 200,
            outcome: "OK",
            meta: { radiusMeters: 50000, requestsMade: 0, cacheHits: 0, fallbacksUsed: 0 },
            places: [],
          }) as never,
      }
    );

    expect(runOpenAIProductDiscoveryMock).toHaveBeenCalledTimes(2);
    expect(runOpenAIProductDiscoveryMock.mock.calls[1]?.[0]?.items).toHaveLength(1);
    expect(runCanonicalSerpSearchMock).not.toHaveBeenCalled();
    expect(result.selections).toHaveLength(1);
    expect(result.discovery.unmatchedRequirements.some((item) => item.reason === "no_valid_product")).toBe(
      true
    );
    expect(result.discovery.allowlistDomains).toEqual(["localhome.si"]);
    expect(claimProductDiscoverySlot).toHaveBeenCalled();
    expect(runOpenAIProductDiscoveryMock.mock.calls[0]?.[0]?.marketContext).toEqual({
      countryCode: "SI",
      formattedLocation: "Ljubljana",
      merchantDomains: ["localhome.si"],
    });
  });

  it("passes the live 2E product list to Step C with SI market context", async () => {
    const liveNotes = [
      "Keep my current sofa. Keep my current chair. Keep my current desk. Keep my current bed. Keep my current wardrobe.",
      "Need only these three products:",
      "1. black floor lamp, metal, max 150 EUR",
      "2. light-colored ceramic decorative vase, around 30 cm, max 60 EUR",
      "3. neutral living-room rug, approximately 160x230 cm, max 250 EUR",
    ].join(" ");
    loadReusableRoomAnalysisMock.mockResolvedValue({
      ...analysis(),
      design_requirements: {
        furnitureNeeds: [],
        materialNeeds: [],
        constraints: [],
        preserve: [],
        replaceOrRemove: [],
      },
    } as never);
    runOpenAIProductDiscoveryMock.mockImplementation(async (input) => ({
      ok: true as const,
      response: {
        dryRun: false,
        plannedQueries: {},
        plannedTotalQueries: input.items.length,
        effectiveMaxRequests: input.items.length,
        executedCount: input.items.length,
        dailyUsed: 0,
        dailyRemaining: 0,
        status: 200,
        results: input.items.map((item) => ({ item, topCandidates: [], picked: null })),
      },
    }));

    await discoverProjectProducts({} as never, projectId, "", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      preferences: { notes: liveNotes, flooring: "keep" },
      projectLocation: {
        locationInput: "Ljubljana",
        formattedAddress: "Ljubljana, Slovenia",
        latitude: 46.0569,
        longitude: 14.5058,
        radiusKm: 25,
        countryCode: "SI",
      },
      geocodeAddress: vi.fn(),
      searchPlaces: async () =>
        ({
          stores: [
            {
              name: "Local Home Store",
              place_id: "place-1",
              website: "https://www.localhome.si",
              websiteDomain: "localhome.si",
              categoryBucket: "store",
              types: ["furniture_store"],
              qualityFlags: {
                officialSite: true,
                hasCatalogSignal: true,
                isDirectoryOrSocial: false,
                isAggregator: false,
              },
            },
          ],
          contractors: [],
          domains: { stores: ["localhome.si"], contractors: [] },
          allowlistDomainsStores: ["localhome.si"],
          allowlistDomainsContractors: [],
          status: 200,
          outcome: "OK",
          meta: { radiusMeters: 25000, requestsMade: 0, cacheHits: 0, fallbacksUsed: 0 },
          places: [],
        }) as never,
    });

    expect(runOpenAIProductDiscoveryMock).toHaveBeenCalledTimes(4);
    const stepC = runOpenAIProductDiscoveryMock.mock.calls[0]?.[0];
    expect(stepC?.items).toHaveLength(3);
    expect(
      runOpenAIProductDiscoveryMock.mock.calls.slice(1).every((call) => call[0]?.items.length === 1)
    ).toBe(true);
    expect(stepC?.items.join(" ")).toMatch(/floor lamp|stoje[cč]a svetilka/i);
    expect(stepC?.items.join(" ")).toMatch(/vase/i);
    expect(stepC?.items.join(" ")).toMatch(/rug/i);
    expect(stepC?.items.join(" ")).not.toMatch(/ceiling|stropn|pendant/i);
    expect(stepC?.marketContext).toEqual({
      countryCode: "SI",
      formattedLocation: "Ljubljana, Slovenia",
      merchantDomains: ["localhome.si"],
    });
  });

  it("persists all-not-found without treating it as infrastructure failure", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: {},
        plannedTotalQueries: 2,
        effectiveMaxRequests: 2,
        executedCount: 2,
        dailyUsed: 0,
        dailyRemaining: 0,
        status: 200,
        results: [
          { item: "a", topCandidates: [], picked: null },
          { item: "b", topCandidates: [], picked: null },
        ],
      },
    });

    const result = await discoverProjectProducts({} as never, projectId, "Ljubljana", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      geocodeAddress: async () => ({
        ok: true,
        formattedAddress: "Ljubljana",
        lat: 46.05,
        lng: 14.5,
        countryCode: "SI",
      }),
      searchPlaces: async () =>
        ({
          stores: [
            {
              name: "Local Home Store",
              place_id: "place-1",
              website: "https://www.localhome.si",
              websiteDomain: "localhome.si",
              categoryBucket: "store",
              types: ["furniture_store"],
              qualityFlags: {
                officialSite: true,
                hasCatalogSignal: true,
                isDirectoryOrSocial: false,
                isAggregator: false,
              },
            },
          ],
          contractors: [],
          domains: { stores: ["localhome.si"], contractors: [] },
          allowlistDomainsStores: ["localhome.si"],
          allowlistDomainsContractors: [],
          status: 200,
          outcome: "OK",
          meta: { radiusMeters: 50000, requestsMade: 0, cacheHits: 0, fallbacksUsed: 0 },
          places: [],
        }) as never,
    });

    expect(result.selections).toHaveLength(0);
    expect(result.discovery.unmatchedRequirements.length).toBeGreaterThan(0);
    expect(runCanonicalSerpSearchMock).not.toHaveBeenCalled();
  });

  it("uses persisted coordinates and does not geocode again", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: {},
        plannedTotalQueries: 1,
        effectiveMaxRequests: 1,
        executedCount: 1,
        dailyUsed: 0,
        dailyRemaining: 0,
        status: 200,
        results: [{ item: "desk", topCandidates: [], picked: null }],
      },
    });
    const geocodeAddress = vi.fn();
    const searchPlaces = vi.fn(async (input: { lat: number; lng: number; radiusKm: number }) => {
      expect(input.lat).toBe(46.2358);
      expect(input.lng).toBe(15.2677);
      expect(input.radiusKm).toBe(25);
      return {
        stores: [
          {
            name: "Local Home Store",
            place_id: "place-1",
            website: "https://www.localhome.si",
            websiteDomain: "localhome.si",
            categoryBucket: "store",
            types: ["furniture_store"],
            qualityFlags: {
              officialSite: true,
              hasCatalogSignal: true,
              isDirectoryOrSocial: false,
              isAggregator: false,
            },
          },
        ],
        contractors: [],
        domains: { stores: ["localhome.si"], contractors: [] },
        allowlistDomainsStores: ["localhome.si"],
        allowlistDomainsContractors: [],
        status: 200,
        outcome: "OK",
        meta: { radiusMeters: 25000, requestsMade: 0, cacheHits: 0, fallbacksUsed: 0 },
        places: [],
      } as never;
    });

    await discoverProjectProducts({} as never, projectId, "ignored", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      projectLocation: {
        locationInput: "Celje",
        formattedAddress: "Celje, Slovenia",
        latitude: 46.2358,
        longitude: 15.2677,
        radiusKm: 25,
        countryCode: "SI",
      },
      geocodeAddress,
      searchPlaces,
    });

    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(runOpenAIProductDiscoveryMock.mock.calls[0]?.[0]?.marketContext).toEqual({
      countryCode: "SI",
      formattedLocation: "Celje, Slovenia",
      merchantDomains: ["localhome.si"],
    });
  });

  it("geocodes once for a legacy address without coords and persists the result", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: {},
        plannedTotalQueries: 1,
        effectiveMaxRequests: 1,
        executedCount: 1,
        dailyUsed: 0,
        dailyRemaining: 0,
        status: 200,
        results: [{ item: "desk", topCandidates: [], picked: null }],
      },
    });
    const geocodeAddress = vi.fn(async () => ({
      ok: true as const,
      formattedAddress: "Celje, Slovenia",
      lat: 46.2358,
      lng: 15.2677,
      countryCode: "SI",
    }));
    const persistResolvedLocation = vi.fn(async () => undefined);
    const searchPlaces = vi.fn(async () => ({
      stores: [
        {
          name: "Local Home Store",
          place_id: "place-1",
          website: "https://www.localhome.si",
          websiteDomain: "localhome.si",
          categoryBucket: "store",
          types: ["furniture_store"],
          qualityFlags: {
            officialSite: true,
            hasCatalogSignal: true,
            isDirectoryOrSocial: false,
            isAggregator: false,
          },
        },
      ],
      contractors: [],
      domains: { stores: ["localhome.si"], contractors: [] },
      allowlistDomainsStores: ["localhome.si"],
      allowlistDomainsContractors: [],
      status: 200,
      outcome: "OK",
      meta: { radiusMeters: 50000, requestsMade: 0, cacheHits: 0, fallbacksUsed: 0 },
      places: [],
    }) as never);

    await discoverProjectProducts({} as never, projectId, "Celje", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      geocodeAddress,
      persistResolvedLocation,
      searchPlaces,
    });

    expect(geocodeAddress).toHaveBeenCalledTimes(1);
    expect(persistResolvedLocation).toHaveBeenCalledWith(
      expect.objectContaining({
        locationInput: "Celje",
        latitude: 46.2358,
        longitude: 15.2677,
      })
    );
  });

  it("does not call Places with invalid persisted coordinates and geocodes the address instead", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: {},
        plannedTotalQueries: 1,
        effectiveMaxRequests: 1,
        executedCount: 1,
        dailyUsed: 0,
        dailyRemaining: 0,
        status: 200,
        results: [{ item: "desk", topCandidates: [], picked: null }],
      },
    });
    const geocodeAddress = vi.fn(async () => ({
      ok: true as const,
      formattedAddress: "Celje, Slovenia",
      lat: 46.2358,
      lng: 15.2677,
      countryCode: "SI",
    }));
    const searchPlaces = vi.fn(async (input: { lat: number; lng: number }) => {
      expect(input.lat).toBe(46.2358);
      expect(input.lng).toBe(15.2677);
      expect(input.lat).not.toBe(999);
      return {
        stores: [
          {
            name: "Local Home Store",
            place_id: "place-1",
            website: "https://www.localhome.si",
            websiteDomain: "localhome.si",
            categoryBucket: "store",
            types: ["furniture_store"],
            qualityFlags: {
              officialSite: true,
              hasCatalogSignal: true,
              isDirectoryOrSocial: false,
              isAggregator: false,
            },
          },
        ],
        contractors: [],
        domains: { stores: ["localhome.si"], contractors: [] },
        allowlistDomainsStores: ["localhome.si"],
        allowlistDomainsContractors: [],
        status: 200,
        outcome: "OK",
        meta: { radiusMeters: 25000, requestsMade: 0, cacheHits: 0, fallbacksUsed: 0 },
        places: [],
      } as never;
    });

    await discoverProjectProducts({} as never, projectId, "", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      projectLocation: {
        locationInput: "Celje",
        formattedAddress: "Celje",
        latitude: 999,
        longitude: 15,
        radiusKm: 25,
        countryCode: "SI",
      },
      geocodeAddress,
      searchPlaces,
    });

    expect(geocodeAddress).toHaveBeenCalledTimes(1);
    expect(searchPlaces).toHaveBeenCalledTimes(1);
  });

  it("returns location_required without Places or geocode when no address exists", async () => {
    const geocodeAddress = vi.fn();
    const searchPlaces = vi.fn();
    await expect(
      discoverProjectProducts({} as never, projectId, "  ", {
        ownerUserId: randomUUID(),
        persistClient: {} as never,
        geocodeAddress,
        searchPlaces,
      })
    ).rejects.toMatchObject({ code: "location_required" });
    expect(geocodeAddress).not.toHaveBeenCalled();
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it("returns location_invalid when geocode yields coordinates outside range", async () => {
    const geocodeAddress = vi.fn(async () => ({
      ok: true as const,
      formattedAddress: "Nowhere",
      lat: 999,
      lng: 15,
      countryCode: "SI",
    }));
    const searchPlaces = vi.fn();
    await expect(
      discoverProjectProducts({} as never, projectId, "Nowhere", {
        ownerUserId: randomUUID(),
        persistClient: {} as never,
        geocodeAddress,
        searchPlaces,
      })
    ).rejects.toMatchObject({ code: "location_invalid" });
    expect(geocodeAddress).toHaveBeenCalledTimes(1);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it("does not reuse a prior discovery after radius or coordinate changes", async () => {
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: {},
        plannedTotalQueries: 1,
        effectiveMaxRequests: 1,
        executedCount: 1,
        dailyUsed: 0,
        dailyRemaining: 0,
        status: 200,
        results: [{ item: "desk", topCandidates: [], picked: null }],
      },
    });
    const current = analysis();
    loadReusableRoomAnalysisMock.mockResolvedValue(current as never);
    const existing = {
      id: discoveryId,
      projectId,
      sourceAnalysisId: current.id,
      sourceAnalysisUpdatedAt: current.updated_at,
      locationInput: "Celje",
      latitude: 46.2358,
      longitude: 15.2677,
      radiusKm: 10,
      searchedItemCount: 1,
      notSearchedCount: 0,
      allowlistDomains: ["localhome.si"],
      unmatchedRequirements: [],
      sourcePreferences: {},
      sourcePreferencesHash: shoppingPreferenceHash(null),
      createdAt: current.created_at,
      updatedAt: current.updated_at,
    };
    getDiscoveryMock.mockResolvedValue(existing as never);
    const geocodeAddress = vi.fn();
    const searchPlaces = vi.fn(async () => ({
      stores: [
        {
          name: "Local Home Store",
          place_id: "place-1",
          website: "https://www.localhome.si",
          websiteDomain: "localhome.si",
          categoryBucket: "store",
          types: ["furniture_store"],
          qualityFlags: {
            officialSite: true,
            hasCatalogSignal: true,
            isDirectoryOrSocial: false,
            isAggregator: false,
          },
        },
      ],
      contractors: [],
      domains: { stores: ["localhome.si"], contractors: [] },
      allowlistDomainsStores: ["localhome.si"],
      allowlistDomainsContractors: [],
      status: 200,
      outcome: "OK",
      meta: { radiusMeters: 40000, requestsMade: 0, cacheHits: 0, fallbacksUsed: 0 },
      places: [],
    }) as never);

    const reused = await discoverProjectProducts({} as never, projectId, "Celje", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      projectLocation: {
        locationInput: "Celje",
        formattedAddress: "Celje",
        latitude: 46.2358,
        longitude: 15.2677,
        radiusKm: 10,
        countryCode: "SI",
      },
      geocodeAddress,
      searchPlaces,
    });
    expect(reused.reused).toBe(true);
    expect(searchPlaces).not.toHaveBeenCalled();

    const radiusChanged = await discoverProjectProducts({} as never, projectId, "Celje", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      projectLocation: {
        locationInput: "Celje",
        formattedAddress: "Celje",
        latitude: 46.2358,
        longitude: 15.2677,
        radiusKm: 40,
        countryCode: "SI",
      },
      geocodeAddress,
      searchPlaces,
    });
    expect(radiusChanged.reused).toBe(false);
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(geocodeAddress).not.toHaveBeenCalled();

    searchPlaces.mockClear();
    const locationChanged = await discoverProjectProducts({} as never, projectId, "Ljubljana", {
      ownerUserId: randomUUID(),
      persistClient: {} as never,
      projectLocation: {
        locationInput: "Ljubljana",
        formattedAddress: "Ljubljana",
        latitude: 46.0569,
        longitude: 14.5058,
        radiusKm: 10,
        countryCode: "SI",
      },
      geocodeAddress,
      searchPlaces,
    });
    expect(locationChanged.reused).toBe(false);
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(geocodeAddress).not.toHaveBeenCalled();
  });
});
