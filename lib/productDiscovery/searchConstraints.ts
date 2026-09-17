/**
 * Normalized hard-constraint representation for search discovery.
 * Acceptance / evidence semantics remain unchanged — this is discovery-only.
 */
import {
  extractMaxPriceEur,
  usesApproximateLanguage,
  usesExactLanguage,
} from "./matchPolicy";
import { parseRequestedRequirements } from "./requirementAnalysis";
import { parseProductIdentity } from "./productIdentity";

export type DimensionAxis = "width" | "height" | "depth" | "diameter" | "size" | "unknown";
export type DimensionMode = "exact" | "approx";

export type SearchDimensionConstraint = {
  axis: DimensionAxis;
  mode: DimensionMode;
  valueMm: number;
  /** Discovery tolerance only; acceptance still uses existing exact/approx rules. */
  toleranceMm: number;
  /** Category-aware labeled search terms (product width — not cabinet niche). */
  productLabels: string[];
};

export type SearchConstraints = {
  category: string | null;
  categoryTokens: string[];
  dimensions: SearchDimensionConstraint[];
  materialsRequired: string[];
  colorFinish: string[];
  softStyles: string[];
  priceMaxEur: number | null;
  exactDimensions: boolean;
  approximateDimensions: boolean;
};

const SOFT_STYLES = /\b(modern|minimalist|scandinavian|decorative|industrial|rustic|classic|contemporary|vintage)\b/gi;

function toMm(value: number, unit: string): number {
  if (unit === "mm") return Math.round(value);
  if (unit === "cm") return Math.round(value * 10);
  if (unit === "m") return Math.round(value * 1000);
  return Math.round(value);
}

function inferAxis(requestedItem: string, category: string | null): DimensionAxis {
  const t = requestedItem.toLowerCase();
  if (/\b(diameter|premer|ø|shade)\b/i.test(t)) return "diameter";
  if (/\b(height|visina|višina|tall)\b/i.test(t)) return "height";
  if (/\b(depth|globina|deep)\b/i.test(t)) return "depth";
  if (/\b(width|wide|širina|sirina|breite)\b/i.test(t)) return "width";
  if (category?.includes("sink") || category?.includes("cabinet") || category?.includes("table")) {
    return "width";
  }
  if (category?.includes("lamp") || category?.includes("pendant") || category?.includes("vase")) {
    return "diameter";
  }
  if (category?.includes("rug")) return "size";
  return "unknown";
}

function productLabelsFor(axis: DimensionAxis, category: string | null): string[] {
  const labels: string[] = [];
  if (axis === "width" || axis === "unknown") {
    labels.push("širina", "width", "breite");
    if (category?.includes("sink")) labels.push("širina izdelka");
  }
  if (axis === "diameter" || (axis === "unknown" && category?.includes("lamp"))) {
    labels.push("premer", "diameter", "durchmesser");
  }
  if (axis === "height") labels.push("višina", "height", "höhe");
  if (axis === "depth") labels.push("globina", "depth", "tiefe");
  if (axis === "size") labels.push("mere", "dimenzije", "size");
  return [...new Set(labels)];
}

function materialSearchTokens(raw: string): string[] {
  const m = raw.toLowerCase();
  const out: string[] = [m];
  if (/stainless|steel|inox/.test(m)) {
    out.push("nerjavno jeklo", "inox", "stainless steel");
  }
  if (/ceramic|keramik/.test(m)) out.push("keramika", "ceramic");
  if (/oak|hrast/.test(m)) out.push("hrast", "oak");
  if (/metal|kovin/.test(m)) out.push("kovina", "metal");
  return [...new Set(out)];
}

