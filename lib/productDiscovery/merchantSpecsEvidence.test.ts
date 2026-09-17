import { describe, expect, it } from "vitest";
import {
  acquireMerchantEvidenceFromHtml,
  extractEmbeddedProductSpecs,
  extractLabeledHtmlSpecs,
} from "./merchantEvidence";
import { classifyExactDimensionAgainstEvidence } from "./productEvidence";
import {
  classifyHardConstraintDetails,
  classifyMissingEvidenceCombo,
  hasProvenHardConstraintMismatch,
  summarizeEligibleEvidenceStats,
} from "./evidenceQualificationAnalysis";
import type { FrozenEvidenceCandidate } from "./productEvidenceBenchmark";

function baseCandidate(
  overrides: Partial<FrozenEvidenceCandidate> & {
    productUrl?: string;
  } = {}
): FrozenEvidenceCandidate {
  return {
    candidateId: "c1",
    productUrl: overrides.productUrl ?? "https://obi.si/p/x",
    evidence: {
      productUrl: overrides.productUrl ?? "https://obi.si/p/x",
      productNameEvidence: [],
      categoryEvidence: [],
      priceEvidence: [],
      materialEvidence: [],
      colorEvidence: [],
      dimensionEvidence: [],
      generalTextEvidence: [],
    },
    enrichmentStatus: "success",
    enrichmentDetail: {
      attempted: true,
      status: "success",
      jsonLdProductFound: false,
      merchantTitle: true,
      merchantPrice: true,
      merchantMaterialOrSpecs: false,
      failureClass: "success",
      labeledDimensionsFound: 0,
      materialFound: false,
      colorFound: false,
      extractionMethods: [],
      httpStatus: 200,
    },
    relevantCandidate: true,
    fullyQualifyingCandidate: false,
    qualificationReasons: [],
    productionDecision: { accepted: false, rejectionReason: "insufficient_evidence" },
    evidenceCoverage: {
      priceKind: "merchant_page",
      price: 10,
      dimensionKinds: [],
      materialKinds: [],
      colorKinds: [],
    },
    ...overrides,
  };
}

