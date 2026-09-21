import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Database } from "@/lib/database.types";
import { furnitureShoppingPreferencesMatch } from "@/lib/discovery/preferences";
import { discoveryMatchesShoppingSource, isCurrentProductDiscovery } from "@/lib/discovery/stale";
import { shoppingPreferenceHash } from "@/lib/discovery/preferenceHash";
import { mapProjectRoomPreferenceRow } from "@/lib/project-preferences/queries";
import { EMPTY_PROJECT_ROOM_PREFERENCES } from "@/lib/project-preferences/types";
import { projectRoomPreferencesToShoppingPreferences } from "@/lib/project-preferences/adapter";
import {
  inferLegacyFloorFinishMode,
  inferLegacyWallFinishMode,
  canonicalRenderPreferences,
} from "@/lib/render/preferences";
import { resolveArchitecturalFinishes } from "@/lib/render/finishes";
import { buildRoomRenderPrompt } from "@/lib/render/prompt";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import type { ProjectRoomAnalysisRow } from "@/lib/analysis/queries";
import type { ProductDiscoveryView } from "@/lib/discovery/types";

type PreferenceRow = Database["public"]["Tables"]["project_room_preferences"]["Row"];

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function row(overrides: Partial<PreferenceRow> = {}): PreferenceRow {
  return {
    project_id: PROJECT_ID,
    room_type: "living-room",
    selected_styles: ["modern"],
    budget_level: null,
    wall_main_color: "",
    wall_accent_color: "",
    flooring: "keep",
    underfloor_heating: false,
    bed_type: "none",
    notes: "",
    keep_existing_walls: true,
    wall_finish_mode: null,
    floor_finish_mode: null,
    location_input: null,
    formatted_address: null,
    latitude: null,
    longitude: null,
    radius_km: null,
    country_code: null,
    created_at: "2026-09-21T00:00:00.000Z",
    updated_at: "2026-09-21T00:00:00.000Z",
    ...overrides,
  };
}

const analysis: ProjectRoomAnalysisRow = {
  id: "22222222-2222-4222-8222-222222222222",
  project_id: PROJECT_ID,
  source_upload_id: "33333333-3333-4333-8333-333333333333",
  source_storage_path: "projects/x/uploads/y.jpg",
  schema_version: 2,
  provider: "openai",
  model: "gpt-4o",
  analysis: validRoomAnalysisResult.analysis,
  design_requirements: validRoomAnalysisResult.designRequirements,
  created_at: "2026-09-21T00:00:00.000Z",
  updated_at: "2026-09-21T00:00:00.000Z",
};

function discoveryFromShopping(preferences: object): ProductDiscoveryView {
  const hash = shoppingPreferenceHash(preferences);
  return {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    projectId: PROJECT_ID,
    sourceAnalysisId: analysis.id,
    sourceAnalysisUpdatedAt: analysis.updated_at,
    locationInput: "Velenje",
    latitude: 46.36,
    longitude: 15.11,
    radiusKm: 50,
    searchedItemCount: 3,
    notSearchedCount: 0,
    allowlistDomains: ["localhome.si"],
    unmatchedRequirements: [],
    sourcePreferences: {
      schemaVersion: 2,
      selectedStyles: ["modern"],
      wallMainColor: "",
      wallAccentColor: "",
      flooring: "keep",
      underfloorHeating: false,
      bedType: "none",
      keepExistingWalls: true,
      noteShoppingIntents: [],
    },
    sourcePreferencesHash: hash,
    createdAt: "2026-09-21T00:00:00.000Z",
    updatedAt: "2026-09-21T00:00:00.000Z",
  };
}

