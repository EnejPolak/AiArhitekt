import { describe, expect, it } from "vitest";
import {
  acquireMerchantEvidenceFromHtml,
  extractLabeledHtmlSpecs,
  parsePriceNumber,
} from "./merchantEvidence";
import { classifyExactDimensionAgainstEvidence } from "./productEvidence";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import type { ProductDiscoveryProduct } from "./types";

function product(overrides: Partial<ProductDiscoveryProduct> = {}): ProductDiscoveryProduct {
  return {
    name: "Sink",
    retailer: "Shop",
    retailerDomain: "shop.si",
    productUrl: "https://shop.si/p/sink",
    price: 119,
    currency: "EUR",
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: 0.9,
    matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "x",
    priceEvidence: "merchant_page",
    ...overrides,
  };
}

describe("merchantEvidence JSON-LD", () => {
  it("parses Product + Offer", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@type":"Product","name":"Lamp","offers":{"@type":"Offer","price":"69.99","priceCurrency":"EUR"}}
    </script></head><body></body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/lamp");
    expect(ev.jsonLdProductFound).toBe(true);
    expect(ev.productName).toBe("Lamp");
    expect(ev.price).toBe(69.99);
    expect(ev.currency).toBe("EUR");
  });

  it("parses @graph Product and @type arrays", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@graph":[
      {"@type":"WebSite","name":"Shop"},
      {"@type":["Product","Thing"],"name":"Graph Sink","sku":"S-1",
       "offers":{"@type":"Offer","price":"109","priceCurrency":"EUR"},
       "material":"stainless steel","color":"silver"}
    ]}
    </script></head><body></body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/graph-sink");
    expect(ev.jsonLdProductFound).toBe(true);
    expect(ev.productName).toBe("Graph Sink");
    expect(ev.price).toBe(109);
    expect(ev.labeledSpecs.some((s) => s.field === "material")).toBe(true);
  });

  it("handles AggregateOffer lowPrice", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@type":"Product","name":"Range","offers":{"@type":"AggregateOffer","lowPrice":"59.99","highPrice":"79.99","priceCurrency":"EUR"}}
    </script></head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/range");
    expect(ev.price).toBe(59.99);
  });

  it("reads additionalProperty specs", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@type":"Product","name":"Radiator","offers":{"@type":"Offer","price":"120","priceCurrency":"EUR"},
     "additionalProperty":[{"@type":"PropertyValue","name":"Širina","value":"600 mm"},{"@type":"PropertyValue","name":"Material","value":"Krom"}]}
    </script></head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/rad");
    expect(ev.labeledSpecs.some((s) => /širina|sirina/i.test(s.label) && /600/i.test(s.value))).toBe(
      true
    );
  });

  it("ignores malformed JSON-LD and falls back to meta", () => {
    const html = `<html><head>
      <script type="application/ld+json">{ broken</script>
      <meta property="og:title" content="OG Pendant" />
      <meta property="product:price:amount" content="89.99" />
      <meta property="product:price:currency" content="EUR" />
    </head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/og");
    expect(ev.jsonLdProductFound).toBe(false);
    expect(ev.productName).toBe("OG Pendant");
    expect(ev.price).toBe(89.99);
    expect(ev.currency).toBe("EUR");
  });

  it("does not invent currency when meta currency is absent", () => {
    const html = `<html><head>
      <meta property="og:title" content="Lamp" />
      <meta property="product:price:amount" content="40" />
    </head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/lamp2");
    // Currency-missing amounts are not verified purchase prices.
    expect(ev.price).toBeNull();
    expect(ev.currency).toBeNull();
    expect(ev.priceFailureReason).toBe("PRICE_NONE_CURRENCY_MISSING");
  });
});

