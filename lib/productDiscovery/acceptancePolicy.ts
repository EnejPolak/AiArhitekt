import {
  extractMaxPriceEur,
  normalizeMatchScore,
  normalizeRequirementLists,
  type RequirementLists,
} from "./matchPolicy";
import {
  ACCEPTANCE_PRIMARY_MIN_COVERAGE,
  ACCEPTANCE_PRIMARY_MIN_SCORE,
  ACCEPTANCE_RESCUE_MIN_COVERAGE,
  ACCEPTANCE_RESCUE_MIN_SCORE,
} from "./constants";
import {
  computeRequirementCoverage,
  countCriticalUnknowns,
  isCategoryVerified,
  isImpossibleRequest,
  parseRequestedRequirements,
  requirementStatus,
} from "./requirementAnalysis";
import { usesExactLanguage } from "./matchPolicy";
import { downgradeUnsupportedDistinctiveClaims, parseDistinctiveRequirements } from "./distinctiveRequirements";
import { categoryEvidenceHaystack, verifyIdentityRequirements } from "./productIdentity";
import { classifyClaimAgainstEvidence } from "./productEvidence";
import type { PriceEvidence, ProductDiscoveryProduct } from "./types";

export type AcceptanceSource = "primary" | "rescue" | "targeted" | "serp_fallback";

function rescueLikeSource(source: AcceptanceSource): boolean {
  return source === "rescue" || source === "serp_fallback";
}

export type AcceptanceReason =
  | "accepted"
  | "score_too_low"
  | "hard_constraint_unmet"
  | "too_many_unknowns"
  | "budget_unverified"
  | "insufficient_evidence"
  | "category_unverified"
  | "identity_requirement_unverified"
  | "impossible_request_unmet";

export type AcceptanceInput = {
  source: AcceptanceSource;
  requestedItem: string;
  product: ProductDiscoveryProduct;
  /** Trusted evidence only — never model whyItMatches / model specifications. */
  evidenceText?: string;
};

export type AcceptanceResult = {
  accepted: boolean;
  reason: AcceptanceReason;
  matchScore: number;
  requirementCoverage: number;
  categoryVerified: boolean;
  lists: RequirementLists;
};

/**
 * Trusted factual haystack for acceptance.
 * Intentionally excludes product.whyItMatches and model specifications.
 */
function trustedEvidenceHaystack(input: {
  product: ProductDiscoveryProduct;
  evidenceText?: string;
}): string {
  return (input.evidenceText ?? "").toLowerCase();
}

function claimSupportedByEvidence(
  claim: string,
  haystack: string,
  requestedItem: string,
  dimensionHaystack: string
): boolean {
  return (
    classifyClaimAgainstEvidence({
      claim,
      haystack,
      requestedItem,
      dimensionHaystack,
    }) === "supported"
  );
}

export function validateDeterministicClaims(input: {
  requestedItem: string;
  product: ProductDiscoveryProduct;
  evidenceText?: string;
}): RequirementLists {
  const haystack = trustedEvidenceHaystack(input);
  const dimensionHaystack = haystack;
  let lists: RequirementLists = {
    matchedRequirements: [...input.product.matchedRequirements],
    unmetRequirements: [...input.product.unmetRequirements],
    unknownRequirements: [...input.product.unknownRequirements],
  };

  const downgradedUnknown: string[] = [];
  const downgradedUnmet: string[] = [];

  lists.matchedRequirements = lists.matchedRequirements.filter((claim) => {
    const status = classifyClaimAgainstEvidence({
      claim,
      haystack,
      requestedItem: input.requestedItem,
      dimensionHaystack,
    });
    if (status === "supported") return true;
    if (status === "contradicted") {
      downgradedUnmet.push(`${claim} (contradicted by merchant evidence)`);
      return false;
    }
    downgradedUnknown.push(claim);
    return false;
  });

  for (const claim of downgradedUnmet) {
    if (!lists.unmetRequirements.some((entry) => entry.toLowerCase() === claim.toLowerCase())) {
      lists.unmetRequirements.push(claim);
    }
  }

  for (const claim of downgradedUnknown) {
    if (
      !lists.unknownRequirements.some((entry) => entry.toLowerCase() === claim.toLowerCase()) &&
      !lists.unmetRequirements.some((entry) => entry.toLowerCase() === claim.toLowerCase())
    ) {
      lists.unknownRequirements.push(claim);
    }
  }

  lists = downgradeUnsupportedDistinctiveClaims({
    requestedItem: input.requestedItem,
    lists,
    evidenceHaystack: haystack,
  });

  if (input.product.price == null && extractMaxPriceEur(input.requestedItem) != null) {
    lists.matchedRequirements = lists.matchedRequirements.filter(
      (entry) => !(/max\b/i.test(entry) && /eur|€/i.test(entry))
    );
  }

  return normalizeRequirementLists(input.requestedItem, lists, input.product.price);
}

