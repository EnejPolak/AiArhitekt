/**
 * Dev-only ProductEvidence frozen benchmark helpers.
 * Uses the SAME ProductEvidence representation as production acceptance.
 * Not wired into production searchProductItem.
 */
import type { EnrichmentStatus } from "./enrichCandidate";
import {
  categoryEvidenceHaystack,
  parseProductIdentity,
  verifyCoreCategoryInEvidence,
} from "./productIdentity";
import {
  buildProductEvidence,
  resolveGroundedPrice,
  trustedEvidenceHaystack,
  type EvidenceFact,
  type EvidenceKind,
  type ProductEvidence,
} from "./productEvidence";
import type { RescueCandidate } from "./rescueCandidates";
import { assessAcceptanceAlignedQualification } from "./selectionBenchmarkGroundTruth";
import type { PriceEvidence, ProductDiscoverySource } from "./types";

export type FrozenEnrichmentStatus =
  | "success"
  | "forbidden"
  | "failed"
  | "not_attempted";

export type FrozenEvidenceCandidate = {
  candidateId: string;
  productUrl: string;
  evidence: ProductEvidence;
  modelClaims?: {
    name?: string;
    price?: number | null;
    whyItMatches?: string;
    specifications?: unknown;
  };
  enrichmentStatus: FrozenEnrichmentStatus;
  enrichmentDetail: {
    attempted: boolean;
    status: EnrichmentStatus | "not_attempted" | null;
    jsonLdProductFound: boolean;
    merchantTitle: boolean;
    merchantPrice: boolean;
    merchantMaterialOrSpecs: boolean;
    failureClass: EnrichmentStatus | "not_attempted" | null;
    labeledDimensionsFound?: number;
    materialFound?: boolean;
    colorFound?: boolean;
    extractionMethods?: string[];
    httpStatus?: number | null;
    priceSource?: string | null;
    priceFailureReason?: string | null;
    priceKind?: string | null;
    enrichmentDurationMs?: number | null;
    cacheHit?: boolean | null;
    fetchBlockReason?: string | null;
    fetchSuccessKind?: string | null;
    acquisitionSource?: string | null;
    adapterId?: string | null;
    unsupportedDirectEnrichment?: boolean;
  };
  relevantCandidate: boolean;
  fullyQualifyingCandidate: boolean;
  qualificationReasons: string[];
  productionDecision: {
    accepted: boolean;
    rejectionReason: string | null;
  };
  evidenceCoverage: {
    priceKind: PriceEvidence;
    price: number | null;
    dimensionKinds: EvidenceKind[];
    materialKinds: EvidenceKind[];
    colorKinds: EvidenceKind[];
  };
};

export type RunFailureClass =
  | "SEARCH_MISS"
  | "EVIDENCE_MISS"
  | "ENRICHMENT_MISS"
  | "HARD_CONSTRAINT_MISS"
  | "OTHER";

export type ProviderEvidenceHealth = {
  webSearchCallCount: number;
  sourceCount: number;
  sourceUrls: string[];
  sourceTitlesPresent: number;
  sourceSnippetsPresent: number;
  citationEvidenceCount: number;
  distinctSourceDomains: string[];
};

function mapEnrichmentStatus(status: EnrichmentStatus | null | undefined): FrozenEnrichmentStatus {
  if (!status) return "not_attempted";
  if (status === "success") return "success";
  if (status === "forbidden") return "forbidden";
  return "failed";
}

/** Build the shared ProductEvidence object production acceptance consumes. */
export function buildCandidateProductEvidence(candidate: RescueCandidate): ProductEvidence {
  const trustedName =
    candidate.enrichment?.productName?.trim() ||
    candidate.enrichment?.pageTitle?.trim() ||
    candidate.sourceTitle?.trim() ||
    null;
  return buildProductEvidence({
    productUrl: candidate.url,
    sources: [
      {
        url: candidate.url,
        title: candidate.sourceTitle,
        snippet: candidate.sourceEvidence,
      },
    ],
    enrichment: candidate.enrichment,
    trustedDisplayName: trustedName,
  });
}

export function serializeProductEvidence(evidence: ProductEvidence): ProductEvidence {
  return JSON.parse(JSON.stringify(evidence)) as ProductEvidence;
}

