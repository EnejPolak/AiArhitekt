import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { SearchableRequirement, UnmatchedRequirement } from "./itemSpecs";
import type { RankedProductCandidate } from "./style/types";
import {
  diversifyMerchantCandidatePool,
  effectiveSearchAllowlist,
  exclusiveUnresolvedRetryKey,
  mergeRankedCandidatePool,
  referenceFetchBlockedDomains,
  searchScopeAfterRejectedMemory,
  selectFirstRenderReadyCandidate,
  resolveRequirementSlot,
} from "./completeRoom";
import { TARGETED_RESEARCH_SYSTEM_PROMPT } from "@/lib/productDiscovery/targetedResearchPrompt";
import { PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL } from "@/lib/productDiscovery/prompt";

function sofaRequirement(): SearchableRequirement {
  return {
    requirementType: "furniture",
    requirementKey: "furniture:user-sofa:0",
    itemSpec: "Sofa",
    queryPlan: ["Sofa"],
    snapshot: { category: "Sofa", quantity: 1, placementNotes: null, constraints: [] },
    displayLabel: "Sofa",
  };
}

function ranked(
  url: string,
  title: string,
  score: number,
  domain: string
): RankedProductCandidate {
  return {
    product: {
      productTitle: title,
      productSnippet: null,
      productUrl: url,
      productImageUrl: `https://cdn.${domain}/${title}.jpg`,
      price: 199,
      currency: "EUR",
      retailerDomain: domain,
      retailerName: domain,
      hasReferenceImage: true,
    },
    hardValid: true,
    hardGateReasons: [],
    fidelity: null,
    serpScore: score,
    serpConfidence: 1,
    styleFit: null,
    finalScore: score,
  };
}

const SOFA_ALLOWLIST = [
  "xxxlesnina.si",
  "harveynorman.si",
  "rutar.com",
  "svetpohistva.si",
  "obi.si",
  "merkur.si",
];

const RUG_ALLOWLIST = [
  "bauhaus.si",
  "xxxlesnina.si",
  "harveynorman.si",
  "rutar.com",
  "svetpohistva.si",
  "obi.si",
  "merkur.si",
];

