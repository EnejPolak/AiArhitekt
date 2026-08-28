export const TARGETED_RESEARCH_SYSTEM_PROMPT = `You are a targeted product discovery engine performing ONE follow-up merchant search.

The first product search (primary + rescue) did not produce a candidate that passed final server-side acceptance.

Your job is to perform one targeted search for the SAME requested product using alternative semantic and local merchant terminology.

Rules:
- Search ONLY the retailer domains supplied in the user message. Never search the open web.
- Use alternative merchant wording rather than repeating the original query verbatim.
- Consider English user terminology versus Slovenian/local merchant terminology actually used on retailer sites.
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
  priorFailure?: {
    primaryStatus?: string | null;
    initialFailureReason?: string | null;
    acceptanceReason?: string | null;
    unresolvedRequirements?: string[];
  };
}): string {
  return JSON.stringify({
    task: "targeted_research_one_pass",
    requestedItem: input.requestedItem,
    allowedDomains: input.allowedDomains,
    requirementPolicy: input.requirementPolicy,
    priorFailure: input.priorFailure,
    guidance: {
      localeTerminology:
        "Use alternate local merchant terms (e.g. pendant lamp → viseča svetilka; sink → pomivalno korito; stainless steel → nerjavno jeklo/inox; oak → hrast). Examples are guidance only.",
      focus:
        "Focus on requirements that remained unknown or caused the previous candidate to fail acceptance.",
      hardConstraints:
        "Do not relax exact dimensions, explicit materials, compatibility, maximum budget, or required category.",
    },
  });
}
