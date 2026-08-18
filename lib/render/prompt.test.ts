import { describe, expect, it } from "vitest";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { buildRoomRenderPrompt } from "./prompt";
import { referencePriority, type OrderedRenderReference } from "./order";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";

function ref(
  imageIndex: number,
  selection: Partial<ProductSelectionView> & Pick<ProductSelectionView, "id" | "requirementType" | "requirementKey" | "itemSpec" | "productTitle">
): OrderedRenderReference {
  const full: ProductSelectionView = {
    projectId: "11111111-1111-4111-8111-111111111111",
    discoveryId: "22222222-2222-4222-8222-222222222222",
    requirementSnapshot: { category: selection.itemSpec },
    productUrl: "https://www.localhome.si/p/1",
    productImageUrl: null,
    price: 199,
    currency: "EUR",
    retailerDomain: "localhome.si",
    retailerName: "Local",
    hasReferenceImage: true,
    isConfirmed: true,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...selection,
  };
  const asset: ProductReferenceAssetView = {
    id: `asset-${selection.id}`,
    projectId: full.projectId,
    selectionId: full.id,
    sourceImageUrl: "https://cdn.localhome.si/1.jpg",
    storageBucket: "project-assets",
    storagePath: `projects/${full.projectId}/product-references/${full.id}.jpg`,
    mimeType: "image/jpeg",
    sizeBytes: 22,
    sourceHash: "a".repeat(64),
    width: 1,
    height: 1,
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

describe("buildRoomRenderPrompt", () => {
  it("identifies each reference image and preserves the original room", () => {
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
      preferences: {
        selectedStyles: ["warm-minimal"],
        budgetLevel: "balanced",
        wallMainColor: "warm greige",
        wallAccentColor: "olive green",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        notes: "keep the window light",
      },
      references: [
        ref(2, {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          requirementType: "furniture",
          requirementKey: "furniture:sofa:0",
          itemSpec: "sofa",
          productTitle: "Modern beige sofa",
          requirementSnapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
        }),
      ],
    });

    expect(snapshot.imageMapping[0]).toMatchObject({ imageIndex: 1, role: "original_room" });
    expect(snapshot.imageMapping[1]).toMatchObject({
      imageIndex: 2,
      role: "product_reference",
      requirementKey: "furniture:sofa:0",
    });
    expect(snapshot.prompt).toContain("Image 1 is the original room and is the spatial source.");
    expect(snapshot.prompt).toContain("Image 2 is the exact selected furniture reference");
    expect(snapshot.prompt).toContain("Preserve the original camera viewpoint");
    expect(snapshot.prompt).toContain("Do not invent extra major furniture beyond the supplied references.");
    expect(snapshot.prompt).toContain("Do not invent an unrelated new major purchasable item");
    expect(snapshot.prompt).toContain("Do not generate shopping text, prices, URLs");
    expect(snapshot.prompt).toContain("Do not claim exact physical measurements");
    expect(snapshot.prompt).toContain("window and radiator");
    expect(snapshot.prompt).toContain("existing sofa");
    expect(snapshot.prompt).toContain("furniture:rug:3");
    expect(snapshot.prompt).not.toContain("https://www.localhome.si");
    expect(snapshot.prompt).not.toContain("OPENAI");
    expect(snapshot.prompt).not.toContain("signed");
  });
});
