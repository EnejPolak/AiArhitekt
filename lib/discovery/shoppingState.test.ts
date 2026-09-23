import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ProductDiscoveryView, ProductSelectionView } from "./types";
import {
  formatVerifiedProductPrice,
  toProjectProductShoppingState,
} from "./shoppingState";

const PROJECT_ID = "11111111-1111-4111-8111-111111111111";
const DISCOVERY_ID = "22222222-2222-4222-8222-222222222222";

function discovery(overrides: Partial<ProductDiscoveryView> = {}): ProductDiscoveryView {
  return {
    id: DISCOVERY_ID,
    projectId: PROJECT_ID,
    sourceAnalysisId: "33333333-3333-4333-8333-333333333333",
    sourceAnalysisUpdatedAt: "2026-08-18T00:00:00.000Z",
    locationInput: "Velenje",
    latitude: 46.36,
    longitude: 15.11,
    radiusKm: 50,
    searchedItemCount: 3,
    notSearchedCount: 0,
    allowlistDomains: ["localhome.si"],
    unmatchedRequirements: [],
    sourcePreferences: {},
    sourcePreferencesHash: "",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

function selection(
  overrides: Partial<ProductSelectionView> & Pick<ProductSelectionView, "id" | "itemSpec">
): ProductSelectionView {
  return {
    projectId: PROJECT_ID,
    discoveryId: DISCOVERY_ID,
    requirementType: "furniture",
    requirementKey: overrides.requirementKey ?? overrides.id,
    requirementSnapshot: { displayLabel: overrides.itemSpec },
    productTitle: overrides.productTitle ?? overrides.itemSpec,
    productUrl: "https://www.localhome.si/p/1",
    productImageUrl: "https://cdn.localhome.si/1.jpg",
    price: 10,
    currency: "EUR",
    retailerDomain: "localhome.si",
    retailerName: "Local Home",
    hasReferenceImage: true,
    isConfirmed: false,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
    ...overrides,
  };
}

const productA = selection({
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  itemSpec: "oak desk",
  productTitle: "Product A",
  price: 100,
  isConfirmed: true,
});
const productB = selection({
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  itemSpec: "wool rug",
  productTitle: "Product B",
  price: 50,
  isConfirmed: true,
});
const productCMissing = {
  requirementKey: "lamp",
  requirementType: "furniture" as const,
  itemSpec: "floor lamp",
  displayLabel: "floor lamp",
  reason: "no_valid_product" as const,
};

describe("toProjectProductShoppingState", () => {
  it("reloads found products and missing requirements without wizard productCandidates", () => {
    const persisted = discovery({
      unmatchedRequirements: [productCMissing],
    });
    const lostWizardState = {
      productCandidates: null,
      shoppingList: null,
    };
    const state = toProjectProductShoppingState(persisted, [productA, productB]);

    expect(lostWizardState.productCandidates).toBeNull();
    expect(lostWizardState.shoppingList).toBeNull();
    expect(state.foundSelections.map((item) => item.productTitle)).toEqual(["Product A", "Product B"]);
    expect(state.missingRequirements.map((item) => item.label)).toEqual(["floor lamp"]);
    expect(state.allNotFound).toBe(false);
  });

  it("reconstructs the same shopping list and final-report payload after a refresh", () => {
    const persisted = discovery({ unmatchedRequirements: [productCMissing] });
    const first = toProjectProductShoppingState(persisted, [productA, productB]);
    const afterRefresh = toProjectProductShoppingState(persisted, [productA, productB]);

    expect(afterRefresh).toEqual(first);
    expect(afterRefresh.foundSelections).toHaveLength(2);
    expect(afterRefresh.missingRequirements).toHaveLength(1);
  });

  it("treats a known-price total of 150 EUR as partial when one found product has no price", () => {
    const unpriced = selection({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      itemSpec: "oak chair",
      productTitle: "Product C",
      price: null,
      currency: null,
      isConfirmed: true,
    });
    const state = toProjectProductShoppingState(discovery(), [productA, productB, unpriced]);

    expect(state.knownProductTotal).toBe(150);
    expect(state.pricedCount).toBe(2);
    expect(state.unpricedCount).toBe(1);
    expect(state.knownProductTotalIsPartial).toBe(true);
    expect(formatVerifiedProductPrice(unpriced.price, unpriced.currency)).toBe("Price unavailable");
  });

  it("renders an all-not-found empty state with unresolved requirements", () => {
    const persisted = discovery({
      searchedItemCount: 3,
      unmatchedRequirements: [
        { ...productCMissing, requirementKey: "a", itemSpec: "desk", displayLabel: "desk" },
        { ...productCMissing, requirementKey: "b", itemSpec: "rug", displayLabel: "rug" },
        { ...productCMissing, requirementKey: "c", itemSpec: "lamp", displayLabel: "lamp" },
      ],
    });
    const state = toProjectProductShoppingState(persisted, []);

    expect(state.foundSelections).toEqual([]);
    expect(state.missingRequirements).toHaveLength(3);
    expect(state.allNotFound).toBe(true);
    expect(state.knownProductTotal).toBeNull();
  });

    it("does not treat unavailable FOUND products as shopping-list selections", () => {
      const unavailable = selection({
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        itemSpec: "sofa",
        productTitle: "Unrenderable sofa",
        referenceStatus: "unavailable",
        isConfirmed: true,
      });
      const state = toProjectProductShoppingState(discovery(), [productA, unavailable]);
      expect(state.foundSelections.map((item) => item.productTitle)).toEqual(["Product A"]);
      expect(state.missingRequirements.some((item) => item.label === "Unrenderable sofa")).toBe(true);
    });

    it("includes found products regardless of isConfirmed and preserves the design flag", () => {
      const confirmed = productA;
    const notConfirmed = selection({
      id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      itemSpec: "wool rug",
      productTitle: "Product B",
      price: 50,
      isConfirmed: false,
    });
    const state = toProjectProductShoppingState(discovery(), [confirmed, notConfirmed]);

    expect(state.foundSelections).toHaveLength(2);
    expect(state.foundSelections.find((item) => item.productTitle === "Product A")?.isConfirmed).toBe(
      true
    );
    expect(state.foundSelections.find((item) => item.productTitle === "Product B")?.isConfirmed).toBe(
      false
    );
  });

  it("does not treat unknown price as 0 in the known product total", () => {
    const unpricedOnly = selection({
      id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      itemSpec: "oak chair",
      productTitle: "Product C",
      price: null,
      currency: null,
    });
    const state = toProjectProductShoppingState(discovery(), [unpricedOnly]);
    expect(state.knownProductTotal).toBeNull();
    expect(state.unpricedCount).toBe(1);
    expect(state.knownProductTotalIsPartial).toBe(false);
  });

  it("lists not_searched leftovers as unresolved so they are not silently omitted", () => {
    const persisted = discovery({
      notSearchedCount: 2,
      unmatchedRequirements: [
        {
          requirementKey: "furniture:desk:0",
          requirementType: "furniture",
          itemSpec: "desk",
          displayLabel: "desk",
          reason: "not_searched",
        },
      ],
    });
    const state = toProjectProductShoppingState(persisted, [productA]);
    expect(state.missingRequirements.map((item) => item.requirementKey)).toEqual(["furniture:desk:0"]);
    expect(state.notSearchedCount).toBe(1);
  });

  it("returns an empty read-only state when discovery is missing", () => {
    const state = toProjectProductShoppingState(null, [productA]);
    expect(state.hasDiscovery).toBe(false);
    expect(state.foundSelections).toEqual([]);
    expect(state.missingRequirements).toEqual([]);
  });
});

describe("product continuity source invariants", () => {
  it("keeps the shopping-state mapper free of provider SDKs", () => {
    const source = readFileSync(join(process.cwd(), "lib/discovery/shoppingState.ts"), "utf8");
    expect(source).not.toMatch(/openai|replicate|serpapi|googleapis/i);
  });

  it("loads shopping state through the existing owned discovery reader", () => {
    const source = readFileSync(join(process.cwd(), "lib/discovery/server.ts"), "utf8");
    expect(source).toContain("getVerifiedUser");
    expect(source).toContain("loadPersistedProductDiscovery");
    expect(source).toContain("loadProjectProductShoppingState");
    expect(source.indexOf("getVerifiedUser")).toBeLessThan(source.indexOf("loadCurrentProductDiscovery"));
  });

  it("does not require productCandidates in Step9c or Step10", () => {
    const step9c = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step9cShoppingList.tsx"),
      "utf8"
    );
    const step10 = readFileSync(
      join(process.cwd(), "components/app/room-renovation/steps/Step10FinalReport.tsx"),
      "utf8"
    );
    const flow = readFileSync(
      join(process.cwd(), "components/app/room-renovation/RoomRenovationFlow.tsx"),
      "utf8"
    );
    expect(step9c).not.toContain("productCandidates");
    expect(step10).not.toContain("productCandidates");
    expect(step10).not.toContain("data.shoppingList");
    expect(flow).toContain("toProjectProductShoppingState");
    expect(flow).toContain("productShoppingState");
  });
});