describe("merchant diversity hardening", () => {
  it("A. multi-domain pool prefers two A.com then other domains, not all A", () => {
    const pool = diversifyMerchantCandidatePool([
      ranked("https://a.com/1", "A1", 90, "a.com"),
      ranked("https://a.com/2", "A2", 80, "a.com"),
      ranked("https://a.com/3", "A3", 70, "a.com"),
      ranked("https://b.com/1", "B1", 60, "b.com"),
      ranked("https://c.com/1", "C1", 50, "c.com"),
    ]);
    expect(pool.map((item) => item.product.productTitle).slice(0, 4)).toEqual([
      "A1",
      "A2",
      "B1",
      "C1",
    ]);
    expect(pool.every((item) => item.product.retailerDomain === "a.com")).toBe(false);
    expect(new Set(pool.map((item) => item.product.retailerDomain)).size).toBeGreaterThanOrEqual(2);
  });

  it("A2. mergeRankedCandidatePool applies the same max-per-domain preference", () => {
    const pool = mergeRankedCandidatePool(
      [],
      [
        ranked("https://a.com/1", "A1", 90, "a.com"),
        ranked("https://a.com/2", "A2", 80, "a.com"),
        ranked("https://a.com/3", "A3", 70, "a.com"),
        ranked("https://b.com/1", "B1", 60, "b.com"),
        ranked("https://c.com/1", "C1", 50, "c.com"),
      ]
    );
    expect(pool.map((item) => item.product.productTitle).slice(0, 4)).toEqual([
      "A1",
      "A2",
      "B1",
      "C1",
    ]);
  });

  it("B. single-domain fallback keeps available candidates", () => {
    const onlyA = [
      ranked("https://a.com/1", "A1", 90, "a.com"),
      ranked("https://a.com/2", "A2", 80, "a.com"),
      ranked("https://a.com/3", "A3", 70, "a.com"),
    ];
    const pool = diversifyMerchantCandidatePool(onlyA);
    expect(pool.map((item) => item.product.productTitle)).toEqual(["A1", "A2", "A3"]);
    expect(pool).toHaveLength(3);
  });

  it("C. remaining same-domain candidates are skipped after merchant_blocked threshold", async () => {
    const a1 = ranked("https://a.com/p/1", "A1", 90, "a.com");
    const a2 = ranked("https://a.com/p/2", "A2", 80, "a.com");
    const a3 = ranked("https://a.com/p/3", "A3", 70, "a.com");
    const b1 = ranked("https://b.com/p/1", "B1", 60, "b.com");
    const evaluate = vi.fn((candidate: RankedProductCandidate) => {
      if (candidate.product.retailerDomain === "a.com") {
        return { ready: false as const, failureCode: "merchant_blocked" };
      }
      return { ready: true as const, cachedBytesValid: true };
    });

    const selected = await selectFirstRenderReadyCandidate({
      candidates: [a1, a2, a3, b1],
      evaluate,
    });

    expect(evaluate.mock.calls.map((call) => call[0].product.productUrl)).toEqual([
      "https://a.com/p/1",
      "https://a.com/p/2",
      "https://b.com/p/1",
    ]);
    expect(selected.rejected).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productUrl: "https://a.com/p/3",
          failureCode: "reference_fetch_blocked",
        }),
      ])
    );
    expect(selected.selected?.product.productUrl).toBe("https://b.com/p/1");
  });

  it("D. recovery Step C receives allowlist without the blocked domain", () => {
    const rejected = [
      { productUrl: "https://a.com/p/1", merchant: "a.com", failureCode: "merchant_blocked" },
      { productUrl: "https://a.com/p/2", merchant: "a.com", failureCode: "merchant_blocked" },
    ];
    const scope = searchScopeAfterRejectedMemory(["a.com", "b.com", "c.com"], rejected);
    expect(scope.referenceFetchBlockedDomains).toEqual(["a.com"]);
    expect(scope.allowlistDomains).toEqual(["b.com", "c.com"]);
    expect(scope.excludeProductUrls).toEqual(["https://a.com/p/1", "https://a.com/p/2"]);
    expect(scope.noEligibleMerchants).toBe(false);
  });

  it("E. all-domains-blocked fails closed with no open-web fallback", () => {
    const rejected = [
      { productUrl: "https://a.com/p/1", merchant: "a.com", failureCode: "merchant_blocked" },
      { productUrl: "https://a.com/p/2", merchant: "a.com", failureCode: "merchant_blocked" },
      { productUrl: "https://b.com/p/1", merchant: "b.com", failureCode: "merchant_blocked" },
      { productUrl: "https://b.com/p/2", merchant: "b.com", failureCode: "merchant_blocked" },
      { productUrl: "https://c.com/p/1", merchant: "c.com", failureCode: "merchant_blocked" },
      { productUrl: "https://c.com/p/2", merchant: "c.com", failureCode: "merchant_blocked" },
    ];
    const scope = searchScopeAfterRejectedMemory(["a.com", "b.com", "c.com"], rejected);
    expect(scope.allowlistDomains).toEqual([]);
    expect(scope.noEligibleMerchants).toBe(true);
    expect(effectiveSearchAllowlist(["a.com", "b.com", "c.com"], ["a.com", "b.com", "c.com"])).toEqual(
      []
    );
    expect(PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL).toContain(
      "Search ONLY the retailer domains supplied in the user message"
    );
    expect(TARGETED_RESEARCH_SYSTEM_PROMPT).toContain("Never search the open web");
  });

  it("F. fetch_failed does not domain-block a merchant", () => {
    expect(
      referenceFetchBlockedDomains([
        { productUrl: "https://a.com/p/1", merchant: "a.com", failureCode: "fetch_failed" },
        { productUrl: "https://a.com/p/2", merchant: "a.com", failureCode: "fetch_failed" },
        { productUrl: "https://a.com/p/3", merchant: "a.com", failureCode: "fetch_failed" },
      ])
    ).toEqual([]);
  });

  it("G. no_image does not domain-block a merchant", () => {
    expect(
      referenceFetchBlockedDomains([
        { productUrl: "https://a.com/p/1", merchant: "a.com", failureCode: "no_image" },
        { productUrl: "https://a.com/p/2", merchant: "a.com", failureCode: "no_image" },
      ])
    ).toEqual([]);
  });

  it("H. association_unverified does not domain-block a merchant", () => {
    expect(
      referenceFetchBlockedDomains([
        { productUrl: "https://a.com/p/1", merchant: "a.com", failureCode: "association_unverified" },
        { productUrl: "https://a.com/p/2", merchant: "a.com", failureCode: "association_unverified" },
      ])
    ).toEqual([]);
  });

  it("I. persisted merchant_blocked history is honored before a later manual Retry", () => {
    const sofaRejected = [
      {
        productUrl: "https://www.xxxlesnina.si/p/mid-you-sedezna-garnitura-tkanina-be-002220053706",
        merchant: "xxxlesnina.si",
        failureCode: "merchant_blocked",
      },
      {
        productUrl: "https://www.xxxlesnina.si/p/hom-in-kotna-sedezna-garnitura-senilja-be-000553016402",
        merchant: "xxxlesnina.si",
        failureCode: "merchant_blocked",
      },
      {
        productUrl: "https://www.xxxlesnina.si/p/hom-in-kotna-sedezna-garnitura-gladka-tkanina-barve-grafita-000553010610",
        merchant: "xxxlesnina.si",
        failureCode: "merchant_blocked",
      },
    ];
    const scope = searchScopeAfterRejectedMemory(SOFA_ALLOWLIST, sofaRejected);
    expect(scope.referenceFetchBlockedDomains).toEqual(["xxxlesnina.si"]);
    expect(scope.allowlistDomains).not.toContain("xxxlesnina.si");
    expect(scope.allowlistDomains).toEqual([
      "harveynorman.si",
      "rutar.com",
      "svetpohistva.si",
      "obi.si",
      "merkur.si",
    ]);
    expect(scope.excludeProductUrls).toHaveLength(3);
    const discoverSrc = readFileSync(join(__dirname, "discover.ts"), "utf8");
    expect(discoverSrc).toMatch(
      /retryUnresolvedRequirement[\s\S]*searchScopeAfterRejectedMemory\(allowlistDomains/
    );
  });

  it("J. READY sibling requirements are not searched again", () => {
    const unmatched: UnmatchedRequirement[] = [
      {
        requirementKey: "furniture:user-sofa:0",
        requirementType: "furniture",
        itemSpec: "Sofa",
        displayLabel: "Sofa",
        reason: "no_valid_product",
        rejectedCandidates: [],
        recoverySearchesUsed: 1,
      },
    ];
    const ready = ["furniture:coffee-table:0", "furniture:ceiling-light:0"];
    expect(exclusiveUnresolvedRetryKey("furniture:user-sofa:0", unmatched, ready)).toBe(
      "furniture:user-sofa:0"
    );
    expect(exclusiveUnresolvedRetryKey("furniture:coffee-table:0", unmatched, ready)).toBeNull();
    expect(exclusiveUnresolvedRetryKey("furniture:ceiling-light:0", unmatched, ready)).toBeNull();
    const discoverSrc = readFileSync(join(__dirname, "discover.ts"), "utf8");
    expect(discoverSrc).toMatch(/exclusiveUnresolvedRetryKey\(/);
    expect(discoverSrc).toMatch(/retryUnresolvedRequirement[\s\S]*items:\s*\[query\]/);
  });

  it("live sofa replay: xxxlesnina concentration is bounded, skipped, and excluded from recovery", async () => {
    const candidates = [
      ranked("https://www.xxxlesnina.si/p/sofa-1", "S1", 90, "xxxlesnina.si"),
      ranked("https://www.xxxlesnina.si/p/sofa-2", "S2", 80, "xxxlesnina.si"),
      ranked("https://www.xxxlesnina.si/p/sofa-3", "S3", 70, "xxxlesnina.si"),
      ranked("https://www.xxxlesnina.si/p/sofa-4", "S4", 60, "xxxlesnina.si"),
      ranked("https://www.xxxlesnina.si/p/sofa-5", "S5", 50, "xxxlesnina.si"),
    ];
    const kept = diversifyMerchantCandidatePool(candidates);
    expect(kept).toHaveLength(5);

    const evaluate = vi.fn((candidate: RankedProductCandidate) => {
      if (candidate.product.retailerDomain === "xxxlesnina.si") {
        return { ready: false as const, failureCode: "merchant_blocked" };
      }
      return { ready: false as const, failureCode: "no_image" };
    });
    const recover = vi.fn(async ({ rejected }: { rejected: { merchant: string; productUrl: string }[] }) => {
      const scope = searchScopeAfterRejectedMemory(SOFA_ALLOWLIST, rejected);
      expect(scope.referenceFetchBlockedDomains).toEqual(["xxxlesnina.si"]);
      expect(scope.allowlistDomains).toEqual([
        "harveynorman.si",
        "rutar.com",
        "svetpohistva.si",
        "obi.si",
        "merkur.si",
      ]);
      expect(scope.excludeProductUrls).toHaveLength(5);
      return [];
    });

    const slot = await resolveRequirementSlot({
      requirement: sofaRequirement(),
      candidates: kept,
      evaluate,
      recover,
    });

    expect(evaluate).toHaveBeenCalledTimes(2);
    expect(
      slot.rejected.filter((item) => item.failureCode === "reference_fetch_blocked")
    ).toHaveLength(3);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(slot.status).toBe("unresolved");
  });

  it("live rug replay: bauhaus and xxxlesnina are removed from recovery allowlist", () => {
    const rejected = [
      {
        productUrl: "https://www.bauhaus.si/preproge/preproga-floria/p/28432128",
        merchant: "bauhaus.si",
        failureCode: "merchant_blocked",
      },
      {
        productUrl: "https://www.bauhaus.si/kosmate-preproge/preproga-z-visokim-florom-super-soft-shaggy/p/23004948",
        merchant: "bauhaus.si",
        failureCode: "merchant_blocked",
      },
      {
        productUrl: "https://www.xxxlesnina.si/p/preproga-crna-be-008729073401",
        merchant: "xxxlesnina.si",
        failureCode: "merchant_blocked",
      },
      {
        productUrl: "https://www.xxxlesnina.si/p/preproga-druga",
        merchant: "xxxlesnina.si",
        failureCode: "merchant_blocked",
      },
    ];
    const scope = searchScopeAfterRejectedMemory(RUG_ALLOWLIST, rejected);
    expect(scope.referenceFetchBlockedDomains).toEqual(["bauhaus.si", "xxxlesnina.si"]);
    expect(scope.allowlistDomains).toEqual([
      "harveynorman.si",
      "rutar.com",
      "svetpohistva.si",
      "obi.si",
      "merkur.si",
    ]);
    expect(scope.allowlistDomains).not.toContain("bauhaus.si");
    expect(scope.allowlistDomains).not.toContain("xxxlesnina.si");
    expect(scope.noEligibleMerchants).toBe(false);
  });

  it("prompts require merchant-diverse candidate pools", () => {
    const rule =
      "return candidates from at least two merchant domains and no more than two candidates from one domain";
    expect(PRODUCT_DISCOVERY_SYSTEM_PROMPT_CONTROL).toContain(rule);
    expect(TARGETED_RESEARCH_SYSTEM_PROMPT).toContain(rule);
  });
});