export function deserializeProductEvidence(raw: unknown): ProductEvidence {
  if (!raw || typeof raw !== "object") {
    throw new Error("Invalid ProductEvidence payload");
  }
  const record = raw as Record<string, unknown>;
  const required = [
    "productUrl",
    "productNameEvidence",
    "categoryEvidence",
    "priceEvidence",
    "materialEvidence",
    "colorEvidence",
    "dimensionEvidence",
    "generalTextEvidence",
  ] as const;
  for (const key of required) {
    if (!(key in record)) throw new Error(`Missing ProductEvidence field: ${key}`);
  }
  const evidence = serializeProductEvidence(raw as ProductEvidence);
  for (const group of [
    evidence.productNameEvidence,
    evidence.categoryEvidence,
    evidence.priceEvidence,
    evidence.materialEvidence,
    evidence.colorEvidence,
    evidence.dimensionEvidence,
    evidence.generalTextEvidence,
  ]) {
    for (const fact of group) {
      if (typeof fact.kind !== "string" || typeof fact.field !== "string") {
        throw new Error("EvidenceFact missing kind/field");
      }
      if (!("value" in fact) || !("text" in fact) || !("url" in fact)) {
        throw new Error("EvidenceFact missing value/text/url");
      }
    }
  }
  return evidence;
}

function factKey(fact: EvidenceFact): string {
  return [
    fact.kind,
    fact.field,
    fact.url ?? "",
    fact.text ?? "",
    fact.value == null ? "" : String(fact.value),
  ].join("|");
}

export function productEvidenceSemanticallyEqual(a: ProductEvidence, b: ProductEvidence): boolean {
  if (a.productUrl !== b.productUrl) return false;
  const groups: Array<Exclude<keyof ProductEvidence, "productUrl">> = [
    "productNameEvidence",
    "categoryEvidence",
    "priceEvidence",
    "materialEvidence",
    "colorEvidence",
    "dimensionEvidence",
    "generalTextEvidence",
  ];
  for (const group of groups) {
    const left = [...a[group]].map(factKey).sort();
    const right = [...b[group]].map(factKey).sort();
    if (left.length !== right.length) return false;
    for (let i = 0; i < left.length; i++) {
      if (left[i] !== right[i]) return false;
    }
  }
  return true;
}

function evidenceKindsPresentInText(
  evidence: ProductEvidence,
  predicate: (text: string) => boolean
): EvidenceKind[] {
  const kinds = new Set<EvidenceKind>();
  const all = [
    ...evidence.productNameEvidence,
    ...evidence.categoryEvidence,
    ...evidence.priceEvidence,
    ...evidence.materialEvidence,
    ...evidence.colorEvidence,
    ...evidence.dimensionEvidence,
    ...evidence.generalTextEvidence,
  ];
  for (const fact of all) {
    const text = (fact.text ?? (fact.value != null ? String(fact.value) : "")).toLowerCase();
    if (text && predicate(text)) kinds.add(fact.kind);
  }
  return [...kinds];
}

/**
 * Category-relevant candidate from ProductEvidence only (not fully qualifying).
 */
export function isRelevantCandidateFromEvidence(
  requestedItem: string,
  evidence: ProductEvidence
): boolean {
  const hay = trustedEvidenceHaystack(evidence).toLowerCase();
  const identity = parseProductIdentity(requestedItem);
  const categoryHay = categoryEvidenceHaystack({
    productName: "",
    evidenceText: trustedEvidenceHaystack(evidence),
  });
  if (!verifyCoreCategoryInEvidence(identity, categoryHay)) return false;

  if (/\bheated\s+towel\s+rail\b/i.test(requestedItem)) {
    if (/\b(drzalo|towel holder|holder)\b/i.test(hay) && !/\b(radiator|ogrev)\b/i.test(hay)) {
      return false;
    }
    return /\b(radiator|ogrev|towel radiator|heated towel|brisac)\b/i.test(hay);
  }
  if (/\bvase\b/i.test(requestedItem)) {
    if (/\b(tile|tiles|ploscic|plosic|granitogres)\b/i.test(hay) && !/\b(vase|vaza)\b/i.test(hay)) {
      return false;
    }
    return /\b(vase|vaza)\b/i.test(hay);
  }
  if (/\bpendant\s+lamp\b/i.test(requestedItem)) {
    return /\b(pendant|viseca|visilka|hanging)\b/i.test(hay);
  }
  if (/\bkitchen\s+sink\b/i.test(requestedItem)) {
    return /\b(sink|korito|pomival)\b/i.test(hay);
  }
  return true;
}

