import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { completeRoomGate } from "@/lib/discovery/completeRoom";
import type { UnmatchedRequirement } from "@/lib/discovery/itemSpecs";
import { EMPTY_PROJECT_ROOM_PREFERENCES } from "@/lib/project-preferences/types";
import {
  architecturalFinishesFromSnapshot,
  resolveArchitecturalFinishes,
  requestedFinishLabel,
  resolvedFinishLabel,
} from "./finishes";
import { canonicalRenderPreferences, type RoomRenderPreferences } from "./preferences";
import { evaluateCompleteRoomReadiness } from "./readiness";
import { buildRenderHonestyReport } from "./report";

const SOFA_KEY = "furniture:sofa:0";
const TABLE_KEY = "furniture:coffee-table:1";
const RUG_KEY = "furniture:rug:2";
const FLOOR_KEY = "material:floor:user-flooring:hardwood";
const WALL_KEY = "material:wall:interior-wall-paint:main";

const READY_FURNITURE = [SOFA_KEY, TABLE_KEY, RUG_KEY];

function prefs(overrides: Partial<RoomRenderPreferences> = {}): RoomRenderPreferences {
  return canonicalRenderPreferences({
    selectedStyles: ["minimal"],
    budgetLevel: null,
    wallMainColor: "",
    wallAccentColor: "",
    flooring: "keep",
    underfloorHeating: false,
    bedType: "none",
    keepExistingWalls: true,
    wallFinishMode: "keep_existing",
    notes: "",
    ...overrides,
  });
}

function unmatched(key: string, spec: string): UnmatchedRequirement {
  return {
    requirementKey: key,
    requirementType: key.startsWith("material") ? "material" : "furniture",
    itemSpec: spec,
    displayLabel: spec,
    reason: "no_valid_product",
  };
}

describe("finish intent enforcement", () => {
  it("A. change floor without READY floor is unresolved and blocks render", () => {
    const preferences = prefs({ flooring: "hardwood" });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [] });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 4,
      unmatched: [unmatched(FLOOR_KEY, "hardwood flooring")],
      readyRequirementKeys: READY_FURNITURE,
      preferences,
    });

    expect(finishes.floor_finish.requestedMode).toBe("exact_product");
    expect(finishes.floor_finish.resolvedMode).toBe("unresolved");
    expect(finishes.floor_finish.resolvedMode).not.toBe("keep_existing");
    expect(gate.allowed).toBe(false);
    expect(gate.unresolvedSlots).toBeGreaterThan(0);
    expect(gate.unresolvedLabels.join(" ")).toMatch(/Floor change is unresolved/i);
  });

  it("B. change floor with READY exact floor allows render", () => {
    const preferences = prefs({ flooring: "hardwood" });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 4,
      unmatched: [],
      readyRequirementKeys: [...READY_FURNITURE, FLOOR_KEY],
      preferences,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.unresolvedSlots).toBe(0);
  });

  it("C. change floor then explicit Keep existing allows render", () => {
    const afterKeep = prefs({ flooring: "keep" });
    const finishes = resolveArchitecturalFinishes({ preferences: afterKeep, references: [] });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 3,
      unmatched: [],
      readyRequirementKeys: READY_FURNITURE,
      preferences: afterKeep,
    });
    expect(finishes.floor_finish.requestedMode).toBe("keep_existing");
    expect(finishes.floor_finish.resolvedMode).toBe("keep_existing");
    expect(gate.allowed).toBe(true);
  });

  it("D. wall concept color allows render without a merchant paint product", () => {
    const preferences = prefs({
      wallFinishMode: "concept_color",
      wallMainColor: "warm greige",
    });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [] });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 3,
      unmatched: [],
      readyRequirementKeys: READY_FURNITURE,
      preferences,
    });
    expect(finishes.wall_finish.requestedMode).toBe("concept_color");
    expect(finishes.wall_finish.resolvedMode).toBe("concept_color");
    expect(finishes.wall_finish.shoppable).toBe(false);
    expect(gate.allowed).toBe(true);
  });

  it("E. exact wall paint requested but unavailable stays unresolved and blocks render", () => {
    const preferences = prefs({
      wallFinishMode: "exact_product",
      wallMainColor: "warm greige",
    });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [] });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 4,
      unmatched: [unmatched(WALL_KEY, "interior wall paint")],
      readyRequirementKeys: READY_FURNITURE,
      preferences,
    });
    expect(finishes.wall_finish.requestedMode).toBe("exact_product");
    expect(finishes.wall_finish.resolvedMode).toBe("unresolved");
    expect(finishes.wall_finish.resolvedMode).not.toBe("concept_color");
    expect(gate.allowed).toBe(false);
    expect(gate.unresolvedLabels.join(" ")).toMatch(/Exact wall paint is unresolved/i);
  });

  it("F. exact wall paint unavailable then explicit switch to concept color allows render", () => {
    const preferences = prefs({
      wallFinishMode: "concept_color",
      wallMainColor: "warm greige",
    });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [] });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 3,
      unmatched: [],
      readyRequirementKeys: READY_FURNITURE,
      preferences,
    });
    expect(finishes.wall_finish.requestedMode).toBe("concept_color");
    expect(finishes.wall_finish.resolvedMode).toBe("concept_color");
    expect(gate.allowed).toBe(true);
  });

  it("G. DB default keep_existing_walls = true for new rows", () => {
    const sql = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260818700000_keep_existing_walls_default_true.sql"),
      "utf8"
    );
    expect(sql).toMatch(/keep_existing_walls\s+set default true/i);
    expect(sql).not.toMatch(/update\s+public\.project_room_preferences/i);
    expect(sql).not.toMatch(/wall_finish_mode/);
    expect(sql).not.toMatch(/enable row level security/i);
    expect(EMPTY_PROJECT_ROOM_PREFERENCES.keepExistingWalls).toBe(true);
    expect(canonicalRenderPreferences({}).keepExistingWalls).toBe(true);
    expect(canonicalRenderPreferences({}).wallFinishMode).toBe("keep_existing");
  });

  it("H. requested intent and resolved mode are not conflated", () => {
    const preferences = prefs({ flooring: "hardwood" });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [] });
    const honesty = buildRenderHonestyReport({ inventory: [], finishes });
    const parsed = architecturalFinishesFromSnapshot({ architecturalFinishes: finishes });

    expect(honesty.finishIntent.floor_finish.requestedLabel).toBe("Change floor");
    expect(honesty.finishIntent.floor_finish.resolvedLabel).toBe("Unresolved");
    expect(honesty.finishIntent.floor_finish.resolvedMode).not.toBe("keep_existing");
    expect(requestedFinishLabel("floor_finish", finishes.floor_finish.requestedMode)).toBe("Change floor");
    expect(resolvedFinishLabel(finishes.floor_finish.resolvedMode)).toBe("Unresolved");
    expect(parsed?.floor_finish.requestedMode).toBe("exact_product");
    expect(parsed?.floor_finish.resolvedMode).toBe("unresolved");
  });

  it("product-only unmatched floor leftover does not block when floor is keep existing", () => {
    const preferences = prefs({ flooring: "keep" });
    const product = completeRoomGate({
      searchedItemCount: 4,
      unmatched: [unmatched(FLOOR_KEY, "hardwood flooring")],
      readyRequirementKeys: READY_FURNITURE,
    });
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 4,
      unmatched: [unmatched(FLOOR_KEY, "hardwood flooring")],
      readyRequirementKeys: READY_FURNITURE,
      preferences,
    });
    expect(product.allowed).toBe(true);
    expect(gate.allowed).toBe(true);
  });
});
