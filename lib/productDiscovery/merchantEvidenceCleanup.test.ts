import { describe, expect, it } from "vitest";
import { acquireMerchantEvidenceFromHtml, extractLabeledHtmlSpecs } from "./merchantEvidence";
import { classifyExactDimensionAgainstEvidence } from "./productEvidence";
import { isAppearanceOnlyMaterialEvidence } from "./materialEvidence";
import {
  extractEmbeddedStatePrices,
  looksLikeDimensionNotPrice,
  parsePriceNumber,
  selectVerifiedPurchasePrice,
} from "./merchantPurchasePrice";
import { loadMerchantHtmlFixture } from "./fixtures/loadMerchantHtmlFixture";

const PAGE = "https://shop.example/p/item";

describe("merchant evidence cleanup", () => {
  it("does not treat 600.09 mm as a price", () => {
    expect(looksLikeDimensionNotPrice("600.09 mm")).toBe(true);
    expect(parsePriceNumber("600.09 mm")).toBeNull();
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("T-dimension-not-price"),
      PAGE
    );
    expect(ev.price).toBeNull();
    expect(ev.verifiedPrice).toBeNull();
  });

  it("does not treat Dimenzije 600 x 500 mm as a price", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      `<html><body><p>Dimenzije: 600 x 500 mm</p></body></html>`,
      PAGE
    );
    expect(ev.price).toBeNull();
  });

  it("keeps labeled Cena with Širina and does not swap them", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("U-labeled-price-and-width"),
      PAGE
    );
    expect(ev.price).toBe(109.99);
    expect(ev.currency).toBe("EUR");
    const hay = ev.labeledSpecs.map((s) => s.text).join("\n");
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "supported"
    );
  });

  it("keeps a genuine structured 600.09 EUR offer price", () => {
    const html = `<html><head><script type="application/ld+json">
      {"@type":"Product","name":"Sink","url":"${PAGE}",
       "offers":{"@type":"Offer","price":"600.09","priceCurrency":"EUR"}}
    </script></head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, PAGE);
    expect(ev.price).toBe(600.09);
    expect(ev.verifiedPrice?.source).toBe("json_ld");
  });

  it("does not take embedded dimension amount as price", () => {
    const html = `<html><body><script type="application/json">
      {"name":"Širina","amount":600.09,"unit":"mm","currency":"EUR"}
    </script></body></html>`;
    const candidates = extractEmbeddedStatePrices({ html, pageUrl: PAGE });
    const selected = selectVerifiedPurchasePrice(candidates);
    expect(selected.verified).toBeNull();
  });

  it("ignores CSS width/material declarations", () => {
    const html = `<html><head><style>.x{width: 600px; material: gold}</style></head>
      <body><div style="width: 0; height: 0; opacity: 0">Footer</div>
      <p>width: 0; display: none</p></body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.filter((s) => s.field === "dimension")).toHaveLength(0);
    expect(specs.filter((s) => s.field === "material")).toHaveLength(0);
    const ev = acquireMerchantEvidenceFromHtml(html, PAGE);
    expect(ev.labeledSpecs.some((s) => /0/.test(s.value) && s.field === "dimension")).toBe(false);
  });

  it("ignores nav material filters and keeps product-local material", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("S-nav-material-filter"),
      PAGE
    );
    const materials = ev.labeledSpecs.filter((s) => s.field === "material");
    expect(materials.some((s) => /keramik/i.test(s.value))).toBe(true);
    expect(materials.some((s) => /kovina|les|plastika/i.test(s.value))).toBe(false);
    expect(ev.labeledSpecs.some((s) => s.field === "color" && /bela/i.test(s.value))).toBe(true);
  });

  it("strips flyout/footer/CSS chrome from trusted specs", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("R-chrome-nav-css"),
      PAGE
    );
    const hay = [ev.rawProductText, ...ev.labeledSpecs.map((s) => s.text)].join("\n");
    expect(hay).not.toMatch(/za-vhodna-vrata/i);
    expect(hay).not.toMatch(/flyout-sub-sub/i);
    expect(hay).not.toMatch(/opacity:\s*0/i);
    expect(hay).not.toMatch(/width:\s*0/i);
    expect(ev.labeledSpecs.some((s) => s.field === "material" && /kovina/i.test(s.value))).toBe(
      true
    );
    expect(ev.labeledSpecs.some((s) => s.field === "color" && /črn|crn/i.test(s.value))).toBe(true);
    expect(ev.labeledSpecs.some((s) => /les|plastika|vhodna/i.test(s.value))).toBe(false);
    expect(ev.labeledSpecs.some((s) => s.field === "dimension" && /40/.test(s.value))).toBe(true);
  });

  it("keeps keramika/zlata split", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("K-material-appearance"),
      PAGE
    );
    const hay = ev.labeledSpecs.map((s) => s.text).join("\n");
    expect(ev.labeledSpecs.find((s) => s.field === "material")?.value.toLowerCase()).toContain(
      "keramik"
    );
    expect(isAppearanceOnlyMaterialEvidence("gold", hay)).toBe(true);
  });

  it("retains spec provenance", () => {
    const ev = acquireMerchantEvidenceFromHtml(
      loadMerchantHtmlFixture("E-html-spec-table"),
      PAGE
    );
    expect(ev.labeledSpecs.some((s) => s.origin === "product_spec_table")).toBe(true);
  });

  it("ignores shipping and financing labeled as price-adjacent numbers", () => {
    const ship = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture("N-shipping"), PAGE);
    const fin = acquireMerchantEvidenceFromHtml(loadMerchantHtmlFixture("M-financing"), PAGE);
    expect(ship.price).toBe(89);
    expect(fin.price).toBe(144);
  });
});
