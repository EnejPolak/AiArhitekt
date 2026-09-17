import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OpenAI from "openai";
import { clearCandidateEnrichmentCache } from "./enrichCandidate";
import { searchProductItem } from "./searchItem";

vi.mock("@/lib/references/ssrf", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/references/ssrf")>();
  return {
    ...actual,
    assertPublicHttpUrl: async (url: string) => new URL(url),
  };
});

const REQUEST = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";
const CLASSIC_40 =
  "https://www.bauhaus.si/pomivalna-korita-iz-nerjavecega-jekla/alveus-vgradno-korito-classic-40/p/21281222";
const MERKUR_B = "https://www.merkur.si/p/nerjavno-pomivalno-korito-inox-60";
const MERKUR_C = "https://www.merkur.si/p/nerjavno-korito-c";
const ALLOWLIST = ["bauhaus.si", "merkur.si"];

function forbiddenFetch() {
  return vi.fn(async () => ({
    status: 403,
    ok: false,
    headers: { get: (key: string) => (key.toLowerCase() === "content-type" ? "text/html" : null) },
    body: {
      getReader: () => ({
        read: async () => ({ done: true, value: undefined }),
        cancel: async () => undefined,
      }),
    },
  }));
}

function webSearch(sources: Array<{ url: string; title: string }>) {
  return {
    type: "web_search_call",
    action: { sources },
  };
}

function citation(url: string, title: string) {
  return {
    type: "message",
    content: [
      {
        type: "output_text",
        annotations: [{ type: "url_citation", url, title }],
      },
    ],
  };
}

function primaryClassic40() {
  return {
    output: [
      webSearch([{ url: CLASSIC_40, title: "Alveus Vgradno korito Classic 40 Nerjavno jeklo" }]),
      citation(CLASSIC_40, "Alveus Vgradno korito Classic 40 Nerjavno jeklo"),
    ],
    output_parsed: {
      status: "found",
      product: {
        name: "Alveus Vgradno korito Classic 40",
        retailer: "Bauhaus",
        retailerDomain: "bauhaus.si",
        productUrl: CLASSIC_40,
        price: null,
        currency: null,
        priceUnit: null,
        imageUrl: null,
        specifications: [],
        matchScore: 0.85,
        matchedRequirements: ["kitchen sink", "stainless steel"],
        unmetRequirements: [],
        unknownRequirements: ["max 200 EUR", "exactly 60cm wide"],
        whyItMatches: "Kitchen sink inox.",
      },
    },
  };
}

const rescueNone = {
  output: [],
  output_parsed: {
    status: "none",
    candidateId: null,
    productName: null,
    retailer: null,
    price: null,
    currency: null,
    priceUnit: null,
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    matchScore: 0,
    whyItMatches: "",
  },
};

const targetedNotFound = {
  output: [{ type: "web_search_call", action: { sources: [] } }],
  output_parsed: { status: "not_found", product: null },
};