describe("architectural finish mode persistence", () => {
  it("1. new row defaults are keep_existing for wall and floor", () => {
    expect(EMPTY_PROJECT_ROOM_PREFERENCES.wallFinishMode).toBe("keep_existing");
    expect(EMPTY_PROJECT_ROOM_PREFERENCES.floorFinishMode).toBe("keep_existing");
    expect(canonicalRenderPreferences({}).wallFinishMode).toBe("keep_existing");
    expect(canonicalRenderPreferences({}).floorFinishMode).toBe("keep_existing");
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260818800000_architectural_finish_modes.sql"),
      "utf8"
    );
    expect(sql).toMatch(/wall_finish_mode set default 'keep_existing'/);
    expect(sql).toMatch(/floor_finish_mode set default 'keep_existing'/);
  });

  it("2. concept_color persists after reload", () => {
    const mapped = mapProjectRoomPreferenceRow(
      row({
        wall_finish_mode: "concept_color",
        wall_main_color: "warm beige",
        keep_existing_walls: true,
      })
    );
    expect(mapped.wallFinishMode).toBe("concept_color");
    expect(mapped.wallFinishModeExplicit).toBe(true);
    expect(mapped.wallMainColor).toBe("warm beige");
  });

  it("3. exact_product wall persists after reload", () => {
    const mapped = mapProjectRoomPreferenceRow(row({ wall_finish_mode: "exact_product" }));
    expect(mapped.wallFinishMode).toBe("exact_product");
    expect(mapped.wallFinishModeExplicit).toBe(true);
  });

  it("4. exact_product floor persists after reload", () => {
    const mapped = mapProjectRoomPreferenceRow(
      row({ floor_finish_mode: "exact_product", flooring: "hardwood" })
    );
    expect(mapped.floorFinishMode).toBe("exact_product");
    expect(mapped.floorFinishModeExplicit).toBe(true);
  });

  it("5. unresolved exact floor remains unresolved after reload", () => {
    const mapped = mapProjectRoomPreferenceRow(
      row({ floor_finish_mode: "exact_product", flooring: "hardwood" })
    );
    const finishes = resolveArchitecturalFinishes({
      preferences: canonicalRenderPreferences(mapped),
      references: [],
    });
    expect(finishes.floor.mode).toBe("exact_product");
    expect(finishes.floor_finish.requestedMode).toBe("exact_product");
    expect(finishes.floor_finish.resolvedMode).toBe("unresolved");
    expect(finishes.floor_finish.resolvedMode).not.toBe("keep_existing");
  });

  it("6. legacy wall row inference", () => {
    expect(
      inferLegacyWallFinishMode({ keepExistingWalls: true, wallMainColor: "red" })
    ).toBe("keep_existing");
    expect(
      inferLegacyWallFinishMode({
        keepExistingWalls: false,
        hasReadyExactWallProduct: true,
        wallMainColor: "red",
      })
    ).toBe("exact_product");
    expect(
      inferLegacyWallFinishMode({ keepExistingWalls: false, wallMainColor: "warm beige" })
    ).toBe("concept_color");
    expect(inferLegacyWallFinishMode({ keepExistingWalls: false })).toBe("keep_existing");

    const keep = mapProjectRoomPreferenceRow(row({ keep_existing_walls: true, wall_main_color: "navy" }));
    expect(keep.wallFinishMode).toBe("keep_existing");
    expect(keep.wallFinishModeExplicit).toBe(false);

    const concept = mapProjectRoomPreferenceRow(
      row({ keep_existing_walls: false, wall_main_color: "warm beige" })
    );
    expect(concept.wallFinishMode).toBe("concept_color");
    expect(concept.wallFinishModeExplicit).toBe(false);

    const exact = mapProjectRoomPreferenceRow(row({ keep_existing_walls: false }), {
      hasReadyExactWallProduct: true,
    });
    expect(exact.wallFinishMode).toBe("exact_product");
    expect(exact.wallFinishModeExplicit).toBe(false);
  });

  it("7. legacy floor row inference", () => {
    expect(inferLegacyFloorFinishMode({ flooring: "hardwood" })).toBe("keep_existing");
    expect(
      inferLegacyFloorFinishMode({ flooring: "hardwood", hasReadyExactFloorProduct: true })
    ).toBe("exact_product");
    expect(inferLegacyFloorFinishMode({ flooring: "keep", hasReadyExactFloorProduct: true })).toBe(
      "keep_existing"
    );

    const unresolvedLegacy = mapProjectRoomPreferenceRow(row({ flooring: "marble" }));
    expect(unresolvedLegacy.floorFinishMode).toBe("keep_existing");
    expect(unresolvedLegacy.floorFinishModeExplicit).toBe(false);

    const readyLegacy = mapProjectRoomPreferenceRow(row({ flooring: "marble" }), {
      hasReadyExactFloorProduct: true,
    });
    expect(readyLegacy.floorFinishMode).toBe("exact_product");
  });

  it("8. existing rows are not rewritten by migration", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260818800000_architectural_finish_modes.sql"),
      "utf8"
    );
    expect(sql).not.toMatch(/update\s+public\.project_room_preferences/i);
    expect(sql).not.toMatch(/enable row level security/i);
    expect(sql).not.toMatch(/grant /i);
    expect(sql).toMatch(/wall_finish_mode is null/);
    expect(sql).toMatch(/floor_finish_mode is null/);
  });

  it("9. prompt snapshot uses persisted mode", () => {
    const preferences = canonicalRenderPreferences({
      wallFinishMode: "concept_color",
      wallMainColor: "warm beige",
      floorFinishMode: "exact_product",
      flooring: "hardwood",
    });
    const built = buildRoomRenderPrompt({
      observation: validRoomAnalysisResult.analysis,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      preferences,
      references: [],
    });
    expect(built.architecturalFinishes.wall.mode).toBe("concept_color");
    expect(built.architecturalFinishes.floor.mode).toBe("exact_product");
    expect(built.architecturalFinishes.wall_finish.mode).toBe("concept_color");
    expect(built.architecturalFinishes.floor_finish.mode).toBe("exact_product");
    expect(built.architecturalFinishes.wall_finish.requestedMode).toBe("concept_color");
    expect(built.architecturalFinishes.floor_finish.requestedMode).toBe("exact_product");
    expect(built.architecturalFinishes.floor_finish.resolvedMode).toBe("unresolved");
    expect(built.prompt).toContain("Wall finish requestedMode: concept_color.");
    expect(built.prompt).toContain("Floor finish requestedMode: exact_product.");
  });

  it("10. changing concept wall color does not stale furniture discovery", () => {
    const keep = projectRoomPreferencesToShoppingPreferences({
      ...EMPTY_PROJECT_ROOM_PREFERENCES,
      selectedStyles: ["modern"],
      wallFinishMode: "keep_existing",
      keepExistingWalls: true,
    });
    const concept = projectRoomPreferencesToShoppingPreferences({
      ...EMPTY_PROJECT_ROOM_PREFERENCES,
      selectedStyles: ["modern"],
      wallFinishMode: "concept_color",
      wallMainColor: "warm beige",
      keepExistingWalls: true,
    });
    expect(furnitureShoppingPreferencesMatch(keep, concept)).toBe(true);
    const existing = discoveryFromShopping(keep);
    expect(
      isCurrentProductDiscovery(existing, analysis, {
        locationInput: "Velenje",
        preferences: concept,
      })
    ).toBe(true);
  });

  it("11. changing flooring exact product does not rerun sofa/table/rug discovery", () => {
    const keepFloor = projectRoomPreferencesToShoppingPreferences({
      ...EMPTY_PROJECT_ROOM_PREFERENCES,
      selectedStyles: ["modern"],
      floorFinishMode: "keep_existing",
      flooring: "keep",
    });
    const changeFloor = projectRoomPreferencesToShoppingPreferences({
      ...EMPTY_PROJECT_ROOM_PREFERENCES,
      selectedStyles: ["modern"],
      floorFinishMode: "exact_product",
      flooring: "hardwood",
    });
    expect(furnitureShoppingPreferencesMatch(keepFloor, changeFloor)).toBe(true);
    const existing = discoveryFromShopping(keepFloor);
    expect(
      discoveryMatchesShoppingSource(existing, {
        locationInput: "Velenje",
        preferences: changeFloor,
      })
    ).toBe(true);
    const finishes = resolveArchitecturalFinishes({
      preferences: canonicalRenderPreferences({
        floorFinishMode: "exact_product",
        flooring: "hardwood",
        selectedStyles: ["modern"],
      }),
      references: [],
    });
    expect(finishes.floor_finish.resolvedMode).toBe("unresolved");
  });
});
