import { afterEach, describe, expect, it } from "vitest";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import {
  buildDecisionSnapshot,
  buildRejectedDecisionSnapshot,
  freezeDecisionSnapshot,
  reloadDecisionSnapshot,
} from "./decisionSnapshot";
import { acquireMerchantEvidenceFromHtml } from "./merchantEvidence";
import {
  candidateEnrichmentFromPageEvidence,
  clearCandidateEnrichmentCache,
  getCachedCandidateEnrichment,
  seedCandidateEnrichmentCache,
} from "./enrichCandidate";
import { enrichmentCacheKey } from "./enrichmentCacheKey";
import {
  buildProductEvidence,
  classifyExactDimensionAgainstEvidence,
  trustedEvidenceHaystack,
} from "./productEvidence";
import { merchantEvidenceText, type RescueCandidate } from "./rescueCandidates";
import type { ProductDiscoveryProduct } from "./types";

const REQUEST = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";
const URL = "https://www.merkur.si/nerjavno-pomivalno-korito-sink-solution-a-line-600x500/";
const URL_NO_SLASH = URL.replace(/\/$/, "");

const A_LINE_HTML = `<!doctype html>
<html>
<head>
  <title>Nerjavno Pomivalno Korito Sink Solution A Line 600x500</title>
  <meta property="product:price:amount" content="124.99" />
  <meta property="product:price:currency" content="EUR" />
</head>
<body>
  <main>
    <h1>Nerjavno Pomivalno Korito Sink Solution A Line 600x500</h1>
    <table>
      <tr><th>MATERIAL</th><td>NERJAVNO JEKLO</td></tr>
      <tr><th>DOLŽINA</th><td>50 CM</td></tr>
      <tr><th>ŠIRINA</th><td>60 CM</td></tr>
    </table>
  </main>
</body>
</html>`;

function product(overrides: Partial<ProductDiscoveryProduct> = {}): ProductDiscoveryProduct {
  return {
    name: "Nerjavno Pomivalno Korito Sink Solution A Line 600x500",
    retailer: "Merkur",
    retailerDomain: "merkur.si",
    productUrl: URL,
    price: 124.99,
    currency: "EUR",
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: 0.92,
    matchedRequirements: ["kitchen sink", "stainless steel", "60 cm", "max 200 EUR"],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "stainless kitchen sink width 60 cm",
    priceEvidence: "merchant_page",
    ...overrides,
  };
}

afterEach(() => {
  clearCandidateEnrichmentCache();
});

