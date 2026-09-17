import { describe, expect, it } from "vitest";
import { classifyExactDimensionAgainstEvidence } from "./productEvidence";
import {
  discoveryDomainMetrics,
  diversifyDiscoveryCandidates,
  scoreConstraintAwareDiscovery,
} from "./discoveryScore";
import { buildSearchConstraints } from "./searchConstraints";
import {
  buildSearchQueryVariants,
  summarizeQueryVariantStats,
} from "./searchQueryVariants";
import { buildProductDiscoveryUserMessage } from "./prompt";
import {
  buildRequirementPolicyHints,
  buildSuggestedSearchQueriesForRequest,
} from "./matchPolicy";
import { buildRescueCandidates } from "./rescueCandidates";
import { ACCEPTANCE_PRIMARY_MIN_SCORE, ACCEPTANCE_RESCUE_MIN_SCORE } from "./constants";

describe("search recall — constraint-aware query generation", () => {
  it("A. exact width 600 mm generates 600 mm + 60 cm variants", () => {
    const variants = buildSearchQueryVariants(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      { allowlistDomains: ["obi.si", "merkur.si"] }
    );
    const joined = variants.map((v) => v.query).join(" | ");
    expect(joined).toMatch(/600\s*mm/i);
    expect(joined).toMatch(/60\s*cm/i);
    expect(variants.some((v) => v.intent === "exact_spec")).toBe(true);
  });

  it("B. exact width does not become approximate", () => {
    const c = buildSearchConstraints(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR"
    );
    expect(c.exactDimensions).toBe(true);
    expect(c.approximateDimensions).toBe(false);
    expect(c.dimensions[0]?.mode).toBe("exact");
    expect(c.dimensions[0]?.toleranceMm).toBe(0);
    const variants = buildSearchQueryVariants(c);
    expect(variants.every((v) => !/\bapprox|around|roughly\b/i.test(v.query))).toBe(true);
  });

  it("C. approximate 40 cm creates bounded near-size variants", () => {
    const variants = buildSearchQueryVariants(
      "black metal pendant lamp approx 40cm max 120 EUR"
    );
    const stats = summarizeQueryVariantStats(variants);
    expect(stats.total).toBeLessThanOrEqual(6);
    expect(variants.some((v) => /40\s*cm|400\s*mm/i.test(v.query))).toBe(true);
    // Near-size present but bounded (not dozens)
    const sizeHits = variants.filter((v) => /\b3[89]\s*cm|\b4[12]\s*cm|\b40\s*cm/i.test(v.query));
    expect(sizeHits.length).toBeGreaterThanOrEqual(1);
    expect(sizeHits.length).toBeLessThanOrEqual(4);
  });

  it("D. material hard constraint appears in prioritized queries", () => {
    const variants = buildSearchQueryVariants(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR"
    );
    expect(
      variants.some((v) => /inox|nerjavno|stainless/i.test(v.query) && v.priority <= 2)
    ).toBe(true);
  });

  it("E. soft style preference does not crowd out hard dimensions", () => {
    const variants = buildSearchQueryVariants(
      "modern minimalist scandinavian exactly 60cm wide kitchen sink stainless steel max 200 EUR"
    );
    expect(variants.every((v) => !/\bmodern|minimalist|scandinavian\b/i.test(v.query))).toBe(
      true
    );
    expect(variants.some((v) => /60\s*cm|600\s*mm/i.test(v.query))).toBe(true);
  });

  it("F. query dedupe removes equivalent variants", () => {
    const variants = buildSearchQueryVariants(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR"
    );
    const keys = variants.map((v) =>
      v.query
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/["']/g, "")
        .replace(/\s+/g, " ")
        .trim()
    );
    expect(new Set(keys).size).toBe(keys.length);
    expect(variants.length).toBeLessThanOrEqual(6);
  });

  it("G. cabinet/niche terminology does not outrank product width terminology", () => {
    const variants = buildSearchQueryVariants(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR"
    );
    expect(variants.every((v) => !/omaric|cabinet width|minimalna širina/i.test(v.query))).toBe(
      true
    );
    expect(variants.some((v) => /širina|width/i.test(v.query))).toBe(true);
  });
});

describe("search recall — discovery scoring", () => {
  const request = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";

  it("H. ambiguous 800x600 is lower discovery confidence than labeled width 600", () => {
    const labeled = scoreConstraintAwareDiscovery({
      url: "https://obi.si/p/sink-60",
      title: "Pomivalno korito širina 600 mm nerjavno jeklo",
      snippet: "Širina: 600 mm",
      requestedItem: request,
    });
    const ambiguous = scoreConstraintAwareDiscovery({
      url: "https://obi.si/p/classic-40",
      title: "Alveus Classic 40 800 x 600 mm",
      snippet: "800 x 600 mm kitchen sink",
      requestedItem: request,
    });
    expect(labeled.score).toBeGreaterThan(ambiguous.score);
    expect(labeled.signals).toContain("labeled_target_dimension");
    expect(ambiguous.signals.some((s) => /ambiguous|classic40|800x600/i.test(s))).toBe(true);
  });

  it("I. supported merchant can outrank unsupported when constraint match similar", () => {
    const supported = scoreConstraintAwareDiscovery({
      url: "https://merkur.si/p/sink-600",
      title: "Korito širina 600 mm inox",
      snippet: "širina 600 mm",
      requestedItem: request,
    });
    const unsupported = scoreConstraintAwareDiscovery({
      url: "https://www.bauhaus.si/p/sink-600",
      title: "Korito širina 600 mm inox",
      snippet: "širina 600 mm",
      requestedItem: request,
    });
    expect(supported.score).toBeGreaterThan(unsupported.score);
    expect(unsupported.signals).toContain("penalty:unsupported_enrichment_merchant");
  });

  it("J. hard mismatch snippet gets penalized", () => {
    const mismatch = scoreConstraintAwareDiscovery({
      url: "https://obi.si/p/sink-86",
      title: "Korito širina 86 cm",
      snippet: "Širina: 86 cm nerjavno",
      requestedItem: request,
    });
    expect(mismatch.signals).toContain("penalty:width_mismatch");
    expect(mismatch.score).toBeLessThan(
      scoreConstraintAwareDiscovery({
        url: "https://obi.si/p/sink-60",
        title: "Korito širina 60 cm",
        snippet: "Širina: 60 cm",
        requestedItem: request,
      }).score
    );
  });

  it("K. candidate discovery score never creates acceptance evidence", () => {
    const scored = scoreConstraintAwareDiscovery({
      url: "https://obi.si/p/sink-60",
      title: "Širina 600 mm",
      snippet: "perfect match",
      requestedItem: request,
    });
    expect(scored.acceptanceEvidence).toBe(false);
  });

  it("L. rescue pass bounded", () => {
    const withRescue = buildSearchQueryVariants(request, {
      includeRescue: true,
      allowlistDomains: ["obi.si"],
    });
    const rescue = withRescue.filter((v) => v.intent === "broader_rescue");
    expect(rescue.length).toBeGreaterThan(0);
    expect(rescue.length).toBeLessThanOrEqual(2);
    expect(withRescue.length).toBeLessThanOrEqual(7);
  });

  it("M. Classic 40 exact-dimension acceptance remains unchanged", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "Alveus Classic 40 800 x 600 mm",
      })
    ).toBe("unsupported");
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "Širina: 600 mm",
      })
    ).toBe("supported");
  });

  it("O. no acceptance threshold changes", () => {
    expect(ACCEPTANCE_PRIMARY_MIN_SCORE).toBe(0.7);
    expect(ACCEPTANCE_RESCUE_MIN_SCORE).toBe(0.75);
  });
});

