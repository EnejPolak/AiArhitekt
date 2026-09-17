import {
  LOCAL_MARKET_SEARCH_INSTRUCTION,
  normalizeProductDiscoveryMarketContext,
  type ProductDiscoveryMarketContext,
} from "./marketContext";

export const TARGETED_RESEARCH_SYSTEM_PROMPT = `You are a targeted product discovery engine performing ONE follow-up merchant search.

The first product search (primary + rescue) did not produce a candidate that passed final server-side acceptance.

Your job is to perform one targeted search for the SAME requested product using alternative semantic and local merchant terminology.

Rules:
- Search ONLY the retailer domains supplied in the user message. Never search the open web.
- Use alternative merchant wording rather than repeating the original query verbatim.
- Prefer terminology used by retailers in the target market from countryCode, formattedLocation, and merchantDomains. Local-market language first; English fallback if local queries are insufficient.
- Preserve ALL hard constraints exactly. Do not weaken exact dimensions, explicit materials, compatibility, maximum budget, or required category.
- Do not reformulate "exactly 60cm" into "roughly 60cm" just to find something.
- Search priority: (1) correct product category, (2) hard technical/material requirements, (3) exact requirements, (4) maximum price, (5) approximate dimensions, (6) soft/aesthetic requirements.
- Never fabricate product names, prices, URLs, or specifications.
- Prefer direct merchant product pages over category/blog/PDF pages.
- If price is not clearly stated, use null. Do not claim budget satisfaction when price is unknown.
- Put unverified distinctive attributes (diamond, Italian leather, specific brand/material) in unknownRequirements, not matchedRequirements.
- Return not_found if no credible source-backed product page exists.

Return structured JSON matching the required schema.`;

export function buildTargetedResearchUserMessage(input: {
  requestedItem: string;
  allowedDomains: string[];
  requirementPolicy?: Record<string, unknown>;
  suggestedSearchQueries?: Array<{ query: string; intent: string; priority: number }>;
  marketContext?: ProductDiscoveryMarketContext | null;
  priorFailure?: {
    primaryStatus?: string | null;
    initialFailureReason?: string | null;
    acceptanceReason?: string | null;
    unresolvedRequirements?: string[];
  };
}): string {
  const marketContext = normalizeProductDiscoveryMarketContext(
    input.marketContext,
    input.allowedDomains
  );
  return JSON.stringify({
    task: "targeted_research_one_pass",
    requestedItem: input.requestedItem,
    allowedDomains: input.allowedDomains,
    marketContext: {
      countryCode: marketContext.countryCode,
      formattedLocation: marketContext.formattedLocation,
      merchantDomains: marketContext.merchantDomains,
    },
    requirementPolicy: input.requirementPolicy,
    suggestedSearchQueries: input.suggestedSearchQueries ?? [],
    priorFailure: input.priorFailure,
    localMarketSearchInstruction: LOCAL_MARKET_SEARCH_INSTRUCTION,
    guidance: {
      localeTerminology:
        "Infer natural local-market merchant terminology from countryCode, formattedLocation, and merchantDomains. Do not translate brand names, model names, SKUs, or product codes. Preserve the requested product class.",
      localizationIsSearchOnly:
        "requestedItem remains authoritative for acceptance. Localized terms are discovery hints only.",
      focus:
        "Focus on requirements that remained unknown or caused the previous candidate to fail acceptance.",
      hardConstraints:
        "Do not relax exact dimensions, explicit materials, compatibility, maximum budget, or required category.",
      boundedRescue:
        "Use at most the provided suggestedSearchQueries (rescue intents). Do not invent unbounded query recursion.",
      discoveryHintsAreNotEvidence:
        "Search snippets and suggested queries are discovery hints only; merchant evidence remains authoritative.",
    },
  });
}