export function evaluateAcceptance(input: AcceptanceInput): AcceptanceResult {
  const lists = {
    matchedRequirements: input.product.matchedRequirements,
    unmetRequirements: input.product.unmetRequirements,
    unknownRequirements: input.product.unknownRequirements,
  };

  const minScore = rescueLikeSource(input.source)
    ? ACCEPTANCE_RESCUE_MIN_SCORE
    : ACCEPTANCE_PRIMARY_MIN_SCORE;
  const minCoverage = rescueLikeSource(input.source)
    ? ACCEPTANCE_RESCUE_MIN_COVERAGE
    : ACCEPTANCE_PRIMARY_MIN_COVERAGE;

  const requirementCoverage = computeRequirementCoverage(input.requestedItem, lists);
  // Do not feed model product.name / specifications as category evidence.
  // Callers must pass trusted evidenceText (URL/title/snippet/merchant).
  const categoryEvidence = categoryEvidenceHaystack({
    productName: "",
    evidenceText: input.evidenceText,
    specifications: {},
  });
  const categoryVerified = isCategoryVerified(
    input.requestedItem,
    "",
    input.evidenceText,
    {}
  );
  const matchScore = input.product.matchScore;
  const maxPrice = extractMaxPriceEur(input.requestedItem);
  const criticalUnknowns = countCriticalUnknowns(input.requestedItem, lists);
  const impossible = isImpossibleRequest(input.requestedItem);
  const priceEvidence = input.product.priceEvidence ?? "none";
  const onlyBudgetUnknown =
    maxPrice == null &&
    lists.unknownRequirements.length > 0 &&
    lists.unmetRequirements.length === 0 &&
    lists.unknownRequirements.every((entry) => /max\b/i.test(entry) && /eur|€/i.test(entry));

  if (!categoryVerified) {
    return {
      accepted: false,
      reason: "category_unverified",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  const identityCheck = verifyIdentityRequirements({
    requestedItem: input.requestedItem,
    lists,
    evidenceHaystack: categoryEvidence,
  });
  if (!identityCheck.verified) {
    return {
      accepted: false,
      reason: "identity_requirement_unverified",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (maxPrice != null && (input.product.price == null || priceEvidence === "none")) {
    return {
      accepted: false,
      reason: "budget_unverified",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (lists.unmetRequirements.length > 0) {
    return {
      accepted: false,
      reason: "hard_constraint_unmet",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (usesExactLanguage(input.requestedItem)) {
    const exactDimension = parseRequestedRequirements(input.requestedItem).find(
      (req) => req.id.startsWith("dimension:") && req.hard
    );
    if (exactDimension && requirementStatus(exactDimension, lists) !== "confirmed") {
      return {
        accepted: false,
        reason: "insufficient_evidence",
        matchScore,
        requirementCoverage,
        categoryVerified,
        lists,
      };
    }
  }

  if (matchScore < minScore) {
    return {
      accepted: false,
      reason: "score_too_low",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (
    onlyBudgetUnknown &&
    !rescueLikeSource(input.source) &&
    categoryVerified &&
    matchScore >= minScore
  ) {
    return {
      accepted: true,
      reason: "accepted",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  const hardDistinctive = parseDistinctiveRequirements(input.requestedItem).filter((entry) => entry.hard);
  if (hardDistinctive.length > 0) {
    const unresolvedHardDistinctive = hardDistinctive.filter((entry) => {
      const req = {
        id: entry.id,
        label: entry.label,
        weight: entry.weight,
        hard: entry.hard,
        tokens: entry.tokens,
      };
      return requirementStatus(req, lists) !== "confirmed";
    });
    if (unresolvedHardDistinctive.length > 0) {
      return {
        accepted: false,
        reason: "insufficient_evidence",
        matchScore,
        requirementCoverage,
        categoryVerified,
        lists,
      };
    }
  }

  if (requirementCoverage < minCoverage) {
    return {
      accepted: false,
      reason: "insufficient_evidence",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (
    input.source === "rescue" &&
    maxPrice != null &&
    input.product.price == null &&
    criticalUnknowns >= 2
  ) {
    return {
      accepted: false,
      reason: "budget_unverified",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (impossible && (requirementCoverage < 0.85 || matchScore < 0.85)) {
    return {
      accepted: false,
      reason: "impossible_request_unmet",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (input.source === "rescue" && criticalUnknowns >= 3) {
    return {
      accepted: false,
      reason: "too_many_unknowns",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  if (
    input.source === "rescue" &&
    matchScore < 0.8 &&
    criticalUnknowns >= 2 &&
    requirementCoverage < 0.75
  ) {
    return {
      accepted: false,
      reason: "insufficient_evidence",
      matchScore,
      requirementCoverage,
      categoryVerified,
      lists,
    };
  }

  return {
    accepted: true,
    reason: "accepted",
    matchScore,
    requirementCoverage,
    categoryVerified,
    lists,
  };
}

export function finalizeAcceptedProduct(input: {
  requestedItem: string;
  source: AcceptanceSource;
  product: ProductDiscoveryProduct;
  evidenceText?: string;
}): AcceptanceResult & { product: ProductDiscoveryProduct } {
  const validatedLists = validateDeterministicClaims({
    requestedItem: input.requestedItem,
    product: input.product,
    evidenceText: input.evidenceText,
  });

  const matchScore = normalizeMatchScore({
    matchScore: input.product.matchScore,
    unmetRequirements: validatedLists.unmetRequirements,
    unknownRequirements: validatedLists.unknownRequirements,
  });

  const product: ProductDiscoveryProduct = {
    ...input.product,
    matchedRequirements: validatedLists.matchedRequirements,
    unmetRequirements: validatedLists.unmetRequirements,
    unknownRequirements: validatedLists.unknownRequirements,
    matchScore,
  };

  const acceptance = evaluateAcceptance({
    source: input.source,
    requestedItem: input.requestedItem,
    product,
    evidenceText: input.evidenceText,
  });

  return { ...acceptance, product };
}

export function priceEvidenceLabel(priceEvidence: PriceEvidence | undefined): PriceEvidence {
  return priceEvidence ?? "none";
}

/** @deprecated Prefer classifyClaimAgainstEvidence — kept for tests/debug. */
export function claimSupportedByEvidenceForTests(
  claim: string,
  haystack: string,
  requestedItem: string,
  dimensionHaystack: string
): boolean {
  return claimSupportedByEvidence(claim, haystack, requestedItem, dimensionHaystack);
}
