import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  clampSearchRadiusKm,
  isValidSearchCoordinate,
  parseProjectLocation,
  projectLocationLabel,
  searchLocationsMatch,
} from "./parse";

describe("project location parse", () => {
  it("clamps radius to the Places 1–50 km contract", () => {
    expect(clampSearchRadiusKm(100)).toBe(50);
    expect(clampSearchRadiusKm(0)).toBe(1);
    expect(clampSearchRadiusKm(25.4)).toBe(25);
    expect(clampSearchRadiusKm(undefined)).toBe(50);
  });

  it("rejects null, NaN, and out-of-range coordinates", () => {
    expect(isValidSearchCoordinate(null, 15)).toBe(false);
    expect(isValidSearchCoordinate(Number.NaN, 15)).toBe(false);
    expect(isValidSearchCoordinate(46.2, Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidSearchCoordinate(91, 15)).toBe(false);
    expect(isValidSearchCoordinate(46.2, 181)).toBe(false);
    expect(isValidSearchCoordinate(46.23, 15.26)).toBe(true);
  });

  it("parses a persisted Celje location for contractors after losing wizard state", () => {
    const location = parseProjectLocation({
      locationInput: "Celje",
      formattedAddress: "Celje, Slovenia",
      latitude: 46.2358,
      longitude: 15.2677,
      radiusKm: 25,
      countryCode: "SI",
    });
    const lostWizardState = { location: null, radiusKm: 50 };
    expect(lostWizardState.location).toBeNull();
    expect(location).toMatchObject({
      locationInput: "Celje",
      latitude: 46.2358,
      longitude: 15.2677,
      radiusKm: 25,
    });
    expect(projectLocationLabel(location!)).toBe("Celje, Slovenia");
  });

  it("does not parse invalid persisted coordinates", () => {
    expect(
      parseProjectLocation({
        locationInput: "Celje",
        formattedAddress: "Celje",
        latitude: 999,
        longitude: 15,
        radiusKm: 25,
        countryCode: "SI",
      })
    ).toBeNull();
  });

  it("treats radius-only and coordinate changes as different search contexts", () => {
    const celje = { latitude: 46.2358, longitude: 15.2677, radiusKm: 10 };
    expect(searchLocationsMatch(celje, { ...celje, radiusKm: 40 })).toBe(false);
    expect(
      searchLocationsMatch(celje, { latitude: 46.05, longitude: 14.5, radiusKm: 10 })
    ).toBe(false);
    expect(searchLocationsMatch(celje, { ...celje })).toBe(true);
  });
});

describe("project location ownership", () => {
  it("saves location through the existing owned preference action", () => {
    const source = readFileSync(join(process.cwd(), "lib/project-preferences/actions.ts"), "utf8");
    expect(source).toContain("saveProjectLocationAction");
    expect(source).toContain("getVerifiedUser");
    expect(source).toContain("requireOwnedRoomProject");
  });

  it("hydrates Step6b and contractors from persisted project preferences", () => {
    const page = readFileSync(join(process.cwd(), "app/app/projects/[projectId]/page.tsx"), "utf8");
    const flow = readFileSync(
      join(process.cwd(), "components/app/room-renovation/RoomRenovationFlow.tsx"),
      "utf8"
    );
    const step6b = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step6bLocation.tsx"),
      "utf8"
    );
    const step9d = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step9dContractors.tsx"),
      "utf8"
    );
    expect(page).toContain("loadPersistedProjectRoomPreferences");
    expect(flow).toContain("parseProjectLocation");
    expect(flow).toContain("searchLocation");
    expect(flow).toContain("Step9dContractors");
    expect(flow).toContain("location={searchLocation}");
    expect(step6b).toContain("saveProjectLocationAction");
    expect(step6b).toContain("MAX_DISCOVERY_RADIUS_KM");
    expect(step6b).not.toContain("100 km");
    expect(step9d).toContain("location.lat");
    expect(step9d).toContain("location.lng");
  });
});
