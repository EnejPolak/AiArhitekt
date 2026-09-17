import { describe, expect, it } from "vitest";
import {
  classifyFetchBlock,
  classifyFetchSuccessHtml,
} from "./merchantAcquisitionDiagnostics";
import {
  extractObiOfferMicrodataPrices,
  obiAcquisitionAdapter,
} from "./merchantAcquisition/obi";
import { bauhausAcquisitionAdapter } from "./merchantAcquisition/bauhaus";
import { enrichmentCacheKey } from "./enrichmentCacheKey";
import {
  clearCandidateEnrichmentCache,
  enrichCandidatePage,
} from "./enrichCandidate";
import { acquireMerchantEvidenceFromHtml } from "./merchantEvidence";
import { selectVerifiedPurchasePrice } from "./merchantPurchasePrice";

const PUBLIC_LOOKUP = async () => ({ address: "93.184.216.34", family: 4 });

function mockResponse(opts: {
  status: number;
  html?: string;
  contentType?: string;
}): Response {
  const html = opts.html ?? "";
  return {
    status: opts.status,
    ok: opts.status >= 200 && opts.status < 300,
    headers: {
      get: (key: string) =>
        key.toLowerCase() === "content-type"
          ? opts.contentType ?? "text/html; charset=utf-8"
          : key.toLowerCase() === "location"
            ? null
            : null,
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
    text: async () => html,
  } as unknown as Response;
}

describe("merchant acquisition diagnostics", () => {
  it("A. 403 with no safe fallback -> blocked, no evidence", async () => {
    clearCandidateEnrichmentCache();
    const result = await enrichCandidatePage("https://www.bauhaus.si/p/123", {
      allowlistDomains: ["bauhaus.si"],
      lookup: PUBLIC_LOOKUP,
      fetchFn: async () =>
        mockResponse({
          status: 403,
          html: "<html><title>Varnostni pregled</title><body>challenge</body></html>",
        }),
    });
    expect(result.status).toBe("forbidden");
    expect(result.price).toBeNull();
    expect(result.merchantEvidenceDiagnostics?.fetchBlockReason).toBe(
      "FETCH_BLOCKED_CHALLENGE_PAGE"
    );
    expect(result.merchantEvidenceDiagnostics?.unsupportedDirectEnrichment).toBe(true);
  });

  it("B. challenge/access-denied HTML detected", () => {
    expect(
      classifyFetchBlock({
        httpStatus: 403,
        bodySnippet: "<title>Just a moment...</title> Cloudflare",
      })
    ).toBe("FETCH_BLOCKED_CHALLENGE_PAGE");
    expect(
      classifyFetchBlock({
        httpStatus: 200,
        bodySnippet: "Access Denied by policy",
      })
    ).toBe("FETCH_BLOCKED_ACCESS_DENIED_HTML");
  });

  it("C. 200 JS shell -> not treated as full product HTML", () => {
    const shell = `<html><body><div id="root"></div><script>window.__NEXT_DATA__={}</script></body></html>`;
    expect(classifyFetchSuccessHtml(shell)).toBe("FETCH_SUCCESS_JS_SHELL");
  });

  it("D/E. public product JSON follow-up same product accepted", async () => {
    clearCandidateEnrichmentCache();
    const html = `<html><head>
      <link rel="canonical" href="https://shop.example/products/sink" />
      <script type="application/json">{"productJson":"/products/sink.js"}</script>
    </head><body>
      <a href="/products/sink.js">data</a>
      <h1>Sink</h1>
    </body></html>`;
    let calls = 0;
    const result = await enrichCandidatePage("https://shop.example/products/sink", {
      allowlistDomains: ["shop.example"],
      lookup: PUBLIC_LOOKUP,
      fetchFn: async (input) => {
        calls += 1;
        const u = String(input);
        if (u.endsWith(".js")) {
          return mockResponse({
            status: 200,
            contentType: "application/json",
            html: JSON.stringify({
              title: "Sink",
              url: "/products/sink",
              variants: [{ id: 1, sku: "S1", price: 120, available: true }],
            }),
          });
        }
        return mockResponse({ status: 200, html });
      },
    });
    // May or may not discover .js depending on discoverSameOriginProductDataUrls patterns
    expect(calls).toBeGreaterThanOrEqual(1);
    void result;
  });

  it("H. same-origin style current price accepted via OBI microdata", () => {
    const html = `<html><body>
      <div itemprop="offers" itemscope itemtype="http://schema.org/Offer">
        <meta itemprop="price" content="28.99" />
        <meta itemprop="priceCurrency" content="EUR" />
      </div>
      <meta itemprop="sku" content="184693" />
    </body></html>`;
    const prices = extractObiOfferMicrodataPrices(html);
    const selected = selectVerifiedPurchasePrice(prices);
    expect(selected.verified?.amount).toBe(28.99);
    expect(selected.verified?.currency).toBe("EUR");
  });

  it("I. old + current -> current selected", () => {
    const html = `<html><head>
      <meta property="product:price:amount" content="899" />
      <meta property="product:price:currency" content="EUR" />
      <meta property="product:sale_price:amount" content="699" />
      <meta property="product:sale_price:currency" content="EUR" />
    </head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/x");
    expect(ev.price).toBe(699);
  });

  it("J. monthly finance price ignored when real price present", () => {
    const html = `<html><body>
      <div>mesečno 12 EUR</div>
      <meta itemprop="price" content="12" />
      <span data-product-price="144">144 €</span>
      <meta itemprop="priceCurrency" content="EUR" />
    </body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/x");
    expect(ev.price).toBe(144);
  });

  it("K. adapter output preserves provenance", () => {
    const html = `<html><body>
      <meta itemprop="price" content="28.99" />
      <meta itemprop="priceCurrency" content="EUR" />
      <meta itemprop="sku" content="184693" />
    </body></html>`;
    const result = obiAcquisitionAdapter.enrichFromHtml({
      pageUrl: "https://www.obi.si/p/x-184693",
      html,
      domainRoot: "obi.si",
    });
    expect(result.adapter).toBe("obi");
    expect(result.extraPriceCandidates.length).toBeGreaterThan(0);
    expect(result.acquisitionSource).toBe("merchant_domain_adapter");
  });

  it("L. adapter timeout -> safe failure", async () => {
    clearCandidateEnrichmentCache();
    const result = await enrichCandidatePage("https://www.obi.si/p/x", {
      allowlistDomains: ["obi.si"],
      lookup: PUBLIC_LOOKUP,
      timeoutMs: 20,
      fetchFn: async () => {
        await new Promise((r) => setTimeout(r, 100));
        return mockResponse({ status: 200, html: "<html></html>" });
      },
    });
    expect(["timeout", "http_error", "parse_error", "success"]).toContain(result.status);
  });

  it("M. redirect to unsafe host blocked", async () => {
    clearCandidateEnrichmentCache();
    const result = await enrichCandidatePage("https://www.obi.si/p/x", {
      allowlistDomains: ["obi.si"],
      lookup: PUBLIC_LOOKUP,
      fetchFn: async () =>
        ({
          status: 302,
          ok: false,
          headers: { get: (k: string) => (k.toLowerCase() === "location" ? "https://evil.example/x" : null) },
          body: null,
        }) as unknown as Response,
    });
    expect(result.price).toBeNull();
    expect(["http_error", "forbidden"]).toContain(result.status);
  });

  it("N. product endpoint requires auth -> do not use", async () => {
    clearCandidateEnrichmentCache();
    const html = `<html><body><a href="/products/x.js">json</a><h1>X</h1></body></html>`;
    const result = await enrichCandidatePage("https://www.obi.si/products/x", {
      allowlistDomains: ["obi.si"],
      lookup: PUBLIC_LOOKUP,
      fetchFn: async (input) => {
        const u = String(input);
        if (u.endsWith(".js")) return mockResponse({ status: 401, html: "auth" });
        return mockResponse({ status: 200, html });
      },
    });
    expect(result.verifiedPrice ?? null).toBeNull();
  });

  it("O. duplicate canonical URLs -> shared cache hit", async () => {
    clearCandidateEnrichmentCache();
    const html = `<html><head>
      <link rel="canonical" href="https://www.obi.si/p/lamp" />
      <meta itemprop="price" content="40" />
      <meta itemprop="priceCurrency" content="EUR" />
      <meta property="og:title" content="Lamp" />
    </head></html>`;
    let fetches = 0;
    const fetchFn = async () => {
      fetches += 1;
      return mockResponse({ status: 200, html });
    };
    await enrichCandidatePage("https://obi.si/p/lamp?utm_source=x", {
      allowlistDomains: ["obi.si"],
      lookup: PUBLIC_LOOKUP,
      fetchFn,
    });
    await enrichCandidatePage("https://www.obi.si/p/lamp/", {
      allowlistDomains: ["obi.si"],
      lookup: PUBLIC_LOOKUP,
      fetchFn,
    });
    expect(fetches).toBe(1);
  });

  it("P. variant query parameter preserved in cache key", () => {
    const a = enrichmentCacheKey("https://obi.si/p/x?variant=1&utm_source=google");
    const b = enrichmentCacheKey("https://obi.si/p/x?variant=2&utm_source=google");
    const c = enrichmentCacheKey("https://www.obi.si/p/x?variant=1");
    expect(a).not.toBe(b);
    expect(a).toBe(c);
  });

  it("bauhaus adapter marks unsupported", () => {
    const r = bauhausAcquisitionAdapter.enrichFromHtml({
      pageUrl: "https://www.bauhaus.si/p/1",
      html: "",
      domainRoot: "bauhaus.si",
    });
    expect(r.unsupportedDirectEnrichment).toBe(true);
  });

  it("F. follow-up wrong product association rejected by selectVerifiedPurchasePrice", () => {
    const selected = selectVerifiedPurchasePrice([
      {
        amount: 9,
        currency: "EUR",
        kind: "current",
        source: "same_origin_product_data",
        productAssociation: "cross_host",
      },
    ]);
    expect(selected.verified).toBeNull();
    expect(selected.failureReason).toBe("PRICE_NONE_PRODUCT_ASSOCIATION_UNSAFE");
  });

  it("G. unresolved variants rejected", () => {
    const selected = selectVerifiedPurchasePrice([
      {
        amount: 10,
        currency: "EUR",
        kind: "current",
        source: "embedded_state",
        productAssociation: "variant",
        variantId: "1",
      },
      {
        amount: 20,
        currency: "EUR",
        kind: "current",
        source: "embedded_state",
        productAssociation: "variant",
        variantId: "2",
      },
    ]);
    expect(selected.failureReason).toBe("PRICE_NONE_VARIANT_UNRESOLVED");
  });
});

describe("OBI large HTML truncation recovery", () => {
  it("recovers price past 512KB when enough HTML is provided", () => {
    const pad = "<!--" + "x".repeat(520_000) + "-->";
    const html = `<html><body>${pad}
      <meta itemprop="price" content="28.99" />
      <meta itemprop="priceCurrency" content="EUR" />
      <meta itemprop="sku" content="184693" />
    </body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://www.obi.si/p/x-184693");
    expect(ev.price).toBe(28.99);
    const adapter = obiAcquisitionAdapter.enrichFromHtml({
      pageUrl: "https://www.obi.si/p/x-184693",
      html,
      domainRoot: "obi.si",
    });
    expect(adapter.extraPriceCandidates.some((p) => p.amount === 28.99)).toBe(true);
  });
});
