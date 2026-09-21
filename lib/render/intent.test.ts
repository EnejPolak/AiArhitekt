import { describe, expect, it } from "vitest";
import { resolveRenderIntentFromFinishes, resolveRenderIntentFromSource } from "./intent";
import { resolveArchitecturalFinishes } from "./finishes";
import { canonicalRenderPreferences } from "./preferences";

const keepPrefs = canonicalRenderPreferences({
  wallFinishMode: "keep_existing",
  flooring: "keep",
});

describe("resolveRenderIntent", () => {
  it("uses FURNISH_ONLY when walls and floor are kept", () => {
    expect(
      resolveRenderIntentFromSource({
        preferences: keepPrefs,
        references: [],
      })
    ).toBe("furnish_only");
    expect(
      resolveRenderIntentFromFinishes(
        resolveArchitecturalFinishes({
          preferences: canonicalRenderPreferences({
            wallFinishMode: "keep_existing",
            flooring: "keep",
            wallMainColor: "",
          }),
          references: [],
        })
      )
    ).toBe("furnish_only");
  });

  it("uses COMPLETE_INTERIOR for concept wall color", () => {
    expect(
      resolveRenderIntentFromSource({
        preferences: canonicalRenderPreferences({
          wallFinishMode: "concept_color",
          flooring: "keep",
          wallMainColor: "warm greige",
        }),
        references: [],
      })
    ).toBe("complete_interior");
  });

  it("keeps existing walls even if a color string is stored", () => {
    expect(
      resolveRenderIntentFromSource({
        preferences: canonicalRenderPreferences({
          wallFinishMode: "keep_existing",
          flooring: "keep",
          wallMainColor: "warm greige",
        }),
        references: [],
      })
    ).toBe("furnish_only");
  });

  it("does not treat an unresolved floor change as keep_existing for the prompt, and does not invent a floor", () => {
    const finishes = resolveArchitecturalFinishes({
      preferences: canonicalRenderPreferences({
        wallFinishMode: "keep_existing",
        flooring: "hardwood",
      }),
      references: [],
    });
    expect(finishes.floor_finish.requestedMode).toBe("exact_product");
    expect(finishes.floor_finish.resolvedMode).toBe("unresolved");
    expect(resolveRenderIntentFromFinishes(finishes)).toBe("furnish_only");
  });

  it("uses COMPLETE_INTERIOR when a grounded floor finish exists", () => {
    const finishes = resolveArchitecturalFinishes({
      preferences: canonicalRenderPreferences({
        wallFinishMode: "keep_existing",
        flooring: "hardwood",
      }),
      references: [
        {
          imageIndex: 2,
          originalIndex: 0,
          priority: 0,
          selection: {
            id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
            projectId: "11111111-1111-4111-8111-111111111111",
            discoveryId: "22222222-2222-4222-8222-222222222222",
            requirementType: "material",
            requirementKey: "material:floor:user-flooring:hardwood",
            itemSpec: "hardwood flooring",
            productTitle: "Oak plank floor",
            requirementSnapshot: { surface: "floor", category: "hardwood flooring" },
            productUrl: "https://www.localhome.si/p/floor",
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
          },
          asset: {
            id: "asset-floor",
            projectId: "11111111-1111-4111-8111-111111111111",
            selectionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
            sourceImageUrl: "https://cdn.localhome.si/1.jpg",
            sourcePageUrl: "https://www.localhome.si/p/floor",
            isPrimary: true,
            sortOrder: 0,
            storageBucket: "project-assets",
            storagePath: "projects/x/product-references/floor.jpg",
            mimeType: "image/jpeg" as const,
            sizeBytes: 4000,
            sourceHash: "a".repeat(64),
            width: 128,
            height: 128,
            createdAt: "2026-01-01T00:00:00Z",
            updatedAt: "2026-01-01T00:00:00Z",
          },
        },
      ],
    });
    expect(finishes.floor_finish.resolvedMode).toBe("exact_product");
    expect(resolveRenderIntentFromFinishes(finishes)).toBe("complete_interior");
  });
});
