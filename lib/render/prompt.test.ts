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
    sourcePageUrl: "https://www.localhome.si/p/1",
    isPrimary: true,
    sortOrder: 0,
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
    expect(snapshot.prompt).toContain("IMAGE A (Image 1) is the customer's real empty or unfinished room");
    expect(snapshot.prompt).toContain("IMAGE B (Image 2) is the exact selected furniture reference");
    expect(snapshot.prompt).toContain("Modern beige sofa");
    expect(snapshot.prompt).toContain("Preserve this room's architecture, perspective and camera position");
    expect(snapshot.prompt).toContain("Do not invent extra major furniture beyond the supplied references.");
    expect(snapshot.prompt).toContain("NOT_FOUND");
    expect(snapshot.prompt).toContain("Do not generate shopping text, prices, URLs");
    expect(snapshot.prompt).toContain("Do not claim pixel-identical photographic identity");
    expect(snapshot.prompt).toContain("concept-only decor");
    expect(snapshot.prompt).toContain("window and radiator");
    expect(snapshot.prompt).toContain("existing sofa");
    expect(snapshot.prompt).toContain("furniture:rug:3");
    expect(snapshot.prompt).not.toContain("https://www.localhome.si");
    expect(snapshot.prompt).not.toContain("OPENAI");
    expect(snapshot.prompt).not.toContain("signed");
  });

  it("does not claim an ungrounded selected product is exact", () => {
    const snapshot = buildRoomRenderPrompt({
      observation: validRoomAnalysisResult.analysis,
      designRequirements: validRoomAnalysisResult.designRequirements,
      unmatchedRequirements: [],
      ungroundedSelections: [
        {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa9",
          projectId: "11111111-1111-4111-8111-111111111111",
          discoveryId: "22222222-2222-4222-8222-222222222222",
          requirementType: "furniture",
          requirementKey: "furniture:floor-lamp:2",
          requirementSnapshot: { category: "floor lamp" },
          itemSpec: "floor lamp",
          productTitle: "Unimaged lamp",
          productUrl: "https://www.localhome.si/p/lamp",
          productImageUrl: null,
          price: null,
          currency: null,
          retailerDomain: "localhome.si",
          retailerName: "Local",
          hasReferenceImage: false,
          isConfirmed: false,
          createdAt: "2026-01-01T00:00:00Z",
          updatedAt: "2026-01-01T00:00:00Z",
        },
      ],
      preferences: {
        selectedStyles: ["warm-minimal"],
        budgetLevel: "balanced",
        wallMainColor: "",
        wallAccentColor: "",
        flooring: "keep",
        underfloorHeating: false,
        bedType: "none",
        notes: "",
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

    expect(snapshot.prompt).toContain("no usable reference image");
    expect(snapshot.prompt).toContain("furniture:floor-lamp:2");
    expect(snapshot.prompt).not.toMatch(/exact selected[\s\S]*Unimaged lamp/);
    expect(snapshot.prompt).toContain("Do not present invented or generated decor as a purchasable selected merchant product");
  });
});
