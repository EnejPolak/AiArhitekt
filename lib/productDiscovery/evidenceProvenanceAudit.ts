/**
 * Dev-only evidence provenance audit helpers.
 * Does not modify production acceptance or search.
 */
import { extractMaxPriceEur } from "./matchPolicy";
import { buildTrustedEvidenceText as buildProductionTrustedEvidenceText } from "./productEvidence";
import { parseRequestedRequirements } from "./requirementAnalysis";
import type { ProductDiscoveryProduct, ProductDiscoverySource } from "./types";

export type RequirementEvidenceTrace = {
  requirement: string;
  classification: "matched" | "unknown" | "unmet";
  evidenceType:
    | "merchant_json_ld"
    | "merchant_page"
    | "web_search_source"
    | "web_search_citation"
    | "source_title"
    | "source_snippet"
    | "product_name"
    | "structured_model_output"
    | "model_price_labeled_web_search"
    | "url_path"
    | "other"
    | "none";
  evidenceUrl: string | null;
  evidenceText: string | null;
  /** Whether production acceptance treated this as matched after finalize. */
  trustedByAcceptance: boolean;
  /** Whether claim is grounded in merchant/source fields excluding model prose. */
  groundedInTrustedEvidence: boolean;
  unsupportedMatchedClaim: boolean;
};

export type ProvenanceAuditResult = {
  requestedItem: string;
  accepted: boolean;
  acceptanceSource: string | null;
  acceptanceReason: string | null;
  productName: string | null;
  productUrl: string | null;
  domain: string | null;
  price: number | null;
  priceEvidence: string | null;
  matchScore: number | null;
  requirementCoverage: number | null;
  modelLists: {
    matchedRequirements: string[];
    unknownRequirements: string[];
    unmetRequirements: string[];
  };
  finalLists: {
    matchedRequirements: string[];
    unknownRequirements: string[];
    unmetRequirements: string[];
  };
  whyItMatches: string | null;
  primaryEvidenceTextReconstructed: string;
  trustedEvidenceText: string;
  traces: RequirementEvidenceTrace[];
  unsupportedMatchedClaims: string[];
  allHardOrIdentityMatchedGrounded: boolean;
  frozenRetention: {
    selectedUrlInSources: boolean;
    sourceTitlePresent: boolean;
    sourceTitle: string | null;
    whatFrozenWouldKeep: string[];
    whatProductionUsedBeyondFrozen: string[];
  };
  inconsistency:
    | "BENCHMARK_EVIDENCE_LOSS"
    | "BENCHMARK_POLICY_MISMATCH"
    | "PRODUCTION_ACCEPTANCE_EVIDENCE_BUG"
    | "NO_INCONSISTENCY"
    | "UNKNOWN";
  notes: string[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function urlPathEvidence(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/[-_+/]/g, " ");
  } catch {
    return url;
  }
}

const REQ_ALIASES: Record<string, string[]> = {
  metal: ["metal", "kovin", "steel", "jekl", "aluminium", "aluminum", "brass", "meden"],
  black: ["black", "crna", "crno", "crni", "crn"],
  white: ["white", "bela", "belo", "beli", "bel"],
  chrome: ["chrome", "krom", "kromiran"],
  ceramic: ["ceramic", "keramik"],
  stainless: ["stainless", "inox", "nerjav", "nerjave"],
  steel: ["steel", "inox", "nerjav", "jekl"],
  "pendant lamp": ["pendant", "viseca", "visilka", "hanging"],
  "kitchen sink": ["sink", "korito", "pomival"],
  "heated towel rail": ["radiator", "ogrev", "towel radiator"],
  "towel rail": ["radiator", "ogrev", "towel"],
};

function tokensForRequirement(label: string): string[] {
  const key = label.toLowerCase().trim();
  if (REQ_ALIASES[key]) return REQ_ALIASES[key];
  // dimension labels like "40 cm"
  const dim = key.match(/^(\d+(?:[.,]\d+)?)\s*(cm|mm)$/);
  if (dim) {
    const n = dim[1]!.replace(",", ".");
    const unit = dim[2]!;
    if (unit === "cm" && n === "60") return ["60 cm", "60cm", "600 mm", "600mm", "60 x", "x 60"];
    if (unit === "cm" && n === "40") return ["40 cm", "40cm", "400 mm", "ø 40", "oe 40", "diameter 40"];
    if (unit === "cm" && n === "30") return ["30 cm", "30cm", "300 mm"];
    return [n, `${n} ${unit}`, `${n}${unit}`];
  }
  if (/max\s+\d+/i.test(key)) return []; // budget handled separately
  return key
    .split(/[^a-z0-9]+/i)
    .filter((t) => t.length >= 3)
    .map((t) => normalize(t));
}

