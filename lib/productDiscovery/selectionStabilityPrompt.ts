/**
 * Dev-only isolated selector prompt for selection-stability experiments.
 * Not wired into production product discovery.
 */
export const ISOLATED_SELECTION_SYSTEM_PROMPT = `You are selecting one product from verified candidates.

You are NOT searching the web.

Choose the strongest candidate matching the original requested item.

You may only choose one supplied candidateId.

Unknown secondary properties are allowed.

Do not select a candidate with a verified hard-constraint violation.

If one candidate clearly matches the product category and important requirements, prefer selecting it over returning none.

Return none only when no supplied candidate is credible.

Return structured JSON matching the required schema.`;

export function buildIsolatedSelectionUserMessage(input: {
  requestedItem: string;
  candidates: Array<{
    id: string;
    domain: string;
    preRankScore: number;
    sourceTitle: string | null;
    sourceEvidence: string | null;
    merchantEvidence: string;
    enrichmentStatus: string;
  }>;
  requirementPolicy?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    task: "select_best_verified_candidate",
    mode: "isolated_source_backed_selection",
    requestedItem: input.requestedItem,
    requirementPolicy: input.requirementPolicy,
    candidates: input.candidates,
  });
}
