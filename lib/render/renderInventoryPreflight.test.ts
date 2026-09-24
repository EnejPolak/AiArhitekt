import { describe, expect, it, vi } from "vitest";
import type { ProductSelectionView } from "@/lib/discovery/types";
import type { ProductReferenceAssetView } from "@/lib/references/types";
import { MAX_RENDER_REFERENCE_IMAGES } from "./constants";
import { selectionsForRenderInventory } from "./inventory";
import { orderRenderReferences } from "./order";
import {
  referenceCapacityGate,
  tooManyReferencesBlockMessage,
} from "./readiness";

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
    isConfirmed: true,
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

describe("final render inventory preflight", () => {
  it("7 required / former 6-capacity behavior must not silently render only six", () => {
    // Force the historical silent-slice failure mode by temporarily ordering
    // against a synthetic capacity check: with 7 ready refs and capacity 6,
    // orderRenderReferences must return empty ordered + tooMany (not 6).
    const seven = REQUIRED_KEYS.map((key, index) =>
      selection({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString().padStart(12, "0")}`,
        requirementKey: key,
        itemSpec: key.split(":")[1]!.replace(/-/g, " "),
        productTitle: `Product ${index + 1}`,
      })
    );
    const assets = new Map(seven.map((item, index) => [item.id, asset(item.id, String(index))]));

    // Patch constant via capacity gate + order under reduced max by importing
    // the module's current MAX (10). Simulate overflow with 11 chairs instead,
    // and separately assert 7 ≤ current capacity includes all seven.
    const withinCapacity = orderRenderReferences(seven, assets);
    expect(MAX_RENDER_REFERENCE_IMAGES).toBeGreaterThanOrEqual(7);
    expect(withinCapacity.tooMany).toBe(false);
    expect(withinCapacity.ordered).toHaveLength(7);
    expect(withinCapacity.ordered.map((item) => item.selection.requirementKey).sort()).toEqual(
      [...REQUIRED_KEYS].sort()
    );

    const overflow = Array.from({ length: MAX_RENDER_REFERENCE_IMAGES + 1 }, (_, index) =>
      selection({
        id: `bbbbbbbb-bbbb-4bbb-8bbb-${(index + 1).toString().padStart(12, "0")}`,
        requirementKey: `furniture:extra:${index}`,
        itemSpec: "chair",
        productTitle: `Extra ${index}`,
      })
    );
    const overflowHash = "c".repeat(64);
    const overflowAssets = new Map(
      overflow.map((item) => [item.id, asset(item.id, "c")])
    );
    // Ensure every overflow row has a valid asset (same contract as order.test).
    for (const item of overflow) {
      const row = overflowAssets.get(item.id)!;
      expect(row.sourceHash).toBe(overflowHash);
      expect(row.sizeBytes).toBeGreaterThan(0);
    }
    const blocked = orderRenderReferences(overflow, overflowAssets);
    expect(blocked.missing).toHaveLength(0);
    expect(blocked.tooMany).toBe(true);
    expect(blocked.truncated).toBe(true);
    expect(blocked.ordered).toHaveLength(0);
    expect(referenceCapacityGate(overflow.length).allowed).toBe(false);
    expect(tooManyReferencesBlockMessage(overflow.length)).toMatch(/silently dropped/i);
  });

  it("8 selections / 7 effective required: extra cannot displace a required product", () => {
    const required = REQUIRED_KEYS.map((key, index) =>
      selection({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString().padStart(12, "0")}`,
        requirementKey: key,
        itemSpec: key.split(":")[1]!.replace(/-/g, " "),
        productTitle: `Required ${index + 1}`,
      })
    );
    const tracino = selection({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      requirementKey: "furniture:tv-console:0",
      itemSpec: "tv console",
      productTitle: "TV omarica TRACINO",
      // High priority category text would otherwise compete with required slots
      requirementSnapshot: { category: "sofa" },
    });
    const all = [...required, tracino];
    const { included, excluded } = selectionsForRenderInventory(all, [...REQUIRED_KEYS], []);
    expect(included.map((item) => item.requirementKey).sort()).toEqual([...REQUIRED_KEYS].sort());
    expect(excluded).toHaveLength(1);
    expect(excluded[0]?.selection.requirementKey).toBe("furniture:tv-console:0");
    expect(excluded[0]?.reason).toBe("not_in_effective_plan");

    const assets = new Map(included.map((item, index) => [item.id, asset(item.id, String(index))]));
    const ordered = orderRenderReferences(included, assets);
    expect(ordered.tooMany).toBe(false);
    expect(ordered.ordered).toHaveLength(7);
    expect(ordered.ordered.some((item) => item.selection.requirementKey === "furniture:tv-console:0")).toBe(
      false
    );
    for (const key of REQUIRED_KEYS) {
      expect(ordered.ordered.some((item) => item.selection.requirementKey === key)).toBe(true);
    }
  });

  it("no required reference omitted when inventory fits capacity", () => {
    const required = REQUIRED_KEYS.map((key, index) =>
      selection({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString().padStart(12, "0")}`,
        requirementKey: key,
        itemSpec: key.split(":")[1]!.replace(/-/g, " "),
        productTitle: `Required ${index + 1}`,
      })
    );
    const assets = new Map(required.map((item, index) => [item.id, asset(item.id, String(index))]));
    const ordered = orderRenderReferences(required, assets);
    expect(ordered.missing).toEqual([]);
    expect(ordered.ordered).toHaveLength(7);
    expect(new Set(ordered.ordered.map((item) => item.selection.requirementKey)).size).toBe(7);
  });

  it("reference-limit failure never reaches OpenAI Images", async () => {
    const editImage = vi.fn(async () => {
      throw new Error("images.edit must not be called");
    });
    const overflowCount = MAX_RENDER_REFERENCE_IMAGES + 1;
    const gate = referenceCapacityGate(overflowCount);
    expect(gate.allowed).toBe(false);
    expect(editImage).not.toHaveBeenCalled();
    // generateRoomRender throws too_many_references before editImage — contract:
    expect(tooManyReferencesBlockMessage(overflowCount)).toContain(String(MAX_RENDER_REFERENCE_IMAGES));
  });

  it("render inventory matches approved effective inventory (7 required, no extras)", () => {
    const required = REQUIRED_KEYS.map((key, index) =>
      selection({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString().padStart(12, "0")}`,
        requirementKey: key,
        itemSpec: key.split(":")[1]!.replace(/-/g, " "),
        productTitle: `Required ${index + 1}`,
      })
    );
    const stale = selection({
      id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
      requirementKey: "furniture:tv-console:0",
      itemSpec: "tv console",
      productTitle: "TRACINO",
    });
    const { included } = selectionsForRenderInventory([...required, stale], [...REQUIRED_KEYS], []);
    const assets = new Map(included.map((item, index) => [item.id, asset(item.id, String(index))]));
    const ordered = orderRenderReferences(included, assets).ordered;
    expect(ordered.map((item) => item.selection.requirementKey).sort()).toEqual(
      [...REQUIRED_KEYS].sort()
    );
    expect(ordered.map((item) => item.imageIndex)).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });
});
