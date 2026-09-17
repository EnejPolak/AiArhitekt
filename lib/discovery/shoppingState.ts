import { unmatchedRequirementDisplayLabel } from "./requirementLabels";
import type { UnmatchedRequirement } from "./itemSpecs";
import type { ProductDiscoveryView, ProductSelectionView } from "./types";

/**
 * Shopping-list / final-report inclusion:
 * - Found products = every persisted `project_product_selections` row.
 *   Discovery stores one chosen product per searched requirement. That row is
 *   the shopping-list item. `isConfirmed` is the existing "Use in design"
 *   render flag and is NOT a second shopping-list confirmation system.
 * - Missing requirements = unmatched rows with `no_valid_product` or
 *   `search_interrupted`.
 * - `not_searched` stays a separate limit note, not a fabricated product.
 */
export const SHOPPING_MISSING_REASONS = new Set<UnmatchedRequirement["reason"]>([
  "no_valid_product",
  "search_interrupted",
]);

export type MissingShoppingRequirement = {
  requirementKey: string;
  requirementType: UnmatchedRequirement["requirementType"];
  itemSpec: string;
  label: string;
  reason: UnmatchedRequirement["reason"];
};

export type ProjectProductShoppingState = {
  hasDiscovery: boolean;
  foundSelections: ProductSelectionView[];
  missingRequirements: MissingShoppingRequirement[];
  notSearchedCount: number;
  pricedCount: number;
  unpricedCount: number;
  knownProductTotal: number | null;
  knownProductTotalIsPartial: boolean;
  allNotFound: boolean;
};

export function formatVerifiedProductPrice(
  price: number | null,
  currency: "EUR" | null
): string {
  if (price == null || !Number.isFinite(price)) return "Price unavailable";
  try {
    return new Intl.NumberFormat("sl-SI", {
      style: "currency",
      currency: currency ?? "EUR",
      minimumFractionDigits: 2,
    }).format(price);
  } catch {
    return "Price unavailable";
  }
}

export function toProjectProductShoppingState(
  discovery: ProductDiscoveryView | null,
  selections: ProductSelectionView[]
): ProjectProductShoppingState {
  const foundSelections = discovery ? selections : [];
  const unmatched = discovery?.unmatchedRequirements ?? [];
  const missingRequirements = unmatched
    .filter((item) => SHOPPING_MISSING_REASONS.has(item.reason))
    .map((item) => ({
      requirementKey: item.requirementKey,
      requirementType: item.requirementType,
      itemSpec: item.itemSpec,
      label: unmatchedRequirementDisplayLabel(item),
      reason: item.reason,
    }));
  const notSearchedCount = unmatched.filter((item) => item.reason === "not_searched").length;

  let knownProductTotal = 0;
  let pricedCount = 0;
  let unpricedCount = 0;
  for (const selection of foundSelections) {
    if (selection.price != null && Number.isFinite(selection.price)) {
      knownProductTotal += selection.price;
      pricedCount += 1;
    } else {
      unpricedCount += 1;
    }
  }

  return {
    hasDiscovery: Boolean(discovery),
    foundSelections,
    missingRequirements,
    notSearchedCount,
    pricedCount,
    unpricedCount,
    knownProductTotal: pricedCount > 0 ? knownProductTotal : null,
    knownProductTotalIsPartial: pricedCount > 0 && unpricedCount > 0,
    allNotFound: Boolean(discovery) && foundSelections.length === 0,
  };
}
