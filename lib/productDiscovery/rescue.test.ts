import { describe, expect, it } from "vitest";
import {
  buildRescueCandidates,
  isConfidentNonProductUrl,
  priceSupportedByCandidateEvidence,
  rescueCandidateMap,
  scoreProductPageLikelihood,
} from "./rescueCandidates";
import { shouldAttemptRescue } from "./rescue";

describe("rescueCandidates", () => {
  it("prefers direct product-like URLs over category pages", () => {
    const productScore = scoreProductPageLikelihood(
      "https://obi.si/p/trio-led-viseca-svetilka-salinas-308122",
      "Trio LED viseča svetilka"
    );
    const categoryScore = scoreProductPageLikelihood(
      "https://obi.si/c/bivanje-874/svetila-in-luci-516/notranja-svetila-929",
      null
    );
    expect(productScore).toBeGreaterThan(categoryScore);
  });

  it("builds bounded candidate set from allowlisted sources", () => {
    const candidates = buildRescueCandidates({
      sources: [
        { url: "https://obi.si/p/pendant-black", title: "Black pendant lamp 40cm" },
        { url: "https://obi.si/c/category", title: "Category" },
        { url: "https://evil.com/p/x", title: "Evil" },
        { url: "https://merkur.si/file.pdf", title: "PDF" },
      ],
      allowlistDomains: ["obi.si", "merkur.si"],
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      maxCandidates: 5,
    });
    expect(candidates.length).toBe(1);
    expect(candidates[0]?.id).toBe("candidate_1");
    expect(candidates[0]?.url).toBe("https://obi.si/p/pendant-black");
  });

  it("rejects prices not present in candidate evidence", () => {
    const candidate = {
      id: "candidate_1",
      url: "https://obi.si/p/pendant",
      domain: "obi.si",
      sourceTitle: "Black pendant lamp",
      sourceEvidence: "Black pendant lamp",
      preRankScore: 10,
      enrichment: null,
    };
    expect(priceSupportedByCandidateEvidence(119.99, candidate)).toBe(false);
    expect(
      priceSupportedByCandidateEvidence(119.99, {
        ...candidate,
        sourceEvidence: "Price 119,99 EUR",
      })
    ).toBe(true);
  });

  it("identifies confident non-product junk", () => {
    expect(isConfidentNonProductUrl("https://merkur.si/catalog.pdf")).toBe(true);
    expect(isConfidentNonProductUrl("https://obi.si/p/product-123")).toBe(false);
  });
});

describe("shouldAttemptRescue", () => {
  it("does not rescue when primary found", () => {
    expect(
      shouldAttemptRescue({
        primaryStatus: "found",
        initialFailureReason: null,
        searchUsed: true,
        sourceCount: 5,
      })
    ).toBe(false);
  });

  it("rescues on model_not_found with sources", () => {
    expect(
      shouldAttemptRescue({
        primaryStatus: "not_found",
        initialFailureReason: "model_not_found",
        searchUsed: true,
        sourceCount: 5,
      })
    ).toBe(true);
  });

  it("rescues on url_not_in_sources", () => {
    expect(
      shouldAttemptRescue({
        primaryStatus: "not_found",
        initialFailureReason: "url_not_in_sources",
        searchUsed: true,
        sourceCount: 5,
      })
    ).toBe(true);
  });
});

describe("rescueCandidateMap", () => {
  it("maps stable candidate IDs", () => {
    const candidates = buildRescueCandidates({
      sources: [
        { url: "https://obi.si/p/a", title: "A" },
        { url: "https://obi.si/p/b", title: "B" },
      ],
      allowlistDomains: ["obi.si"],
      requestedItem: "lamp",
    });
    const map = rescueCandidateMap(candidates);
    expect(map.get("candidate_1")?.url).toBe("https://obi.si/p/a");
    expect(map.get("candidate_2")?.url).toBe("https://obi.si/p/b");
  });
});
