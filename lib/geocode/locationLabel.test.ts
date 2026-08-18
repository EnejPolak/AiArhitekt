import { describe, expect, it } from "vitest";
import { locationLabelFromGeocode } from "./locationLabel";

describe("locationLabelFromGeocode", () => {
  it("uses formattedAddress as the human-readable label", () => {
    expect(
      locationLabelFromGeocode(
        { ok: true, formattedAddress: "Velenje, Slovenia" },
        { latitude: 46.3644, longitude: 15.1117 }
      )
    ).toBe("Velenje, Slovenia");
  });

  it("falls back to coordinates only when formattedAddress is missing", () => {
    expect(
      locationLabelFromGeocode(
        { ok: true },
        { latitude: 46.3644, longitude: 15.1117 }
      )
    ).toBe("46.3644, 15.1117");
  });

  it("does not read a competing address field", () => {
    expect(
      locationLabelFromGeocode(
        { ok: true, formattedAddress: "Velenje, Slovenia", address: "46.3644, 15.1117" } as {
          ok: true;
          formattedAddress: string;
        },
        { latitude: 46.3644, longitude: 15.1117 }
      )
    ).toBe("Velenje, Slovenia");
  });
});
