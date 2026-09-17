/**
 * Deterministic hard-constraint-aware search query variants (discovery only).
 * Snippets/queries never become acceptance evidence.
 */
import type { SearchConstraints, SearchDimensionConstraint } from "./searchConstraints";
import { buildSearchConstraints } from "./searchConstraints";

export type SearchQueryIntent =
  | "exact_spec"
  | "localized_spec"
  | "category_phrase"
  | "merchant_targeted"
  | "broader_rescue";

export type SearchQueryVariant = {
  query: string;
  intent: SearchQueryIntent;
  /** Lower = higher priority for discovery. */
  priority: number;
};

const MAX_PRIMARY_VARIANTS = 5;
const MAX_RESCUE_VARIANTS = 2;

function normalizeQueryKey(query: string): string {
  return query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function mmToCm(mm: number): number {
  return Math.round(mm) % 10 === 0 ? mm / 10 : Math.round((mm / 10) * 10) / 10;
}

function dimTokens(dim: SearchDimensionConstraint): string[] {
  const cm = mmToCm(dim.valueMm);
  const mm = dim.valueMm;
  const tokens = [`${mm} mm`, `${cm} cm`];
  if (dim.mode === "approx") {
    const near = [dim.valueMm - dim.toleranceMm, dim.valueMm + dim.toleranceMm]
      .map((v) => Math.max(10, Math.round(v / 10) * 10))
      .filter((v) => v !== dim.valueMm);
    for (const n of near.slice(0, 2)) {
      tokens.push(`${mmToCm(n)} cm`);
    }
  }
  return [...new Set(tokens)];
}

function primaryCategoryPhrase(constraints: SearchConstraints): string {
  return (
    constraints.categoryTokens.find((t) => /korito|svetilka|vaza|radiator|sink|lamp|vase/i.test(t)) ??
    constraints.categoryTokens[0] ??
    "izdelek"
  );
}

function materialPhrase(constraints: SearchConstraints): string {
  if (constraints.materialsRequired.length === 0) return "";
  // Prefer localized merchant material terms when available.
  const preferred =
    constraints.materialsRequired.find((m) => /nerjavno|inox|keramik|hrast|kovina/i.test(m)) ??
    constraints.materialsRequired[0]!;
  return preferred;
}

function colorPhrase(constraints: SearchConstraints): string {
  const c = constraints.colorFinish[0];
  if (!c) return "";
  if (c === "black") return "črna";
  if (c === "white") return "bela";
  if (c === "chrome") return "krom";
  return c;
}

function labeledDimPhrase(dim: SearchDimensionConstraint, label: string, unit: "mm" | "cm"): string {
  const value = unit === "mm" ? `${dim.valueMm} mm` : `${mmToCm(dim.valueMm)} cm`;
  return `${label} ${value}`;
}

/**
 * Build a small set of meaningfully different discovery queries.
 * Soft style words are omitted so they cannot crowd out hard constraints.
 */
export function buildSearchQueryVariants(
  requestedItemOrConstraints: string | SearchConstraints,
  options?: {
    includeRescue?: boolean;
    allowlistDomains?: string[];
    maxVariants?: number;
  }
): SearchQueryVariant[] {
  const constraints =
    typeof requestedItemOrConstraints === "string"
      ? buildSearchConstraints(requestedItemOrConstraints)
      : requestedItemOrConstraints;

  const includeRescue = options?.includeRescue ?? false;
  const maxVariants = options?.maxVariants ?? MAX_PRIMARY_VARIANTS;
  const category = primaryCategoryPhrase(constraints);
  const material = materialPhrase(constraints);
  const color = colorPhrase(constraints);
  const dim = constraints.dimensions[0] ?? null;
  const budget =
    constraints.priceMaxEur != null ? `do ${constraints.priceMaxEur} €` : "";

  const draft: SearchQueryVariant[] = [];

  // A. Natural-language / category + hard constraints
  {
    const parts = [category, material, color].filter(Boolean);
    if (dim) parts.push(dimTokens(dim)[1] ?? dimTokens(dim)[0]!); // prefer cm form
    if (budget && constraints.exactDimensions) parts.push(budget);
    draft.push({
      query: parts.join(" ").replace(/\s+/g, " ").trim(),
      intent: "category_phrase",
      priority: 2,
    });
  }

  // B. Exact / labeled spec (highest priority when exact)
  if (dim) {
    const label = dim.productLabels[0] ?? "širina";
    const mmPhrase = labeledDimPhrase(dim, label, "mm");
    const cmPhrase = labeledDimPhrase(dim, label, "cm");
    draft.push({
      query: [category, material, `"${cmPhrase}"`].filter(Boolean).join(" "),
      intent: constraints.exactDimensions ? "exact_spec" : "localized_spec",
      priority: constraints.exactDimensions ? 0 : 1,
    });
    draft.push({
      query: [category, material, `"${mmPhrase}"`].filter(Boolean).join(" "),
      intent: constraints.exactDimensions ? "exact_spec" : "localized_spec",
      priority: constraints.exactDimensions ? 1 : 2,
    });

    // Alternate localized width/diameter label
    const altLabel = dim.productLabels[1] ?? (dim.axis === "diameter" ? "diameter" : "width");
    if (altLabel !== label) {
      draft.push({
        query: [category, material, `"${labeledDimPhrase(dim, altLabel, "mm")}"`]
          .filter(Boolean)
          .join(" "),
        intent: "localized_spec",
        priority: 2,
      });
    }

    // Approx: one near-size variant (bounded)
    if (dim.mode === "approx") {
      const nearCm = mmToCm(dim.valueMm + Math.min(dim.toleranceMm, 50));
      draft.push({
        query: [category, material, color, `${nearCm} cm`].filter(Boolean).join(" "),
        intent: "localized_spec",
        priority: 3,
      });
    }
  } else {
    draft.push({
      query: [category, material, color, budget].filter(Boolean).join(" "),
      intent: "category_phrase",
      priority: 1,
    });
  }

  // C. Merchant-targeted (one enrichable domain hint when allowlist present)
  const domains = (options?.allowlistDomains ?? []).filter(
    (d) => d && !/bauhaus|xxxlesnina/i.test(d)
  );
  if (domains[0] && dim) {
    const label = dim.productLabels[0] ?? "širina";
    draft.push({
      query: `site:${domains[0]} ${category} "${labeledDimPhrase(dim, label, "mm")}"`,
      intent: "merchant_targeted",
      priority: 4,
    });
  }

  // D. Bounded rescue variants
  if (includeRescue) {
    draft.push({
      query: [category, material, dim ? `${mmToCm(dim.valueMm)} cm` : null, budget]
        .filter(Boolean)
        .join(" "),
      intent: "broader_rescue",
      priority: 5,
    });
    if (dim) {
      draft.push({
        query: [category, `"${dim.productLabels[0] ?? "širina"}: ${mmToCm(dim.valueMm)} cm"`]
          .filter(Boolean)
          .join(" "),
        intent: "broader_rescue",
        priority: 6,
      });
    }
  }

  // Deduplicate semantically equivalent queries; keep best priority.
  const byKey = new Map<string, SearchQueryVariant>();
  for (const variant of draft) {
    const key = normalizeQueryKey(variant.query);
    if (!key || key.length < 4) continue;
    // Reject cabinet/niche terminology crowding product-width queries.
    if (/\bomaric|cabinet\s+width|minimalna\s+širina/i.test(variant.query)) continue;
    const existing = byKey.get(key);
    if (!existing || variant.priority < existing.priority) byKey.set(key, variant);
  }

  const sorted = [...byKey.values()].sort((a, b) => a.priority - b.priority || a.query.localeCompare(b.query));
  const primary = sorted.filter((v) => v.intent !== "broader_rescue").slice(0, maxVariants);
  if (!includeRescue) return primary;
  const rescue = sorted.filter((v) => v.intent === "broader_rescue").slice(0, MAX_RESCUE_VARIANTS);
  return [...primary, ...rescue].slice(0, maxVariants + MAX_RESCUE_VARIANTS);
}

export function summarizeQueryVariantStats(variants: SearchQueryVariant[]): {
  total: number;
  exactSpec: number;
  localizedSpec: number;
  categoryPhrase: number;
  merchantTargeted: number;
  rescue: number;
} {
  return {
    total: variants.length,
    exactSpec: variants.filter((v) => v.intent === "exact_spec").length,
    localizedSpec: variants.filter((v) => v.intent === "localized_spec").length,
    categoryPhrase: variants.filter((v) => v.intent === "category_phrase").length,
    merchantTargeted: variants.filter((v) => v.intent === "merchant_targeted").length,
    rescue: variants.filter((v) => v.intent === "broader_rescue").length,
  };
}
