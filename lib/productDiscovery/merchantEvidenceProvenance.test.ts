import { afterEach, describe, expect, it } from "vitest";
import {
  acquireMerchantEvidenceFromHtml,
  extractLabeledHtmlSpecs,
} from "./merchantEvidence";
import {
  MAX_EVIDENCE_EXCERPT_CHARS,
  isChromeEvidencePath,
  sanitizeEvidenceExcerpt,
} from "./evidenceProvenance";
import {
  buildProductEvidence,
  trustedEvidenceHaystack,
} from "./productEvidence";
import {
  freezeDecisionSnapshot,
  reloadDecisionSnapshot,
  buildDecisionSnapshot,
} from "./decisionSnapshot";
import { finalizeAcceptedProduct } from "./acceptancePolicy";
import type { ProductDiscoveryProduct } from "./types";
import {
  candidateEnrichmentFromPageEvidence,
  clearCandidateEnrichmentCache,
  compactMerchantEvidenceForDebug,
  getCachedCandidateEnrichment,
  parseProductPageEvidence,
  seedCandidateEnrichmentCache,
} from "./enrichCandidate";
import { loadMerchantHtmlFixture } from "./fixtures/loadMerchantHtmlFixture";

const PAGE = "https://shop.example/p/item";

function product(overrides: Partial<ProductDiscoveryProduct> = {}): ProductDiscoveryProduct {
  return {
    name: "Sink",
    retailer: "Shop",
    retailerDomain: "shop.example",
    productUrl: PAGE,
    price: 109.99,
    currency: "EUR",
    priceUnit: null,
    imageUrl: null,
    specifications: {},
    matchScore: 0.9,
    matchedRequirements: [],
    unmetRequirements: [],
    unknownRequirements: [],
    whyItMatches: "x",
    priceEvidence: "merchant_page",
    ...overrides,
  };
}

const CONTAMINATION_HTML = `<!doctype html>
<html>
<body>
  <main>
    <table>
      <tr><th>Širina</th><td>600.09 mm</td></tr>
      <tr><th>Cena</th><td>109,99 €</td></tr>
      <tr><th>Material</th><td>Nerjavno jeklo</td></tr>
      <tr><th>Barva</th><td>Krom</td></tr>
    </table>
  </main>
</body>
</html>`;

const JSON_LD_600_HTML = `<html><head><script type="application/ld+json">
{"@type":"Product","name":"Sink","url":"${PAGE}",
 "offers":{"@type":"Offer","price":"600.09","priceCurrency":"EUR"}}
</script></head></html>`;

afterEach(() => {
  clearCandidateEnrichmentCache();
});

