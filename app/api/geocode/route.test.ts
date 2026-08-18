import { beforeEach, describe, expect, it, vi } from "vitest";
import { reverseGeocode } from "@/lib/geocode/service";
import { POST } from "./route";

vi.mock("@/lib/geocode/service", () => ({
  geocodeAddress: vi.fn(),
  reverseGeocode: vi.fn(),
}));

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
    });
    expect(body).not.toHaveProperty("address");
    expect(reverseGeocodeMock).toHaveBeenCalledWith(46.3644, 15.1117);
  });
});
