export type RequirementLists = {
  matchedRequirements: string[];
  unmetRequirements: string[];
  unknownRequirements: string[];
};

const APPROX_LANGUAGE =
  /\b(approx(?:imately)?|around|circa|about|roughly|~|ca\.?)\b/i;
const MAX_PRICE_PATTERN =
  /\bmax(?:imum)?\s*(\d+(?:[.,]\d+)?)\s*(?:eur|€)\b/i;
const BUDGET_SATISFACTION_PATTERN =
  /\b(under|below|within|meets|satisfies|at or under|≤|<=).{0,40}\b(max|budget|€|eur|price)\b|\b(max|budget).{0,40}\b(under|below|within|satisfied|met)\b/i;
const CONTRADICTION_MARKERS =
  /\b(not|instead|non-|without|is\s+(plastic|wood|glass|fabric|ceramic|steel|aluminium|aluminum|abs|acrylic|mdf|particle))\b/i;
const SOFT_ATTRIBUTE_PATTERN =
  /\b(metal|wood|oak|matte|gloss|modern|minimalist|scandinavian|material|finish|fabric|leather|marble|steel|aluminium|aluminum)\b/i;

export function usesApproximateLanguage(requestedItem: string): boolean {
  return APPROX_LANGUAGE.test(requestedItem);
}

export function usesExactLanguage(requestedItem: string): boolean {
  return /\b(exact(?:ly)?|precisely|must be|strictly)\b/i.test(requestedItem);
}

export function extractMaxPriceEur(requestedItem: string): number | null {
  const match = requestedItem.match(MAX_PRICE_PATTERN);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1].replace(",", "."));
  return Number.isFinite(value) && value > 0 ? value : null;
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function removeBudgetClaimsFromMatched(matchedRequirements: string[]): string[] {
  return matchedRequirements.filter((entry) => !BUDGET_SATISFACTION_PATTERN.test(entry));
}

function moveSoftUnmetToUnknown(unmetRequirements: string[]): {
  unmetRequirements: string[];
  movedToUnknown: string[];
} {
  const unmet: string[] = [];
  const movedToUnknown: string[] = [];
  for (const entry of unmetRequirements) {
    if (SOFT_ATTRIBUTE_PATTERN.test(entry) && !CONTRADICTION_MARKERS.test(entry)) {
      movedToUnknown.push(entry);
      continue;
    }
    unmet.push(entry);
  }
  return { unmetRequirements: unmet, movedToUnknown };
}

export function normalizeRequirementLists(
  requestedItem: string,
  lists: RequirementLists,
  price: number | null
): RequirementLists {
  let matchedRequirements = [...lists.matchedRequirements];
  let unmetRequirements = [...lists.unmetRequirements];
  let unknownRequirements = [...lists.unknownRequirements];

  const maxPriceEur = extractMaxPriceEur(requestedItem);
  if (maxPriceEur != null && price == null) {
    matchedRequirements = removeBudgetClaimsFromMatched(matchedRequirements);
    unmetRequirements = unmetRequirements.filter((entry) => !BUDGET_SATISFACTION_PATTERN.test(entry));
    const budgetUnknown = `max ${maxPriceEur} EUR`;
    if (
      !unknownRequirements.some((entry) => /max\b/i.test(entry) && /eur|€/i.test(entry)) &&
      !unmetRequirements.some((entry) => /max\b/i.test(entry) && /eur|€/i.test(entry))
    ) {
      unknownRequirements.push(budgetUnknown);
    }
  }

  if (price != null && maxPriceEur != null && price > maxPriceEur) {
    const budgetUnmet = `max ${maxPriceEur} EUR`;
    if (!unmetRequirements.some((entry) => entry.toLowerCase().includes(budgetUnmet.toLowerCase()))) {
      unmetRequirements.push(budgetUnmet);
    }
    matchedRequirements = removeBudgetClaimsFromMatched(matchedRequirements);
  }

  if (price != null && maxPriceEur != null && price <= maxPriceEur) {
    const budgetMatched = `max ${maxPriceEur} EUR`;
    matchedRequirements = removeBudgetClaimsFromMatched(matchedRequirements);
    if (!matchedRequirements.some((entry) => /max\b/i.test(entry) && /eur|€/i.test(entry))) {
      matchedRequirements.push(budgetMatched);
    }
    unknownRequirements = unknownRequirements.filter(
      (entry) => !( /max\b/i.test(entry) && /eur|€/i.test(entry))
    );
    unmetRequirements = unmetRequirements.filter(
      (entry) => !( /max\b/i.test(entry) && /eur|€/i.test(entry))
    );
  }

  const reclassified = moveSoftUnmetToUnknown(unmetRequirements);
  unmetRequirements = reclassified.unmetRequirements;
  unknownRequirements.push(...reclassified.movedToUnknown);

  return {
    matchedRequirements: uniqueStrings(matchedRequirements),
    unmetRequirements: uniqueStrings(unmetRequirements),
    unknownRequirements: uniqueStrings(unknownRequirements),
  };
}

export function normalizeMatchScore(input: {
  matchScore: number;
  unmetRequirements: string[];
  unknownRequirements: string[];
}): number {
  let score = input.matchScore;
  if (!Number.isFinite(score)) return 0;
  score = Math.max(0, Math.min(1, score));

  const unmetCount = input.unmetRequirements.length;
  const unknownCount = input.unknownRequirements.length;

  if (unmetCount > 0) {
    score = Math.min(score, unmetCount >= 2 ? 0.79 : 0.85);
  } else if (unknownCount > 0) {
    score = Math.min(score, unknownCount >= 3 ? 0.84 : 0.94);
  }

  return score;
}

export function buildRequirementPolicyHints(requestedItem: string): Record<string, unknown> {
  const maxPriceEur = extractMaxPriceEur(requestedItem);
  return {
    approximateDimensions: usesApproximateLanguage(requestedItem),
    exactDimensions: usesExactLanguage(requestedItem),
    maxPriceEur,
    policy: {
      unknownIsNotUnmet:
        "If merchant evidence does not confirm a secondary/soft property, put it in unknownRequirements, not unmetRequirements.",
      approximateTolerance:
        "Treat approx/around/roughly dimensions as approximate, not exact. Use reasonable tolerance.",
      bestEffort:
        "Return the strongest verified direct product page when category and hard requirements are satisfied, even if some soft properties remain unknown.",
      notFoundOnlyWhen:
        "Use not_found only when no credible direct product page exists, category mismatches, a critical hard requirement is explicitly violated, or evidence is insufficient.",
    },
  };
}
