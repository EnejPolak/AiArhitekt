import { unmatchedRequirementDisplayLabel } from "./requirementLabels";
import type { UnmatchedRequirement } from "./itemSpecs";
import type { ProductDiscoveryView, ProductSelectionView } from "./types";

/**
 * Shopping-list / final-report inclusion:
 * - Found products = persisted READY selections. Unavailable FOUND-but-unrenderable
 *   rows are not shopping-list items.
 * - Missing requirements = unmatched `no_valid_product` / `search_interrupted` /
 *   `not_searched`, plus unavailable selections that never became RENDER_READY.
 * - `not_searched` also keeps a separate limit note. `user_removed` is excluded.
 */
export const SHOPPING_MISSING_REASONS = new Set<UnmatchedRequirement["reason"]>([
  "no_valid_product",
  "search_interrupted",
  "not_searched",
]);
export const SHOPPING_RETRYABLE_REASONS = new Set<UnmatchedRequirement["reason"]>([
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
  const foundSelections = discovery
    ? selections.filter((item) => item.referenceStatus !== "unavailable")
    : [];
  const unmatched = discovery?.unmatchedRequirements ?? [];
  const missingRequirements = [
    ...unmatched
      .filter((item) => SHOPPING_MISSING_REASONS.has(item.reason))
      .map((item) => ({
        requirementKey: item.requirementKey,
        requirementType: item.requirementType,
        itemSpec: item.itemSpec,
        label: unmatchedRequirementDisplayLabel(item),
        reason: item.reason,
      })),
    ...selections
      .filter((item) => item.referenceStatus === "unavailable")
      .map((item) => ({
        requirementKey: item.requirementKey,
        requirementType: item.requirementType,
        itemSpec: item.itemSpec,
        label: item.productTitle,
        reason: "no_valid_product" as const,
      })),
  ];
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
