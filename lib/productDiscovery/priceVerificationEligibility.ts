import type { AcceptanceResult, AcceptanceSource } from "./acceptancePolicy";
import { extractMaxPriceEur, usesExactLanguage } from "./matchPolicy";
import {
  ACCEPTANCE_PRIMARY_MIN_COVERAGE,
  ACCEPTANCE_PRIMARY_MIN_SCORE,
  ACCEPTANCE_RESCUE_MIN_COVERAGE,
  ACCEPTANCE_RESCUE_MIN_SCORE,
} from "./constants";
import { domainAllowed } from "./domains";
import { parseRequestedRequirements, requirementStatus } from "./requirementAnalysis";
import { isProductUrlEvidenceBacked } from "./sources";
import type { ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export function shouldAttemptPriceVerification(input: {
  requestedItem: string;
  source: AcceptanceSource;
  finalized: AcceptanceResult & { product: ProductDiscoveryProduct };
  allowlistDomains: string[];
  sources: ProductDiscoverySource[];
}): boolean {
  if (input.finalized.reason !== "budget_unverified") return false;
  if (extractMaxPriceEur(input.requestedItem) == null) return false;

  const product = input.finalized.product;
  if (!product?.productUrl?.trim()) return false;
  if (!domainAllowed(product.productUrl, input.allowlistDomains)) return false;
  if (!isProductUrlEvidenceBacked(product.productUrl, input.sources)) return false;
  if (!input.finalized.categoryVerified) return false;
  if (input.finalized.lists.unmetRequirements.length > 0) return false;

  const minScore =
    input.source === "rescue" ? ACCEPTANCE_RESCUE_MIN_SCORE : ACCEPTANCE_PRIMARY_MIN_SCORE;
  const minCoverage =
    input.source === "rescue" ? ACCEPTANCE_RESCUE_MIN_COVERAGE : ACCEPTANCE_PRIMARY_MIN_COVERAGE;

  if (input.finalized.matchScore < minScore) return false;
  if (input.finalized.requirementCoverage < minCoverage) return false;

  if (usesExactLanguage(input.requestedItem)) {
    const exactDimension = parseRequestedRequirements(input.requestedItem).find(
      (req) => req.id.startsWith("dimension:") && req.hard
    );
    if (exactDimension && requirementStatus(exactDimension, input.finalized.lists) !== "confirmed") {
      return false;
    }
  }

  return true;
}
