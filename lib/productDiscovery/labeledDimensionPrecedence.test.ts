import { describe, expect, it } from "vitest";
import { acquireMerchantEvidenceFromHtml, extractLabeledHtmlSpecs } from "./merchantEvidence";
import {
  classifyExactDimensionAgainstEvidence,
  classifyClaimAgainstEvidence,
} from "./productEvidence";

const REQUEST = "exactly 60cm wide kitchen sink stainless steel max 200 EUR";

describe("labeled dimension evidence precedence", () => {
  it("explicit WIDTH 60 cm satisfies exact 60 cm", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "Kitchen sink WIDTH: 60 cm stainless steel",
      })
    ).toBe("supported");
  });

  it("explicit ŠIRINA 60 CM satisfies exact 60 cm even when length 50 is listed first or second", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "ŠIRINA: 60 CM\nDOLŽINA: 50 CM\nVIŠINA: 16 CM",
      })
    ).toBe("supported");
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack:
          "Nerjavno Pomivalno Korito A Line 600x500 MATERIAL NERJAVNO JEKLO ŠIRINA 60 CM DOLŽINA 50 CM VIŠINA 16 CM 124.99 EUR",
      })
    ).toBe("supported");
  });

  it("explicit Breite 600 mm satisfies exact 60 cm", () => {
    const html = `<html><body><p>Breite: 600 mm</p></body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /breite/i.test(s.label) && /600/.test(s.value))).toBe(true);
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: specs.map((s) => s.text).join("\n"),
      })
    ).toBe("supported");
  });

  it("ambiguous 600 x 500 alone does not prove width", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "nerjavno korito 600 x 500 mm",
      })
    ).toBe("unsupported");
  });

  it("explicit width 60 plus ambiguous 600 x 500 is not contradictory", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "ŠIRINA: 60 CM A Line 600x500",
      })
    ).toBe("supported");
    expect(
      classifyClaimAgainstEvidence({
        claim: "exactly 60cm wide",
        haystack: "WIDTH: 60 cm overall 600 x 500 mm",
        requestedItem: REQUEST,
      })
    ).toBe("supported");
  });

  it("explicit width 50 against required 60 is contradictory", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "pomivalno korito ŠIRINA: 50 CM nerjavno",
      })
    ).toBe("contradicted");
  });

  it("height and depth labels cannot satisfy width", () => {
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "VIŠINA: 60 CM GLOBINA: 40 CM",
      })
    ).toBe("unsupported");
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: "DOLŽINA: 60 CM",
      })
    ).toBe("unsupported");
  });

  it("generic HTML spec table preserves ŠIRINA 60 CM", () => {
    const html = `<html><body>
      <table class="additional-attributes">
        <tr><th>MATERIAL</th><td>NERJAVNO JEKLO</td></tr>
        <tr><th>DOLŽINA</th><td>50 CM</td></tr>
        <tr><th>ŠIRINA</th><td>60 CM</td></tr>
        <tr><th>VIŠINA</th><td>16 CM</td></tr>
      </table>
    </body></html>`;
    const specs = extractLabeledHtmlSpecs(html);
    expect(specs.some((s) => /širina/i.test(s.label) && /60/i.test(s.value))).toBe(true);
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: specs.map((s) => s.text).join("\n"),
      })
    ).toBe("supported");
  });

  it("OBI-style labeled product page still parses name, price, material, color, dimensions", () => {
    const html = `<html><head><title>CMI Držalo za brisače S 100 krom 60 cm</title></head><body>
      <h1>CMI Držalo za brisače S 100 krom 60 cm</h1>
      <span itemprop="price" content="28.99">28,99 €</span>
      <meta property="product:price:amount" content="28.99" />
      <meta property="product:price:currency" content="EUR" />
      <dl>
        <dt>Material</dt><dd>Kovina</dd>
        <dt>Barva</dt><dd>Krom</dd>
        <dt>Višina izdelka (v mm)</dt><dd>71 mm</dd>
        <dt>Širina izdelka (v mm)</dt><dd>600 mm</dd>
        <dt>Globina izdelka (v mm)</dt><dd>68 mm</dd>
      </dl>
    </body></html>`;
    const ev = acquireMerchantEvidenceFromHtml(html, "https://shop.example/p/holder-60");
    expect(ev.productName).toMatch(/držalo za brisače/i);
    expect(ev.price).toBe(28.99);
    expect(ev.labeledSpecs.some((s) => s.field === "material" && /kovina/i.test(s.value))).toBe(true);
    expect(ev.labeledSpecs.some((s) => s.field === "color" && /krom/i.test(s.value))).toBe(true);
    expect(ev.labeledSpecs.some((s) => /širina/i.test(s.label) && /600/.test(s.value))).toBe(true);
    expect(ev.labeledSpecs.some((s) => /višina/i.test(s.label) && /71/.test(s.value))).toBe(true);
    expect(
      classifyExactDimensionAgainstEvidence({
        valueCm: "60",
        haystack: ev.labeledSpecs.map((s) => s.text).join("\n"),
      })
    ).toBe("supported");
  });

  it("does not introduce retailer-specific branches", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const evidence = readFileSync(join(process.cwd(), "lib/productDiscovery/productEvidence.ts"), "utf8");
    const merchant = readFileSync(join(process.cwd(), "lib/productDiscovery/merchantEvidence.ts"), "utf8");
    expect(evidence).not.toMatch(/merkur|lesnina|obi\.si/i);
    expect(merchant).not.toMatch(/merkur|lesnina|obi\.si/i);
  });
});