describe("merchant labeled specs recovery", () => {
  it("A. labeled width + depth", () => {
    const html = `<html><body>
      <table><tr><th>Širina</th><td>600 mm</td></tr>
      <tr><th>Globina</th><td>400 mm</td></tr></table>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /širina/i.test(s.label) && /600/.test(s.value))).toBe(true);
    expect(specs.some((s) => /globina/i.test(s.label) && /400/.test(s.value))).toBe(true);
  });

  it("B. unlabeled 800 x 600 must NOT become exact width evidence", () => {
    const html = `<html><body><p>800 x 600 mm</p></body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/x");
    const hay = [ev.productName, ev.rawProductText, ...ev.labeledSpecs.map((s) => s.text)].join("\n");
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "unsupported"
    );
  });

  it("C. Width: 600 mm -> valid width", () => {
    const html = `<html><body><p>Width: 600 mm</p></body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    const width = specs.find((s) => /width/i.test(s.label));
    expect(width?.value).toMatch(/600/);
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: specs.map((s) => s.text).join("\n"),
      })
    ).toBe("supported");
  });

  it("D. localized product width label with HTML entities", () => {
    const html = `<html><body>
      <td data-th="&#x0160;irina&#x20;izdelka&#x20;&#x28;v&#x20;mm&#x29;">600</td>
      <td data-th="&#x0160;irina&#x20;paketa&#x20;&#x28;v&#x20;mm&#x29;">71</td>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /širina izdelka/i.test(s.label) && /600/.test(s.value))).toBe(true);
    expect(specs.some((s) => /paketa/i.test(s.label))).toBe(false);
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: specs.map((s) => s.text).join("\n"),
      })
    ).toBe("supported");
  });

  it("E. material in spec table", () => {
    const html = `<html><body>
      <table class="table"><tr><th>MATERIAL</th><td data-th="MATERIAL">KOVINA</td></tr></table>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => s.field === "material" && /kovina/i.test(s.value))).toBe(true);
  });

  it("F. material in JSON-LD additionalProperty", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@type":"Product","name":"Sink","url":"https://obi.si/p/sink",
     "additionalProperty":[{"@type":"PropertyValue","name":"Material","value":"Nerjavno jeklo"}],
     "offers":{"@type":"Offer","price":"100","priceCurrency":"EUR"}}
    </script></head></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/sink");
    expect(ev.labeledSpecs.some((s) => s.field === "material" && /nerjavno/i.test(s.value))).toBe(
      true
    );
  });

  it("G. material marketing text only -> not extracted as labeled material", () => {
    const html = `<html><body>
      <p>Beautiful metal look finish for modern kitchens. Style: industrial.</p>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.filter((s) => s.field === "material")).toHaveLength(0);
  });

  it("H. matte black -> color + finish when label supports both", () => {
    const html = `<html><body><dl><dt>Color</dt><dd>matte black</dd></dl></body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /black/i.test(s.value))).toBe(true);
    expect(specs.some((s) => /matte|finish/i.test(s.label + s.value))).toBe(true);
  });

  it("I. dimensions from embedded product JSON", () => {
    const html = `<html><body><script type="application/json">
    {"product":{"name":"Rail","attributes":[
      {"name":"Širina izdelka","value":"600 mm"},
      {"name":"Material","value":"Kovina"}
    ]}}
    </script></body></html>`;
    const specs = extractEmbeddedProductSpecs(html);
    expect(specs.some((s) => s.field === "dimension" && /600/.test(s.value))).toBe(true);
    expect(specs.some((s) => s.field === "material")).toBe(true);
  });

  it("J. conflicting dimensions from two sources are both retained (no silent choice)", () => {
    const html = `<html><body>
      <tr><th>Širina</th><td>600 mm</td></tr>
      <tr><th>Width</th><td>550 mm</td></tr>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    const widths = specs.filter((s) => s.field === "dimension" && /širina|width/i.test(s.label));
    expect(widths.length).toBeGreaterThanOrEqual(2);
  });

  it("K. package dimensions ignored; product dimensions kept", () => {
    const html = `<html><body>
      <td data-th="Širina paketa (v mm)">71</td>
      <td data-th="Širina izdelka (v mm)">600</td>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /paketa/i.test(s.label))).toBe(false);
    expect(specs.some((s) => /izdelka/i.test(s.label) && /600/.test(s.value))).toBe(true);
  });

  it("L. product weight must not become dimension", () => {
    const html = `<html><body>
      <td data-th="Teža izdelka (v kg)">0,410</td>
      <td data-th="Širina izdelka (v mm)">600</td>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /teža|weight/i.test(s.label))).toBe(false);
    expect(specs.some((s) => s.field === "dimension" && /600/.test(s.value))).toBe(true);
  });

  it("M. recommendation-product specifications ignored in embedded JSON", () => {
    const html = `<html><body><script type="application/json">
    {"related":[{"name":"Accessory","attributes":[{"name":"Material","value":"Plastic"}]}],
     "product":{"name":"Main","attributes":[{"name":"Material","value":"Kovina"}]}}
    </script></body></html>`;
    const specs = extractEmbeddedProductSpecs(html);
    expect(specs.some((s) => /kovina/i.test(s.value))).toBe(true);
    expect(specs.some((s) => /plastic/i.test(s.value))).toBe(false);
  });

  it("N. wrong variant specs: unresolved multi-variant sizes stay unlabeled orientation-safe", () => {
    const html = `<html><body>
      <p>Size: 800 x 600 mm</p>
    </body></html>`;
    const hay = extractLabeledHtmlSpecs(html).map((s) => s.text).join("\n") + "\n800 x 600 mm";
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "unsupported"
    );
  });
});

