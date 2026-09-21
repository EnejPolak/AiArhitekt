import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import {
  resolveArchitecturalFinishes,
  type ArchitecturalFinishes,
} from "./finishes";
import { referencePriority, type OrderedRenderReference } from "./order";
import { buildRoomRenderPrompt } from "./prompt";
import type { RoomRenderPreferences } from "./preferences";
import { buildRenderHonestyReport, overlayHonestyReportQualityFromAssets, referenceQualityDiagnostic } from "./report";
import { toExpectedRenderInventory } from "./inventory";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";

function prefs(overrides: Partial<RoomRenderPreferences> = {}): RoomRenderPreferences {
  return {
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
  };
}

function ref(
  imageIndex: number,
  selection: Partial<ProductSelectionView> &
    Pick<ProductSelectionView, "id" | "requirementType" | "requirementKey" | "itemSpec" | "productTitle">
): OrderedRenderReference {
  const full: ProductSelectionView = {
    projectId: PROJECT_ID,
    discoveryId: "22222222-2222-4222-8222-222222222222",
    requirementSnapshot: { category: selection.itemSpec },
    productUrl: `https://www.localhome.si/p/${selection.id.slice(0, 8)}`,
    productImageUrl: "https://cdn.localhome.si/1.jpg",
    price: 199,
    currency: "EUR",
    retailerDomain: "localhome.si",
    retailerName: "Local Home",
    hasReferenceImage: true,
    isConfirmed: true,
    referenceStatus: "ready",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...selection,
  };
  const asset: ProductReferenceAssetView = {
    id: `asset-${selection.id}`,
    projectId: PROJECT_ID,
    selectionId: full.id,
    sourceImageUrl: "https://cdn.localhome.si/1.jpg",
    sourcePageUrl: full.productUrl,
    isPrimary: true,
    sortOrder: 0,
    storageBucket: "project-assets",
    storagePath: `projects/${PROJECT_ID}/product-references/${full.id}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 4000,
    sourceHash: "a".repeat(64),
    width: 128,
    height: 128,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
  return {
    imageIndex,
    selection: full,
    asset,
    priority: referencePriority(full),
    originalIndex: imageIndex - 2,
  };
}

const sofa = ref(2, {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  requirementType: "furniture",
  requirementKey: "furniture:sofa:0",
  itemSpec: "sofa",
  productTitle: "Velpa sofa",
  requirementSnapshot: { category: "sofa" },
});

const floorProduct = ref(3, {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  requirementType: "material",
  requirementKey: "material:floor:user-flooring:hardwood",
  itemSpec: "hardwood flooring",
  productTitle: "Oak plank floor",
  requirementSnapshot: {
    surface: "floor",
    category: "hardwood flooring",
    finishDirection: null,
    constraints: ["hardwood"],
  },
});

function snapshot(preferences: RoomRenderPreferences, references: OrderedRenderReference[]) {
  return buildRoomRenderPrompt({
    observation: validRoomAnalysisResult.analysis,
    designRequirements: validRoomAnalysisResult.designRequirements,
    unmatchedRequirements: [],
    preferences,
    references,
  });
}

function reportFrom(finishes: ArchitecturalFinishes, references: OrderedRenderReference[]) {
  return buildRenderHonestyReport({
    inventory: toExpectedRenderInventory(references),
    finishes,
  });
}

describe("architectural finishes", () => {
  it("keeps existing walls and does not invent a wall product", () => {
    const preferences = prefs({ keepExistingWalls: true, wallMainColor: "warm greige" });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [sofa] });
    const built = snapshot(preferences, [sofa]);
    const honesty = reportFrom(finishes, [sofa]);

    expect(finishes.wall_finish.requestedMode).toBe("keep_existing");
    expect(finishes.wall_finish.resolvedMode).toBe("keep_existing");
    expect(finishes.wall_finish.shoppable).toBe(false);
    expect(built.renderIntent).toBe("furnish_only");
    expect(built.prompt).toContain("Wall finish requestedMode: keep_existing.");
    expect(built.prompt).toContain("Wall finish resolvedMode: keep_existing.");
    expect(built.prompt).toContain("Do not paint, plaster, or invent a wall product.");
    expect(honesty.productsToBuy.map((item) => item.productName)).toEqual(["Velpa sofa"]);
    expect(honesty.conceptOnlyFinishChoices).toEqual([]);
    expect(honesty.exactVisualizedItems.every((item) => item.surface !== "wall_finish")).toBe(true);
  });

  it("applies concept wall color without presenting it as a shoppable product", () => {
    const preferences = prefs({
      wallFinishMode: "concept_color",
      keepExistingWalls: true,
      wallMainColor: "warm greige",
      wallAccentColor: "olive green",
    });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [sofa] });
    const built = snapshot(preferences, [sofa]);
    const honesty = reportFrom(finishes, [sofa]);

    expect(finishes.wall_finish).toMatchObject({
      requestedMode: "concept_color",
      resolvedMode: "concept_color",
      shoppable: false,
      colorDirection: "warm greige",
      accentColorDirection: "olive green",
    });
    expect(built.renderIntent).toBe("complete_interior");
    expect(built.prompt).toContain("Wall finish requestedMode: concept_color.");
    expect(built.prompt).toContain("Wall finish resolvedMode: concept_color.");
    expect(built.prompt).toContain("This is a concept-only wall finish, not a shoppable merchant product.");
    expect(built.prompt).not.toContain("Surface completion is intentional and allowed");
    expect(honesty.productsToBuy.map((item) => item.productName)).toEqual(["Velpa sofa"]);
    expect(honesty.conceptOnlyFinishChoices).toEqual([
      {
        surface: "wall_finish",
        mode: "concept_color",
        shoppable: false,
        colorDirection: "warm greige",
        accentColorDirection: "olive green",
      },
    ]);
    expect(honesty.exactVisualizedItems.some((item) => item.productName === "warm greige")).toBe(false);
  });

  it("uses an exact grounded floor product as the floor finish", () => {
    const preferences = prefs({ flooring: "hardwood" });
    const finishes = resolveArchitecturalFinishes({
      preferences,
      references: [sofa, floorProduct],
    });
    const built = snapshot(preferences, [sofa, floorProduct]);
    const honesty = reportFrom(finishes, [sofa, floorProduct]);

    expect(finishes.floor_finish).toMatchObject({
      requestedMode: "exact_product",
      resolvedMode: "exact_product",
      shoppable: true,
      productName: "Oak plank floor",
      productUrl: floorProduct.selection.productUrl,
      referenceAssetId: floorProduct.asset.id,
      referenceStatus: "ready",
    });
    expect(built.imageMapping[2]?.role).toBe("finish_reference");
    expect(built.prompt).toContain("Floor finish requestedMode: exact_product.");
    expect(built.prompt).toContain("Floor finish resolvedMode: exact_product.");
    expect(built.prompt).toContain("Oak plank floor");
    expect(built.prompt).toMatch(/Allowed new physical products: Velpa sofa/);
    expect(built.prompt).not.toMatch(/Allowed new physical products:.*Oak plank floor/);
    expect(honesty.productsToBuy.map((item) => item.productName).sort()).toEqual([
      "Oak plank floor",
      "Velpa sofa",
    ]);
    expect(honesty.exactVisualizedItems.some((item) => item.kind === "exact_finish" && item.productName === "Oak plank floor")).toBe(
      true
    );
  });

  it("blocks a floor change when no grounded floor reference exists", () => {
    const preferences = prefs({ flooring: "hardwood", keepExistingWalls: true });
    const finishes = resolveArchitecturalFinishes({ preferences, references: [sofa] });
    const built = snapshot(preferences, [sofa]);
    const honesty = reportFrom(finishes, [sofa]);

    expect(finishes.floor_finish).toMatchObject({
      requestedMode: "exact_product",
      resolvedMode: "unresolved",
      shoppable: true,
    });
    expect(built.renderIntent).toBe("furnish_only");
    expect(built.prompt).toContain("Floor finish requestedMode: exact_product.");
    expect(built.prompt).toContain("Floor finish resolvedMode: unresolved.");
    expect(built.prompt).toContain("A floor change was requested and is unresolved.");
    expect(built.prompt).toContain("Do not invent a floor finish.");
    expect(built.prompt).not.toContain("Floor finish resolvedMode: keep_existing.");
    expect(honesty.finishIntent.floor_finish.requestedLabel).toBe("Change floor");
    expect(honesty.finishIntent.floor_finish.resolvedLabel).toBe("Unresolved");
    expect(honesty.productsToBuy.map((item) => item.productName)).toEqual(["Velpa sofa"]);
    expect(honesty.exactVisualizedItems.some((item) => item.surface === "floor_finish")).toBe(false);
  });

  it("does not invent extra purchasable objects", () => {
    const built = snapshot(prefs({ wallFinishMode: "concept_color", wallMainColor: "warm greige" }), [sofa]);
    expect(built.prompt).toContain("Do not invent extra furniture, rugs, lamps, plants, planters, cushions, artwork, books");
    expect(built.prompt).toContain("Do not invent extra major furniture beyond the supplied references.");
    expect(built.prompt).toContain("If an area of the room would otherwise remain empty, leave it empty.");
    expect(built.prompt).toContain("Do not invent extra purchasable furniture or decor to complete the room.");
    expect(built.expectedRenderInventory.map((item) => item.productName)).toEqual(["Velpa sofa"]);
    expect(built.renderReport.exactVisualizedItems.map((item) => item.productName)).toEqual(["Velpa sofa"]);
  });

  it("keeps the final report honest about products, finishes, exact items, and concept-only choices", () => {
    const preferences = prefs({
      wallFinishMode: "concept_color",
      wallMainColor: "warm greige",
      flooring: "hardwood",
    });
    const finishes = resolveArchitecturalFinishes({
      preferences,
      references: [sofa, floorProduct],
    });
    const honesty = reportFrom(finishes, [sofa, floorProduct]);
    const built = snapshot(preferences, [sofa, floorProduct]);

    expect(honesty.productsToBuy.map((item) => item.productName).sort()).toEqual([
      "Oak plank floor",
      "Velpa sofa",
    ]);
    expect(honesty.finishDecisions.wall_finish.requestedMode).toBe("concept_color");
    expect(honesty.finishDecisions.wall_finish.resolvedMode).toBe("concept_color");
    expect(honesty.finishDecisions.floor_finish.requestedMode).toBe("exact_product");
    expect(honesty.finishDecisions.floor_finish.resolvedMode).toBe("exact_product");
    expect(honesty.finishIntent.wall_finish.requestedLabel).toBe("Choose color");
    expect(honesty.finishIntent.floor_finish.requestedLabel).toBe("Change floor");
    expect(honesty.conceptOnlyFinishChoices.map((item) => item.colorDirection)).toEqual(["warm greige"]);
    expect(honesty.conceptOnlyFinishChoices.every((item) => item.shoppable === false)).toBe(true);
    expect(honesty.productsToBuy.some((item) => /greige/i.test(item.productName))).toBe(false);
    expect(honesty.exactVisualizedItems.map((item) => item.productName).sort()).toEqual([
      "Oak plank floor",
      "Velpa sofa",
    ]);
    expect(honesty.exactVisualizedItems.find((item) => item.productName === "Velpa sofa")).toMatchObject({
      referenceStatus: "ready",
      referenceQuality: "low",
      referenceWidth: 128,
      referenceHeight: 128,
    });
    expect(referenceQualityDiagnostic(honesty.exactVisualizedItems[0]!)).toEqual(
      expect.arrayContaining(["READY", expect.stringMatching(/Reference quality: (HIGH|MEDIUM|LOW)/)])
    );
    expect(built.architecturalFinishes).toEqual(honesty.finishDecisions);
    expect(built.renderReport.conceptOnlyFinishChoices).toEqual(honesty.conceptOnlyFinishChoices);
  });

  it("overlays live reference quality onto an older snapshot without blocking READY", () => {
    const finishes = resolveArchitecturalFinishes({
      preferences: prefs({ flooring: "hardwood", keepExistingWalls: true }),
      references: [sofa, floorProduct],
    });
    const honesty = reportFrom(finishes, [sofa, floorProduct]);
    const upgraded = overlayHonestyReportQualityFromAssets(
      honesty,
      new Map([
        [
          sofa.selection.id,
          {
            ...sofa.asset,
            width: 950,
            height: 700,
            sizeBytes: 96431,
          },
        ],
        [
          floorProduct.selection.id,
          {
            ...floorProduct.asset,
            width: 415,
            height: 415,
            sizeBytes: 7450,
          },
        ],
      ])
    );
    expect(upgraded.exactVisualizedItems.find((item) => item.productName === "Velpa sofa")).toMatchObject({
      referenceStatus: "ready",
      referenceQuality: "high",
      referenceWidth: 950,
      referenceHeight: 700,
    });
    expect(upgraded.exactVisualizedItems.find((item) => item.productName === "Oak plank floor")).toMatchObject({
      referenceStatus: "ready",
      referenceQuality: "medium",
      referenceWidth: 415,
      referenceHeight: 415,
    });
    expect(referenceQualityDiagnostic(upgraded.exactVisualizedItems.find((item) => item.productName === "Velpa sofa")!)).toEqual(
      ["READY", "Reference quality: HIGH", "950 × 700"]
    );
  });
});
