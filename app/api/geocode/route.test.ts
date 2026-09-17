import { beforeEach, describe, expect, it, vi } from "vitest";
import { reverseGeocode } from "@/lib/geocode/service";
import { POST } from "./route";

vi.mock("@/lib/geocode/service", () => ({
  geocodeAddress: vi.fn(),
  reverseGeocode: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({
  getVerifiedUser: vi.fn(async () => ({ id: "user-1" })),
}));

vi.mock("@/lib/env/deployment", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env/deployment")>("@/lib/env/deployment");
  return { ...actual, isDebugApiAllowed: () => false };
});

const reverseGeocodeMock = vi.mocked(reverseGeocode);

describe("POST /api/geocode", () => {
  beforeEach(() => {
    reverseGeocodeMock.mockReset();
  });

  it("returns formattedAddress for lat/lng reverse geocode", async () => {
    reverseGeocodeMock.mockResolvedValue({
      ok: true,
      formattedAddress: "Velenje, Slovenia",
      lat: 46.3644,
      lng: 15.1117,
      countryCode: "SI",
    });

    const response = await POST(
      new Request("http://localhost/api/geocode", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lat: 46.3644, lng: 15.1117 }),
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      formattedAddress: "Velenje, Slovenia",
      lat: 46.3644,
      lng: 15.1117,
      countryCode: "SI",
    });
    expect(body).not.toHaveProperty("address");
    expect(reverseGeocodeMock).toHaveBeenCalledWith(46.3644, 15.1117);
  });
});
