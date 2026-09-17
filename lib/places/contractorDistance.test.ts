import { describe, expect, it } from "vitest";
import {
  contractorDistanceLimitKm,
  filterContractorsByRequestedRadius,
  isContractorWithinRequestedRadius,
  readPlaceCoordinates,
} from "./contractorDistance";

const LJUBLJANA = { lat: 46.0569, lng: 14.5058 };

function northOf(origin: { lat: number; lng: number }, km: number) {
  return { lat: origin.lat + km / 111.32, lng: origin.lng };
}

describe("contractor distance filter", () => {
  it("includes nearby and boundary-near contractors and excludes a far-away outlier", () => {
    const radiusKm = 25;
    const nearby = { name: "A", ...northOf(LJUBLJANA, 5) };
    const boundary = { name: "B", ...northOf(LJUBLJANA, 22) };
    const far = { name: "C", lat: 33.4484, lng: -112.074 };

    const kept = filterContractorsByRequestedRadius(
      [nearby, boundary, far],
      LJUBLJANA,
      radiusKm,
      (item) => ({ lat: item.lat, lng: item.lng })
    ).map((item) => item.name);

    expect(kept).toEqual(["A", "B"]);
    expect(isContractorWithinRequestedRadius(LJUBLJANA, far, radiusKm)).toBe(false);
    expect(contractorDistanceLimitKm(radiusKm)).toBeLessThan(40);
  });

  it("excludes contractors with no usable coordinates", () => {
    expect(readPlaceCoordinates({ name: "No geometry" })).toBeNull();
    expect(isContractorWithinRequestedRadius(LJUBLJANA, null, 25)).toBe(false);
    const kept = filterContractorsByRequestedRadius(
      [{ name: "Missing" }, { name: "Local", geometry: { location: northOf(LJUBLJANA, 4) } }],
      LJUBLJANA,
      25,
      readPlaceCoordinates
    );
    expect(kept.map((item) => item.name)).toEqual(["Local"]);
  });

  it("does not treat address text as coordinates", () => {
    expect(
      readPlaceCoordinates({
        formatted_address: "Phoenix, AZ 85032, USA",
        name: "North Phoenix Painter",
      })
    ).toBeNull();
  });
});