function findInText(hay: string, tokens: string[]): string | null {
  const n = normalize(hay);
  for (const token of tokens) {
    if (token.length >= 2 && n.includes(normalize(token))) return token;
  }
  return null;
}

/**
 * Reconstruct trusted primary evidence (URL + source title/snippet only).
 * whyItMatches is intentionally excluded.
 */
export function reconstructPrimaryEvidenceText(
  product: ProductDiscoveryProduct,
  sources: ProductDiscoverySource[]
): string {
  return buildProductionTrustedEvidenceText({
    productUrl: product.productUrl,
    sources,
  });
}

/**
 * Trusted merchant/source evidence ONLY — excludes model prose (whyItMatches),
 * model claim lists, and model-filled specifications (those are claims, not evidence).
 */
export function buildTrustedEvidenceText(
  product: ProductDiscoveryProduct,
  sources: ProductDiscoverySource[]
): string {
  const selected =
    sources.find((s) => s.url === product.productUrl) ??
    sources.find((s) => product.productUrl.includes(s.url) || s.url.includes(product.productUrl));
  const parts = [
    product.name,
    selected?.title ?? null,
    urlPathEvidence(product.productUrl),
  ];
  return parts.filter(Boolean).join("\n");
}

export function auditRequirementGrounding(input: {
  requestedItem: string;
  product: ProductDiscoveryProduct;
  sources: ProductDiscoverySource[];
  finalMatched: string[];
  finalUnknown: string[];
  finalUnmet: string[];
}): RequirementEvidenceTrace[] {
  const trusted = buildTrustedEvidenceText(input.product, input.sources);
  const modelProse = input.product.whyItMatches ?? "";
  const selected =
    input.sources.find((s) => s.url === input.product.productUrl) ??
    input.sources.find((s) => input.product.productUrl.includes(s.url));

  const requested = parseRequestedRequirements(input.requestedItem);
  const traces: RequirementEvidenceTrace[] = [];

  const labels = new Set([
    ...requested.map((r) => r.label),
    ...input.finalMatched,
    ...input.finalUnknown,
    ...input.finalUnmet,
  ]);

  for (const label of labels) {
    const lower = label.toLowerCase();
    let classification: RequirementEvidenceTrace["classification"] = "unknown";
    if (input.finalMatched.some((m) => m.toLowerCase() === lower || m.toLowerCase().includes(lower))) {
      classification = "matched";
    } else if (input.finalUnmet.some((m) => m.toLowerCase().includes(lower))) {
      classification = "unmet";
    } else if (input.finalUnknown.some((m) => m.toLowerCase().includes(lower))) {
      classification = "unknown";
    } else {
      // not in final lists — skip noise unless it's a parsed requirement
      if (!requested.some((r) => r.label.toLowerCase() === lower)) continue;
      classification = "unknown";
    }

    // Budget / price
    if (/max\b/i.test(label) && /eur|€/i.test(label)) {
      const max = extractMaxPriceEur(input.requestedItem);
      const priceOk =
        input.product.price != null && max != null && input.product.price <= max;
      const priceEvidence = input.product.priceEvidence ?? "none";
      const groundedInTrusted =
        false; // primary path labels model price as web_search without source price text proof
      const inTrustedText =
        input.product.price != null &&
        (trusted.includes(String(input.product.price)) ||
          trusted.includes(input.product.price.toFixed(2).replace(".", ",")));
      traces.push({
        requirement: label,
        classification,
        evidenceType:
          priceEvidence === "web_search"
            ? "model_price_labeled_web_search"
            : priceEvidence === "merchant_page"
              ? "merchant_page"
              : "none",
        evidenceUrl: input.product.productUrl,
        evidenceText:
          input.product.price != null
            ? `price=${input.product.price} priceEvidence=${priceEvidence}`
            : null,
        trustedByAcceptance: classification === "matched",
        groundedInTrustedEvidence: Boolean(inTrustedText && priceOk),
        unsupportedMatchedClaim:
          classification === "matched" && !(inTrustedText && priceOk),
      });
      continue;
    }

    const tokens = tokensForRequirement(label);
    const inTrusted = tokens.length ? findInText(trusted, tokens) : null;
    const inModelProse = tokens.length ? findInText(modelProse, tokens) : null;
    const inName = tokens.length ? findInText(input.product.name, tokens) : null;
    const inTitle = selected?.title && tokens.length ? findInText(selected.title, tokens) : null;
    const inUrl = tokens.length ? findInText(urlPathEvidence(input.product.productUrl), tokens) : null;

    let evidenceType: RequirementEvidenceTrace["evidenceType"] = "none";
    let evidenceText: string | null = null;
    if (inName) {
      evidenceType = "product_name";
      evidenceText = input.product.name;
    } else if (inTitle) {
      evidenceType = "source_title";
      evidenceText = selected?.title ?? null;
    } else if (inUrl) {
      evidenceType = "url_path";
      evidenceText = urlPathEvidence(input.product.productUrl);
    } else if (inModelProse) {
      evidenceType = "structured_model_output";
      evidenceText = modelProse.slice(0, 400);
    }

    const groundedInTrustedEvidence = Boolean(inTrusted);
    const unsupportedMatchedClaim =
      classification === "matched" && !groundedInTrustedEvidence;

    traces.push({
      requirement: label,
      classification,
      evidenceType,
      evidenceUrl: input.product.productUrl,
      evidenceText,
      trustedByAcceptance: classification === "matched",
      groundedInTrustedEvidence,
      unsupportedMatchedClaim,
    });
  }

  return traces;
}

