import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import { orderRenderReferences, referencePriority } from "./order";

function selection(
  overrides: Partial<ProductSelectionView> & Pick<ProductSelectionView, "id" | "requirementType" | "requirementKey" | "itemSpec">
): ProductSelectionView {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    discoveryId: "22222222-2222-4222-8222-222222222222",
    requirementSnapshot: { category: overrides.itemSpec },
    productTitle: overrides.productTitle ?? overrides.itemSpec,
    productUrl: "https://www.localhome.si/p/1",
    productImageUrl: "https://cdn.localhome.si/1.jpg",
    price: 10,
    currency: "EUR",
    retailerDomain: "localhome.si",
    retailerName: "Local",
    hasReferenceImage: true,
    isConfirmed: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function asset(selectionId: string, hash: string): ProductReferenceAssetView {
  const projectId = "11111111-1111-4111-8111-111111111111";
  return {
    id: `asset-${selectionId}`,
    projectId,
    selectionId,
    sourceImageUrl: "https://cdn.localhome.si/1.jpg",
    storageBucket: "project-assets",
    storagePath: `projects/${projectId}/product-references/${selectionId}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 22,
    sourceHash: hash,
    width: 1,
    height: 1,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const HASH_D = "d".repeat(64);

describe("render reference order", () => {
  it("orders large furniture, other furniture, materials, then accessories", () => {
    const sofa = selection({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      requirementType: "furniture",
      requirementKey: "furniture:sofa:0",
      itemSpec: "sofa",
      requirementSnapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
    });
    const table = selection({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      requirementType: "furniture",
      requirementKey: "furniture:coffee-table:1",
      itemSpec: "coffee table",
      requirementSnapshot: { category: "coffee table", quantity: 1, placementNotes: null, constraints: [] },
    });
    const lamp = selection({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
      requirementType: "furniture",
      requirementKey: "furniture:floor-lamp:2",
      itemSpec: "floor lamp",
      requirementSnapshot: { category: "floor lamp", quantity: 1, placementNotes: null, constraints: [] },
    });
    const flooring = selection({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
      requirementType: "material",
      requirementKey: "material:floor:wood-look-flooring:0",
      itemSpec: "wood-look flooring",
      requirementSnapshot: validRoomAnalysisResult.designRequirements.materialNeeds[0],
    });

    expect(referencePriority(sofa)).toBe(1);
    expect(referencePriority(table)).toBe(2);
    expect(referencePriority(flooring)).toBe(3);
    expect(referencePriority(lamp)).toBe(4);

    const { ordered, missing, tooMany } = orderRenderReferences(
      [sofa, table, lamp, flooring],
      new Map([
        [sofa.id, asset(sofa.id, HASH_A)],
        [table.id, asset(table.id, HASH_B)],
        [lamp.id, asset(lamp.id, HASH_C)],
        [flooring.id, asset(flooring.id, HASH_D)],
      ])
    );

    expect(tooMany).toBe(false);
    expect(missing).toEqual([]);
    expect(ordered.map((item) => item.selection.itemSpec)).toEqual([
      "sofa",
      "coffee table",
      "wood-look flooring",
      "floor lamp",
    ]);
    expect(ordered.map((item) => item.imageIndex)).toEqual([2, 3, 4, 5]);
  });

  it("does not silently discard when more than 10 valid references exist", () => {
    const confirmed = Array.from({ length: 11 }, (_, index) =>
      selection({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString().padStart(12, "0")}`,
        requirementType: "furniture",
        requirementKey: `furniture:chair:${index}`,
        itemSpec: "chair",
      })
    );
    const assets = new Map(
      confirmed.map((item) => [item.id, asset(item.id, HASH_A)])
    );
    const result = orderRenderReferences(confirmed, assets);
    expect(result.tooMany).toBe(true);
    expect(result.ordered).toEqual([]);
  });
});
