import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import { loadRenderReadySelectedProductsFromState } from "./loadReady";
import { MAX_RENDER_REFERENCE_IMAGES } from "./constants";
import { orderRenderReferences } from "./order";
import { groundedSelectionIdsFromSnapshot } from "./types";

function selection(
  overrides: Partial<ProductSelectionView> & Pick<ProductSelectionView, "id" | "requirementType" | "requirementKey" | "itemSpec">
): ProductSelectionView {
  return {
    projectId: "11111111-1111-4111-8111-111111111111",
    discoveryId: "22222222-2222-4222-8222-222222222222",
    requirementSnapshot: { category: overrides.itemSpec, material: "oak", color: "beige" },
    productTitle: overrides.productTitle ?? overrides.itemSpec,
    productUrl: "https://www.localhome.si/p/1",
    productImageUrl: "https://cdn.localhome.si/1.jpg",
    price: 10,
    currency: "EUR",
    retailerDomain: "localhome.si",
    retailerName: "Local",
    hasReferenceImage: true,
    isConfirmed: false,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function asset(selectionId: string): ProductReferenceAssetView {
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
    sizeBytes: 4000,
    sourceHash: "a".repeat(64),
    width: 128,
    height: 128,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  };
}

describe("loadRenderReadySelectedProductsFromState", () => {
  it("loads persisted found selections and marks missing assets as ungrounded", () => {
    const sofa = selection({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      requirementType: "furniture",
      requirementKey: "furniture:sofa:0",
      itemSpec: "sofa",
      requirementSnapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
      productTitle: "Lesnina sofa",
    });
    const lamp = selection({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      requirementType: "furniture",
      requirementKey: "furniture:floor-lamp:1",
      itemSpec: "floor lamp",
      productImageUrl: null,
      hasReferenceImage: false,
    });

    const ready = loadRenderReadySelectedProductsFromState([sofa, lamp], [asset(sofa.id)]);
    expect(ready[0]).toMatchObject({
      selectionId: sofa.id,
      requirementId: "furniture:sofa:0",
      productName: "Lesnina sofa",
      merchant: "Local",
      grounding: "reference-grounded",
    });
    expect(ready[0].referenceAssets[0]?.isPrimary).toBe(true);
    expect(ready[1].grounding).toBe("reference-unavailable");
    expect(ready[1].referenceAssets).toEqual([]);
  });

  it("records exact selection and asset ids in a render snapshot", () => {
    const sofa = selection({
      id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      requirementType: "furniture",
      requirementKey: "furniture:sofa:0",
      itemSpec: "sofa",
    });
    const ordered = orderRenderReferences([sofa], new Map([[sofa.id, asset(sofa.id)]])).ordered;
    expect(ordered).toHaveLength(1);
    const snapshot = ordered.map((item) => ({
      imageIndex: item.imageIndex,
      selectionId: item.selection.id,
      requirementKey: item.selection.requirementKey,
      requirementType: item.selection.requirementType,
      productTitle: item.selection.productTitle,
      productUrl: item.selection.productUrl,
      price: item.selection.price,
      currency: item.selection.currency,
      retailerDomain: item.selection.retailerDomain,
      retailerName: item.selection.retailerName,
      referenceAssetId: item.asset.id,
      referenceHash: item.asset.sourceHash,
    }));
    expect([...groundedSelectionIdsFromSnapshot(snapshot)]).toEqual([sofa.id]);
    expect(snapshot[0]?.referenceAssetId).toBe(`asset-${sofa.id}`);
  });

  it("caps render references at the documented product limit", () => {
    expect(MAX_RENDER_REFERENCE_IMAGES).toBe(10);
  });
});