export function classifyInconsistency(input: {
  accepted: boolean;
  unsupportedMatchedClaims: string[];
  selectedUrlInSources: boolean;
  groundedHardCount: number;
  hardMatchedCount: number;
  notes: string[];
}): ProvenanceAuditResult["inconsistency"] {
  if (!input.accepted) return "UNKNOWN";
  if (input.unsupportedMatchedClaims.length > 0) return "PRODUCTION_ACCEPTANCE_EVIDENCE_BUG";
  if (!input.selectedUrlInSources) return "UNKNOWN";
  // If production grounded claims via model prose that frozen drops:
  if (input.notes.some((n) => n.includes("whyItMatches"))) return "BENCHMARK_EVIDENCE_LOSS";
  if (input.hardMatchedCount > 0 && input.groundedHardCount < input.hardMatchedCount) {
    return "PRODUCTION_ACCEPTANCE_EVIDENCE_BUG";
  }
  return "NO_INCONSISTENCY";
}

export function focusRequirementLabels(requestedItem: string): string[] {
  const lower = requestedItem.toLowerCase();
  if (lower.includes("pendant")) {
    return ["pendant lamp", "black", "metal", "40 cm", `max ${extractMaxPriceEur(requestedItem)} EUR`];
  }
  if (lower.includes("kitchen sink")) {
    return [
      "kitchen sink",
      "stainless",
      "60 cm",
      `max ${extractMaxPriceEur(requestedItem)} EUR`,
    ];
  }
  if (lower.includes("towel")) {
    return [
      "heated towel rail",
      "chrome",
      "60 cm",
      `max ${extractMaxPriceEur(requestedItem)} EUR`,
    ];
  }
  return parseRequestedRequirements(requestedItem).map((r) => r.label);
}

export function summarizeFocusGrounding(
  traces: RequirementEvidenceTrace[],
  labels: string[]
): Record<string, { grounded: boolean; classification: string; evidenceType: string }> {
  const out: Record<string, { grounded: boolean; classification: string; evidenceType: string }> = {};
  for (const label of labels) {
    const t =
      traces.find((x) => x.requirement.toLowerCase() === label.toLowerCase()) ??
      traces.find((x) => x.requirement.toLowerCase().includes(label.toLowerCase().split(" ")[0]!));
    out[label] = {
      grounded: t?.groundedInTrustedEvidence === true,
      classification: t?.classification ?? "missing",
      evidenceType: t?.evidenceType ?? "none",
    };
  }
  return out;
}

/**
 * Code-path note for auditors: production validateDeterministicClaims only
 * strictly checks dimension-like claims; other matched claims default to supported.
 * evidenceHaystack also includes product.whyItMatches (model prose).
 */
export const PRODUCTION_ACCEPTANCE_EVIDENCE_NOTES = [
  "primaryEvidenceText = trusted ProductEvidence haystack (URL/title/snippet/merchant) — not whyItMatches",
  "model specifications are claims and are excluded from acceptance haystacks",
  "claimSupportedByEvidence requires token/evidence support (no default-true for soft claims)",
  "priceEvidence=web_search only when provider-visible source text contains the price",
  "model-reported price alone yields priceEvidence=none",
] as const;

