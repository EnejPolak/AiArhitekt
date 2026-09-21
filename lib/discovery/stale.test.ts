import { describe, expect, it } from "vitest";
import type { ProjectRoomAnalysisRow } from "@/lib/analysis/queries";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { shoppingPreferencesMatch } from "./preferences";
import {
  EMPTY_SHOPPING_PREFERENCE_HASH,
  shoppingPreferenceHash,
} from "./preferenceHash";
import {
  discoveryMatchesShoppingSource,
  isCurrentProductDiscovery,
  isDiscoveryAnalysisCurrent,
} from "./stale";
import type { ProductDiscoveryView } from "./types";

const analysis: ProjectRoomAnalysisRow = {
  id: "11111111-1111-4111-8111-111111111111",
  project_id: "22222222-2222-4222-8222-222222222222",
  source_upload_id: "33333333-3333-4333-8333-333333333333",
  source_storage_path:
    "projects/22222222-2222-4222-8222-222222222222/uploads/33333333-3333-4333-8333-333333333333.jpg",
  schema_version: 1,
  provider: "openai",
  model: "gpt-4o",
  analysis: validRoomAnalysisResult.analysis,
  design_requirements: validRoomAnalysisResult.designRequirements,
  created_at: "2026-08-18T00:00:00.000Z",
  updated_at: "2026-08-18T00:00:00.000Z",
};

const marblePrefs = {
  wallMainColor: "metallic black",
  wallAccentColor: "olive green",
  flooring: "marble" as const,
  underfloorHeating: false,
  bedType: "none" as const,
  selectedStyles: ["modern"],
};

function discovery(overrides: Partial<ProductDiscoveryView> = {}): ProductDiscoveryView {
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    projectId: analysis.project_id,
    sourceAnalysisId: analysis.id,
    sourceAnalysisUpdatedAt: analysis.updated_at,
    locationInput: "Velenje, Slovenia",
    latitude: 46.3592,
    longitude: 15.1103,
    radiusKm: 50,
    searchedItemCount: 2,
    notSearchedCount: 0,
    allowlistDomains: ["localhome.si"],
    unmatchedRequirements: [],
    sourcePreferences: {
      schemaVersion: 1,
      selectedStyles: ["modern"],
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
      flooring: "marble",
      underfloorHeating: false,
      bedType: "none",
      keepExistingWalls: false,
    },
    sourcePreferencesHash: shoppingPreferenceHash(marblePrefs),
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

describe("discovery shopping source identity", () => {
  it("reuses when analysis, location, and normalized preferences match", () => {
    const row = discovery();
    expect(isDiscoveryAnalysisCurrent(row, analysis)).toBe(true);
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "  velenje,   slovenia ",
        preferences: {
          ...marblePrefs,
          wallMainColor: "Metallic  Black",
          selectedStyles: ["Modern"],
        },
      })
    ).toBe(true);
    expect(
      discoveryMatchesShoppingSource(row, {
        locationInput: "Velenje, Slovenia",
        preferences: marblePrefs,
      })
    ).toBe(true);
  });

  it("does not stale furniture discovery when flooring changes from marble to wood", () => {
    const row = discovery();
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        preferences: { ...marblePrefs, flooring: "hardwood" },
      })
    ).toBe(true);
  });

  it("does not stale furniture discovery when wall color changes from metallic black to white", () => {
    const row = discovery();
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        preferences: { ...marblePrefs, wallMainColor: "white" },
      })
    ).toBe(true);
  });

  it("does not invalidate for notes or budget-only UI state", () => {
    const row = discovery();
    expect(
      shoppingPreferenceHash({
        ...marblePrefs,
        notes: "please make it cozy",
        budgetLevel: "premium",
      } as never)
    ).toBe(row.sourcePreferencesHash);
    expect(
      shoppingPreferencesMatch(row.sourcePreferences, {
        ...marblePrefs,
        notes: "please make it cozy",
        budgetLevel: "premium",
      })
    ).toBe(true);
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        preferences: marblePrefs,
      })
    ).toBe(true);
  });

  it("is stale when bed type, heating, or selected styles change", () => {
    const row = discovery();
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        preferences: { ...marblePrefs, bedType: "king" },
      })
    ).toBe(false);
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        preferences: { ...marblePrefs, underfloorHeating: true },
      })
    ).toBe(false);
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        preferences: { ...marblePrefs, selectedStyles: ["industrial"] },
      })
    ).toBe(false);
  });

  it("is stale when coordinates change", () => {
    const row = discovery();
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        latitude: 46.05,
        longitude: 14.5,
        radiusKm: 50,
        preferences: marblePrefs,
      })
    ).toBe(false);
  });

  it("is stale when only radius changes", () => {
    const row = discovery();
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        latitude: 46.3592,
        longitude: 15.1103,
        radiusKm: 10,
        preferences: marblePrefs,
      })
    ).toBe(false);
    expect(
      isCurrentProductDiscovery(row, analysis, {
        locationInput: "Velenje, Slovenia",
        latitude: 46.3592,
        longitude: 15.1103,
        radiusKm: 50,
        preferences: marblePrefs,
      })
    ).toBe(true);
  });

  it("keeps the empty snapshot hash stable for backfill", () => {
    expect(EMPTY_SHOPPING_PREFERENCE_HASH).toBe(
      "55b1c94ff5ba8f92fd175b9f1b63ca4fb5563daa3711ab0d952f5127607a5c4c"
    );
  });
});