describe("rejectedDecisionSnapshot precedence", () => {
  beforeEach(() => {
    clearCandidateEnrichmentCache();
    vi.stubGlobal("fetch", forbiddenFetch());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retains primary Classic 40 snapshot when rescue and targeted select none", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce(primaryClassic40())
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce(targetedNotFound);

    const result = await searchProductItem({
      requestedItem: REQUEST,
      allowlistDomains: ALLOWLIST,
      client: { responses: { parse: mockParse } } as unknown as OpenAI,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.rescueSelected).toBe(false);
    expect(result.diagnostics?.targetedResearchAttempted).toBe(true);
    expect(result.diagnostics?.targetedSelectedCandidateId ?? null).toBeNull();
    const snap = result.diagnostics?.rejectedDecisionSnapshot;
    expect(snap?.path).toBe("primary");
    expect(snap?.productUrl).toBe(CLASSIC_40);
    expect(snap?.rejectionReason).toBe("budget_unverified");
    expect(snap?.productEvidence).toBeTruthy();
    expect(snap?.productEvidence.productUrl).toBe(CLASSIC_40);
    expect(result.diagnostics?.acceptanceReason).toBe("budget_unverified");
  });

  it("replaces primary snapshot when rescue rejects a different concrete candidate", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce({
        output: [
          webSearch([
            { url: CLASSIC_40, title: "Alveus Vgradno korito Classic 40 Nerjavno jeklo" },
            { url: MERKUR_B, title: "Nerjavno pomivalno korito inox 60" },
          ]),
          citation(CLASSIC_40, "Alveus Vgradno korito Classic 40 Nerjavno jeklo"),
        ],
        output_parsed: primaryClassic40().output_parsed,
      })
      .mockResolvedValueOnce({
        output: [],
        output_parsed: {
          status: "selected",
          candidateId: "candidate_1",
          productName: "Nerjavno pomivalno korito inox",
          retailer: "Merkur",
          price: null,
          currency: "EUR",
          priceUnit: null,
          matchedRequirements: ["kitchen sink", "stainless steel"],
          unmetRequirements: [],
          unknownRequirements: ["max 200 EUR", "exactly 60cm wide"],
          matchScore: 0.88,
          whyItMatches: "Rescue pick.",
        },
      })
      .mockResolvedValueOnce(targetedNotFound);

    const result = await searchProductItem({
      requestedItem: REQUEST,
      allowlistDomains: ALLOWLIST,
      client: { responses: { parse: mockParse } } as unknown as OpenAI,
    });

    expect(result.status).toBe("not_found");
    expect(result.diagnostics?.rescueSelected).toBe(true);
    const snap = result.diagnostics?.rejectedDecisionSnapshot;
    expect(snap?.path).toBe("rescue");
    expect(snap?.productUrl).not.toBe(CLASSIC_40);
    expect(snap?.productEvidence).toBeTruthy();
    expect(result.diagnostics?.rescueRejectedDecisionSnapshot?.path).toBe("primary");
    expect(result.diagnostics?.rescueRejectedDecisionSnapshot?.productUrl).toBe(CLASSIC_40);
  });

  it("uses targeted snapshot when rescue selects none and targeted rejects a candidate", async () => {
    const mockParse = vi
      .fn()
      .mockResolvedValueOnce(primaryClassic40())
      .mockResolvedValueOnce(rescueNone)
      .mockResolvedValueOnce({
        output: [
          webSearch([{ url: MERKUR_C, title: "Nerjavno pomivalno korito C" }]),
          citation(MERKUR_C, "Nerjavno pomivalno korito C"),
        ],
        output_parsed: {
          status: "found",
          product: {
            name: "Nerjavno pomivalno korito C",
            retailer: "Merkur",
            retailerDomain: "merkur.si",
            productUrl: MERKUR_C,
            price: null,
            currency: null,
            priceUnit: null,
            imageUrl: null,
            specifications: [],
            matchScore: 0.84,
            matchedRequirements: ["kitchen sink", "stainless steel"],
            unmetRequirements: [],
            unknownRequirements: ["max 200 EUR", "exactly 60cm wide"],
            whyItMatches: "Targeted pick.",
          },
        },
      })
      .mockResolvedValueOnce(rescueNone);

    const result = await searchProductItem({
      requestedItem: REQUEST,
      allowlistDomains: ALLOWLIST,
      client: { responses: { parse: mockParse } } as unknown as OpenAI,
    });

    expect(result.status).toBe("not_found");
    const snap = result.diagnostics?.rejectedDecisionSnapshot;
    expect(snap?.path).toBe("targeted");
    expect(snap?.productUrl).toBe(MERKUR_C);
    expect(snap?.productEvidence).toBeTruthy();
    expect(result.diagnostics?.rescueRejectedDecisionSnapshot?.path).toBe("primary");
  });

  it("keeps acceptedDecisionSnapshot authoritative when rescue recovers", async () => {
    const html = `<!doctype html><html><head><title>Black pendant 40cm</title>
      <script type="application/ld+json">{"@type":"Product","name":"Black pendant 40cm","offers":{"@type":"Offer","price":"71.99","priceCurrency":"EUR"}}</script>
    </head><body>black metal pendant lamp kovina 40 cm</body></html>`;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        status: 200,
        ok: true,
        headers: {
          get: (key: string) => (key.toLowerCase() === "content-type" ? "text/html; charset=utf-8" : null),
        },
        body: {
          getReader: () => {
            const bytes = new TextEncoder().encode(html);
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
      }))
    );

    const pendant = "https://www.merkur.si/p/viseca-svetilka-crna-40";
    const mockParse = vi.fn().mockResolvedValueOnce({
      output: [
        webSearch([{ url: pendant, title: "Black metal pendant lamp 40cm 71.99 EUR" }]),
        citation(pendant, "Black metal pendant lamp 40cm 71.99 EUR"),
      ],
      output_parsed: {
        status: "found",
        product: {
          name: "Black metal pendant lamp 40cm",
          retailer: "Merkur",
          retailerDomain: "merkur.si",
          productUrl: pendant,
          price: 71.99,
          currency: "EUR",
          priceUnit: null,
          imageUrl: null,
          specifications: [],
          matchScore: 0.95,
          matchedRequirements: ["black", "metal", "pendant lamp", "max 120 EUR"],
          unmetRequirements: [],
          unknownRequirements: [],
          whyItMatches: "Verified pendant.",
        },
      },
    });

    const result = await searchProductItem({
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      allowlistDomains: ["merkur.si"],
      client: { responses: { parse: mockParse } } as unknown as OpenAI,
    });

    expect(result.status).toBe("found");
    expect(result.diagnostics?.acceptedDecisionSnapshot?.acceptanceResult.accepted).toBe(true);
    expect(result.diagnostics?.acceptedDecisionSnapshot?.acceptanceResult.reason).toBe("accepted");
  });
});
