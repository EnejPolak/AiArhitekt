import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import { RESCUE_ENRICH_MAX_CANDIDATES } from "./constants";
import {
  candidateEnrichmentFromPageEvidence,
  clearCandidateEnrichmentCache,
  seedCandidateEnrichmentCache,
} from "./enrichCandidate";
import {
  enrichSelectedRescueCandidate,
} from "./enrichCandidates";
import { acquireMerchantEvidenceFromHtml } from "./merchantEvidence";
import {
  classifyExactDimensionAgainstEvidence,
  trustedEvidenceHaystack,
} from "./productEvidence";
import { attemptSourceBackedRescue } from "./rescue";
import { buildRescueCandidates, type RescueCandidate } from "./rescueCandidates";

const PUBLIC_LOOKUP = async () => ({ address: "93.184.216.34", family: 4 });
const REQUEST = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";
const A_LINE_URL =
  "https://www.merkur.si/nerjavno-pomivalno-korito-sink-solution-a-line-600x500/";
const ALLOWLIST = ["obi.si", "merkur.si", "tapro.si", "bauhaus.si"];

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

const OTHER_HTML = `<!doctype html><html><head>
<title>Other sink</title>
<script type="application/ld+json">{"@type":"Product","name":"Other sink","offers":{"@type":"Offer","price":"99.00","priceCurrency":"EUR"}}</script>
</head><body>other sink</body></html>`;

function mockHtmlResponse(html: string, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => (key.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null),
    },
    body: {
      getReader: () => {
        const encoder = new TextEncoder();
        const bytes = encoder.encode(html);
        let done = false;
        return {
          read: async () => {
            if (done) return { done: true, value: undefined };
            done = true;
            return { done: false, value: bytes };
          },
          cancel: async () => undefined,
        };
      },
    },
  } as unknown as Response;
}

function forbiddenResponse() {
  return {
    status: 403,
    ok: false,
    headers: { get: (key: string) => (key.toLowerCase() === "content-type" ? "text/html" : null) },
    body: {
      getReader: () => ({
        read: async () => ({ done: true, value: undefined }),
        cancel: async () => undefined,
      }),
    },
  } as unknown as Response;
}

function candidate(partial: Partial<RescueCandidate> & Pick<RescueCandidate, "id" | "url">): RescueCandidate {
  return {
    domain: "merkur.si",
    sourceTitle: "Sink",
    sourceEvidence: null,
    preRankScore: 10,
    enrichment: null,
    ...partial,
  };
}

function mockClient(candidateId: string) {
  const mockParse = vi.fn(async () => ({
    output_parsed: {
      status: "selected",
      candidateId,
      productName: "Nerjavno Pomivalno Korito Sink Solution A Line 600x500",
      retailer: "Merkur",
      price: null,
      currency: "EUR",
      priceUnit: null,
      matchedRequirements: ["Kitchen sink category"],
      unmetRequirements: [],
      unknownRequirements: [
        "Price is not verified, so compliance with the maximum budget of 200 EUR is unknown",
        "max 200 EUR",
        "Stainless steel material (nerjavno)",
        "Exact 600 mm width indicated by 600x500 dimensions",
      ],
      matchScore: 0.92,
      whyItMatches: "Kitchen sink from sources.",
    },
  }));
  return { responses: { parse: mockParse } } as unknown as OpenAI;
}

beforeEach(() => {
  clearCandidateEnrichmentCache();
});

afterEach(() => {
  clearCandidateEnrichmentCache();
});

