import type { RequirementLists } from "./matchPolicy";

export type DistinctiveRequirement = {
  id: string;
  label: string;
  tokens: string[];
  hard: boolean;
  weight: number;
};

const DISTINCTIVE_PATTERNS: Array<{
  pattern: RegExp;
  label: string;
  tokens: string[];
  hard: boolean;
}> = [
  { pattern: /\bdiamond\b/i, label: "diamond", tokens: ["diamond", "diamant"], hard: true },
  {
    pattern: /\bitalian\s+leather\b/i,
    label: "italian leather",
    tokens: ["italian", "leather", "italij", "usnje", "usnj"],
    hard: true,
  },
  { pattern: /\bsolid\s+titanium\b/i, label: "solid titanium", tokens: ["titanium", "titan"], hard: true },
  { pattern: /\bsolid\s+gold\b/i, label: "solid gold", tokens: ["solid gold", "gold"], hard: true },
  { pattern: /\bdesigner\b/i, label: "designer", tokens: ["designer"], hard: false },
];

export function parseDistinctiveRequirements(requestedItem: string): DistinctiveRequirement[] {
  const out: DistinctiveRequirement[] = [];
  for (const entry of DISTINCTIVE_PATTERNS) {
    if (!entry.pattern.test(requestedItem)) continue;
    out.push({
      id: `distinctive:${entry.label}`,
      label: entry.label,
      tokens: entry.tokens,
      hard: entry.hard,
      weight: entry.hard ? 2 : 1,
    });
  }
  return out;
}

function claimMatchesDistinctive(claim: string, distinctive: DistinctiveRequirement): boolean {
  const haystack = claim.toLowerCase();
  return distinctive.tokens.some((token) => token.length >= 3 && haystack.includes(token));
}

export function downgradeUnsupportedDistinctiveClaims(input: {
  requestedItem: string;
  lists: RequirementLists;
  evidenceHaystack: string;
}): RequirementLists {
  const distinctive = parseDistinctiveRequirements(input.requestedItem);
  if (distinctive.length === 0) return input.lists;

  const matched: string[] = [];
  const downgraded: string[] = [];

  for (const claim of input.lists.matchedRequirements) {
    const related = distinctive.find((entry) => claimMatchesDistinctive(claim, entry));
    if (!related) {
      matched.push(claim);
      continue;
    }
    const supported = related.tokens.some(
      (token) => token.length >= 3 && input.evidenceHaystack.includes(token)
    );
    if (supported) matched.push(claim);
    else downgraded.push(claim);
  }

  const unknownRequirements = [...input.lists.unknownRequirements];
  for (const claim of downgraded) {
    if (!unknownRequirements.some((entry) => entry.toLowerCase() === claim.toLowerCase())) {
      unknownRequirements.push(claim);
    }
    const related = distinctive.find((entry) => claimMatchesDistinctive(claim, entry));
    if (related && !unknownRequirements.some((entry) => entry.toLowerCase().includes(related.label))) {
      unknownRequirements.push(related.label);
    }
  }

  return {
    matchedRequirements: matched,
    unmetRequirements: input.lists.unmetRequirements,
    unknownRequirements,
  };
}
