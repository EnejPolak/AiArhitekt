import { describe, expect, it } from "vitest";
import {
  loadMerchantHtmlFixture,
  MERCHANT_HTML_FIXTURE_IDS,
} from "./fixtures/loadMerchantHtmlFixture";
import { acquireMerchantEvidenceFromHtml } from "./merchantEvidence";
import { isAppearanceOnlyMaterialEvidence } from "./materialEvidence";
import { classifyExactDimensionAgainstEvidence } from "./productEvidence";
import { extractOpenAiResponseUsage } from "./sources";

const PAGE = "https://shop.example/p/item";

describe("merchant HTML fixtures A–Q", () => {
  it("loads every fixture from disk without network", () => {
    for (const id of MERCHANT_HTML_FIXTURE_IDS) {
      const html = loadMerchantHtmlFixture(id);
      expect(html.length).toBeGreaterThan(20);
      expect(html).toMatch(/<html/i);
    }
  });

  it("A. JSON-LD Product + Offer", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("A-jsonld-product-offer"),
      "https://shop.example/p/lamp"
    );
    expect(ev.jsonLdProductFound).toBe(true);
    expect(ev.productName).toBe("Črna viseča svetilka");
    expect(ev.brand).toBe("Globo");
    expect(ev.sku).toBe("L-40");
    expect(ev.mpn).toBe("MPN-40");
    expect(ev.price).toBe(69.99);
    expect(ev.currency).toBe("EUR");
    expect(ev.canonicalUrl).toBe("https://shop.example/p/lamp");
    expect(ev.verifiedPrice?.source).toBe("json_ld");
  });

  it("B. @graph Product", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("B-graph-product"),
      "https://shop.example/p/graph-sink"
    );
    expect(ev.jsonLdProductFound).toBe(true);
    expect(ev.productName).toBe("Graph Sink");
    expect(ev.price).toBe(109);
    expect(ev.labeledSpecs.some((s) => s.field === "material")).toBe(true);
    expect(ev.labeledSpecs.some((s) => s.field === "color")).toBe(true);
  });

  it("C. AggregateOffer lowPrice", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("C-aggregate-offer"),
      "https://shop.example/p/range"
    );
    expect(ev.price).toBe(59.99);
    expect(ev.currency).toBe("EUR");
  });

  it("D. metadata-only price", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("D-metadata-only-price"),
      "https://shop.example/p/og"
    );
    expect(ev.jsonLdProductFound).toBe(false);
    expect(ev.productName).toBe("OG Pendant");
    expect(ev.price).toBe(89.99);
    expect(ev.currency).toBe("EUR");
    expect(ev.canonicalUrl).toBe("https://shop.example/p/og");
    expect(ev.metaDescription).toMatch(/metal pendant/i);
  });

  it("E. HTML specification table", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("E-html-spec-table"),
      PAGE
    );
    expect(ev.labeledSpecs.some((s) => s.field === "dimension" && /600/.test(s.value))).toBe(true);
    expect(ev.labeledSpecs.some((s) => s.field === "material" && /nerjavno/i.test(s.value))).toBe(
      true
    );
    expect(ev.labeledSpecs.some((s) => s.field === "color" && /krom/i.test(s.value))).toBe(true);
  });

  it("F. dl/dt/dd specifications", () => {
    const ev = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture("F-dl-dt-dd"), PAGE);
    expect(ev.labeledSpecs.some((s) => /širina/i.test(s.label) && /600/.test(s.value))).toBe(true);
    expect(ev.labeledSpecs.some((s) => s.field === "material")).toBe(true);
    expect(ev.labeledSpecs.some((s) => s.field === "color")).toBe(true);
  });

  it("G. labeled Širina 600 mm establishes exact width", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("G-labeled-width"),
      PAGE
    );
    const hay = ev.labeledSpecs.map((s) => s.text).join("\n");
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "supported"
    );
  });

  it("H. Classic 40 / 800 x 600 does not establish exact width", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("H-ambiguous-dimensions"),
      "https://shop.example/p/classic-40"
    );
    const hay = [ev.productName, ev.rawProductText, ...ev.labeledSpecs.map((s) => s.text)].join(
      "\n"
    );
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "unsupported"
    );
    expect(ev.labeledSpecs.some((s) => /širina|width/i.test(s.label) && /600/.test(s.value))).toBe(
      false
    );
  });

  it("I. labeled material", () => {
    const ev = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture("I-material"), PAGE);
    expect(ev.labeledSpecs.some((s) => s.field === "material" && /nerjavno jeklo/i.test(s.value))).toBe(
      true
    );
  });

  it("J. labeled color", () => {
    const ev = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture("J-color"), PAGE);
    expect(ev.labeledSpecs.some((s) => s.field === "color" && /krom/i.test(s.value))).toBe(true);
  });

  it("K. material keramika + barva zlata is not gold-material", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("K-material-appearance"),
      PAGE
    );
    const material = ev.labeledSpecs.find((s) => s.field === "material");
    const color = ev.labeledSpecs.find((s) => s.field === "color");
    expect(material?.value.toLowerCase()).toContain("keramik");
    expect(color?.value.toLowerCase()).toContain("zlat");
    expect(material?.value.toLowerCase()).not.toContain("zlat");
    const hay = ev.labeledSpecs.map((s) => s.text).join("\n");
    expect(isAppearanceOnlyMaterialEvidence("gold", hay)).toBe(true);
  });

  it("L. sale/current price uses 109 not 149", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("L-sale-old-price"),
      PAGE
    );
    expect(ev.price).toBe(109);
    expect(ev.verifiedPrice?.kind).toMatch(/sale|current/);
  });

  it("M. financing is not selected as product price", () => {
    const ev = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture("M-financing"), PAGE);
    expect(ev.price).toBe(144);
    expect(ev.price).not.toBe(12);
  });

  it("N. shipping is not selected as product price", () => {
    const ev = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture("N-shipping"), PAGE);
    expect(ev.price).toBe(89);
    expect(ev.price).not.toBe(4.99);
  });

  it("O. multiple Product JSON-LD does not merge related evidence", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("O-multiple-products"),
      "https://shop.example/p/main-sink"
    );
    expect(ev.productName).toBe("Main Sink");
    expect(ev.price).toBe(199);
    expect(ev.labeledSpecs.some((s) => s.field === "material" && /nerjavno/i.test(s.value))).toBe(
      true
    );
    expect(ev.labeledSpecs.some((s) => /plastic/i.test(s.value))).toBe(false);
    expect(ev.labeledSpecs.some((s) => /red/i.test(s.value))).toBe(false);
  });

  it("P. malformed JSON-LD falls back to meta", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("P-malformed-jsonld"),
      "https://shop.example/p/og"
    );
    expect(ev.jsonLdProductFound).toBe(false);
    expect(ev.productName).toBe("OG Pendant");
    expect(ev.price).toBe(89.99);
  });

  it("Q. no product evidence", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("Q-no-product-evidence"),
      PAGE
    );
    expect(ev.jsonLdProductFound).toBe(false);
    expect(ev.price).toBeNull();
    expect(ev.labeledSpecs).toEqual([]);
    expect(ev.verifiedPrice).toBeNull();
  });
});