function categorySearchTokens(
  category: string | null,
  identityCore: string,
  requestedItem: string
): string[] {
  const tokens: string[] = [];
  const raw = requestedItem.toLowerCase();
  if (/\bfloor\s+lamp\b/.test(raw)) {
    tokens.push("floor lamp");
    if (identityCore && !/flooring/i.test(identityCore)) tokens.push(identityCore);
    return [...new Set(tokens.filter(Boolean))];
  }
  if (category) tokens.push(category);
  if (identityCore) tokens.push(identityCore);
  const c = (category ?? identityCore).toLowerCase();
  if (/\bpendant\b/.test(c) || /\bpendant\b/.test(raw)) {
    tokens.push("viseča svetilka", "visilka", "pendant lamp");
  }
  if (/kitchen\s*sink|sink/.test(c)) tokens.push("pomivalno korito", "kuhinjsko korito", "kitchen sink");
  if (/vase/.test(c) || /\bvase\b/.test(raw)) tokens.push("vaza", "keramična vaza", "ceramic vase");
  if (/towel|radiator/.test(c)) {
    tokens.push("radiator za brisače", "kopalniški radiator", "heated towel rail");
  }
  return [...new Set(tokens.filter(Boolean))];
}

/**
 * Build discovery-oriented constraints from the raw request string.
 * Does not change acceptance thresholds or evidence rules.
 */
export function buildSearchConstraints(requestedItem: string): SearchConstraints {
  const identity = parseProductIdentity(requestedItem);
  const parsed = parseRequestedRequirements(requestedItem);
  const exact = usesExactLanguage(requestedItem);
  const approx = usesApproximateLanguage(requestedItem);
  const category =
    parsed.find((r) => r.id.startsWith("category:"))?.label ??
    identity.coreCategory ??
    null;

  const dimensions: SearchDimensionConstraint[] = [];
  for (const match of requestedItem.matchAll(/\b(\d+(?:[.,]\d+)?)\s*(cm|mm|m)\b/gi)) {
    const raw = Number.parseFloat((match[1] ?? "").replace(",", "."));
    const unit = (match[2] ?? "cm").toLowerCase();
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const valueMm = toMm(raw, unit);
    const axis = inferAxis(requestedItem, category);
    const mode: DimensionMode = exact ? "exact" : approx ? "approx" : "approx";
    const toleranceMm =
      mode === "exact" ? 0 : Math.max(20, Math.round(valueMm * 0.125)); // ~±5cm at 40cm
    dimensions.push({
      axis,
      mode: exact ? "exact" : "approx",
      valueMm,
      toleranceMm,
      productLabels: productLabelsFor(axis, category),
    });
  }

  const materialsRequired = parsed
    .filter((r) => r.id.startsWith("material:") && r.hard)
    .flatMap((r) => materialSearchTokens(r.label));

  const colorFinish = parsed
    .filter((r) => r.id.startsWith("color:"))
    .map((r) => r.label.toLowerCase());

  const softStyles = [...requestedItem.matchAll(SOFT_STYLES)].map((m) => m[0]!.toLowerCase());

  return {
    category,
    categoryTokens: categorySearchTokens(category, identity.coreCategory ?? "", requestedItem),
    dimensions,
    materialsRequired: [...new Set(materialsRequired)],
    colorFinish: [...new Set(colorFinish)],
    softStyles: [...new Set(softStyles)],
    priceMaxEur: extractMaxPriceEur(requestedItem),
    exactDimensions: exact,
    approximateDimensions: approx && !exact,
  };
}

/** Compact policy blob for prompts / diagnostics (discovery only). */
export function searchConstraintsToPolicy(constraints: SearchConstraints): Record<string, unknown> {
  return {
    category: constraints.category,
    exactDimensions: constraints.exactDimensions,
    approximateDimensions: constraints.approximateDimensions,
    priceMaxEur: constraints.priceMaxEur,
    materialsRequired: constraints.materialsRequired,
    dimensions: constraints.dimensions.map((d) => ({
      axis: d.axis,
      mode: d.mode,
      valueMm: d.valueMm,
      toleranceMm: d.toleranceMm,
      productLabels: d.productLabels,
    })),
    softStylesMayOmitFromSearch: constraints.softStyles,
    note: "Discovery hints only. Merchant evidence remains authoritative for acceptance.",
  };
}
