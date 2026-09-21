import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { toProjectProductShoppingState } from "@/lib/discovery/shoppingState";
import type { ProductDiscoveryView, ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import {
  buildRenderInventory,
  inventoryIsSubsetOfShoppingSelections,
  referenceSnapshotIsReadyOnly,
  shoppingListEqualsRenderInventory,
} from "./inventory";
import { orderRenderReferences, referencePriority, type OrderedRenderReference } from "./order";
import { buildRoomRenderPrompt } from "./prompt";
import { toReferenceSnapshot } from "./types";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const DISCOVERY_ID = "22222222-2222-4222-8222-222222222222";

const PREFS = {
  selectedStyles: [] as string[],
  budgetLevel: null,
  wallMainColor: "warm greige",
  wallAccentColor: "",
  flooring: "keep" as const,
  underfloorHeating: false,
  bedType: "none" as const,
  keepExistingWalls: false,
  notes: "",
};

function selection(
  overrides: Partial<ProductSelectionView> &
    Pick<ProductSelectionView, "id" | "requirementType" | "requirementKey" | "itemSpec" | "productTitle">
): ProductSelectionView {
  return {
    projectId: PROJECT_ID,
    discoveryId: DISCOVERY_ID,
    requirementSnapshot: { category: overrides.itemSpec },
    productUrl: `https://www.localhome.si/p/${overrides.id.slice(0, 8)}`,
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
    ...overrides,
  };
}

function asset(selectionId: string, sizeBytes = 4000): ProductReferenceAssetView {
  return {
    id: `asset-${selectionId}`,
    projectId: PROJECT_ID,
    selectionId,
    sourceImageUrl: "https://cdn.localhome.si/1.jpg",
    sourcePageUrl: "https://www.localhome.si/p/1",
    isPrimary: true,
    sortOrder: 0,
    storageBucket: "project-assets",
    storagePath: `projects/${PROJECT_ID}/product-references/${selectionId}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes,
    sourceHash: "a".repeat(64),
    width: 128,
    height: 128,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

function orderedRef(imageIndex: number, item: ProductSelectionView): OrderedRenderReference {
  return {
    imageIndex,
    selection: item,
    asset: asset(item.id),
    priority: referencePriority(item),
    originalIndex: imageIndex - 2,
  };
}

function discovery(unmatched: ProductDiscoveryView["unmatchedRequirements"] = []): ProductDiscoveryView {
  return {
    id: DISCOVERY_ID,
    projectId: PROJECT_ID,
    sourceAnalysisId: "33333333-3333-4333-8333-333333333333",
    sourceAnalysisUpdatedAt: "2026-01-01T00:00:00Z",
    locationInput: "Ljubljana",
    latitude: 46.05,
    longitude: 14.5,
    radiusKm: 20,
    searchedItemCount: 3,
    notSearchedCount: 0,
    allowlistDomains: ["localhome.si"],
    unmatchedRequirements: unmatched,
    sourcePreferences: {},
    sourcePreferencesHash: "",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const coffee = selection({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  requirementType: "furniture",
  requirementKey: "furniture:coffee-table:1",
  itemSpec: "coffee table",
  productTitle: "Klubska miza RY",
  requirementSnapshot: { category: "coffee table", material: "white lacquer", color: "white" },
});

const sofaUnavailable = selection({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  requirementType: "furniture",
  requirementKey: "furniture:sofa:0",
  itemSpec: "sofa",
  productTitle: "Found sofa",
  referenceStatus: "unavailable",
  hasReferenceImage: false,
  productImageUrl: null,
});

describe("strict shoppable render inventory", () => {
  it("A. one READY coffee table is the only allowed new physical product", () => {
    const snapshot = buildRoomRenderPrompt({
      observation: validRoomAnalysisResult.analysis,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      preferences: PREFS,
      references: [orderedRef(2, coffee)],
    });

    expect(snapshot.expectedRenderInventory).toHaveLength(1);
    expect(snapshot.expectedRenderInventory[0]?.productName).toBe("Klubska miza RY");
    expect(snapshot.prompt).toContain("Allowed new physical products: Klubska miza RY (coffee table, Image 2).");
    expect(snapshot.prompt).toContain("The only new physical furniture, decor, accessories, plants, lighting");
    const allowedLine = snapshot.prompt.match(/Allowed new physical products: ([^\n]+)/)?.[1] ?? "";
    expect(allowedLine).toBe("Klubska miza RY (coffee table, Image 2).");
    expect(allowedLine).not.toMatch(/sofa/i);
  });

  it("B. unavailable sofa is explicitly forbidden from being introduced", () => {
    const snapshot = buildRoomRenderPrompt({
      observation: validRoomAnalysisResult.analysis,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      ungroundedSelections: [sofaUnavailable],
      preferences: PREFS,
      references: [orderedRef(2, coffee)],
    });

    expect(snapshot.expectedRenderInventory.map((item) => item.selectionId)).toEqual([coffee.id]);
    expect(snapshot.prompt).toContain("furniture:sofa:0 (sofa)");
    expect(snapshot.prompt).toContain("Do not introduce them. Leave that area empty");
    expect(snapshot.prompt).toContain("Do not introduce sofas, chairs, tables, rugs, lamps, plants, planters");
  });

  it("C. NOT_FOUND rug is explicitly forbidden", () => {
    const snapshot = buildRoomRenderPrompt({
      observation: validRoomAnalysisResult.analysis,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [
        {
          requirementType: "furniture",
          requirementKey: "furniture:rug:3",
          itemSpec: "rug",
          reason: "no_valid_product",
        },
      ],
      preferences: PREFS,
      references: [orderedRef(2, coffee)],
    });

    expect(snapshot.prompt).toContain("furniture:rug:3 (rug)");
    expect(snapshot.prompt).toContain("These requirements were NOT_FOUND. Do not introduce them. Leave that area empty");
    expect(snapshot.expectedRenderInventory.every((item) => !/rug/i.test(item.category))).toBe(true);
  });

  it("D. plants and planters may not be introduced when none are READY", () => {
    const snapshot = buildRoomRenderPrompt({
      observation: validRoomAnalysisResult.analysis,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      preferences: PREFS,
      references: [orderedRef(2, coffee)],
    });

    expect(snapshot.prompt).toContain("Plants are not an exception.");
    expect(snapshot.prompt).toContain("If no plant or planter is in the inventory, do not render a plant or planter.");
    expect(snapshot.expectedRenderInventory.some((item) => /plant/i.test(item.category))).toBe(false);
    const allowedLine = snapshot.prompt.match(/Allowed new physical products: ([^\n]+)/)?.[1] ?? "";
    expect(allowedLine).not.toMatch(/plant/i);
  });

  it("E. shopping-list selections for render equal the render inventory", () => {
    const rugMissing = {
      requirementType: "furniture" as const,
      requirementKey: "furniture:rug:3",
      itemSpec: "rug",
      reason: "no_valid_product" as const,
    };
    const assets = new Map([[coffee.id, asset(coffee.id)]]);
    const inventory = buildRenderInventory([coffee, sofaUnavailable], assets);
    const shopping = toProjectProductShoppingState(discovery([rugMissing]), [coffee, sofaUnavailable]);

    expect(inventory.map((item) => item.selectionId)).toEqual([coffee.id]);
    expect(shopping.foundSelections.map((item) => item.id)).toEqual([coffee.id]);
    expect(inventoryIsSubsetOfShoppingSelections(shopping.foundSelections, inventory)).toBe(true);
    expect(shoppingListEqualsRenderInventory(shopping.foundSelections, assets, inventory)).toBe(true);
    expect(shopping.missingRequirements.map((item) => item.requirementKey).sort()).toEqual(
      ["furniture:rug:3", sofaUnavailable.requirementKey].sort()
    );
  });

  it("F. reference_snapshot contains only READY inventory selections", () => {
    const assets = new Map([[coffee.id, asset(coffee.id)]]);
    const ordered = orderRenderReferences([coffee, sofaUnavailable], assets).ordered;
    const inventory = buildRenderInventory([coffee, sofaUnavailable], assets);
    const snapshot = ordered.map((item) =>
      toReferenceSnapshot({
        imageIndex: item.imageIndex,
        selection: item.selection,
        assetId: item.asset.id,
        referenceHash: item.asset.sourceHash,
      })
    );

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.selectionId).toBe(coffee.id);
    expect(referenceSnapshotIsReadyOnly(snapshot, inventory)).toBe(true);
    expect(inventory.every((item) => item.referenceStatus === "ready")).toBe(true);
    expect(inventory.every((item) => item.referenceAssetId && item.productUrl && item.merchantName)).toBe(true);
  });

  it("G. original-room existing objects are not generated shopping items", () => {
    const snapshot = buildRoomRenderPrompt({
      observation: validRoomAnalysisResult.analysis,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      preferences: PREFS,
      references: [orderedRef(2, coffee)],
    });

    expect(snapshot.prompt).toContain("EXISTING ROOM OBJECTS");
    expect(snapshot.prompt).toContain("Do not treat original-room objects as generated shopping products.");
    expect(snapshot.prompt).toContain("Objects already visible in IMAGE 1");
    expect(validRoomAnalysisResult.analysis.existingElements.some((item) => /sofa/i.test(item.description))).toBe(
      true
    );
    expect(snapshot.expectedRenderInventory.some((item) => /sofa/i.test(item.productName))).toBe(false);
    expect(snapshot.expectedRenderInventory.map((item) => item.productName)).toEqual(["Klubska miza RY"]);
  });

  it("excludes zero-byte reference assets", () => {
    const inventory = buildRenderInventory([coffee], new Map([[coffee.id, asset(coffee.id, 0)]]));
    expect(inventory).toEqual([]);
  });
});