export function buildProvenanceAudit(input: {
  requestedItem: string;
  accepted: boolean;
  acceptanceSource: string | null;
  acceptanceReason: string | null;
  modelProduct: ProductDiscoveryProduct | null;
  finalProduct: ProductDiscoveryProduct | null;
  sources: ProductDiscoverySource[];
  frozenMatch?: {
    found: boolean;
    sourceTitle: string | null;
    sourceEvidence: string | null;
    enrichmentStatus: string | null;
    enrichmentPrice: number | null;
    inTopCandidates: boolean;
  } | null;
}): ProvenanceAuditResult {
  const product = input.finalProduct ?? input.modelProduct;
  const notes: string[] = [...PRODUCTION_ACCEPTANCE_EVIDENCE_NOTES];
  if (!product) {
    return {
      requestedItem: input.requestedItem,
      accepted: false,
      acceptanceSource: input.acceptanceSource,
      acceptanceReason: input.acceptanceReason,
      productName: null,
      productUrl: null,
      domain: null,
      price: null,
      priceEvidence: null,
      matchScore: null,
      requirementCoverage: null,
      modelLists: {
        matchedRequirements: [],
        unknownRequirements: [],
        unmetRequirements: [],
      },
      finalLists: {
        matchedRequirements: [],
        unknownRequirements: [],
        unmetRequirements: [],
      },
      whyItMatches: null,
      primaryEvidenceTextReconstructed: "",
      trustedEvidenceText: "",
      traces: [],
      unsupportedMatchedClaims: [],
      allHardOrIdentityMatchedGrounded: true,
      frozenRetention: {
        selectedUrlInSources: false,
        sourceTitlePresent: false,
        sourceTitle: null,
        whatFrozenWouldKeep: [],
        whatProductionUsedBeyondFrozen: [],
      },
      inconsistency: "UNKNOWN",
      notes,
    };
  }

  const primaryEvidence = reconstructPrimaryEvidenceText(product, input.sources);
  const trusted = buildTrustedEvidenceText(product, input.sources);
  const selected =
    input.sources.find((s) => s.url === product.productUrl) ??
    input.sources.find((s) => product.productUrl.includes(s.url) || s.url.includes(product.productUrl));

  const modelLists = {
    matchedRequirements: input.modelProduct?.matchedRequirements ?? [],
    unknownRequirements: input.modelProduct?.unknownRequirements ?? [],
    unmetRequirements: input.modelProduct?.unmetRequirements ?? [],
  };
  const finalLists = {
    matchedRequirements: product.matchedRequirements ?? [],
    unknownRequirements: product.unknownRequirements ?? [],
    unmetRequirements: product.unmetRequirements ?? [],
  };

  const traces = auditRequirementGrounding({
    requestedItem: input.requestedItem,
    product,
    sources: input.sources,
    finalMatched: finalLists.matchedRequirements,
    finalUnknown: finalLists.unknownRequirements,
    finalUnmet: finalLists.unmetRequirements,
  });

  const unsupportedMatchedClaims = traces
    .filter((t) => t.unsupportedMatchedClaim)
    .map((t) => t.requirement);

  const hardReqs = parseRequestedRequirements(input.requestedItem).filter((r) => r.hard);
  const hardMatched = hardReqs.filter((r) =>
    finalLists.matchedRequirements.some(
      (m) => m.toLowerCase().includes(r.label.toLowerCase()) || r.label.toLowerCase().includes(m.toLowerCase())
    )
  );
  const hardMatchedGrounded = hardMatched.filter((r) => {
    const t = traces.find(
      (x) =>
        x.requirement.toLowerCase() === r.label.toLowerCase() ||
        x.requirement.toLowerCase().includes(r.label.toLowerCase())
    );
    return t?.groundedInTrustedEvidence === true;
  });

  const beyondFrozen: string[] = [];
  if (product.whyItMatches?.trim()) {
    beyondFrozen.push("whyItMatches (model prose used in primaryEvidenceText)");
    notes.push("production includes whyItMatches in acceptance evidence haystack");
  }
  beyondFrozen.push("structured matchedRequirements / unknownRequirements / unmetRequirements");
  if (product.price != null) {
    beyondFrozen.push(`model price=${product.price} labeled priceEvidence=${product.priceEvidence ?? "none"}`);
  }
  beyondFrozen.push("citation/snippet text beyond url (+optional title)");

  const whatFrozenWouldKeep = [
    "source url",
    selected?.title ? "source title" : "source title usually null from action.sources",
    "url-path derived sourceEvidence",
    "merchant enrichment when fetch succeeds",
  ];

  if (input.frozenMatch) {
    if (!input.frozenMatch.inTopCandidates) {
      notes.push("accepted URL missing from frozen top-N rescue candidates (RESCUE_MAX_CANDIDATES=10)");
    }
    if (!input.frozenMatch.sourceTitle) {
      notes.push("frozen sourceTitle null for accepted URL");
    }
    if (input.frozenMatch.enrichmentStatus && input.frozenMatch.enrichmentStatus !== "success") {
      notes.push(`frozen enrichment=${input.frozenMatch.enrichmentStatus}`);
    }
  }

  const policyMismatch =
    product.priceEvidence === "web_search" &&
    (input.frozenMatch == null ||
      input.frozenMatch.enrichmentPrice == null ||
      input.frozenMatch.enrichmentStatus !== "success");

  if (policyMismatch) {
    notes.push(
      "BENCHMARK_POLICY_MISMATCH risk: production trusts priceEvidence=web_search; GT only merchant_page"
    );
  }

  let inconsistency: ProvenanceAuditResult["inconsistency"] = "NO_INCONSISTENCY";
  if (!input.accepted) {
    inconsistency = "UNKNOWN";
  } else if (unsupportedMatchedClaims.length > 0) {
    inconsistency = "PRODUCTION_ACCEPTANCE_EVIDENCE_BUG";
  } else if (policyMismatch) {
    inconsistency = "BENCHMARK_POLICY_MISMATCH";
  } else if (
    input.frozenMatch &&
    (!input.frozenMatch.inTopCandidates ||
      !input.frozenMatch.sourceTitle ||
      (input.frozenMatch.enrichmentStatus && input.frozenMatch.enrichmentStatus !== "success"))
  ) {
    inconsistency = "BENCHMARK_EVIDENCE_LOSS";
  } else if (beyondFrozen.includes("whyItMatches (model prose used in primaryEvidenceText)")) {
    // Model prose was used but claims still grounded in name/title/url — retention gap only.
    inconsistency = "BENCHMARK_EVIDENCE_LOSS";
  }

  let domain: string | null = product.retailerDomain || null;
  try {
    domain = domain || new URL(product.productUrl).hostname.replace(/^www\./i, "");
  } catch {
    // ignore
  }

  return {
    requestedItem: input.requestedItem,
    accepted: input.accepted,
    acceptanceSource: input.acceptanceSource,
    acceptanceReason: input.acceptanceReason,
    productName: product.name,
    productUrl: product.productUrl,
    domain,
    price: product.price,
    priceEvidence: product.priceEvidence ?? null,
    matchScore: product.matchScore,
    requirementCoverage: null,
    modelLists,
    finalLists,
    whyItMatches: product.whyItMatches,
    primaryEvidenceTextReconstructed: primaryEvidence,
    trustedEvidenceText: trusted,
    traces,
    unsupportedMatchedClaims,
    allHardOrIdentityMatchedGrounded: hardMatched.length === hardMatchedGrounded.length,
    frozenRetention: {
      selectedUrlInSources: Boolean(selected),
      sourceTitlePresent: Boolean(selected?.title),
      sourceTitle: selected?.title ?? null,
      whatFrozenWouldKeep,
      whatProductionUsedBeyondFrozen: beyondFrozen,
    },
    inconsistency,
    notes,
  };
}

