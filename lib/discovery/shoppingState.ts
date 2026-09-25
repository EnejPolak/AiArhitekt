import { selectionHasUsableExactProductImage } from "@/lib/references/imageEvidence";
import { unmatchedRequirementDisplayLabel } from "./requirementLabels";
import { selectionConflictsRequirementCategory } from "./requirementCategory";
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
  "not_searched",
]);

export type MissingShoppingRequirement = {
  requirementKey: string;
  requirementType: UnmatchedRequirement["requirementType"];
  itemSpec: string;
  label: string;
  reason: UnmatchedRequirement["reason"];
  /** True when a prior selection must be unlocked before another product can be found. */
  replaceable: boolean;
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

/** Persisted selection that cannot satisfy RENDER_READY / category for its requirement. */
export function isUnusablePersistedSelection(selection: ProductSelectionView): boolean {
  if (selection.referenceStatus === "unavailable") return true;
  if (selectionConflictsRequirementCategory(selection)) return true;
  if (
    selection.referenceStatus === "ready" &&
    !selectionHasUsableExactProductImage(selection)
  ) {
    return true;
  }
  return false;
}

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
  const categoryConflict = discovery
    ? selections.filter((item) => selectionConflictsRequirementCategory(item))
    : [];
  const unusableReady = discovery
    ? selections.filter(
        (item) =>
          item.referenceStatus === "ready" &&
          !selectionHasUsableExactProductImage(item) &&
          !selectionConflictsRequirementCategory(item)
      )
    : [];
  const foundSelections = discovery
    ? selections.filter(
        (item) =>
          item.referenceStatus !== "unavailable" &&
          !selectionConflictsRequirementCategory(item) &&
          !(item.referenceStatus === "ready" && !selectionHasUsableExactProductImage(item))
      )
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
        replaceable: false,
      })),
    ...selections
      .filter((item) => item.referenceStatus === "unavailable")
      .map((item) => ({
        requirementKey: item.requirementKey,
        requirementType: item.requirementType,
        itemSpec: item.itemSpec,
        label: item.productTitle,
        reason: "no_valid_product" as const,
        replaceable: true,
      })),
    ...unusableReady.map((item) => ({
      requirementKey: item.requirementKey,
      requirementType: item.requirementType,
      itemSpec: item.itemSpec,
      label: item.productTitle,
      reason: "no_valid_product" as const,
      replaceable: true,
    })),
    ...categoryConflict.map((item) => ({
      requirementKey: item.requirementKey,
      requirementType: item.requirementType,
      itemSpec: item.itemSpec,
      label: item.productTitle,
      reason: "no_valid_product" as const,
      replaceable: true,
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
