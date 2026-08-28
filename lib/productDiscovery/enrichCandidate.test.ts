import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import OpenAI from "openai";
import {
  clearCandidateEnrichmentCache,
  enrichCandidatePage,
  getCachedCandidateEnrichment,
  parseProductPageEvidence,
} from "./enrichCandidate";
import { enrichRescueCandidates } from "./enrichCandidates";
import { attemptSourceBackedRescue } from "./rescue";
import type { RescueCandidate } from "./rescueCandidates";

const PUBLIC_LOOKUP = async () => ({ address: "93.184.216.34", family: 4 });
const ALLOWLIST = ["obi.si", "merkur.si"];

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

const PRODUCT_JSON_LD = `<!doctype html>
<html>
<head>
  <title>Fallback title</title>
  <script type="application/ld+json">
  {
    "@type": "Product",
    "name": "Globo Gorley",
    "image": "https://obi.si/images/gorley.jpg",
    "brand": { "@type": "Brand", "name": "Globo" },
    "sku": "GOR-40",
    "offers": {
      "@type": "Offer",
      "price": "69.99",
      "priceCurrency": "EUR",
      "availability": "https://schema.org/InStock"
    }
  }
  </script>
</head>
<body><h1>Globo Gorley pendant</h1><p>Metal black lamp 40 cm diameter.</p></body>
</html>`;