describe("merchantEvidence HTML specs + dimensions", () => {
  it("extracts dt/dd and table specs", () => {
    const html = `<html><body>
      <table><tr><th>Širina</th><td>600 mm</td></tr>
      <tr><th>Material</th><td>Nerjavno jeklo</td></tr></table>
      <dl><dt>Barva</dt><dd>Krom</dd></dl>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => s.field === "dimension" && /600/.test(s.value))).toBe(true);
    expect(specs.some((s) => s.field === "material")).toBe(true);
    expect(specs.some((s) => s.field === "color" && /krom/i.test(s.value))).toBe(true);
  });

  it("Classic 40: ambiguous 800x600 does not satisfy exact width", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@type":"Product","name":"Vgradno korito Classic 40",
     "offers":{"@type":"Offer","price":"119","priceCurrency":"EUR"}}
    </script></head>
    <body>Alveus Vgradno korito Classic 40 (800 x 600 mm, Nerjavno jeklo)</body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(
      html,
      "https://bauhaus.si/classic-40/p/1"
    );
    const hay = [ev.productName, ev.rawProductText, ...ev.labeledSpecs.map((s) => s.text)]
      .filter(Boolean)
      .join("\n");
    expect(
      classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })
    ).toBe("unsupported");
    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      product: product({
        name: ev.productName ?? "Classic 40",
        price: ev.price,
        matchedRequirements: ["kitchen sink", "stainless", "60 cm", "max 200 EUR"],
      }),
      evidenceText: hay,
    });
    expect(finalized.accepted).toBe(false);
  });

  it("labeled Širina 600 mm satisfies exact width", () => {
    const html = `<html><body>
      <table><tr><th>Širina</th><td>600 mm</td></tr>
      <tr><th>Material</th><td>Nerjavno jeklo</td></tr></table>
      <p>Pomivalno korito</p>
    </body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/sink60");
    const hay = ev.labeledSpecs.map((s) => s.text).join("\n");
    expect(
      classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })
    ).toBe("supported");
  });

  it("keeps material vs color separate (keramika + zlata)", () => {
    const html = `<html><body>
      <dl><dt>Material</dt><dd>keramika</dd>
      <dt>Barva</dt><dd>zlata</dd></dl>
    </body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/vase");
    const material = ev.labeledSpecs.find((s) => s.field === "material");
    const color = ev.labeledSpecs.find((s) => s.field === "color");
    expect(material?.value.toLowerCase()).toContain("keramik");
    expect(color?.value.toLowerCase()).toContain("zlat");
    expect(material?.value.toLowerCase()).not.toContain("zlat");
  });
});

describe("merchantEvidence prices", () => {
  it("prefers sale price meta over regular product price", () => {
    const html = `<html><head>
      <meta property="product:price:amount" content="150" />
      <meta property="product:price:currency" content="EUR" />
      <meta property="product:sale_price:amount" content="99" />
      <meta property="product:sale_price:currency" content="EUR" />
      <meta property="og:title" content="Sale lamp" />
    </head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/sale");
    expect(ev.price).toBe(99);
    expect(ev.priceProvenance).toBe("meta_sale");
  });

  it("parses european decimal prices", () => {
    expect(parsePriceNumber("1.234,56")).toBe(1234.56);
    expect(parsePriceNumber("69,99")).toBe(69.99);
    expect(parsePriceNumber("69.99")).toBe(69.99);
  });

  it("does not treat financing-looking microdata window as product price", () => {
    const html = `<html><body>
      <span>mesečno financiranje</span>
      <meta itemprop="price" content="12" />
      <meta itemprop="priceCurrency" content="EUR" />
    </body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/fin");
    // May still pick other sources; microdata near financing should be skipped.
    // Without other prices, price should be null.
    expect(ev.price).toBeNull();
  });
});

describe("merchantEvidence product identity", () => {
  it("prefers Product matching page URL over related products", () => {
    const html = `<html><head><script type="application/ld+json">
    [
      {"@type":"Product","name":"Related Accessory","url":"https://obi.si/p/other",
       "offers":{"@type":"Offer","price":"9","priceCurrency":"EUR"}},
      {"@type":"Product","name":"Main Sink","url":"https://obi.si/p/main-sink",
       "offers":{"@type":"Offer","price":"199","priceCurrency":"EUR"}}
    ]
    </script></head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/main-sink");
    expect(ev.productName).toBe("Main Sink");
    expect(ev.price).toBe(199);
  });
});
