/**
 * Persisted room preferences + discovery identity (local, mocked providers).
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, LOCAL_SERVICE_ROLE_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { loadReusableRoomAnalysis } from "@/lib/analysis/analyze";
import { GEOCODING_ERROR_CODES, type GeocodeResult } from "@/lib/geocode/types";
import type { SearchResult } from "@/lib/places/placesService";
import type { CanonicalSerpSearchOutcome } from "@/lib/serp/search";
import { discoverProjectProducts } from "@/lib/discovery/discover";
import { getProjectProductDiscovery } from "@/lib/discovery/queries";
import { shoppingPreferenceFingerprint } from "@/lib/discovery/preferenceHash";
import { isCurrentProductDiscovery } from "@/lib/discovery/stale";
import { expireLocalProductDiscoveryCooldown } from "@/lib/discovery/localCooldownSetup";
import {
  projectRoomPreferencesToRenderPreferences,
  projectRoomPreferencesToShoppingPreferences,
} from "./adapter";
import { getProjectRoomPreferences, upsertProjectRoomPreferences } from "./queries";
import { parseProjectLocation } from "@/lib/project-location/parse";

vi.mock("@/lib/references/ensure", () => ({
  ensureProductReferenceAssets: vi.fn(async () => ({
    assetsBySelectionId: new Map(),
    failedSelectionIds: [],
    reusedCount: 0,
    fetchedCount: 0,
    rescueAttemptedCount: 0,
  })),
}));

const LOCAL_URL = localSupabaseApiUrl();
type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing preference flow tests against hosted Supabase.");
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
    email: `p162-flow-${label}-${randomUUID()}@example.com`,
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
      name: "Prefs flow",
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
  return { projectId, analysisId: analysis.data.id, analysisUpdatedAt: analysis.data.updated_at };
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
  return {
    ok: true,
    formattedAddress: "Ljubljana, Slovenia",
    lat: 46.0569,
    lng: 14.5058,
    countryCode: "SI",
  };
}

function semanticSerpTitle(query: string): string {
  const folded = query.normalize("NFC").toLowerCase();
  if (/olivno|olive green|olive/.test(folded)) return "Olivno zelena notranja barva za stene 10L";
  if (/mat črna|matte black|mat .*barva/.test(folded)) return "Črna mat notranja zidna barva";
  if (/metallic black|metalik/.test(folded)) return "Metalik črna notranja barva za stene 10L";
  if (/črna|black|interior wall paint metallic|interior wall paint matte/.test(folded)) {
    return "Metalik črna notranja barva za stene 10L";
  }
  if (/marmor|marble|marmorne/.test(folded)) return "Marmorne talne ploščice 60x60";
  if (/garnitura|kavč|sofa/.test(folded)) return "Sedežna garnitura moderna";
  if (/barva|paint|stenska/.test(folded)) return "Notranja barva za stene";
  return `Real ${query}`;
}

function serpOutcome(items: string[]): CanonicalSerpSearchOutcome {
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
      results: items.map((item, index) => ({
        item,
        topCandidates: [],
        picked: {
          title: semanticSerpTitle(item),
          url: `https://www.localhome.si/p/${index + 1}`,
          image: `https://cdn.localhome.si/${index + 1}.jpg`,
          price: 249 + index,
          currency: "EUR",
          score: 40,
          confidence: 0.8,
          reasons: ["product-like"],
          domain: "localhome.si",
          snippet: null,
        },
      })),
    },
  };
}

const marblePatch = {
  selectedStyles: ["modern"],
  wallMainColor: "metallic black",
  wallAccentColor: "olive green",
  flooring: "marble" as const,
  underfloorHeating: false,
  bedType: "none" as const,
  keepExistingWalls: false,
};

describe("persisted room preferences + discovery (local, mocked providers)", () => {
  let userA: { client: Client; user: User };
  let persist: Client;
  let seeded: { projectId: string; analysisId: string; analysisUpdatedAt: string };

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    persist = persistClient();
    seeded = await seedWithAnalysis(userA.client, userA.user.id);
  });

  it("rehydrates marble / metallic black / olive green after reload", async () => {
    await upsertProjectRoomPreferences(userA.client, seeded.projectId, {
      ...marblePatch,
      notes: "keep the window nook",
      budgetLevel: "premium",
    });
    const loaded = await getProjectRoomPreferences(userA.client, seeded.projectId);
    expect(loaded).toMatchObject({
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
      flooring: "marble",
      notes: "keep the window nook",
      budgetLevel: "premium",
    });
    expect(loaded?.flooring).not.toBe("keep");
  });

  it("uses persisted marble prefs as the discovery snapshot, then stays current", async () => {
    const stored = await getProjectRoomPreferences(userA.client, seeded.projectId);
    const shopping = projectRoomPreferencesToShoppingPreferences(stored);
    const fingerprint = shoppingPreferenceFingerprint(shopping);
    const geocodeFn = vi.fn(async () => geocodeOk());
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items));

    const first = await discoverProjectProducts(userA.client, seeded.projectId, "Ljubljana", {
      ownerUserId: userA.user.id,
      persistClient: persist,
      preferences: shopping,
      geocodeAddress: geocodeFn,
      searchPlaces: placesFn,
      searchSerp: serpFn,
    });

    expect(first.discovery.sourcePreferences).toMatchObject({ flooring: "marble" });
    expect(first.discovery.sourcePreferencesHash).toBe(fingerprint.hash);
    const analysis = await loadReusableRoomAnalysis(userA.client, seeded.projectId);
    expect(
      isCurrentProductDiscovery(first.discovery, analysis!, {
        locationInput: "Ljubljana",
        preferences: shopping,
      })
    ).toBe(true);

    const reloadedPrefs = await getProjectRoomPreferences(userA.client, seeded.projectId);
    const reloadedShopping = projectRoomPreferencesToShoppingPreferences(reloadedPrefs);
    const existing = await getProjectProductDiscovery(userA.client, seeded.projectId);
    expect(
      isCurrentProductDiscovery(existing!, analysis!, {
        locationInput: "Ljubljana",
        preferences: reloadedShopping,
      })
    ).toBe(true);
    expect(geocodeFn).toHaveBeenCalledTimes(1);
    expect(placesFn).toHaveBeenCalledTimes(1);
    expect(serpFn.mock.calls.length).toBeGreaterThan(0);
  });

  it("marks discovery stale after hardwood change without provider calls", async () => {
    const geocodeFn = vi.fn(async (): Promise<GeocodeResult> => ({
      ok: false,
      code: GEOCODING_ERROR_CODES.DISABLED,
      message: "disabled",
    }));
    const placesFn = vi.fn();
    const serpFn = vi.fn();
    await upsertProjectRoomPreferences(userA.client, seeded.projectId, { flooring: "hardwood" });
    const stored = await getProjectRoomPreferences(userA.client, seeded.projectId);
    const shopping = projectRoomPreferencesToShoppingPreferences(stored);
    const analysis = await loadReusableRoomAnalysis(userA.client, seeded.projectId);
    const existing = await getProjectProductDiscovery(userA.client, seeded.projectId);
    expect(
      isCurrentProductDiscovery(existing!, analysis!, {
        locationInput: "Ljubljana",
        preferences: shopping,
      })
    ).toBe(false);
    expect(existing).toBeTruthy();
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn).not.toHaveBeenCalled();
    expect(serpFn).not.toHaveBeenCalled();
  });

  it("derives render preferences from the persisted project row", async () => {
    await upsertProjectRoomPreferences(userA.client, seeded.projectId, {
      wallMainColor: "metallic black",
      flooring: "marble",
      notes: "keep the window nook",
      budgetLevel: "balanced",
    });
    const stored = await getProjectRoomPreferences(userA.client, seeded.projectId);
    const render = projectRoomPreferencesToRenderPreferences(stored);
    expect(render.wallMainColor).toBe("metallic black");
    expect(render.flooring).toBe("marble");
    expect(render.notes).toBe("keep the window nook");
    expect(render.budgetLevel).toBe("balanced");
  });

  it("persists project location and lets later discovery skip geocode", async () => {
    const locationProject = await seedWithAnalysis(userA.client, userA.user.id);
    await upsertProjectRoomPreferences(userA.client, locationProject.projectId, {
      locationInput: "Celje",
      formattedAddress: "Celje, Slovenia",
      latitude: 46.2358,
      longitude: 15.2677,
      radiusKm: 25,
      countryCode: "SI",
    });
    const reloaded = await getProjectRoomPreferences(userA.client, locationProject.projectId);
    const location = parseProjectLocation(reloaded);
    expect(location).toMatchObject({
      locationInput: "Celje",
      latitude: 46.2358,
      longitude: 15.2677,
      radiusKm: 25,
    });

    const lostWizardState = { location: null as null, radiusKm: 50 };
    expect(lostWizardState.location).toBeNull();
    expect(parseProjectLocation(reloaded)?.radiusKm).toBe(25);

    const geocodeFn = vi.fn(async (): Promise<GeocodeResult> => {
      throw new Error("geocode should not run for persisted coordinates");
    });
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items));
    const shopping = projectRoomPreferencesToShoppingPreferences(reloaded);

    const first = await discoverProjectProducts(userA.client, locationProject.projectId, "", {
      ownerUserId: userA.user.id,
      persistClient: persist,
      preferences: shopping,
      projectLocation: location,
      geocodeAddress: geocodeFn,
      searchPlaces: placesFn,
      searchSerp: serpFn,
    });
    expect(first.reused).toBe(false);
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn).toHaveBeenCalledTimes(1);
    expect(placesFn.mock.calls[0]?.[0]).toMatchObject({
      lat: 46.2358,
      lng: 15.2677,
      radiusKm: 25,
    });

    const second = await discoverProjectProducts(userA.client, locationProject.projectId, "", {
      ownerUserId: userA.user.id,
      persistClient: persist,
      preferences: shopping,
      projectLocation: location,
      geocodeAddress: geocodeFn,
      searchPlaces: placesFn,
      searchSerp: serpFn,
    });
    expect(second.reused).toBe(true);
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn).toHaveBeenCalledTimes(1);

    await upsertProjectRoomPreferences(userA.client, locationProject.projectId, { radiusKm: 40 });
    const afterRadius = parseProjectLocation(
      await getProjectRoomPreferences(userA.client, locationProject.projectId)
    );
    await expireLocalProductDiscoveryCooldown(locationProject.projectId);
    const radiusChanged = await discoverProjectProducts(
      userA.client,
      locationProject.projectId,
      "",
      {
        ownerUserId: userA.user.id,
        persistClient: persist,
        preferences: shopping,
        projectLocation: afterRadius,
        geocodeAddress: geocodeFn,
        searchPlaces: placesFn,
        searchSerp: serpFn,
      }
    );
    expect(radiusChanged.reused).toBe(false);
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn).toHaveBeenCalledTimes(2);
    expect(placesFn.mock.calls[1]?.[0]).toMatchObject({
      lat: 46.2358,
      lng: 15.2677,
      radiusKm: 40,
    });

    await upsertProjectRoomPreferences(userA.client, locationProject.projectId, {
      locationInput: "Ljubljana",
      formattedAddress: "Ljubljana, Slovenia",
      latitude: 46.0569,
      longitude: 14.5058,
      radiusKm: 40,
      countryCode: "SI",
    });
    const afterMove = parseProjectLocation(
      await getProjectRoomPreferences(userA.client, locationProject.projectId)
    );
    await expireLocalProductDiscoveryCooldown(locationProject.projectId);
    const moved = await discoverProjectProducts(userA.client, locationProject.projectId, "", {
      ownerUserId: userA.user.id,
      persistClient: persist,
      preferences: shopping,
      projectLocation: afterMove,
      geocodeAddress: geocodeFn,
      searchPlaces: placesFn,
      searchSerp: serpFn,
    });
    expect(moved.reused).toBe(false);
    expect(geocodeFn).not.toHaveBeenCalled();
    expect(placesFn.mock.calls.at(-1)?.[0]).toMatchObject({
      lat: 46.0569,
      lng: 14.5058,
      radiusKm: 40,
    });
  });

  it("geocodes a legacy address once and persists coordinates for later reuse", async () => {
    const locationProject = await seedWithAnalysis(userA.client, userA.user.id);
    await upsertProjectRoomPreferences(userA.client, locationProject.projectId, {
      locationInput: "Celje",
      radiusKm: 25,
    });
    const stored = await getProjectRoomPreferences(userA.client, locationProject.projectId);
    expect(parseProjectLocation(stored)).toBeNull();
    expect(stored?.locationInput).toBe("Celje");

    const geocodeFn = vi.fn(async () => geocodeOk());
    const persistResolvedLocation = vi.fn(async (location) => {
      await upsertProjectRoomPreferences(userA.client, locationProject.projectId, {
        locationInput: location.locationInput,
        formattedAddress: location.formattedAddress,
        latitude: location.latitude,
        longitude: location.longitude,
        radiusKm: location.radiusKm,
        countryCode: location.countryCode,
      });
    });
    const placesFn = vi.fn(async () => placesResult());
    const serpFn = vi.fn(async (input) => serpOutcome(input.items));

    await discoverProjectProducts(userA.client, locationProject.projectId, "Celje", {
      ownerUserId: userA.user.id,
      persistClient: persist,
      projectLocation: parseProjectLocation(stored),
      persistResolvedLocation,
      geocodeAddress: geocodeFn,
      searchPlaces: placesFn,
      searchSerp: serpFn,
    });
    expect(geocodeFn).toHaveBeenCalledTimes(1);
    expect(persistResolvedLocation).toHaveBeenCalledTimes(1);

    const afterFallback = parseProjectLocation(
      await getProjectRoomPreferences(userA.client, locationProject.projectId)
    );
    expect(afterFallback).toMatchObject({
      locationInput: "Celje",
      latitude: 46.0569,
      longitude: 14.5058,
    });

    const second = await discoverProjectProducts(userA.client, locationProject.projectId, "Celje", {
      ownerUserId: userA.user.id,
      persistClient: persist,
      projectLocation: afterFallback,
      persistResolvedLocation,
      geocodeAddress: geocodeFn,
      searchPlaces: placesFn,
      searchSerp: serpFn,
    });
    expect(second.reused).toBe(true);
    expect(geocodeFn).toHaveBeenCalledTimes(1);
  });
});
