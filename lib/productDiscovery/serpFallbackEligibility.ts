import {
  evaluateAcceptance,
  type AcceptanceReason,
  type AcceptanceSource,
} from "./acceptancePolicy";
import {
  ACCEPTANCE_PRIMARY_MIN_COVERAGE,
  ACCEPTANCE_PRIMARY_MIN_SCORE,
  ACCEPTANCE_RESCUE_MIN_COVERAGE,
  ACCEPTANCE_RESCUE_MIN_SCORE,
} from "./constants";
import { extractMaxPriceEur, usesExactLanguage } from "./matchPolicy";
import { parseRequestedRequirements, requirementStatus } from "./requirementAnalysis";
import type { InitialFailureReason } from "./rescue";
import type { ProductDiscoveryDiagnostics } from "./types";

const NEVER_ELIGIBLE_ACCEPTANCE = new Set<AcceptanceReason>([
  "hard_constraint_unmet",
  "identity_requirement_unverified",
  "impossible_request_unmet",
  "category_unverified",
]);

const DISCOVERY_MISS_ACCEPTANCE = new Set<AcceptanceReason>([
  "insufficient_evidence",
  "score_too_low",
  "too_many_unknowns",
]);

const DISCOVERY_MISS_INITIAL = new Set<InitialFailureReason>([
  "model_not_found",
  "url_not_in_sources",
  "domain_not_allowed",
]);

export type SerpFallbackEligibilityInput = {
  requestedItem: string;
  status: "found" | "not_found" | "no_retailers" | "error";
  diagnostics?: ProductDiscoveryDiagnostics;
};

function rescueLikeSource(source: AcceptanceSource | null | undefined): boolean {
  return source === "rescue" || source === "serp_fallback";
}

function isStrongCandidateMissingPriceOnly(input: {
  requestedItem: string;
  source: AcceptanceSource;
  diagnostics: ProductDiscoveryDiagnostics;
}): boolean {
  const product = input.diagnostics.rejectedProduct;
  if (!product) return false;
  if (extractMaxPriceEur(input.requestedItem) == null) return false;

  const evaluated = evaluateAcceptance({
    source: input.source,
    requestedItem: input.requestedItem,
    product,
  });
  if (evaluated.reason !== "budget_unverified") return false;
  if (!evaluated.categoryVerified) return false;
  if (evaluated.lists.unmetRequirements.length > 0) return false;

  const minScore = rescueLikeSource(input.source)
    ? ACCEPTANCE_RESCUE_MIN_SCORE
    : ACCEPTANCE_PRIMARY_MIN_SCORE;
  const minCoverage = rescueLikeSource(input.source)
    ? ACCEPTANCE_RESCUE_MIN_COVERAGE
    : ACCEPTANCE_PRIMARY_MIN_COVERAGE;

  if (evaluated.matchScore < minScore) return false;
  if (evaluated.requirementCoverage < minCoverage) return false;

  if (usesExactLanguage(input.requestedItem)) {
    const exactDimension = parseRequestedRequirements(input.requestedItem).find(
      (req) => req.id.startsWith("dimension:") && req.hard
    );
    if (exactDimension && requirementStatus(exactDimension, evaluated.lists) !== "confirmed") {
      return false;
    }
  }

  return true;
}

export function shouldUseSerpFallback(input: SerpFallbackEligibilityInput): {
  eligible: boolean;
  reason: string | null;
} {
  if (input.status !== "not_found") {
    return { eligible: false, reason: "status_not_not_found" };
  }

  const diagnostics = input.diagnostics;
  const acceptanceReason = diagnostics?.acceptanceReason as AcceptanceReason | null | undefined;
  const initialFailureReason = diagnostics?.initialFailureReason;

  if (acceptanceReason && NEVER_ELIGIBLE_ACCEPTANCE.has(acceptanceReason)) {
    return { eligible: false, reason: `acceptance_${acceptanceReason}` };
  }

  if (acceptanceReason === "budget_unverified" && diagnostics) {
    const source = (diagnostics.acceptanceSource ?? "primary") as AcceptanceSource;
    if (isStrongCandidateMissingPriceOnly({ requestedItem: input.requestedItem, source, diagnostics })) {
      return { eligible: true, reason: "acceptance_budget_unverified_strong_candidate" };
    }
    return { eligible: false, reason: "acceptance_budget_unverified_weak_candidate" };
  }

  if (initialFailureReason && DISCOVERY_MISS_INITIAL.has(initialFailureReason)) {
    return { eligible: true, reason: `initial_${initialFailureReason}` };
  }

  if (acceptanceReason && DISCOVERY_MISS_ACCEPTANCE.has(acceptanceReason)) {
    return { eligible: true, reason: `acceptance_${acceptanceReason}` };
  }

  if (!acceptanceReason && diagnostics?.primaryStatus === "not_found") {
    return { eligible: true, reason: "primary_search_miss" };
  }

  if (!acceptanceReason) {
    return { eligible: true, reason: "search_miss" };
  }

  return { eligible: false, reason: `not_eligible_${acceptanceReason}` };
}

export function openAiFinalFailureReason(
  diagnostics?: ProductDiscoveryDiagnostics
): string | null {
  if (!diagnostics) return null;
  return (
    diagnostics.acceptanceReason ??
    diagnostics.initialFailureReason ??
    diagnostics.targetedFailureReasonBeforeSearch ??
    null
  );
}