/**
 * Freeze a candidate with full ProductEvidence + production-aligned qualification.
 * Model claims are retained for diagnostics only and never used for qualification.
 */
export function assessFrozenEvidenceCandidate(input: {
  requestedItem: string;
  candidate: RescueCandidate;
  modelClaims?: FrozenEvidenceCandidate["modelClaims"];
}): FrozenEvidenceCandidate {
  const evidence = buildCandidateProductEvidence(input.candidate);
  const grounded = resolveGroundedPrice({
    evidence,
    modelClaimedPrice: null,
    serpSnippetPrice: input.candidate.serpSnippetPrice ?? null,
  });
  const gt = assessAcceptanceAlignedQualification(input.requestedItem, input.candidate);
  const enrichment = input.candidate.enrichment;
  const enrichmentStatus = mapEnrichmentStatus(enrichment?.status);

  return {
    candidateId: input.candidate.id,
    productUrl: input.candidate.url,
    evidence: serializeProductEvidence(evidence),
    modelClaims: input.modelClaims,
    enrichmentStatus,
    enrichmentDetail: {
      attempted: enrichment != null,
      status: enrichment?.status ?? "not_attempted",
      jsonLdProductFound: enrichment?.jsonLdProductFound === true,
      merchantTitle: Boolean(enrichment?.productName || enrichment?.pageTitle),
      merchantPrice: enrichment?.status === "success" && enrichment.price != null,
      merchantMaterialOrSpecs: Boolean(
        enrichment?.status === "success" &&
          ((enrichment.labeledSpecs?.length ?? 0) > 0 ||
            (enrichment.productText && enrichment.productText.length > 40))
      ),
      failureClass: enrichment?.status ?? "not_attempted",
      labeledDimensionsFound:
        enrichment?.merchantEvidenceDiagnostics?.labeledDimensionsFound ??
        enrichment?.labeledSpecs?.filter((s) => s.field === "dimension").length ??
        0,
      materialFound:
        enrichment?.merchantEvidenceDiagnostics?.materialFound ??
        enrichment?.labeledSpecs?.some((s) => s.field === "material") ??
        false,
      colorFound:
        enrichment?.merchantEvidenceDiagnostics?.colorFound ??
        enrichment?.labeledSpecs?.some((s) => s.field === "color") ??
        false,
      extractionMethods: enrichment?.merchantEvidenceDiagnostics?.extractionMethods ?? [],
      httpStatus: enrichment?.merchantEvidenceDiagnostics?.httpStatus ?? null,
      priceSource:
        enrichment?.verifiedPrice?.source ??
        enrichment?.merchantEvidenceDiagnostics?.priceSource ??
        null,
      priceFailureReason:
        enrichment?.priceFailureReason ??
        enrichment?.merchantEvidenceDiagnostics?.priceFailureReason ??
        null,
      priceKind:
        enrichment?.verifiedPrice?.kind ??
        enrichment?.merchantEvidenceDiagnostics?.priceKind ??
        null,
      enrichmentDurationMs: enrichment?.enrichmentTiming?.totalMs ?? null,
      cacheHit: enrichment?.enrichmentTiming?.cacheHit ?? null,
      fetchBlockReason: enrichment?.merchantEvidenceDiagnostics?.fetchBlockReason ?? null,
      fetchSuccessKind: enrichment?.merchantEvidenceDiagnostics?.fetchSuccessKind ?? null,
      acquisitionSource: enrichment?.merchantEvidenceDiagnostics?.acquisitionSource ?? null,
      adapterId: enrichment?.merchantEvidenceDiagnostics?.adapterId ?? null,
      unsupportedDirectEnrichment:
        enrichment?.merchantEvidenceDiagnostics?.unsupportedDirectEnrichment ?? false,
    },
    relevantCandidate: isRelevantCandidateFromEvidence(input.requestedItem, evidence),
    fullyQualifyingCandidate: gt.qualifies,
    qualificationReasons: gt.reasons,
    productionDecision: {
      accepted: gt.acceptanceAccepted,
      rejectionReason: gt.acceptanceAccepted ? null : gt.acceptanceReason,
    },
    evidenceCoverage: {
      priceKind: grounded.priceEvidence,
      price: grounded.price,
      dimensionKinds: evidenceKindsPresentInText(evidence, (t) =>
        /\b\d+(?:[.,]\d+)?\s*(?:cm|mm)\b|\b\d{3,4}\s*x\b|\b600x|\b400x|\b300x/.test(t)
      ),
      materialKinds: evidenceKindsPresentInText(evidence, (t) =>
        /\b(metal|kovin\w*|inox|nerjav\w*|stainless|steel|jekl[oa]?|ceramic|keramik|chrome|krom)\b/.test(
          t
        )
      ),
      colorKinds: evidenceKindsPresentInText(evidence, (t) =>
        /\b(black|crna|white|bela|chrome|krom)\b/.test(t)
      ),
    },
  };
}

