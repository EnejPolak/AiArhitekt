import { describe, expect, it } from "vitest";
import { productDiscoveryModelSchema } from "./schema";
import {
  STEP_C_MAX_CANDIDATES,
  extractModelProposedCandidates,
  withModelCandidatePool,
} from "./stepCCandidates";

function modelProduct(name: string, url: string, rank: number) {
  return {
    name,
    retailer: "Local Home",
    retailerDomain: "localhome.si",
    productUrl: url,
    price: 199,
    currency: "EUR",
    priceUnit: null,
    imageUrl: `https://cdn.localhome.si/${name}.jpg`,
    specifications: [],
    matchScore: 0.8,
    matchedRequirements: ["sofa"],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "sofa",
    sku: `SKU-${rank}`,
    category: "sofa",
    rank,
    sourceUrls: [url],
  };
}

describe("OpenAI Step C candidate pool", () => {
  it("G. parses 3–5 ranked candidates from the model schema", () => {
    const parsed = productDiscoveryModelSchema.parse({
      status: "found",
      product: modelProduct("Sofa A", "https://www.localhome.si/p/a", 1),
      candidates: [
        modelProduct("Sofa B", "https://www.localhome.si/p/b", 2),
        modelProduct("Sofa C", "https://www.localhome.si/p/c", 3),
        modelProduct("Sofa D", "https://www.localhome.si/p/d", 4),
        modelProduct("Sofa E", "https://www.localhome.si/p/e", 5),
      ],
    });
    const proposed = extractModelProposedCandidates({
      parsed,
      requestedItem: "sofa",
      allowlistDomains: ["localhome.si"],
    });
    expect(STEP_C_MAX_CANDIDATES).toBe(5);
    expect(proposed).toHaveLength(5);
    expect(proposed.map((item) => item.productUrl)).toEqual([
      "https://www.localhome.si/p/a",
      "https://www.localhome.si/p/b",
      "https://www.localhome.si/p/c",
      "https://www.localhome.si/p/d",
      "https://www.localhome.si/p/e",
    ]);
    expect(proposed.every((item) => item.rank && item.category === "sofa" && item.sku)).toBe(true);
  });

  it("caps the model pool at 5 unique allowlisted product URLs", () => {
    const parsed = productDiscoveryModelSchema.parse({
      status: "found",
      product: modelProduct("Sofa A", "https://www.localhome.si/p/a", 1),
      candidates: [
        modelProduct("Sofa B", "https://www.localhome.si/p/b", 2),
        modelProduct("Sofa C", "https://www.localhome.si/p/c", 3),
        modelProduct("Sofa D", "https://www.localhome.si/p/d", 4),
        modelProduct("Sofa E", "https://www.localhome.si/p/e", 5),
        modelProduct("Sofa F", "https://www.localhome.si/p/f", 5),
      ],
    });
    expect(parsed.candidates).toHaveLength(5);
    const proposed = extractModelProposedCandidates({
      parsed: {
        ...parsed,
        candidates: [
          ...(parsed.candidates ?? []),
          modelProduct("Sofa F", "https://www.localhome.si/p/f", 6),
        ],
      },
      requestedItem: "sofa",
      allowlistDomains: ["localhome.si"],
    });
    expect(proposed).toHaveLength(5);
  });

  it("drops candidates from blocked merchant domains", () => {
    const parsed = productDiscoveryModelSchema.parse({
      status: "found",
      product: modelProduct("Sofa A", "https://www.localhome.si/p/a", 1),
      candidates: [
        {
          ...modelProduct("Blocked", "https://blocked.si/p/x", 2),
          retailerDomain: "blocked.si",
        },
      ],
    });
    const proposed = extractModelProposedCandidates({
      parsed,
      requestedItem: "sofa",
      allowlistDomains: ["localhome.si"],
    });
    expect(proposed.map((item) => item.productUrl)).toEqual(["https://www.localhome.si/p/a"]);
  });

  it("attaches the model pool onto a discovery result without selecting a winner", () => {
    const proposed = extractModelProposedCandidates({
      parsed: {
        status: "not_found",
        product: null,
        candidates: [
          modelProduct("Sofa B", "https://www.localhome.si/p/b", 1),
          modelProduct("Sofa C", "https://www.localhome.si/p/c", 2),
        ],
      },
      requestedItem: "sofa",
      allowlistDomains: ["localhome.si"],
    });
    const attached = withModelCandidatePool(
      {
        requestedItem: "sofa",
        status: "not_found",
        product: null,
        sources: [{ title: "Sofa B", url: "https://www.localhome.si/p/b" }],
      },
      proposed
    );
    expect(attached.status).toBe("not_found");
    expect(attached.product).toBeNull();
    expect(attached.candidates?.map((item) => item.productUrl)).toEqual([
      "https://www.localhome.si/p/b",
      "https://www.localhome.si/p/c",
    ]);
  });
});
