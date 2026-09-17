import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "merchantHtml");

export const MERCHANT_HTML_FIXTURE_IDS = [
  "A-jsonld-product-offer",
  "B-graph-product",
  "C-aggregate-offer",
  "D-metadata-only-price",
  "E-html-spec-table",
  "F-dl-dt-dd",
  "G-labeled-width",
  "H-ambiguous-dimensions",
  "I-material",
  "J-color",
  "K-material-appearance",
  "L-sale-old-price",
  "M-financing",
  "N-shipping",
  "O-multiple-products",
  "P-malformed-jsonld",
  "Q-no-product-evidence",
] as const;

export type MerchantHtmlFixtureId = (typeof MERCHANT_HTML_FIXTURE_IDS)[number];

export function loadMerchantHtmlFixture(id: MerchantHtmlFixtureId | string): string {
  return readFileSync(join(DIR, `${id}.html`), "utf8");
}