/** Heuristic: would GT-style checks pass if production-trusted fields were retained? */
export function wouldFrozenQualifyIfProductionEvidencePreserved(input: {
  requestedItem: string;
  product: ProductDiscoveryProduct;
  sources: ProductDiscoverySource[];
}): { yes: boolean; reasons: string[] } {
  const hay = normalize(
    [
      reconstructPrimaryEvidenceText(input.product, input.sources),
      buildTrustedEvidenceText(input.product, input.sources),
      input.product.price != null ? `price ${input.product.price} EUR` : "",
    ].join("\n")
  );
  const reasons: string[] = [];
  const labels = focusRequirementLabels(input.requestedItem);
  const max = extractMaxPriceEur(input.requestedItem);

  for (const label of labels) {
    if (/max\b/i.test(label) && max != null) {
      if (input.product.price == null) {
        reasons.push("budget: no price");
      } else if (input.product.price > max) {
        reasons.push(`budget: €${input.product.price} > max €${max}`);
      } else if (input.product.priceEvidence === "none") {
        reasons.push("budget: priceEvidence=none");
      } else {
        reasons.push(`budget: ok via ${input.product.priceEvidence}`);
      }
      continue;
    }
    const tokens = tokensForRequirement(label);
    if (!tokens.length || !findInText(hay, tokens)) {
      reasons.push(`${label}: missing even with production evidence`);
    } else {
      reasons.push(`${label}: present in production evidence`);
    }
  }

  const failed = reasons.some((r) => r.includes("missing") || r.includes("no price") || r.includes("> max"));
  return { yes: !failed, reasons };
}