describe("hard-constraint vs insufficient evidence", () => {
  it("rejects cabinet niche width and CSS width noise", () => {
    const html = `<html><head><style>.x{width:100%!important;height:50px}</style></head><body>
      <table>
        <tr><th>ŠIRINA</th><td>50 CM</td></tr>
        <tr><th>DOLŽINA</th><td>86 CM</td></tr>
        <tr><th>MINIMALNA ŠIRINA OMARICE</th><td>60 CM</td></tr>
      </table>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /omarice/i.test(s.label))).toBe(false);
    expect(specs.some((s) => /%|!important/i.test(s.value))).toBe(false);
    expect(specs.some((s) => /širina/i.test(s.label) && /50/i.test(s.value))).toBe(true);
    const hay = specs.map((s) => s.text).join("\n");
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "contradicted"
    );
  });

  it("adjacent DOLŽINA 50 CM ŠIRINA 60 CM is exact width, not a 50cm contradiction", () => {
    const html = `<html><body>
      <table>
        <tr><th>DOLŽINA</th><td>50 CM</td></tr>
        <tr><th>ŠIRINA</th><td>60 CM</td></tr>
        <tr><th>MATERIAL</th><td>NERJAVNO JEKLO</td></tr>
      </table>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    const hay = `${specs.map((s) => s.text).join("\n")}\nDOLŽINA 50 CM ŠIRINA 60 CM`;
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "supported"
    );
  });

  it("O. missing evidence does not become PROVEN_MISMATCH", () => {
    const c = baseCandidate({
      qualificationReasons: ["chrome finish not evidenced", "width ~60cm not evidenced"],
      productionDecision: { accepted: false, rejectionReason: "insufficient_evidence" },
    });
    const details = classifyHardConstraintDetails(c);
    expect(details.every((d) => d.mode === "INSUFFICIENT_EVIDENCE")).toBe(true);
    expect(hasProvenHardConstraintMismatch(c)).toBe(false);
  });

  it("P. real proven constraint violation stays PROVEN_MISMATCH", () => {
    const c = baseCandidate({
      qualificationReasons: ["wrong finish: white, not chrome", "over budget: €200 > max €150"],
      productionDecision: { accepted: false, rejectionReason: "hard_constraint_unmet" },
    });
    expect(hasProvenHardConstraintMismatch(c)).toBe(true);
    const details = classifyHardConstraintDetails(c);
    expect(details.some((d) => d.mode === "PROVEN_MISMATCH")).toBe(true);
  });

  it("Q. Classic 40 regression remains passing", () => {
    const html = `<html><head><script type="application/ld+json">
    {"@type":"Product","name":"Vgradno korito Classic 40",
     "offers":{"@type":"Offer","price":"119","priceCurrency":"EUR"}}
    </script></head>
    <body>Alveus Vgradno korito Classic 40 (800 x 600 mm, Nerjavno jeklo)</body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://obi.si/p/classic40");
    const hay = [ev.productName, ev.rawProductText, ...ev.labeledSpecs.map((s) => s.text)].join(
      "\n"
    );
    expect(classifyExactDimensionAgainstEvidence({ valueCm: "60", haystack: hay })).toBe(
      "unsupported"
    );
  });

  it("missing combo classification", () => {
    const c = baseCandidate({
      enrichmentDetail: {
        ...baseCandidate().enrichmentDetail,
        materialFound: false,
        colorFound: false,
        labeledDimensionsFound: 0,
        merchantPrice: true,
      },
      evidenceCoverage: {
        priceKind: "merchant_page",
        price: 10,
        dimensionKinds: [],
        materialKinds: [],
        colorKinds: [],
      },
    });
    expect(classifyMissingEvidenceCombo(c)).toBe("material_dimensions_finish");
  });

  it("eligible stats exclude unsupported merchants and proven mismatches", () => {
    const stats = summarizeEligibleEvidenceStats([
      baseCandidate({
        productUrl: "https://www.bauhaus.si/p/1",
        enrichmentStatus: "forbidden",
        enrichmentDetail: {
          ...baseCandidate().enrichmentDetail,
          status: "forbidden",
          failureClass: "forbidden",
          fetchBlockReason: "FETCH_BLOCKED_CHALLENGE_PAGE",
          merchantPrice: false,
        },
      }),
      baseCandidate({
        productUrl: "https://obi.si/p/ok",
        fullyQualifyingCandidate: true,
        productionDecision: { accepted: true, rejectionReason: null },
      }),
      baseCandidate({
        productUrl: "https://obi.si/p/wrong",
        qualificationReasons: ["wrong finish: white, not chrome"],
      }),
    ]);
    expect(stats.unsupportedMerchant).toBe(1);
    expect(stats.eligibleForEvidenceEvaluation).toBe(1);
    expect(stats.fullyEvidencedAmongEligible).toBe(1);
  });
});