describe("merchant evidence provenance", () => {
  it("sanitizes excerpts and bounds length", () => {
    const huge = `price ${"9".repeat(800)} <script>alert(1)</script> cookie=abc authorization: Bearer xyz`;
    const excerpt = sanitizeEvidenceExcerpt(huge);
    expect(excerpt).not.toBeNull();
    expect(excerpt!.length).toBeLessThanOrEqual(MAX_EVIDENCE_EXCERPT_CHARS);
    expect(excerpt).not.toMatch(/<script|cookie=|Bearer/i);
    expect(isChromeEvidencePath("nav > Material")).toBe(true);
    expect(isChromeEvidencePath("Product.offers.price")).toBe(false);
  });

  it("does not persist full merchant HTML in diagnostics", () => {
    const html = loadMerchantHtmlFixture("U-labeled-price-and-width");
    const ev = acquireMerchantEvidenceFromHtml(html, PAGE);
    const blob = JSON.stringify(ev.diagnostics);
    expect(blob).not.toMatch(/<!doctype|<html|<script|<style/i);
    expect(ev.diagnostics.price?.excerpt?.length ?? 0).toBeLessThanOrEqual(MAX_EVIDENCE_EXCERPT_CHARS);
  });

  it("keeps 600.09 mm as width and 109.99 EUR as Cena", () => {
    const ev = acquireMerchantEvidenceFromHtml(CONTAMINATION_HTML, PAGE);
    const width = ev.labeledSpecs.find((s) => /širina/i.test(s.label));
    expect(width?.value).toMatch(/600\.09\s*mm/i);
    expect(width?.normalizedValue).toBe("60.009 cm");
    expect(width?.sourcePath).toMatch(/Širina/i);
    expect(width?.evidenceExcerpt).toMatch(/Širina:\s*600\.09\s*mm/i);

    expect(ev.price).toBe(109.99);
    expect(ev.currency).toBe("EUR");
    expect(ev.verifiedPrice?.extractionMethod).toBe("spec_table");
    expect(ev.verifiedPrice?.sourcePath).toMatch(/Cena/i);
    expect(ev.verifiedPrice?.evidenceExcerpt).toMatch(/Cena:\s*109,99/i);
    expect(ev.diagnostics.price?.amount).toBe(109.99);
    expect(ev.diagnostics.price?.sourcePath).toMatch(/Cena/i);
    expect(ev.price).not.toBe(600.09);
    expect(ev.verifiedPrice?.amount).not.toBe(600.09);
  });

  it("accepts JSON-LD 600.09 EUR with json_ld provenance", () => {
    const ev = acquireMerchantEvidenceFromHtml(JSON_LD_600_HTML, PAGE);
    expect(ev.price).toBe(600.09);
    expect(ev.currency).toBe("EUR");
    expect(ev.verifiedPrice?.extractionMethod).toBe("json_ld");
    expect(ev.verifiedPrice?.sourcePath).toBe("Product.offers.price");
    expect(ev.verifiedPrice?.evidenceExcerpt).toMatch(/"price":"600\.09"/);
    expect(ev.verifiedPrice?.evidenceExcerpt).toMatch(/EUR/);
    expect(ev.diagnostics.price?.extractionMethod).toBe("json_ld");
    expect(ev.diagnostics.productName?.sourcePath).toBe("Product.name");
  });

  it("keeps material and color on separate evidence origins", () => {
    const ev = acquireMerchantEvidenceFromHtml(CONTAMINATION_HTML, PAGE);
    const material = ev.labeledSpecs.find((s) => s.field === "material");
    const color = ev.labeledSpecs.find((s) => s.field === "color");
    expect(material?.value).toMatch(/nerjavno jeklo/i);
    expect(color?.value).toMatch(/krom/i);
    expect(material?.sourcePath).toMatch(/Material/i);
    expect(color?.sourcePath).toMatch(/Barva/i);
    expect(material?.sourcePath).not.toBe(color?.sourcePath);
    expect(material?.evidenceExcerpt).toMatch(/Material:\s*Nerjavno jeklo/i);
    expect(color?.evidenceExcerpt).toMatch(/Barva:\s*Krom/i);
  });

  it("does not invent width orientation for unlabeled 800 x 600 mm", () => {
    const html = `<html><body><main><p>800 x 600 mm</p></main></body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /širina|width/i.test(s.label))).toBe(false);
    const dim = specs.filter((s) => s.field === "dimension");
    for (const spec of dim) {
      expect(spec.normalizedValue).toBeNull();
    }
  });

  it("does not trust nav/footer/css provenance for product facts", () => {
    const html = `<html><body>
      <nav><table><tr><th>Material</th><td>Les</td></tr><tr><th>Cena</th><td>1,00 €</td></tr></table></nav>
      <footer><style>.x{width:40px}</style><p>Material: Plastika</p></footer>
      <main>
        <table>
          <tr><th>Material</th><td>Nerjavno jeklo</td></tr>
          <tr><th>Barva</th><td>Krom</td></tr>
          <tr><th>Cena</th><td>109,99 €</td></tr>
        </table>
      </main>
    </body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, PAGE);
    expect(ev.price).toBe(109.99);
    expect(ev.labeledSpecs.some((s) => /les|plastika/i.test(s.value))).toBe(false);
    for (const spec of ev.labeledSpecs) {
      expect(isChromeEvidencePath(spec.sourcePath)).toBe(false);
    }
    expect(isChromeEvidencePath(ev.verifiedPrice?.sourcePath)).toBe(false);
    expect(ev.verifiedPrice?.sourcePath).toMatch(/Cena/i);
  });

  it("round-trips verified price provenance through the enrichment cache", () => {
    const page = parseProductPageEvidence(CONTAMINATION_HTML, PAGE);
    const enrichment = candidateEnrichmentFromPageEvidence(page);
    expect(enrichment.verifiedPrice?.amount).toBe(109.99);
    expect(enrichment.verifiedPrice?.extractionMethod).toBe("spec_table");
    seedCandidateEnrichmentCache(PAGE, enrichment);
    const reloaded = getCachedCandidateEnrichment(PAGE);
    expect(reloaded?.price).toBe(109.99);
    expect(reloaded?.currency).toBe("EUR");
    expect(reloaded?.verifiedPrice?.amount).toBe(enrichment.verifiedPrice?.amount);
    expect(reloaded?.verifiedPrice?.currency).toBe(enrichment.verifiedPrice?.currency);
    expect(reloaded?.verifiedPrice?.extractionMethod).toBe(enrichment.verifiedPrice?.extractionMethod);
    expect(reloaded?.verifiedPrice?.sourcePath).toBe(enrichment.verifiedPrice?.sourcePath);
    expect(reloaded?.verifiedPrice?.evidenceExcerpt).toBe(enrichment.verifiedPrice?.evidenceExcerpt);

    const width = reloaded?.labeledSpecs?.find((s) => /širina/i.test(s.label));
    const material = reloaded?.labeledSpecs?.find((s) => s.field === "material");
    const color = reloaded?.labeledSpecs?.find((s) => s.field === "color");
    expect(width?.value).toMatch(/600\.09/);
    expect(width?.sourcePath).toBeTruthy();
    expect(width?.evidenceExcerpt).toBeTruthy();
    expect(material?.sourcePath).toMatch(/Material/i);
    expect(color?.sourcePath).toMatch(/Barva/i);

    const compact = compactMerchantEvidenceForDebug(PAGE);
    expect(compact?.price.amount).toBe(109.99);
    expect(compact?.price.extractionMethod).toBe("spec_table");
    expect(compact?.price.sourcePath).toMatch(/Cena/i);
    expect(JSON.stringify(compact)).not.toMatch(/<!doctype|<html/i);
  });

  it("preserves ProductEvidence provenance through freeze/reload", () => {
    const page = parseProductPageEvidence(CONTAMINATION_HTML, PAGE);
    const enrichment = candidateEnrichmentFromPageEvidence(page);
    const evidence = buildProductEvidence({
      productUrl: PAGE,
      sources: [{ url: PAGE, title: "Sink", snippet: null }],
      enrichment,
    });
    const priceFact = evidence.priceEvidence.find((f) => f.value === 109.99);
    expect(priceFact?.extractionMethod).toBe("spec_table");
    expect(priceFact?.sourcePath).toMatch(/Cena/i);
    expect(priceFact?.evidenceExcerpt).toMatch(/Cena/i);
    const widthFact = evidence.dimensionEvidence.find((f) => /širina/i.test(f.label ?? ""));
    expect(widthFact?.value).toMatch(/600\.09/);
    expect(widthFact?.normalizedValue).toBe("60.009 cm");
    expect(widthFact?.sourcePath).toMatch(/Širina/i);
    const materialFact = evidence.materialEvidence.find((f) => /nerjavno/i.test(String(f.value ?? f.text ?? "")));
    const colorFact = evidence.colorEvidence.find((f) => /krom/i.test(String(f.value ?? f.text ?? "")));
    expect(materialFact?.sourcePath).toMatch(/Material/i);
    expect(colorFact?.sourcePath).toMatch(/Barva/i);
    expect(materialFact?.sourcePath).not.toBe(colorFact?.sourcePath);

    const finalized = finalizeAcceptedProduct({
      source: "rescue",
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      product: product(),
      evidenceText: trustedEvidenceHaystack(evidence),
    });
    const snapshot = buildDecisionSnapshot({
      requestedItem: "exactly 60cm wide kitchen sink stainless steel max 200 EUR",
      path: "rescue",
      product: finalized.product,
      acceptance: finalized,
      productEvidence: evidence,
    });
    const reloaded = reloadDecisionSnapshot(freezeDecisionSnapshot(snapshot));
    expect(reloaded.productEvidence.priceEvidence.find((f) => f.value === 109.99)?.extractionMethod).toBe(
      "spec_table"
    );
    expect(reloaded.productEvidence.priceEvidence.find((f) => f.value === 109.99)?.sourcePath).toBe(
      priceFact?.sourcePath
    );
    expect(reloaded.productEvidence.priceEvidence.find((f) => f.value === 109.99)?.evidenceExcerpt).toBe(
      priceFact?.evidenceExcerpt
    );
    expect(
      reloaded.productEvidence.dimensionEvidence.find((f) => /širina/i.test(f.label ?? ""))?.normalizedValue
    ).toBe("60.009 cm");
    expect(
      reloaded.productEvidence.materialEvidence.find((f) => /nerjavno/i.test(String(f.value ?? f.text ?? "")))
        ?.sourcePath
    ).toBe(materialFact?.sourcePath);
    expect(
      reloaded.productEvidence.colorEvidence.find((f) => /krom/i.test(String(f.value ?? f.text ?? "")))
        ?.sourcePath
    ).toBe(colorFact?.sourcePath);
  });
});