describe("enrichSelectedRescueCandidate", () => {
  it("does not refetch when the selected candidate was already in the initial set", async () => {
    const fetchFn = vi.fn(async () => mockHtmlResponse(OTHER_HTML));
    const already = candidate({
      id: "candidate_3",
      url: "https://obi.si/p/already",
      domain: "obi.si",
      enrichment: {
        status: "success",
        pageTitle: "Already",
        metaDescription: null,
        productName: "Already",
        brand: null,
        price: 99,
        currency: "EUR",
        imageUrl: null,
        availability: null,
        sku: null,
        productText: "already",
        jsonLdProductFound: true,
      },
    });
    const result = await enrichSelectedRescueCandidate({
      candidate: already,
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.debug.wasInitiallyEnriched).toBe(true);
    expect(result.debug.enrichmentAttempted).toBe(false);
    expect(result.debug.additionalFetchAttempts).toBe(0);
    expect(result.debug.cacheHit).toBe(false);
  });

  it("makes exactly one additional attempt when selected candidate was not initially enriched", async () => {
    const fetchFn = vi.fn(async () => mockHtmlResponse(A_LINE_HTML));
    const selected = candidate({ id: "candidate_6", url: A_LINE_URL });
    const result = await enrichSelectedRescueCandidate({
      candidate: selected,
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.debug.wasInitiallyEnriched).toBe(false);
    expect(result.debug.enrichmentAttempted).toBe(true);
    expect(result.debug.additionalFetchAttempts).toBe(1);
    expect(result.debug.cacheHit).toBe(false);
    expect(result.candidate.enrichment?.status).toBe("success");
    expect(result.candidate.enrichment?.price).toBe(124.99);
    expect(result.debug.coverageAfter.price).toBe(true);
    expect(result.debug.coverageAfter.material).toBe(true);
    expect(result.debug.coverageAfter.labeledDimensions).toBeGreaterThan(0);
  });

  it("reuses cache and does not refetch when selected candidate evidence is already cached", async () => {
    const acquired = acquireMerchantEvidenceFromHtml(A_LINE_HTML, A_LINE_URL);
    seedCandidateEnrichmentCache(A_LINE_URL, candidateEnrichmentFromPageEvidence(acquired));
    const fetchFn = vi.fn(async () => mockHtmlResponse(A_LINE_HTML));
    const result = await enrichSelectedRescueCandidate({
      candidate: candidate({ id: "candidate_6", url: A_LINE_URL }),
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(result.debug.cacheHit).toBe(true);
    expect(result.debug.additionalFetchAttempts).toBe(0);
    expect(result.candidate.enrichment?.price).toBe(124.99);
    expect(result.debug.coverageAfter.material).toBe(true);
  });

  it("stays conservative when selected enrichment is forbidden", async () => {
    const fetchFn = vi.fn(async () => forbiddenResponse());
    const result = await enrichSelectedRescueCandidate({
      candidate: candidate({ id: "candidate_6", url: A_LINE_URL }),
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });
    expect(result.debug.additionalFetchAttempts).toBe(1);
    expect(result.candidate.enrichment?.status).toBe("forbidden");
    expect(result.candidate.enrichment?.price).toBeNull();
    expect(result.candidate.enrichment?.labeledSpecs ?? []).toEqual([]);
    expect(result.debug.evidenceFactsAdded).toBe(0);
    expect(result.debug.coverageAfter.price).toBe(false);
    expect(result.debug.coverageAfter.material).toBe(false);
  });
});

describe("rescue selected-candidate enrichment bound", () => {
  it("keeps initial enrichment <= configured max and additional selected attempts <= 1", async () => {
    const sources = [
      { url: "https://www.obi.si/p/sink-one-60cm-stainless", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://www.obi.si/p/sink-two-60cm-stainless", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://www.bauhaus.si/pomivalna-korita/p/21281222", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://tapro.si/p/pure-60-inox-sink", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://tapro.si/p/line-60-inox-sink", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: A_LINE_URL, title: "A Line" },
      { url: "https://www.merkur.si/p/other-sink", title: "other sink" },
    ];
    const built = buildRescueCandidates({
      sources,
      allowlistDomains: ALLOWLIST,
      requestedItem: REQUEST,
    });
    expect(built.length).toBeGreaterThan(5);
    const aline = built.find((c) => c.url.includes("a-line-600x500"));
    expect(aline).toBeTruthy();
    const topByRank = [...built].sort((a, b) => b.preRankScore - a.preRankScore).slice(0, 5);
    const alineOutsideTop5 = topByRank.every((c) => c.id !== aline!.id);
    expect(alineOutsideTop5).toBe(true);

    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes("a-line-600x500")) return mockHtmlResponse(A_LINE_HTML);
      if (String(url).includes("bauhaus.si")) return forbiddenResponse();
      return mockHtmlResponse(OTHER_HTML);
    });

    const result = await attemptSourceBackedRescue({
      client: mockClient(aline!.id),
      requestedItem: REQUEST,
      sources,
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });

    expect(result.enrichmentStats?.enrichmentAttemptedCount).toBeLessThanOrEqual(
      RESCUE_ENRICH_MAX_CANDIDATES
    );
    expect(result.enrichmentStats?.selectedAdditionalEnrichmentAttempts).toBe(1);
    expect(result.enrichmentStats?.selectedCandidateEnrichment?.wasInitiallyEnriched).toBe(false);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(RESCUE_ENRICH_MAX_CANDIDATES + 1);
    expect(fetchFn.mock.calls.length).toBe(
      (result.enrichmentStats?.enrichmentAttemptedCount ?? 0) + 1
    );
    expect(result.rescueSelectedCandidateId).toBe(aline!.id);
    expect(result.product?.price).toBe(124.99);
    expect(result.productEvidence?.priceEvidence.some((f) => f.value === 124.99)).toBe(true);

    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem: REQUEST,
      product: result.product!,
      evidenceText: result.evidenceText ?? undefined,
    });
    expect(finalized.accepted).toBe(true);
    expect(finalized.reason).toBe("accepted");
    expect(finalized.product.matchedRequirements.join(" ").toLowerCase()).toMatch(/sink|korito/);
    expect(finalized.product.matchedRequirements.join(" ").toLowerCase()).toMatch(/stainless|steel|nerjav/);
    expect(finalized.product.matchedRequirements.join(" ").toLowerCase()).toMatch(/60\s*cm|max 200/);
    expect(classifyExactDimensionAgainstEvidence({
      valueCm: "60",
      haystack: result.evidenceText ?? "",
    })).toBe("supported");
    expect(classifyExactDimensionAgainstEvidence({
      valueCm: "50",
      haystack: result.evidenceText ?? "",
    })).not.toBe("supported");
    expect(trustedEvidenceHaystack(result.productEvidence!).toLowerCase()).toMatch(/širina|sirina/);
  });

  it("does not add a selected fetch when rescue selects an already enriched candidate", async () => {
    const sources = [
      { url: "https://obi.si/p/sink-one", title: "kitchen sink stainless 60cm" },
      { url: "https://merkur.si/p/sink-two", title: "kitchen sink stainless 60cm" },
    ];
    const fetchFn = vi.fn(async () => mockHtmlResponse(OTHER_HTML));
    const result = await attemptSourceBackedRescue({
      client: mockClient("candidate_1"),
      requestedItem: REQUEST,
      sources,
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });
    expect(result.rescueSelectedCandidateId).toBe("candidate_1");
    expect(result.enrichmentStats?.selectedAdditionalEnrichmentAttempts).toBe(0);
    expect(result.enrichmentStats?.selectedCandidateEnrichment?.wasInitiallyEnriched).toBe(true);
    expect(result.enrichmentStats?.selectedCandidateEnrichment?.enrichmentAttempted).toBe(false);
    expect(fetchFn.mock.calls.length).toBeLessThanOrEqual(RESCUE_ENRICH_MAX_CANDIDATES);
  });

  it("keeps URL-only evidence when selected enrichment is forbidden", async () => {
    const sources = [
      { url: "https://www.obi.si/p/sink-one-60cm-stainless", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://www.obi.si/p/sink-two-60cm-stainless", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://www.bauhaus.si/pomivalna-korita/p/21281222", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://tapro.si/p/pure-60-inox-sink", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: "https://tapro.si/p/line-60-inox-sink", title: "exactly 60cm wide kitchen sink stainless steel inox" },
      { url: A_LINE_URL, title: "A Line" },
      { url: "https://www.merkur.si/p/other-sink", title: "other sink" },
    ];
    const built = buildRescueCandidates({
      sources,
      allowlistDomains: ALLOWLIST,
      requestedItem: REQUEST,
    });
    const aline = built.find((c) => c.url.includes("a-line-600x500"));
    expect(aline).toBeTruthy();
    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes("a-line-600x500")) return forbiddenResponse();
      return mockHtmlResponse(OTHER_HTML);
    });
    const result = await attemptSourceBackedRescue({
      client: mockClient(aline!.id),
      requestedItem: REQUEST,
      sources,
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });
    expect(result.product?.price).toBeNull();
    expect(result.productEvidence?.priceEvidence ?? []).toEqual([]);
    expect(result.productEvidence?.dimensionEvidence.every((f) => f.kind === "product_url" || !f.label)).toBe(
      true
    );
    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem: REQUEST,
      product: result.product!,
      evidenceText: result.evidenceText ?? undefined,
    });
    expect(finalized.accepted).toBe(false);
    expect(finalized.reason).toMatch(/budget_unverified|insufficient_evidence|hard_constraint/);
  });
});