describe("A Line evidence mapping chain", () => {
  it("MerchantEvidence → EnrichedCandidate → ProductEvidence → acceptance", () => {
    const acquired = acquireMerchantEvidenceFromHtml(A_LINE_HTML, URL);
    const enrichment = candidateEnrichmentFromPageEvidence(acquired);
    expect(enrichment.status).toBe("success");
    expect(enrichment.price).toBe(124.99);
    expect(enrichment.labeledSpecs?.some((s) => /širina/i.test(s.label) && /60/i.test(s.value))).toBe(
      true
    );
    expect(enrichment.labeledSpecs?.some((s) => /dolžina|dolzina/i.test(s.label) && /50/i.test(s.value))).toBe(
      true
    );
    expect(enrichment.labeledSpecs?.some((s) => s.field === "material" && /nerjavno/i.test(s.value))).toBe(
      true
    );

    const evidence = buildProductEvidence({
      productUrl: URL,
      sources: [{ url: URL, title: enrichment.productName, snippet: null }],
      enrichment,
      trustedDisplayName: enrichment.productName,
    });
    const hay = trustedEvidenceHaystack(evidence);
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe("supported");
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "50", haystack: hay })).not.toBe(
      "supported"
    );

    const candidate: RescueCandidate = {
      id: "candidate_1",
      url: URL,
      domain: "merkur.si",
      sourceTitle: enrichment.productName,
      sourceEvidence: "nerjavno pomivalno korito a line 600x500",
      preRankScore: 80,
      enrichment,
    };
    const rescueHay = merchantEvidenceText(candidate);
    expect(rescueHay).toMatch(/širina:\s*60\s*cm/i);
    expect(rescueHay).toMatch(/124\.99/);

    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem: REQUEST,
      product: product(),
      evidenceText: rescueHay,
    });
    expect(finalized.accepted).toBe(true);
    expect(finalized.reason).toBe("accepted");
    expect(finalized.product.matchedRequirements.join(" ").toLowerCase()).toMatch(/sink|korito/);
    expect(finalized.product.matchedRequirements.join(" ").toLowerCase()).toMatch(/stainless|nerjav/);
    expect(finalized.product.unmetRequirements.join(" ").toLowerCase()).not.toMatch(/60|width/);
    expect(finalized.product.matchedRequirements.join(" ").toLowerCase()).toMatch(/60\s*cm/);
  });

  it("labeled specs survive even when productText omits ŠIRINA", () => {
    const acquired = acquireMerchantEvidenceFromHtml(A_LINE_HTML, URL);
    const enrichment = candidateEnrichmentFromPageEvidence(acquired);
    enrichment.productText = "Nerjavno pomivalno korito chrome nav footer";
    const hay = merchantEvidenceText({
      id: "c1",
      url: URL,
      domain: "merkur.si",
      sourceTitle: enrichment.productName,
      sourceEvidence: null,
      preRankScore: 1,
      enrichment,
    });
    expect(hay).toMatch(/širina:\s*60\s*cm/i);
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe("supported");
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "50", haystack: hay })).not.toBe("supported");
  });

  it("cache round-trip keeps price, material, width, length, provenance", () => {
    const acquired = acquireMerchantEvidenceFromHtml(A_LINE_HTML, URL);
    const enrichment = candidateEnrichmentFromPageEvidence(acquired);
    seedCandidateEnrichmentCache(URL, enrichment);
    expect(enrichmentCacheKey(URL)).toBe(enrichmentCacheKey(URL_NO_SLASH));
    const reloaded = getCachedCandidateEnrichment(URL_NO_SLASH);
    expect(reloaded?.price).toBe(124.99);
    expect(reloaded?.verifiedPrice?.sourcePath).toMatch(/product:price:amount/);
    expect(reloaded?.labeledSpecs?.some((s) => /širina/i.test(s.label) && /60/i.test(s.value))).toBe(true);
    expect(reloaded?.labeledSpecs?.some((s) => /dolžina|dolzina/i.test(s.label) && /50/i.test(s.value))).toBe(
      true
    );
    expect(reloaded?.labeledSpecs?.some((s) => s.field === "material")).toBe(true);
    const evidence = buildProductEvidence({
      productUrl: URL_NO_SLASH,
      sources: [{ url: URL_NO_SLASH, title: reloaded?.productName ?? null, snippet: null }],
      enrichment: reloaded,
      trustedDisplayName: reloaded?.productName,
    });
    const width = evidence.dimensionEvidence.find((f) => /širina/i.test(f.label ?? ""));
    expect(width?.sourcePath).toMatch(/širina/i);
    expect(width?.evidenceExcerpt).toBeTruthy();
    expect(evidence.priceEvidence[0]?.value).toBe(124.99);
  });

  it("rejectedDecisionSnapshot keeps ProductEvidence and rejection reason", () => {
    const acquired = acquireMerchantEvidenceFromHtml(A_LINE_HTML, URL);
    const enrichment = candidateEnrichmentFromPageEvidence(acquired);
    const productEvidence = buildProductEvidence({
      productUrl: URL,
      sources: [{ url: URL, title: enrichment.productName, snippet: null }],
      enrichment,
      trustedDisplayName: enrichment.productName,
    });
    const rejected = product({
      matchedRequirements: ["kitchen sink"],
      unmetRequirements: ["exactly 60cm wide"],
      matchScore: 0.5,
    });
    const snapshot = buildRejectedDecisionSnapshot({
      requestedItem: REQUEST,
      path: "rescue",
      candidateId: "candidate_1",
      product: rejected,
      acceptance: {
        accepted: false,
        matchScore: 0.5,
        requirementCoverage: 0.4,
        reason: "hard_constraint_unmet",
      },
      productEvidence,
    });
    expect(snapshot.candidateId).toBe("candidate_1");
    expect(snapshot.rejectionReason).toBe("hard_constraint_unmet");
    expect(snapshot.productEvidence.dimensionEvidence.length).toBeGreaterThan(0);
    const frozen = freezeDecisionSnapshot(snapshot);
    const reloaded = reloadDecisionSnapshot(frozen);
    expect(reloaded.productEvidence.priceEvidence.length).toBeGreaterThan(0);
    const acceptedShape = buildDecisionSnapshot({
      requestedItem: REQUEST,
      path: "rescue",
      product: rejected,
      acceptance: {
        accepted: false,
        matchScore: 0.5,
        requirementCoverage: 0.4,
        reason: "hard_constraint_unmet",
      },
      productEvidence,
    });
    expect(acceptedShape.acceptanceResult.reason).toBe("hard_constraint_unmet");
  });
});
