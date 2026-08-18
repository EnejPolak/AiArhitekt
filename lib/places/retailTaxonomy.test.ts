import { describe, expect, it } from "vitest";
import {
  buildStoreDiscoveryPlan,
  MAX_STORE_DISCOVERY_CATEGORIES,
  requirementToRetailCategory,
} from "./retailTaxonomy";

describe("requirement → retail category taxonomy", () => {
  it("maps office chair + computer desk to one furniture Places group", () => {
    const plan = buildStoreDiscoveryPlan(["office chair", "computer desk"]);
    expect(plan.categories).toEqual(["furniture"]);
    expect(plan.queries.filter((q) => q.kind === "keyword")).toHaveLength(1);
    expect(plan.queries.some((q) => q.kind === "type" && q.type === "furniture_store")).toBe(true);
    expect(plan.queries.every((q) => q.categories.includes("furniture"))).toBe(true);
  });

  it("maps marble flooring to flooring/tile, not furniture", () => {
    const plan = buildStoreDiscoveryPlan(["marble flooring"]);
    expect(plan.categories).toEqual(["flooring"]);
    expect(requirementToRetailCategory("floor tiles")).toBe("flooring");
    expect(requirementToRetailCategory("ceramic tile")).toBe("flooring");
  });

  it("maps two wall paints to one paint Places group", () => {
    const plan = buildStoreDiscoveryPlan([
      "interior wall paint metallic black",
      "interior wall paint olive green",
    ]);
    expect(plan.categories).toEqual(["paint"]);
    expect(plan.queries.filter((q) => q.kind === "keyword")).toHaveLength(1);
    expect(plan.queries.filter((q) => q.kind === "type")).toHaveLength(1);
  });

  it("plans furniture + flooring + paint as exactly three category groups", () => {
    const plan = buildStoreDiscoveryPlan([
      "office chair",
      "computer desk",
      "marble flooring",
      "interior wall paint metallic black",
      "interior wall paint olive green",
    ]);
    expect(plan.categories).toEqual(["furniture", "flooring", "paint"]);
    const keywordCats = plan.queries.filter((q) => q.kind === "keyword").flatMap((q) => q.categories);
    expect(new Set(keywordCats)).toEqual(new Set(["furniture", "flooring", "paint"]));
    expect(plan.queries.length).toBeLessThanOrEqual(plan.categories.length * 2);
  });

  it("caps unique retail categories", () => {
    const plan = buildStoreDiscoveryPlan([
      "office chair",
      "wall paint",
      "marble flooring",
      "ceiling lamp",
      "bathroom faucet",
      "hammer",
      "curtain",
      "wall outlet",
    ]);
    expect(plan.categories.length).toBe(MAX_STORE_DISCOVERY_CATEGORIES);
  });

  it("does not map requirements to retailer brands", () => {
    const plan = buildStoreDiscoveryPlan(["office chair", "marble flooring"]);
    const blob = JSON.stringify(plan).toLowerCase();
    expect(blob).not.toMatch(/merkur|lesnina|jysk|obi|jager|ikea/);
  });
});
