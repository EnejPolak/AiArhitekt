/**
 * Mocked A → D → C product discovery against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, LOCAL_SERVICE_ROLE_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { loadReusableRoomAnalysis, runRoomAnalysis } from "@/lib/analysis/analyze";
import { AnalysisError } from "@/lib/analysis/errors";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { expireLocalRoomAnalysisCooldown } from "@/lib/analysis/localCooldownSetup";
import { analyzeRoomImage } from "@/lib/analysis/openai";
import { GEOCODING_ERROR_CODES, type GeocodeResult } from "@/lib/geocode/types";
import type { SearchResult } from "@/lib/places/placesService";
import type { CanonicalSerpSearchOutcome } from "@/lib/serp/search";
import { discoverProjectProducts, loadCurrentProductDiscovery } from "./discover";
import { DiscoveryError } from "./errors";
import { expireLocalProductDiscoveryCooldown } from "./localCooldownSetup";
import { getProjectProductDiscovery, getProjectProductSelections } from "./queries";
import { isCurrentProductDiscovery } from "./stale";
import { shoppingPreferenceHash } from "./preferenceHash";

vi.mock("@/lib/analysis/openai", () => ({
  analyzeRoomImage: vi.fn(),
}));

const LOCAL_URL = localSupabaseApiUrl();
const analyzeRoomImageMock = vi.mocked(analyzeRoomImage);

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing product discovery tests against hosted Supabase.");
  }
}

function publicClient(): Client {
  assertLocalOnly(LOCAL_URL);
  return createClient<Database>(LOCAL_URL, LOCAL_ANON_JWT, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function persistClient(): Client {
  assertLocalOnly(LOCAL_URL);
  return createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_JWT, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUp(label: string) {
  const client = publicClient();
  const { data, error } = await client.auth.signUp({
    email: `p16-flow-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

const JPEG = new Blob(
  [
    new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]),
  ],
  { type: "image/jpeg" }
);

async function seedWithAnalysis(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Discovery flow",
      project_type: "room-renovation",
    })
    .select("id")
    .single();
  if (!created.data) throw new Error("Could not create project");
  const projectId = created.data.id;
  const uploadId = randomUUID();
  const path = buildRoomPhotoPath(projectId, uploadId, "image/jpeg");
  const uploaded = await client.storage
    .from(PROJECT_UPLOADS_BUCKET)
    .upload(path, JPEG, { contentType: "image/jpeg" });
  if (uploaded.error) throw uploaded.error;
  const meta = await client
    .from("project_uploads")
    .insert({
      project_id: projectId,
      kind: "room_photo",
      storage_bucket: PROJECT_UPLOADS_BUCKET,
      storage_path: path,
      original_filename: "room.jpg",
      mime_type: "image/jpeg",
      size_bytes: 22,
    })
    .select("id, storage_path")
    .single();
  if (!meta.data) throw new Error(meta.error?.message ?? "metadata failed");
  const analysis = await client
    .from("project_room_analyses")
    .insert({
      project_id: projectId,
      source_upload_id: meta.data.id,
      source_storage_path: meta.data.storage_path,
      schema_version: 1,
      provider: "openai",
      model: "gpt-4o",
      analysis: validRoomAnalysisResult.analysis,
      design_requirements: validRoomAnalysisResult.designRequirements,
    })
    .select("id, updated_at")
    .single();
  if (!analysis.data) throw new Error(analysis.error?.message ?? "analysis failed");
  return {
    projectId,
    uploadId: meta.data.id,
    path: meta.data.storage_path,
    analysisId: analysis.data.id,
    analysisUpdatedAt: analysis.data.updated_at,
  };
}

function placesResult(domain = "localhome.si"): SearchResult {
  return {
    meta: {
      radiusMeters: 50000,
      requestsMade: 1,
      cacheHits: 0,
      fallbacksUsed: 0,
      plannedQueries: [],
    },
    places: [],
    stores: [
      {
        name: "Local Home Store",
        place_id: "place-1",
        rating: 4.4,
        user_ratings_total: 12,
        distanceKm: 2.1,
        website: `https://www.${domain}`,
        websiteDomain: domain,
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
    domains: { stores: [domain], contractors: [] },
    allowlistDomainsStores: [domain],
    allowlistDomainsContractors: [],
    status: 200,
    outcome: "OK",
  };
}

function geocodeOk(): GeocodeResult {
  return { ok: true, formattedAddress: "Ljubljana, Slovenia", lat: 46.0569, lng: 14.5058 };
}

function serpOutcome(
  items: string[],
  pick: "product" | "none" | "mixed" | "null-price" = "product"
): CanonicalSerpSearchOutcome {
  return {
    ok: true,
    response: {
      dryRun: false,
      plannedQueries: {},
      plannedTotalQueries: items.length,
      effectiveMaxRequests: items.length,
      executedCount: items.length,
      dailyUsed: 2,
      dailyRemaining: 98,
      status: 200,
      results: items.map((item, index) => {
        const skip = pick === "none" || (pick === "mixed" && index === 1);
        if (skip) {
          return { item, topCandidates: [], picked: null };
        }
        return {
          item,
          topCandidates: [],
          picked: {
            title: pick === "null-price" ? "Sofa without price" : `Real ${item}`,
            url: `https://www.localhome.si/p/${index + 1}`,
            image: pick === "null-price" ? null : `https://cdn.localhome.si/${index + 1}.jpg`,
            price: pick === "null-price" ? null : 249 + index,
            currency: pick === "null-price" ? null : "EUR",
            score: 40,
            confidence: 0.8,
            reasons: ["product-like"],
            domain: "localhome.si",
          },
        };
      }),
    },
  };
}

describe("product discovery pipeline (local, mocked providers)", () => {
  let userA: { client: Client; user: User };
  let seeded: Awaited<ReturnType<typeof seedWithAnalysis>>;
  let concurrent: Awaited<ReturnType<typeof seedWithAnalysis>>;
  let preferenceSeed: Awaited<ReturnType<typeof seedWithAnalysis>>;
  let persist: Client;

  function withPersist(
    extra: {
      force?: boolean;
      preferences?: Parameters<typeof discoverProjectProducts>[3]["preferences"];
      geocodeAddress?: Parameters<typeof discoverProjectProducts>[3]["geocodeAddress"];
      searchPlaces?: Parameters<typeof discoverProjectProducts>[3]["searchPlaces"];
      searchSerp?: Parameters<typeof discoverProjectProducts>[3]["searchSerp"];
    } = {}
  ) {
    return {
      ownerUserId: userA.user.id,
      persistClient: persist,
      ...extra,
    };
  }

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    persist = persistClient();
    seeded = await seedWithAnalysis(userA.client, userA.user.id);
    concurrent = await seedWithAnalysis(userA.client, userA.user.id);
    preferenceSeed = await seedWithAnalysis(userA.client, userA.user.id);
  });

  it("runs Geocode once, Places once, then a bounded SERP batch, and persists canonical products", async () => {
    const geocodeFn = vi.fn(async () => geocodeOk());
    const placesFn = vi.fn(async () => placesResult());
    let serpCalls = 0;
    const serpFn = vi.fn(async (input) => {
      serpCalls += 1;
      expect(input.allowlistDomains).toEqual(["localhome.si"]);
      expect(input.items.length).toBeGreaterThan(0);
      expect(input.items.join(" ")).not.toMatch(/site:/i);
      return serpOutcome(input.items, serpCalls === 1 ? "mixed" : "none");
    });

    const first = await discoverProjectProducts(
      userA.client,
      seeded.projectId,
      "Ljubljana",
      withPersist({
        geocodeAddress: geocodeFn,
        searchPlaces: placesFn,
        searchSerp: serpFn,
      })
    );

    expect(first.reused).toBe(false);
    expect(geocodeFn).toHaveBeenCalledTimes(1);
    expect(placesFn).toHaveBeenCalledTimes(1);
    expect(serpFn.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(serpFn.mock.calls.length).toBeLessThanOrEqual(3);
    expect(analyzeRoomImageMock).not.toHaveBeenCalled();
    expect(first.selections).toHaveLength(1);
    expect(first.selections[0]?.productUrl).toBe("https://www.localhome.si/p/1");
    expect(first.selections[0]).not.toHaveProperty("link");
    expect(first.discovery.unmatchedRequirements.some((item) => item.reason === "no_valid_product")).toBe(
      true
    );
    expect(first.discovery.sourceAnalysisId).toBe(seeded.analysisId);
    const serpCallsAfterFirst = serpFn.mock.calls.length;

    const loaded = await loadCurrentProductDiscovery(userA.client, seeded.projectId);
    expect(loaded?.selections).toHaveLength(1);
    expect(geocodeFn).toHaveBeenCalledTimes(1);
    expect(placesFn).toHaveBeenCalledTimes(1);
    expect(serpFn.mock.calls.length).toBe(serpCallsAfterFirst);

    const reused = await discoverProjectProducts(
      userA.client,
      seeded.projectId,
      "  LJUBLJANA ",
      withPersist({
        geocodeAddress: geocodeFn,
        searchPlaces: placesFn,
        searchSerp: serpFn,
      })
    );
    expect(reused.reused).toBe(true);
    expect(geocodeFn).toHaveBeenCalledTimes(1);
    expect(placesFn).toHaveBeenCalledTimes(1);
    expect(serpFn.mock.calls.length).toBe(serpCallsAfterFirst);
  });

  it("persists null price/currency/image and does not fabricate a row for picked:null", async () => {
    await expireLocalProductDiscoveryCooldown(seeded.projectId);
    const geocodeFn = vi.fn(async () => geocodeOk());
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items, "null-price"));

    const result = await discoverProjectProducts(
      userA.client,
      seeded.projectId,
      "Ljubljana",
      withPersist({
        force: true,
        geocodeAddress: geocodeFn,
        searchPlaces: placesFn,
        searchSerp: serpFn,
      })
    );

    expect(result.selections[0]?.price).toBeNull();
    expect(result.selections[0]?.currency).toBeNull();
    expect(result.selections[0]?.productImageUrl).toBeNull();
    expect(result.selections[0]?.hasReferenceImage).toBe(false);
    expect(JSON.stringify(result.selections)).not.toMatch(/"link"\s*:/);

    await expireLocalProductDiscoveryCooldown(seeded.projectId);
    const none = await discoverProjectProducts(
      userA.client,
      seeded.projectId,
      "Ljubljana",
      withPersist({
        force: true,
        geocodeAddress: geocodeFn,
        searchPlaces: placesFn,
        searchSerp: vi.fn(async (input) => serpOutcome(input.items, "none")),
      })
    );
    expect(none.selections).toHaveLength(0);
    expect(none.discovery.unmatchedRequirements.every((item) => item.reason === "no_valid_product")).toBe(
      true
    );
  });

  it("does not search the open web when Places returns no store domains", async () => {
    await expireLocalProductDiscoveryCooldown(seeded.projectId);
    const previous = await getProjectProductDiscovery(userA.client, seeded.projectId);
    const previousSelections = previous
      ? await getProjectProductSelections(userA.client, previous.id)
      : [];
    const serpFn = vi.fn();
    await expect(
      discoverProjectProducts(
        userA.client,
        seeded.projectId,
        "Ljubljana",
        withPersist({
          force: true,
          geocodeAddress: vi.fn(async () => geocodeOk()),
          searchPlaces: vi.fn(async () => ({
            ...placesResult(),
            stores: [],
            allowlistDomainsStores: [],
            domains: { stores: [], contractors: [] },
            outcome: "NO_VALID_STORE_DOMAINS",
          })),
          searchSerp: serpFn,
        })
      )
    ).rejects.toMatchObject({ code: "no_valid_store_domains" });
    expect(serpFn).not.toHaveBeenCalled();
    const still = await getProjectProductDiscovery(userA.client, seeded.projectId);
    expect(still?.id).toBe(previous?.id);
    if (previous) {
      const selections = await getProjectProductSelections(userA.client, previous.id);
      expect(selections).toHaveLength(previousSelections.length);
    }
  });

  it("keeps previous products when a refresh provider call fails", async () => {
    await expireLocalProductDiscoveryCooldown(seeded.projectId);
    const before = await getProjectProductDiscovery(userA.client, seeded.projectId);
    expect(before).toBeTruthy();

    await expect(
      discoverProjectProducts(
        userA.client,
        seeded.projectId,
        "Ljubljana",
        withPersist({
          force: true,
          geocodeAddress: vi.fn(async () => ({
            ok: false as const,
            code: GEOCODING_ERROR_CODES.QUOTA_REACHED,
            message: "quota",
            httpStatus: 429,
          })),
          searchPlaces: vi.fn(),
          searchSerp: vi.fn(),
        })
      )
    ).rejects.toMatchObject({ code: "geocoding_quota" });

    const after = await getProjectProductDiscovery(userA.client, seeded.projectId);
    expect(after?.id).toBe(before?.id);
  });

  it("keeps products when re-analysis fails and invalidates them only after a successful re-analysis", async () => {
    const before = await getProjectProductDiscovery(userA.client, seeded.projectId);
    expect(before).toBeTruthy();

    await expireLocalRoomAnalysisCooldown(seeded.projectId);
    await expect(
      runRoomAnalysis(userA.client, seeded.projectId, {
        force: true,
        analyzeImage: vi.fn(async () => {
          throw new AnalysisError("provider_failed", "Could not analyze the room. Try again.");
        }),
      })
    ).rejects.toMatchObject({ code: "provider_failed" });
    expect(await getProjectProductDiscovery(userA.client, seeded.projectId)).toBeTruthy();

    await expireLocalRoomAnalysisCooldown(seeded.projectId);
    await runRoomAnalysis(userA.client, seeded.projectId, {
      force: true,
      analyzeImage: vi.fn(async () => ({
        result: validRoomAnalysisResult,
        meta: { provider: "openai" as const, model: "gpt-4o" as const },
      })),
    });
    expect(await getProjectProductDiscovery(userA.client, seeded.projectId)).toBeNull();
    expect(await loadCurrentProductDiscovery(userA.client, seeded.projectId)).toBeNull();
  });

  it("grants only one concurrent discovery the persistent claim", async () => {
    const geocodeFn = vi.fn(async () => geocodeOk());
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items, "product"));

    const results = await Promise.allSettled([
      discoverProjectProducts(
        userA.client,
        concurrent.projectId,
        "Ljubljana",
        withPersist({
          geocodeAddress: geocodeFn,
          searchPlaces: placesFn,
          searchSerp: serpFn,
        })
      ),
      discoverProjectProducts(
        userA.client,
        concurrent.projectId,
        "Ljubljana",
        withPersist({
          geocodeAddress: geocodeFn,
          searchPlaces: placesFn,
          searchSerp: serpFn,
        })
      ),
    ]);

    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    expect(fulfilled.length + rejected.length).toBe(2);
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    if (rejected.length) {
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(DiscoveryError);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ code: "rate_limited" });
    }
    expect(geocodeFn.mock.calls.length).toBe(1);
    expect(placesFn.mock.calls.length).toBe(1);
    expect(serpFn.mock.calls.length).toBe(1);
  });

  const marblePrefs = {
    selectedStyles: ["modern"],
    wallMainColor: "metallic black",
    wallAccentColor: "olive green",
    flooring: "marble" as const,
    underfloorHeating: false,
    bedType: "none" as const,
  };

  it("reuses discovery when analysis, location, and normalized preferences match", async () => {
    const geocodeFn = vi.fn(async () => geocodeOk());
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items, "product"));

    const first = await discoverProjectProducts(
      userA.client,
      preferenceSeed.projectId,
      "Ljubljana",
      withPersist({
        preferences: marblePrefs,
        geocodeAddress: geocodeFn,
        searchPlaces: placesFn,
        searchSerp: serpFn,
      })
    );
    expect(first.reused).toBe(false);
    expect(first.discovery.sourcePreferencesHash).toBe(shoppingPreferenceHash(marblePrefs));
    expect(first.discovery.sourcePreferences).toMatchObject({
      flooring: "marble",
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
    });
    expect(geocodeFn).toHaveBeenCalledTimes(1);
    expect(placesFn).toHaveBeenCalledTimes(1);

    const reused = await discoverProjectProducts(
      userA.client,
      preferenceSeed.projectId,
      "  LJUBLJANA ",
      withPersist({
        preferences: {
          ...marblePrefs,
          wallMainColor: "Metallic  Black",
          selectedStyles: ["Modern"],
        },
        geocodeAddress: geocodeFn,
        searchPlaces: placesFn,
        searchSerp: serpFn,
      })
    );
    expect(reused.reused).toBe(true);
    expect(geocodeFn).toHaveBeenCalledTimes(1);
    expect(placesFn).toHaveBeenCalledTimes(1);
    expect(serpFn.mock.calls.length).toBe(1);
  });

  it("becomes stale when flooring changes from marble to wood without provider calls", async () => {
    const analysis = await loadReusableRoomAnalysis(userA.client, preferenceSeed.projectId);
    expect(analysis).toBeTruthy();
    const existing = await getProjectProductDiscovery(userA.client, preferenceSeed.projectId);
    expect(existing).toBeTruthy();
    const geocodeFn = vi.fn(async () => geocodeOk());
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items, "product"));

    expect(
      isCurrentProductDiscovery(existing!, analysis!, {
        locationInput: "Ljubljana",
        preferences: { ...marblePrefs, flooring: "hardwood" },
      })
    ).toBe(false);
    expect(await loadCurrentProductDiscovery(userA.client, preferenceSeed.projectId)).toBeTruthy();
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn).not.toHaveBeenCalled();
    expect(serpFn).not.toHaveBeenCalled();
  });

  it("becomes stale when wall color changes from metallic black to white without provider calls", async () => {
    const analysis = await loadReusableRoomAnalysis(userA.client, preferenceSeed.projectId);
    const existing = await getProjectProductDiscovery(userA.client, preferenceSeed.projectId);
    expect(existing).toBeTruthy();
    const geocodeFn = vi.fn();
    const placesFn = vi.fn();
    const serpFn = vi.fn();

    expect(
      isCurrentProductDiscovery(existing!, analysis!, {
        locationInput: "Ljubljana",
        preferences: { ...marblePrefs, wallMainColor: "white" },
      })
    ).toBe(false);
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn).not.toHaveBeenCalled();
    expect(serpFn).not.toHaveBeenCalled();
  });

  it("does not automatically run Geocode/Places/SERP when preferences change", async () => {
    const geocodeFn = vi.fn(async () => geocodeOk());
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items, "product"));
    const analysis = await loadReusableRoomAnalysis(userA.client, preferenceSeed.projectId);
    const existing = await getProjectProductDiscovery(userA.client, preferenceSeed.projectId);
    expect(existing).toBeTruthy();
    expect(
      isCurrentProductDiscovery(existing!, analysis!, {
        locationInput: "Ljubljana",
        preferences: { ...marblePrefs, flooring: "hardwood" },
      })
    ).toBe(false);
    expect(await loadCurrentProductDiscovery(userA.client, preferenceSeed.projectId)).not.toBeNull();
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn).not.toHaveBeenCalled();
    expect(serpFn).not.toHaveBeenCalled();
  });
});
