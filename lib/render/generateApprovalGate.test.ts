import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ProductSelectionView } from "@/lib/discovery/types";
import { toProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import { selectionsForRenderInventory } from "./inventory";
import {
  designBriefGenerateGate,
  evaluateCompleteRoomReadiness,
  productApprovalGate,
  referenceCapacityGate,
  tooManyReferencesBlockMessage,
} from "./readiness";
import { orderRenderReferences } from "./order";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import { resolveFinalReportProjectState, finalReportHeadline } from "./finalReportState";
import { EMPTY_DESIGN_BRIEF, parseDesignBriefAnswers } from "@/lib/design-brief";
import { MAX_RENDER_REFERENCE_IMAGES } from "./constants";

function selection(
  overrides: Partial<ProductSelectionView> &
    Pick<ProductSelectionView, "id" | "requirementKey" | "itemSpec" | "productTitle">
): ProductSelectionView {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    discoveryId: "22222222-2222-4222-8222-222222222222",
    requirementType: "furniture",
    requirementSnapshot: { category: overrides.itemSpec },
    productUrl: `https://www.localhome.si/p/${overrides.id}`,
    productImageUrl: "https://cdn.localhome.si/1.jpg",
    price: 10,
    currency: "EUR",
    retailerDomain: "localhome.si",
    retailerName: "Local",
    hasReferenceImage: true,
    isConfirmed: false,
    referenceStatus: "ready",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function asset(selectionId: string, hashChar: string): ProductReferenceAssetView {
  const projectId = "11111111-1111-4111-8111-111111111111";
  return {
    id: `asset-${selectionId}`,
    projectId,
    selectionId,
    sourceImageUrl: "https://cdn.localhome.si/1.jpg",
    sourcePageUrl: "https://www.localhome.si/p/1",
    isPrimary: true,
    sortOrder: 0,
    storageBucket: "project-assets",
    storagePath: `projects/${projectId}/product-references/${selectionId}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 22,
    sourceHash: hashChar.repeat(64),
    width: 64,
    height: 64,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const REQUIRED_KEYS = [
  "furniture:sofa:0",
  "furniture:coffee-table:0",
  "furniture:rug:0",
  "furniture:ceiling-light:0",
  "furniture:window-treatment:0",
  "furniture:storage:0",
  "furniture:floor-lamp:0",
] as const;

const DEMO_TITLES = [
  "CUBINO S",
  "Snape",
  "TRIOMPHE",
  "Reality Realta",
  "Mia",
  "Sierra SR8",
  "ELENA II",
] as const;

function sevenReady(confirmedFlags: boolean[] = [true, true, true, false, true, false, false]) {
  return REQUIRED_KEYS.map((key, index) =>
    selection({
      id: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString().padStart(12, "0")}`,
      requirementKey: key,
      itemSpec: key.split(":")[1]!.replace(/-/g, " "),
      productTitle: DEMO_TITLES[index]!,
      isConfirmed: confirmedFlags[index] ?? false,
      price: [1521, 57, 199, 69.99, 21.99, 717, 89.99][index]!,
    })
  );
}

function tracino() {
  return selection({
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    requirementKey: "furniture:tv-console:0",
    itemSpec: "tv console",
    productTitle: "TV omarica TRACINO",
    isConfirmed: true,
    price: 199,
  });
}

