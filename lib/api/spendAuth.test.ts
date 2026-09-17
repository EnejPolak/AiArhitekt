import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getVerifiedUser } from "@/lib/auth/session";
import { isDebugApiAllowed } from "@/lib/env/deployment";
import { GET as geocodeGet, POST as geocodePost } from "@/app/api/geocode/route";
import { POST as placesPost } from "@/app/api/places/search/route";
import { POST as serpPost } from "@/app/api/serp/search/route";
import { POST as searchProductsPost } from "@/app/api/search-products/route";
import { geocodeAddress, reverseGeocode } from "@/lib/geocode/service";
import { searchPlaces } from "@/lib/places/placesService";
import { runOpenAIProductDiscovery } from "@/lib/productDiscovery/search";

vi.mock("@/lib/auth/session", () => ({
  getVerifiedUser: vi.fn(),
}));

vi.mock("@/lib/env/deployment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env/deployment")>("@/lib/env/deployment");
  return {
    ...actual,
    isDebugApiAllowed: vi.fn(),
  };
});

vi.mock("@/lib/geocode/service", () => ({
  geocodeAddress: vi.fn(),
  reverseGeocode: vi.fn(),
}));

vi.mock("@/lib/places/placesService", () => ({
  searchPlaces: vi.fn(),
}));

vi.mock("@/lib/productDiscovery/search", () => ({
  runOpenAIProductDiscovery: vi.fn(),
}));

const getVerifiedUserMock = vi.mocked(getVerifiedUser);
const isDebugApiAllowedMock = vi.mocked(isDebugApiAllowed);
const reverseGeocodeMock = vi.mocked(reverseGeocode);
const geocodeAddressMock = vi.mocked(geocodeAddress);
const searchPlacesMock = vi.mocked(searchPlaces);
const runOpenAIProductDiscoveryMock = vi.mocked(runOpenAIProductDiscovery);

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "127.0.0.1" },
    body: JSON.stringify(body),
  });
}

describe("spend route authentication", () => {
  beforeEach(() => {
    getVerifiedUserMock.mockReset();
    isDebugApiAllowedMock.mockReset();
    reverseGeocodeMock.mockReset();
    geocodeAddressMock.mockReset();
    searchPlacesMock.mockReset();
    runOpenAIProductDiscoveryMock.mockReset();
    isDebugApiAllowedMock.mockReturnValue(false);
    getVerifiedUserMock.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns 401 for unauthenticated production requests", async () => {
    const geocodeRes = await geocodePost(
      jsonRequest("http://localhost/api/geocode", { address: "Ljubljana" })
    );
    const placesRes = await placesPost(
      jsonRequest("http://localhost/api/places/search", { lat: 46, lng: 14, radiusKm: 10 })
    );
    const serpRes = await serpPost(
      jsonRequest("http://localhost/api/serp/search", { items: ["desk"], allowlistDomains: ["x.si"] })
    );
    const searchRes = await searchProductsPost(
      jsonRequest("http://localhost/api/search-products", { budgetPlan: { caps: {} }, localStores: [] })
    );

    expect(geocodeRes.status).toBe(401);
    expect(placesRes.status).toBe(401);
    expect(serpRes.status).toBe(401);
    expect(searchRes.status).toBe(401);
    expect(await geocodeRes.json()).toMatchObject({ error: "unauthenticated" });
    expect(geocodeAddressMock).not.toHaveBeenCalled();
    expect(searchPlacesMock).not.toHaveBeenCalled();
    expect(runOpenAIProductDiscoveryMock).not.toHaveBeenCalled();
  });

  it("returns 401 for unauthenticated GET /api/geocode", async () => {
    const res = await geocodeGet(new Request("http://localhost/api/geocode?address=Ljubljana"));
    expect(res.status).toBe(401);
  });

  it("does not leak provider error text on Places 500", async () => {
    getVerifiedUserMock.mockResolvedValue({ id: "user-1" } as never);
    searchPlacesMock.mockRejectedValue(new Error("GOOGLE_SECRET_LEAK quota exceeded"));
    const res = await placesPost(
      jsonRequest("http://localhost/api/places/search", { lat: 46, lng: 14, radiusKm: 10 })
    );
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/GOOGLE_SECRET_LEAK|quota exceeded/i);
    expect(body.error).toBe("internal_error");
  });

  it("lets an authenticated user through", async () => {
    getVerifiedUserMock.mockResolvedValue({ id: "user-1" } as never);
    reverseGeocodeMock.mockResolvedValue({
      ok: true,
      formattedAddress: "Velenje",
      lat: 46.3,
      lng: 15.1,
      countryCode: "SI",
    });
    searchPlacesMock.mockResolvedValue({ status: 200, stores: [], domains: { stores: [] } } as never);
    runOpenAIProductDiscoveryMock.mockResolvedValue({
      ok: true,
      response: {
        dryRun: true,
        plannedQueries: {},
        plannedTotalQueries: 0,
        effectiveMaxRequests: 0,
        executedCount: 0,
        dailyUsed: 0,
        dailyRemaining: 0,
        results: [],
        status: 200,
      },
    });

    const geocodeRes = await geocodePost(
      jsonRequest("http://localhost/api/geocode", { lat: 46.3, lng: 15.1 })
    );
    const placesRes = await placesPost(
      jsonRequest("http://localhost/api/places/search", { lat: 46, lng: 14, radiusKm: 10 })
    );
    const serpRes = await serpPost(
      jsonRequest("http://localhost/api/serp/search", {
        items: ["desk"],
        allowlistDomains: ["localhome.si"],
        dryRun: true,
      })
    );

    expect(geocodeRes.status).toBe(200);
    expect(placesRes.status).toBe(200);
    expect(serpRes.status).toBe(200);
  });

  it("allows the explicit debug gate without a user, but never in production", async () => {
    isDebugApiAllowedMock.mockReturnValue(true);
    geocodeAddressMock.mockResolvedValue({
      ok: true,
      formattedAddress: "Ljubljana",
      lat: 46.05,
      lng: 14.5,
      countryCode: "SI",
    });

    const debugRes = await geocodePost(
      jsonRequest("http://localhost/api/geocode", { address: "Ljubljana" })
    );
    expect(debugRes.status).toBe(200);
    expect(getVerifiedUserMock).not.toHaveBeenCalled();

    isDebugApiAllowedMock.mockReturnValue(false);
    getVerifiedUserMock.mockResolvedValue(null);
    const prodRes = await geocodePost(
      jsonRequest("http://localhost/api/geocode", { address: "Ljubljana" })
    );
    expect(prodRes.status).toBe(401);
  });
});