describe("parseProductPageEvidence", () => {
  it("extracts Product + Offer JSON-LD fields", () => {
    const evidence = parseProductPageEvidence(PRODUCT_JSON_LD, "https://obi.si/p/gorley");
    expect(evidence.jsonLdProductFound).toBe(true);
    expect(evidence.productName).toBe("Globo Gorley");
    expect(evidence.brand).toBe("Globo");
    expect(evidence.price).toBe(69.99);
    expect(evidence.currency).toBe("EUR");
    expect(evidence.imageUrl).toBe("https://obi.si/images/gorley.jpg");
    expect(evidence.availability).toBe("InStock");
    expect(evidence.sku).toBe("GOR-40");
  });

  it("discovers Product inside @graph", () => {
    const html = `<html><head><script type="application/ld+json">
    {
      "@graph": [
        { "@type": "WebSite", "name": "Shop" },
        {
          "@type": "Product",
          "name": "Graph Lamp",
          "offers": { "@type": "Offer", "price": "49.99", "priceCurrency": "EUR" }
        }
      ]
    }
    </script></head><body></body></html>`;
    const evidence = parseProductPageEvidence(html, "https://obi.si/p/graph-lamp");
    expect(evidence.jsonLdProductFound).toBe(true);
    expect(evidence.productName).toBe("Graph Lamp");
    expect(evidence.price).toBe(49.99);
  });

  it("handles AggregateOffer safely", () => {
    const html = `<html><head><script type="application/ld+json">
    {
      "@type": "Product",
      "name": "Range Lamp",
      "offers": {
        "@type": "AggregateOffer",
        "lowPrice": "59.99",
        "highPrice": "79.99",
        "priceCurrency": "EUR"
      }
    }
    </script></head><body></body></html>`;
    const evidence = parseProductPageEvidence(html, "https://obi.si/p/range-lamp");
    expect(evidence.productName).toBe("Range Lamp");
    expect(evidence.price).toBe(59.99);
    expect(evidence.currency).toBe("EUR");
  });

  it("falls back to metadata when JSON-LD is malformed", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ broken json</script>
      <meta property="og:title" content="OG Pendant" />
      <meta property="og:description" content="Black metal lamp" />
      <meta property="og:image" content="https://obi.si/img/pendant.jpg" />
      <meta property="product:price:amount" content="89.99" />
      <meta property="product:price:currency" content="EUR" />
    </head><body></body></html>`;
    const evidence = parseProductPageEvidence(html, "https://obi.si/p/og-pendant");
    expect(evidence.jsonLdProductFound).toBe(false);
    expect(evidence.productName).toBe("OG Pendant");
    expect(evidence.price).toBe(89.99);
    expect(evidence.currency).toBe("EUR");
    expect(evidence.imageUrl).toBe("https://obi.si/img/pendant.jpg");
  });
});

describe("enrichCandidatePage fetch behavior", () => {
  beforeEach(() => {
    clearCandidateEnrichmentCache();
  });

  it("returns forbidden on 403 without crashing", async () => {
    const fetchFn = vi.fn(async () => mockHtmlResponse("", 403));
    const result = await enrichCandidatePage("https://obi.si/p/blocked", {
      allowlistDomains: ALLOWLIST,
      fetchFn,
      lookup: async () => ({ address: "93.184.216.34", family: 4 }),
    });
    expect(result.status).toBe("forbidden");
    expect(result.productName).toBeNull();
  });

  it("continues other candidates when one times out", async () => {
    const candidates: RescueCandidate[] = [
      {
        id: "candidate_1",
        url: "https://obi.si/p/slow",
        domain: "obi.si",
        sourceTitle: "Slow",
        sourceEvidence: null,
        preRankScore: 50,
        enrichment: null,
      },
      {
        id: "candidate_2",
        url: "https://merkur.si/p/fast",
        domain: "merkur.si",
        sourceTitle: "Fast",
        sourceEvidence: null,
        preRankScore: 40,
        enrichment: null,
      },
    ];

    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes("obi.si")) {
        throw new Error("AbortError timeout");
      }
      return mockHtmlResponse(PRODUCT_JSON_LD);
    });

    const { candidates: enriched, stats } = await enrichRescueCandidates({
      candidates,
      allowlistDomains: ALLOWLIST,
      includeDebug: true,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });
    expect(stats.enrichmentAttemptedCount).toBeGreaterThan(0);
    const slow = enriched.find((c) => c.id === "candidate_1");
    const fast = enriched.find((c) => c.id === "candidate_2");
    expect(slow?.enrichment?.status).toMatch(/timeout|http_error/);
    expect(fast?.enrichment?.status).toBe("success");
    expect(fast?.enrichment?.price).toBe(69.99);
  });

  it("rejects redirect outside allowlist", async () => {
    const fetchFn = vi.fn(async () => ({
      status: 302,
      ok: false,
      headers: {
        get: (key: string) => (key.toLowerCase() === "location" ? "https://evil.com/p/x" : null),
      },
      body: null,
    }));

    const result = await enrichCandidatePage("https://obi.si/p/redirect", {
      allowlistDomains: ALLOWLIST,
      fetchFn,
      lookup: async () => ({ address: "93.184.216.34", family: 4 }),
    });
    expect(result.status).toBe("http_error");
  });

  it("blocks private/internal URLs before fetch", async () => {
    const fetchFn = vi.fn();
    for (const url of [
      "http://localhost/p/x",
      "http://127.0.0.1/p/x",
      "http://10.0.0.5/p/x",
      "http://192.168.1.1/p/x",
      "http://169.254.169.254/p/x",
    ]) {
      const result = await enrichCandidatePage(url, {
        allowlistDomains: ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "169.254.169.254"],
        fetchFn,
      });
      expect(result.status).toBe("http_error");
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("caches enrichment by normalized URL", async () => {
    const fetchFn = vi.fn(async () => mockHtmlResponse(PRODUCT_JSON_LD));
    const opts = {
      allowlistDomains: ALLOWLIST,
      fetchFn,
      lookup: async () => ({ address: "93.184.216.34", family: 4 }),
    };
    await enrichCandidatePage("https://obi.si/p/gorley?utm=1", opts);
    await enrichCandidatePage("https://obi.si/p/gorley#frag", opts);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(getCachedCandidateEnrichment("https://obi.si/p/gorley")?.productName).toBe("Globo Gorley");
  });
});

describe("verified merchant price precedence", () => {
  beforeEach(() => {
    clearCandidateEnrichmentCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps merchant enrichment price when model returns a different price", async () => {
    const fetchFn = vi.fn(async () => mockHtmlResponse(PRODUCT_JSON_LD));

    const mockParse = vi.fn(async () => ({
      output_parsed: {
        status: "selected",
        candidateId: "candidate_1",
        productName: "Wrong name",
        retailer: "OBI",
        price: 59.99,
        currency: "EUR",
        priceUnit: null,
        matchedRequirements: ["black pendant"],
        unmetRequirements: [],
        unknownRequirements: [],
        matchScore: 0.9,
        whyItMatches: "Model tried cheaper price.",
      },
    }));

    const client = { responses: { parse: mockParse } } as unknown as OpenAI;
    const result = await attemptSourceBackedRescue({
      client,
      requestedItem: "black metal pendant lamp approx 40cm max 120 EUR",
      sources: [{ url: "https://obi.si/p/gorley", title: "Globo pendant" }],
      allowlistDomains: ALLOWLIST,
      enrichOptions: { fetchFn, lookup: PUBLIC_LOOKUP },
    });

    expect(result.rescueSelected).toBe(true);
    expect(result.product?.price).toBe(69.99);
    expect(result.product?.currency).toBe("EUR");
    expect(result.product?.priceEvidence).toBe("merchant_page");
  });
});
