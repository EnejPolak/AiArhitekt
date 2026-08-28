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
import type { PriceEvidence, ProductDiscoveryProduct } from "./types";

export type AcceptanceSource = "primary" | "rescue" | "targeted";

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

const DIMENSION_CLAIM = /\b(\d+(?:[.,]\d+)?)\s*(?:cm|mm|m)\b/i;

function evidenceHaystack(input: {
  product: ProductDiscoveryProduct;
  evidenceText?: string;
}): string {
  const parts = [
    input.product.name,
    input.product.whyItMatches,
    input.evidenceText ?? "",
    Object.entries(input.product.specifications)
      .map(([key, value]) => `${key} ${value ?? ""}`)
      .join(" "),
  ];
  return parts.join(" ").toLowerCase();
}

function dimensionEvidenceHaystack(input: {
  product: ProductDiscoveryProduct;
  evidenceText?: string;
}): string {
  const parts = [
    input.product.name,
    Object.entries(input.product.specifications)
      .map(([key, value]) => `${key} ${value ?? ""}`)
      .join(" "),
    input.evidenceText ?? "",
  ];
  return parts.join(" ").toLowerCase();
}

function claimSupportedByEvidence(
  claim: string,
  haystack: string,
  requestedItem: string,
  dimensionHaystack: string
): boolean {
  const dimensionMatch = claim.match(DIMENSION_CLAIM);
  if (dimensionMatch?.[1]) {
    const value = dimensionMatch[1].replace(",", ".");
    const variants = [value, value.replace(".", ",")];
    const source = usesExactLanguage(requestedItem) ? dimensionHaystack : haystack;
    return variants.some((variant) => source.includes(variant));
  }

  if (/\b(max|budget|under|price)\b/i.test(claim) && /\b(satisf|within|under|below|met)\b/i.test(claim)) {
    return false;
  }

  if (/\b(exactly|exact|precisely|must be)\b/i.test(claim) && /\b(width|wide|diameter|dimension|cm|mm)\b/i.test(claim)) {
    const numeric = claim.match(/(\d+(?:[.,]\d+)?)/);
    if (numeric?.[1]) {
      const value = numeric[1].replace(",", ".");
      return [value, value.replace(".", ",")].some((variant) => dimensionHaystack.includes(variant));
    }
    return false;
  }

  return true;
}

function attributeEvidenceHaystack(input: {
  product: ProductDiscoveryProduct;
  evidenceText?: string;
}): string {
  return dimensionEvidenceHaystack(input);
}

export function validateDeterministicClaims(input: {
  requestedItem: string;
  product: ProductDiscoveryProduct;
  evidenceText?: string;
}): RequirementLists {
  const haystack = evidenceHaystack(input);
  const dimensionHaystack = dimensionEvidenceHaystack(input);
  const attributeHaystack = attributeEvidenceHaystack(input);
  let lists: RequirementLists = {
    matchedRequirements: [...input.product.matchedRequirements],
    unmetRequirements: [...input.product.unmetRequirements],
    unknownRequirements: [...input.product.unknownRequirements],
  };

  const downgraded: string[] = [];
  lists.matchedRequirements = lists.matchedRequirements.filter((claim) => {
    const supported = claimSupportedByEvidence(
      claim,
      haystack,
      input.requestedItem,
      dimensionHaystack
    );
    if (!supported) {
      downgraded.push(claim);
      return false;
    }
    return true;
  });

  for (const claim of downgraded) {
    if (!lists.unknownRequirements.some((entry) => entry.toLowerCase() === claim.toLowerCase())) {
      lists.unknownRequirements.push(claim);
    }
  }

  lists = downgradeUnsupportedDistinctiveClaims({
    requestedItem: input.requestedItem,
    lists,
    evidenceHaystack: attributeHaystack,
  });

  if (input.product.price == null && extractMaxPriceEur(input.requestedItem) != null) {
    lists.matchedRequirements = lists.matchedRequirements.filter(
      (entry) => !( /max\b/i.test(entry) && /eur|€/i.test(entry))
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

  const minScore =
    input.source === "rescue" ? ACCEPTANCE_RESCUE_MIN_SCORE : ACCEPTANCE_PRIMARY_MIN_SCORE;
  const minCoverage =
    input.source === "rescue" ? ACCEPTANCE_RESCUE_MIN_COVERAGE : ACCEPTANCE_PRIMARY_MIN_COVERAGE;

  const requirementCoverage = computeRequirementCoverage(input.requestedItem, lists);
  const categoryEvidence = categoryEvidenceHaystack({
    productName: input.product.name,
    evidenceText: input.evidenceText,
    specifications: input.product.specifications,
  });
  const categoryVerified = isCategoryVerified(
    input.requestedItem,
    input.product.name,
    input.evidenceText,
    input.product.specifications
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
    input.source !== "rescue" &&
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
