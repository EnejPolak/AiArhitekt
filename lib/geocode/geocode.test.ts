import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { geocodeAddress, reverseGeocode, clearGeocodeCache } from "./service";
import { getGeocodingConfig } from "./config";
import { normalizeGeocodeAddress } from "./normalize";
import { GEOCODING_ERROR_CODES } from "./types";

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const OK_BODY = {
  status: "OK",
  results: [
    {
      formatted_address: "Velenje, Slovenia",
      geometry: { location: { lat: 46.3592, lng: 15.1103 } },
    },
  ],
};

describe("geocode", () => {
  const fetchFn = vi.fn();
  let prevEnabled: string | undefined;
  let prevKey: string | undefined;
  let prevDaily: string | undefined;
  let prevMonthly: string | undefined;

  beforeEach(() => {
    clearGeocodeCache();
    fetchFn.mockReset();
    prevEnabled = process.env.GOOGLE_GEOCODING_ENABLED;
    prevKey = process.env.GOOGLE_MAPS_API_KEY;
    prevDaily = process.env.GOOGLE_GEOCODING_DAILY_LIMIT;
    prevMonthly = process.env.GOOGLE_GEOCODING_MONTHLY_SOFT_LIMIT;
    process.env.GOOGLE_GEOCODING_ENABLED = "true";
    process.env.GOOGLE_MAPS_API_KEY = "test-key";
  });

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.GOOGLE_GEOCODING_ENABLED;
    else process.env.GOOGLE_GEOCODING_ENABLED = prevEnabled;
    if (prevKey === undefined) delete process.env.GOOGLE_MAPS_API_KEY;
    else process.env.GOOGLE_MAPS_API_KEY = prevKey;
    if (prevDaily === undefined) delete process.env.GOOGLE_GEOCODING_DAILY_LIMIT;
    else process.env.GOOGLE_GEOCODING_DAILY_LIMIT = prevDaily;
    if (prevMonthly === undefined) delete process.env.GOOGLE_GEOCODING_MONTHLY_SOFT_LIMIT;
    else process.env.GOOGLE_GEOCODING_MONTHLY_SOFT_LIMIT = prevMonthly;
  });

  describe("normalizeGeocodeAddress", () => {
    it("collapses equivalent location strings", () => {
      expect(normalizeGeocodeAddress("Velenje")).toBe("velenje");
      expect(normalizeGeocodeAddress(" velenje ")).toBe("velenje");
      expect(normalizeGeocodeAddress("VELENJE")).toBe("velenje");
      expect(normalizeGeocodeAddress("Velenje   Slovenia")).toBe("velenje slovenia");
    });
  });

  it("does not call Google when geocoding is disabled", async () => {
    process.env.GOOGLE_GEOCODING_ENABLED = "false";
    const result = await geocodeAddress("Velenje", fetchFn);
    expect(result).toMatchObject({
      ok: false,
      code: GEOCODING_ERROR_CODES.DISABLED,
      message: "Google geocoding is disabled.",
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("does not call Google when enabled but API key is missing", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const result = await geocodeAddress("Velenje", fetchFn);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(GEOCODING_ERROR_CODES.NOT_CONFIGURED);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns lat/lng on a successful Google response", async () => {
    fetchFn.mockResolvedValue(jsonResponse(OK_BODY));
    const result = await geocodeAddress("Velenje", fetchFn);
    expect(result).toEqual({
      ok: true,
      formattedAddress: "Velenje, Slovenia",
      lat: 46.3592,
      lng: 15.1103,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain("maps.googleapis.com/maps/api/geocode/json");
    expect(url).toContain("address=velenje");
    expect(url).not.toContain("AIza");
  });

  it("reuses cache for repeated normalized locations (one Google call)", async () => {
    fetchFn.mockResolvedValue(jsonResponse(OK_BODY));
    const a = await geocodeAddress("Velenje", fetchFn);
    const b = await geocodeAddress(" velenje ", fetchFn);
    const c = await geocodeAddress("VELENJE", fetchFn);
    expect(a.ok && b.ok && c.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps OVER_QUERY_LIMIT without retrying", async () => {
    fetchFn.mockResolvedValue(jsonResponse({ status: "OVER_QUERY_LIMIT" }));
    const result = await geocodeAddress("Ljubljana", fetchFn);
    expect(result).toMatchObject({
      ok: false,
      code: GEOCODING_ERROR_CODES.QUOTA_REACHED,
      message: "Geocoding request limit reached.",
      httpStatus: 429,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not retry after a quota HTTP 429", async () => {
    fetchFn.mockResolvedValue(jsonResponse({}, 429));
    const result = await geocodeAddress("Celje", fetchFn);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe(GEOCODING_ERROR_CODES.QUOTA_REACHED);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps REQUEST_DENIED without retrying or leaking provider messages", async () => {
    fetchFn.mockResolvedValue(
      jsonResponse({
        status: "REQUEST_DENIED",
        error_message: "This API project is not authorized.",
      })
    );
    const result = await geocodeAddress("Maribor", fetchFn);
    expect(result).toMatchObject({
      ok: false,
      code: GEOCODING_ERROR_CODES.REQUEST_DENIED,
    });
    expect(JSON.stringify(result)).not.toContain("not authorized");
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps malformed Google JSON without retrying", async () => {
    fetchFn.mockResolvedValue(jsonResponse({ status: "OK", results: [{ formatted_address: "x" }] }));
    const result = await geocodeAddress("Kranj", fetchFn);
    expect(result).toMatchObject({
      ok: false,
      code: GEOCODING_ERROR_CODES.MALFORMED,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("maps ZERO_RESULTS as not found", async () => {
    fetchFn.mockResolvedValue(jsonResponse({ status: "ZERO_RESULTS", results: [] }));
    const result = await geocodeAddress("zzz-unknown-place", fetchFn);
    expect(result).toMatchObject({
      ok: false,
      code: GEOCODING_ERROR_CODES.NOT_FOUND,
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("does not cache quota errors (but still does not retry that call)", async () => {
    fetchFn
      .mockResolvedValueOnce(jsonResponse({ status: "OVER_QUERY_LIMIT" }))
      .mockResolvedValueOnce(jsonResponse(OK_BODY));
    const first = await geocodeAddress("Novo mesto", fetchFn);
    const second = await geocodeAddress("Novo mesto", fetchFn);
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(true);
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it("reads daily/monthly env as documented targets (not an in-app counter)", () => {
    process.env.GOOGLE_GEOCODING_DAILY_LIMIT = "200";
    process.env.GOOGLE_GEOCODING_MONTHLY_SOFT_LIMIT = "8000";
    const cfg = getGeocodingConfig();
    expect(cfg.enabled).toBe(true);
    expect(cfg.dailyLimit).toBe(200);
    expect(cfg.monthlySoftLimit).toBe(8000);
  });

  it("protects reverse geocode with the same kill switch", async () => {
    process.env.GOOGLE_GEOCODING_ENABLED = "false";
    const result = await reverseGeocode(46.05, 14.5, fetchFn);
    expect(result).toMatchObject({ ok: false, code: GEOCODING_ERROR_CODES.DISABLED });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("returns formattedAddress for a successful reverse geocode", async () => {
    fetchFn.mockResolvedValue(jsonResponse(OK_BODY));
    const result = await reverseGeocode(46.3592, 15.1103, fetchFn);
    expect(result).toEqual({
      ok: true,
      formattedAddress: "Velenje, Slovenia",
      lat: 46.3592,
      lng: 15.1103,
    });
    expect(result).not.toHaveProperty("address");
  });
});