export function classifyRunFailure(input: {
  productionAccepted: boolean;
  candidates: FrozenEvidenceCandidate[];
}): { primary: RunFailureClass; secondary: RunFailureClass[] } {
  if (input.productionAccepted) {
    return { primary: "OTHER", secondary: [] };
  }
  const relevant = input.candidates.filter((c) => c.relevantCandidate);
  const fully = input.candidates.filter((c) => c.fullyQualifyingCandidate);
  if (fully.length > 0) {
    return { primary: "OTHER", secondary: ["EVIDENCE_MISS"] };
  }
  if (relevant.length === 0) {
    return { primary: "SEARCH_MISS", secondary: [] };
  }

  const hardConstraint = relevant.some((c) =>
    c.qualificationReasons.some((r) => r.includes("wrong ") || r.includes("over budget"))
  );
  if (hardConstraint) {
    return { primary: "HARD_CONSTRAINT_MISS", secondary: ["EVIDENCE_MISS"] };
  }

  const needsMerchantForPrice = relevant.every((c) => c.evidenceCoverage.priceKind === "none");
  const enrichmentBlocked = relevant.every(
    (c) => c.enrichmentStatus === "forbidden" || c.enrichmentStatus === "failed"
  );
  const anyEnrichmentFail = relevant.some(
    (c) => c.enrichmentStatus === "forbidden" || c.enrichmentStatus === "failed"
  );

  if ((enrichmentBlocked || anyEnrichmentFail) && needsMerchantForPrice) {
    return { primary: "ENRICHMENT_MISS", secondary: ["EVIDENCE_MISS"] };
  }

  return { primary: "EVIDENCE_MISS", secondary: anyEnrichmentFail ? ["ENRICHMENT_MISS"] : [] };
}

export function summarizeProviderEvidenceHealth(
  sources: ProductDiscoverySource[],
  diagnostics?: {
    primaryWebSearchCallCount?: number;
    primaryDistinctSourceDomains?: string[];
  }
): ProviderEvidenceHealth {
  const titles = sources.filter((s) => !!s.title?.trim()).length;
  const snippets = sources.filter((s) => !!s.snippet?.trim()).length;
  const citationUsable = sources.filter(
    (s) => (!!s.title?.trim() || !!s.snippet?.trim()) && s.url.startsWith("http")
  ).length;
  return {
    webSearchCallCount: diagnostics?.primaryWebSearchCallCount ?? 0,
    sourceCount: sources.length,
    sourceUrls: sources.map((s) => s.url),
    sourceTitlesPresent: titles,
    sourceSnippetsPresent: snippets,
    citationEvidenceCount: citationUsable,
    distinctSourceDomains: diagnostics?.primaryDistinctSourceDomains ?? [],
  };
}

export function freezeEvidenceCandidatesRoundTrip(
  candidates: FrozenEvidenceCandidate[]
): FrozenEvidenceCandidate[] {
  return JSON.parse(JSON.stringify(candidates)) as FrozenEvidenceCandidate[];
}

/** Count verified web_search prices recoverable from provider source title/snippet text. */
export function countVerifiedWebSearchPricesFromSources(
  sources: ProductDiscoverySource[]
): number {
  const priceRe =
    /(?:€|eur)\s*\d{1,6}(?:[.,]\d{1,2})?|\d{1,6}(?:[.,]\d{1,2})?\s*(?:€|eur)/i;
  return sources.filter((s) => {
    const text = `${s.title ?? ""} ${s.snippet ?? ""}`;
    return priceRe.test(text);
  }).length;
}
