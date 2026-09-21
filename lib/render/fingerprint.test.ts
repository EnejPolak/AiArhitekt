import { describe, expect, it } from "vitest";
import { buildRenderSourceFingerprint } from "./fingerprint";
import type { OrderedRenderReference } from "./order";

const HASH = "ab".repeat(32);

function reference(selectionId: string, requirementKey: string): OrderedRenderReference {
  return {
    imageIndex: 2,
    priority: 1,
    originalIndex: 0,
    selection: {
      id: selectionId,
      projectId: "11111111-1111-4111-8111-111111111111",
      discoveryId: "22222222-2222-4222-8222-222222222222",
      requirementType: "furniture",
      requirementKey,
      requirementSnapshot: { category: "sofa" },
      itemSpec: "sofa",
      productTitle: "Sofa",
      productUrl: "https://www.localhome.si/p/1",
      productImageUrl: null,
      price: 1,
      currency: "EUR",
      retailerDomain: "localhome.si",
      retailerName: "Local",
      hasReferenceImage: true,
      isConfirmed: true,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
    asset: {
      id: `asset-${selectionId}`,
      projectId: "11111111-1111-4111-8111-111111111111",
      selectionId,
      sourceImageUrl: "https://cdn.localhome.si/1.jpg",
      sourcePageUrl: "https://www.localhome.si/p/1",
      isPrimary: true,
      sortOrder: 0,
      storageBucket: "project-assets",
      storagePath: `projects/11111111-1111-4111-8111-111111111111/product-references/${selectionId}.jpg`,
      mimeType: "image/jpeg",
      sizeBytes: 22,
      sourceHash: HASH,
      width: 1,
      height: 1,
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
    },
  };
}

describe("buildRenderSourceFingerprint", () => {
  const base = {
    roomUploadId: "33333333-3333-4333-8333-333333333333",
    roomStoragePath: "projects/11111111-1111-4111-8111-111111111111/uploads/33333333-3333-4333-8333-333333333333.jpg",
    analysisId: "44444444-4444-4444-8444-444444444444",
    analysisUpdatedAt: "2026-01-02T00:00:00.000Z",
    discoveryId: "55555555-5555-4555-8555-555555555555",
    preferences: {
      selectedStyles: ["b", "a"],
      budgetLevel: "balanced" as const,
      wallMainColor: "greige",
      wallAccentColor: "olive",
      flooring: "keep" as const,
      underfloorHeating: false,
      bedType: "none" as const,
      keepExistingWalls: false,
      notes: "",
    },
  };

  it("is stable regardless of selection insertion order", () => {
    const a = reference("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "furniture:sofa:0");
    const b = reference("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", "furniture:table:1");
    const left = buildRenderSourceFingerprint({ ...base, references: [a, b] });
    const right = buildRenderSourceFingerprint({ ...base, references: [b, a] });
    expect(left).toBe(right);
    expect(left).toMatch(/^[a-f0-9]{64}$/);
  });

  it("changes when a reference hash or preference changes", () => {
    const a = reference("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", "furniture:sofa:0");
    const first = buildRenderSourceFingerprint({ ...base, references: [a] });
    const changedHash = {
      ...a,
      asset: { ...a.asset, sourceHash: "cd".repeat(32) },
    };
    const second = buildRenderSourceFingerprint({ ...base, references: [changedHash] });
    const third = buildRenderSourceFingerprint({
      ...base,
      preferences: { ...base.preferences, wallMainColor: "white" },
      references: [a],
    });
    const fourth = buildRenderSourceFingerprint({
      ...base,
      preferences: { ...base.preferences, keepExistingWalls: true },
      references: [a],
    });
    expect(first).not.toBe(second);
    expect(first).not.toBe(third);
    expect(first).not.toBe(fourth);
  });
});