describe("generic JSON-LD extras", () => {
  it("parses Offer[] and skips shipping/finance offers", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@type":"Product","name":"Sink","url":"https://shop.example/p/item",
     "offers":[
       {"@type":"Offer","price":"199","priceCurrency":"EUR"},
       {"@type":"Offer","name":"Shipping","price":"4.99","priceCurrency":"EUR"}
     ]}
    </script></head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, PAGE);
    expect(ev.price).toBe(199);
  });

  it("parses CDATA JSON-LD and trailing commas", () => {
    const html = `<html><head><script type="application/ld+json">
    <![CDATA[
    {"@type":"Product","name":"CDATA Lamp","url":"https://shop.example/p/item",
     "offers":{"@type":"Offer","price":"40","priceCurrency":"EUR",},}
    ]]>
    </script></head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, PAGE);
    expect(ev.productName).toBe("CDATA Lamp");
    expect(ev.price).toBe(40);
  });
});

describe("extractOpenAiResponseUsage", () => {
  it("reads tokens and web_search_call count from an existing response payload", () => {
    const usage = extractOpenAiResponseUsage({
      usage: {
        input_tokens: 1200,
        output_tokens: 80,
        input_tokens_details: { cached_tokens: 200 },
      },
      output: [{ type: "web_search_call" }, { type: "message" }],
    });
    expect(usage.inputTokens).toBe(1200);
    expect(usage.cachedInputTokens).toBe(200);
    expect(usage.outputTokens).toBe(80);
    expect(usage.webSearchCalls).toBe(1);
  });
});

describe("offline fixture recovery summary", () => {
  it("reports what the parser recovers locally", () => {
    const rows = MERCHANT_HTML_FIXTURE_IDS.map((id) => {
      const ev = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture(id), PAGE);
      return {
        id,
        jsonLd: ev.jsonLdProductFound,
        price: ev.price,
        material: ev.labeledSpecs.some((s) => s.field === "material"),
        color: ev.labeledSpecs.some((s) => s.field === "color"),
        labeledDim: ev.labeledSpecs.some((s) => s.field === "dimension"),
      };
    });
    expect(rows.filter((r) => r.jsonLd).map((r) => r.id)).toEqual([
      "A-jsonld-product-offer",
      "B-graph-product",
      "C-aggregate-offer",
      "H-ambiguous-dimensions",
      "O-multiple-products",
    ]);
    expect(rows.filter((r) => r.price != null).map((r) => r.id)).toEqual([
      "A-jsonld-product-offer",
      "B-graph-product",
      "C-aggregate-offer",
      "D-metadata-only-price",
      "H-ambiguous-dimensions",
      "L-sale-old-price",
      "M-financing",
      "N-shipping",
      "O-multiple-products",
      "P-malformed-jsonld",
    ]);
  });
});