describe("autonomous design release regressions", () => {
  it("A: seven READY products with three is_confirmed=false still allow generate", () => {
    const required = sevenReady();
    expect(required.filter((item) => !item.isConfirmed).map((item) => item.productTitle)).toEqual([
      "Reality Realta",
      "Sierra SR8",
      "ELENA II",
    ]);
    expect(productApprovalGate(required).allowed).toBe(true);
    expect(referenceCapacityGate(required.length).allowed).toBe(true);
    expect(1 + required.length).toBe(8);
  });

  it("B: TRACINO outside effective plan is excluded from render inventory", () => {
    const { included, excluded } = selectionsForRenderInventory(
      [...sevenReady(), tracino()],
      [...REQUIRED_KEYS],
      []
    );
    expect(included).toHaveLength(7);
    expect(excluded.some((item) => /TRACINO/i.test(item.selection.productTitle))).toBe(true);
    expect(included.some((item) => /TRACINO/i.test(item.productTitle))).toBe(false);
  });

  it("C: TRACINO outside effective plan is excluded from current design shopping inventory", () => {
    const { included } = selectionsForRenderInventory(
      [...sevenReady(), tracino()],
      [...REQUIRED_KEYS],
      []
    );
    const shopping = toProjectProductShoppingState(
      {
        id: "22222222-2222-4222-8222-222222222222",
        projectId: "11111111-1111-4111-8111-111111111111",
        analysisId: "33333333-3333-4333-8333-333333333333",
        schemaVersion: 1,
        provider: "openai",
        model: "test",
        searchedItemCount: 8,
        unmatchedRequirements: [],
        sourcePreferences: null,
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-01-01T00:00:00Z",
      },
      included
    );
    expect(shopping.foundSelections).toHaveLength(7);
    expect(shopping.foundSelections.some((item) => /TRACINO/i.test(item.productTitle))).toBe(false);
    expect(shopping.foundSelections.map((item) => item.price)).toEqual([
      1521, 57, 199, 69.99, 21.99, 717, 89.99,
    ]);
  });

  it("D: one required reference unavailable blocks generate completeness", () => {
    const required = sevenReady();
    required[0] = { ...required[0]!, referenceStatus: "unavailable" };
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 7,
      unmatched: [],
      readyRequirementKeys: required
        .filter((item) => item.referenceStatus === "ready")
        .map((item) => item.requirementKey),
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
        notes: "",
      },
      requiredPlanItems: REQUIRED_KEYS.map((key) => ({
        requirementKey: key,
        displayLabel: key,
        concept: key.split(":")[1],
      })),
    });
    expect(gate.allowed).toBe(false);
  });

  it("E: one required item unresolved blocks generate", () => {
    const gate = evaluateCompleteRoomReadiness({
      searchedItemCount: 6,
      unmatched: [
        {
          requirementKey: "furniture:floor-lamp:0",
          requirementType: "furniture",
          itemSpec: "floor lamp",
          reason: "no_valid_product",
        },
      ],
      readyRequirementKeys: REQUIRED_KEYS.slice(0, 6).map(String),
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
        notes: "",
      },
      requiredPlanItems: REQUIRED_KEYS.map((key) => ({
        requirementKey: key,
        displayLabel: key,
        concept: key.split(":")[1],
      })),
    });
    expect(gate.allowed).toBe(false);
  });

  it("F: eleven effective product references capacity-block with no ordered truncation", () => {
    const overflow = Array.from({ length: MAX_RENDER_REFERENCE_IMAGES + 1 }, (_, index) =>
      selection({
        id: `bbbbbbbb-bbbb-4bbb-8bbb-${(index + 1).toString().padStart(12, "0")}`,
        requirementKey: `furniture:extra:${index}`,
        itemSpec: "chair",
        productTitle: `Extra ${index}`,
        isConfirmed: true,
      })
    );
    const assets = new Map(overflow.map((item) => [item.id, asset(item.id, "c")]));
    const ordered = orderRenderReferences(overflow, assets);
    expect(referenceCapacityGate(overflow.length).allowed).toBe(false);
    expect(ordered.tooMany).toBe(true);
    expect(ordered.ordered).toHaveLength(0);
    expect(tooManyReferencesBlockMessage(overflow.length)).toMatch(/silently dropped/i);
  });

  it("G: incomplete new Design Brief blocks generate", () => {
    const empty = parseDesignBriefAnswers({});
    expect(designBriefGenerateGate(empty).allowed).toBe(false);
    expect(designBriefGenerateGate(EMPTY_DESIGN_BRIEF).allowed).toBe(false);
  });

  it("H: removing a required key from the effective plan updates inventory", () => {
    const all = [...sevenReady(), tracino()];
    const withoutLamp = REQUIRED_KEYS.filter((key) => key !== "furniture:floor-lamp:0");
    const { included, excluded } = selectionsForRenderInventory(all, withoutLamp, []);
    expect(included).toHaveLength(6);
    expect(included.some((item) => item.requirementKey === "furniture:floor-lamp:0")).toBe(false);
    expect(excluded.some((item) => item.selection.requirementKey === "furniture:floor-lamp:0")).toBe(
      true
    );
    expect(excluded.some((item) => /TRACINO/i.test(item.selection.productTitle))).toBe(true);
  });

  it("I: back navigation does not call discovery server action", () => {
    const step9b = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step9bProductSourcing.tsx"),
      "utf8"
    );
    const panel = readFileSync(
      join(process.cwd(), "components/app/room-renovation/FinalRoomRenderPanel.tsx"),
      "utf8"
    );
    const flow = readFileSync(
      join(process.cwd(), "components/app/room-renovation/RoomRenovationFlow.tsx"),
      "utf8"
    );
    expect(panel).toContain('data-testid="back-to-products"');
    expect(step9b).toContain("onBackToProducts");
    expect(flow).toContain('onBackToProducts={() => goToStepKey("store-discovery")}');
    expect(flow).not.toMatch(/onBackToProducts[\s\S]{0,80}discoverProjectProducts/);
    expect(panel).not.toContain("discoverProjectProducts");
  });

  it("J: successful persisted render keeps Final Report generated after refresh", () => {
    const state = resolveFinalReportProjectState({
      hasSucceededRender: true,
      processing: false,
      generationFailed: false,
      discovery: null,
      selections: [],
      unmatched: [],
      preferences: {
        selectedStyles: [],
        budgetLevel: null,
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        keepExistingWalls: true,
        wallFinishMode: "keep_existing",
        floorFinishMode: "keep_existing",
        notes: "",
      },
    });
    expect(state).toBe("generated");
    expect(finalReportHeadline(state)).toBe("Your renovation project is ready.");
    expect(finalReportHeadline("ready_to_generate")).not.toMatch(/project is ready/i);
    const step10 = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step10FinalReport.tsx"),
      "utf8"
    );
    expect(step10).toContain("loadRoomRenderState");
    expect(step10).toContain('alt="Selected design"');
  });

  it("UI never claims individual product user-approval for autonomous inclusion", () => {
    const shopping = readFileSync(
      join(process.cwd(), "components/app/room-renovation/ProductShoppingSections.tsx"),
      "utf8"
    );
    expect(shopping).toContain("Included in design");
    expect(shopping).not.toContain("Use in design");
    expect(shopping).not.toContain("User approved");
    expect(shopping).not.toContain("approve to use");
    expect(shopping).toContain("included from the approved plan");
  });
});
