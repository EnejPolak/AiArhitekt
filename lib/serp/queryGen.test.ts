import { describe, it, expect } from "vitest";
import {
  buildPlannedQueries,
  itemSpecToKeywords,
  stripStoreNamesAndDomainsFromItem,
} from "./queryGen";
import { itemSpecToCategory } from "./taxonomy";

describe("queryGen", () => {
  const allowlist = ["merkur.si", "jysk.si"];

  it("strips store names from item specs so they never appear as keywords", () => {
    const spec = stripStoreNamesAndDomainsFromItem(
      "bela stenska barva merkur jysk",
      allowlist
    );
    expect(spec.toLowerCase()).not.toMatch(/merkur/);
    expect(spec.toLowerCase()).not.toMatch(/jysk/);
    expect(spec).toMatch(/barva/);
  });

  it("itemSpecToKeywords drops store names, domains, and price noise", () => {
    const keywords = itemSpecToKeywords("stenska barva merkur 12 EUR merkur.si", allowlist);
    expect(keywords.toLowerCase()).not.toContain("merkur");
    expect(keywords.toLowerCase()).not.toContain("eur");
    expect(keywords).toMatch(/stenska/);
    expect(keywords).toMatch(/barva/);
  });

  it("builds site:domain queries from specs and allowlist only", () => {
    const { planned, flat } = buildPlannedQueries(["stenska barva bela"], allowlist);

    expect(flat.length).toBeGreaterThan(0);
    for (const row of flat) {
      expect(row.query).toMatch(/^site:(merkur\.si|jysk\.si)\s+/);
      const keywords = row.query.replace(/^site:\S+\s+/, "").toLowerCase();
      expect(keywords).not.toMatch(/\bmerkur\b/);
      expect(row.item).toBe("stenska barva bela");
    }
    expect(planned["stenska barva bela"]?.length).toBeGreaterThan(0);
    expect(planned["stenska barva bela"].some((q) => q.includes("site:merkur.si"))).toBe(
      true
    );
  });

  it("does not plan queries when the item is only a store name", () => {
    const { planned, flat } = buildPlannedQueries(["Merkur"], allowlist);
    expect(flat).toEqual([]);
    expect(planned["Merkur"]).toEqual([]);
  });
});

describe("desk taxonomy", () => {
  const allowlist = ["merkur.si", "jysk.si"];

  it("classifies computer desk as furniture", () => {
    expect(itemSpecToCategory("large computer desk multiple monitors")).toBe("furniture");
    expect(itemSpecToCategory("computer desk")).toBe("furniture");
  });

  it("keeps Slovenian letters in site-scoped keywords", () => {
    const keywords = itemSpecToKeywords("računalniška miza za več monitorjev", allowlist);
    expect(keywords).toContain("računalniška");
    expect(keywords).toContain("miza");
    expect(keywords).not.toMatch(/racunalniska/);
    const { flat } = buildPlannedQueries(["računalniška miza"], allowlist);
    expect(flat.some((row) => row.query.includes("računalniška miza"))).toBe(true);
  });
});