describe("search recall — diversification + prompt wiring", () => {
  it("diversifies domains and caps unsupported merchants", () => {
    const scored = [
      { url: "https://bauhaus.si/p/1", domain: "bauhaus.si", preRankScore: 100 },
      { url: "https://bauhaus.si/p/2", domain: "bauhaus.si", preRankScore: 99 },
      { url: "https://bauhaus.si/p/3", domain: "bauhaus.si", preRankScore: 98 },
      { url: "https://obi.si/p/1", domain: "obi.si", preRankScore: 90 },
      { url: "https://merkur.si/p/1", domain: "merkur.si", preRankScore: 89 },
      { url: "https://xxxlesnina.si/p/1", domain: "xxxlesnina.si", preRankScore: 95 },
    ];
    const out = diversifyDiscoveryCandidates(scored, 5, { maxPerDomain: 2, maxUnsupported: 2 });
    expect(out.filter((c) => c.domain === "bauhaus.si").length).toBeLessThanOrEqual(2);
    expect(out.some((c) => c.domain === "obi.si")).toBe(true);
    const metrics = discoveryDomainMetrics(out);
    expect(metrics.unsupportedMerchantRatio).toBeLessThanOrEqual(0.5);
  });

  it("user message includes suggested hard-constraint queries", () => {
    const suggested = buildSuggestedSearchQueriesForRequest(
      "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      ["obi.si"]
    );
    const message = JSON.parse(
      buildProductDiscoveryUserMessage({
        requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
        allowedDomains: ["obi.si"],
        requirementPolicy: buildRequirementPolicyHints(
          "exactly 60cm wide kitchen sink stainless steel max 200 EUR"
        ),
        suggestedSearchQueries: suggested,
      })
    );
    expect(message.suggestedSearchQueries.length).toBeGreaterThan(0);
    expect(message.searchGuidance.preferSuggestedHardConstraintQueries).toBe(true);
    expect(message.searchGuidance.doNotUseSearchSnippetsAsAcceptanceEvidence).toBe(true);
    expect(message.requirementPolicy.searchConstraints.exactDimensions).toBe(true);
  });

  it("buildRescueCandidates uses constraint-aware ordering", () => {
    const candidates = buildRescueCandidates({
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      allowlistDomains: ["obi.si", "bauhaus.si", "merkur.si"],
      sources: [
        {
          url: "https://www.bauhaus.si/p/classic-40",
          title: "Classic 40 800 x 600 mm",
          snippet: "800 x 600 mm",
        },
        {
          url: "https://obi.si/p/sink-600",
          title: "Korito širina 600 mm inox",
          snippet: "Širina: 600 mm",
        },
        {
          url: "https://merkur.si/p/sink-600b",
          title: "Pomivalno korito width 600 mm",
          snippet: "width 600 mm stainless",
        },
      ],
      maxCandidates: 3,
    });
    expect(candidates[0]?.url).toMatch(/obi\.si|merkur\.si/);
    expect(candidates[0]?.preRankScore).toBeGreaterThanOrEqual(candidates.at(-1)!.preRankScore);
  });
});
