export type ProductDiscoveryStatus = "found" | "not_found" | "no_retailers" | "error";

export type PriceEvidence = "merchant_page" | "web_search" | "serp" | "none";

export type ProductDiscoveryProduct = {
  name: string;
  retailer: string;
  retailerDomain: string;
  productUrl: string;
  price: number | null;
  currency: string | null;
  priceUnit: string | null;
  imageUrl: string | null;
  specifications: Record<string, string | number | boolean | null>;
  matchScore: number;
  matchedRequirements: string[];
  unmetRequirements: string[];
  unknownRequirements: string[];
  whyItMatches: string;
  priceEvidence?: PriceEvidence;
};

export type ProductDiscoverySource = {
  title: string | null;
  url: string;
  /** Provider-visible snippet/description when the Responses API exposes it. */
  snippet?: string | null;
};

export type ProductDiscoveryDiagnostics = {
  searchUsed: boolean;
  allowedDomainsCount: number;
  elapsedMs?: number;
  errorCode?: string;
  rescueAttempted?: boolean;
  rescueCandidateCount?: number;
  rescueSucceeded?: boolean;
  rescueElapsedMs?: number;
  rescueSelectedCandidateId?: string | null;
  initialFailureReason?: "model_not_found" | "url_not_in_sources" | "domain_not_allowed" | null;
  primaryStatus?: "found" | "not_found";
  enrichmentAttemptedCount?: number;
  enrichmentSuccessCount?: number;
  enrichment403Count?: number;
  enrichmentTimeoutCount?: number;
  /** Rescue-path enrichment counts; not overwritten by targeted. api-debug. */
  rescueEnrichmentAttemptedCount?: number;
  rescueEnrichmentSuccessCount?: number;
  targetedEnrichmentAttemptedCount?: number;
  targetedEnrichmentSuccessCount?: number;
  targetedSelectedCandidateId?: string | null;
  /** Per-candidate enrichment debug (local/api-debug). Never includes HTML. */
  enrichmentCandidateDebug?: Array<{
    candidateId: string;
    url?: string;
    domain: string;
    preRankScore: number;
    fetchStatus: string;
    jsonLdProductFound: boolean;
    priceFound: boolean;
    productNameFound: boolean;
    materialFound?: boolean;
    labeledDimensionsFound?: number;
  }>;
  /** Rescue-path per-candidate debug; not overwritten by targeted. api-debug. */
  rescueEnrichmentCandidateDebug?: ProductDiscoveryDiagnostics["enrichmentCandidateDebug"];
  /** api-debug. Selected-candidate enrichment after ranking (max 1 extra fetch). */
  rescueSelectedCandidateEnrichment?: {
    candidateId: string;
    wasInitiallyEnriched: boolean;
    cacheHit: boolean;
    enrichmentAttempted: boolean;
    enrichmentStatus: string | null;
    evidenceFactsAdded: number;
    additionalFetchAttempts?: number;
    coverageBefore?: { price: boolean; material: boolean; labeledDimensions: number };
    coverageAfter?: { price: boolean; material: boolean; labeledDimensions: number };
  };
  selectedAdditionalEnrichmentAttempts?: number;
  acceptanceChecked?: boolean;
  acceptanceSource?: "primary" | "rescue" | "targeted" | "serp_fallback" | null;
  acceptanceScore?: number | null;
  requirementCoverage?: number | null;
  acceptanceReason?: string | null;
  rescueSelected?: boolean;
  rejectedProduct?: ProductDiscoveryProduct | null;
  targetedResearchAttempted?: boolean;
  targetedResearchSearchUsed?: boolean;
  targetedResearchSourceCount?: number;
  targetedResearchAccepted?: boolean;
  targetedResearchDurationMs?: number | null;
  targetedFailureReasonBeforeSearch?: string | null;
  targetedRecovered?: boolean;
  targetedResultAcceptanceReason?: string | null;
  priceVerificationAttempted?: boolean;
  priceVerificationStatus?: "verified" | "not_found" | "conflicting" | "error" | null;
  priceVerificationEvidence?: PriceEvidence | null;
  priceVerificationPrice?: number | null;
  priceVerificationRecovered?: boolean;
  priceVerificationDurationMs?: number | null;
  priceVerificationSucceeded?: boolean;
  openAiFinalFailureReason?: string | null;
  /** Whether PRODUCT_DISCOVERY_SERP_FALLBACK was enabled for this request. */
  serpFallbackEnabled?: boolean;
  serpFallbackEligible?: boolean;
  serpFallbackReason?: string | null;
  serpFallbackAttempted?: boolean;
  serpFallbackQueryCount?: number;
  serpFallbackCandidateCount?: number;
  serpFallbackSelectedCandidateId?: string | null;
  serpFallbackAccepted?: boolean;
  serpFallbackDurationMs?: number | null;
  /**
   * Raw OpenAI Responses API usage from calls already made in this request.
   * Not a dollar estimate. Missing fields stay null when the SDK omits them.
   */
  openAiUsage?: {
    inputTokens: number | null;
    cachedInputTokens: number | null;
    outputTokens: number | null;
    webSearchCalls: number | null;
  };
  /** Provider-visible primary web_search actions (no chain-of-thought). */
  primaryWebSearchCallCount?: number;
  primarySearchQueries?: string[];
  primarySourceCount?: number;
  primaryDistinctSourceDomains?: string[];
  /** Evidence grounding diagnostics for the selected candidate (dev/api-debug). */
  evidenceDiagnostics?: {
    groundedRequirements: string[];
    unsupportedModelClaims: string[];
    priceEvidenceKind: PriceEvidence;
    evidenceSourceCount: number;
    merchantEvidenceAvailable: boolean;
    modelReportedPrice?: number | null;
    merchantEvidence?: {
      status?: string;
      canonicalUrl?: string | null;
      productName?: { found: boolean; sourcePath?: string };
      price?: {
        found: boolean;
        amount?: number;
        currency?: string | null;
        extractionMethod?: string;
        sourcePath?: string | null;
        excerpt?: string | null;
      };
      materialsFound?: number;
      colorsFound?: number;
      labeledDimensionsFound?: number;
      extractionMethods?: string[];
    };
  };
  /**
   * Server-side model routing (api-debug / diagnostics only).
   * Not a customer-facing product field.
   */
  modelRouting?: {
    lunaPrimaryEnabled: boolean;
    primaryModel: string;
    targetedModel: string;
  };
  primaryModel?: string;
  targetedAttempted?: boolean;
  targetedModel?: string | null;
  usageByStage?: {
    primary?: {
      modelUsed: string;
      inputTokens: number | null;
      cachedInputTokens: number | null;
      outputTokens: number | null;
      webSearchCalls: number | null;
    } | null;
    targeted?: {
      modelUsed: string;
      inputTokens: number | null;
      cachedInputTokens: number | null;
      outputTokens: number | null;
      webSearchCalls: number | null;
    } | null;
  };
  /**
   * Exact ProductEvidence + acceptance outcome at decision time.
   * Used for benchmark parity; not required for clients.
   * Provenance excerpts/sourcePaths are development/api-debug audit fields.
   */
  acceptedDecisionSnapshot?: {
    requestedItem: string;
    path: "primary" | "rescue" | "targeted" | "price_verification" | "serp";
    productUrl: string;
    productEvidence: import("./productEvidence").ProductEvidence;
    normalizedRequirements: {
      matchedRequirements: string[];
      unmetRequirements: string[];
      unknownRequirements: string[];
    };
    acceptanceResult: {
      accepted: boolean;
      score: number;
      coverage: number;
      reason: string | null;
    };
  };
  /**
   * api-debug only. Final rejected candidate ProductEvidence.
   * Not a customer-facing field.
   */
  rejectedDecisionSnapshot?: {
    requestedItem: string;
    path: "primary" | "rescue" | "targeted" | "price_verification" | "serp";
    candidateId: string | null;
    productUrl: string;
    productEvidence: import("./productEvidence").ProductEvidence;
    normalizedRequirements: {
      matchedRequirements: string[];
      unmetRequirements: string[];
      unknownRequirements: string[];
    };
    acceptanceResult: {
      accepted: boolean;
      score: number;
      coverage: number;
      reason: string | null;
    };
    rejectionReason: string | null;
  };
  /** api-debug. Rescue rejection before targeted overwrite. */
  rescueRejectedDecisionSnapshot?: ProductDiscoveryDiagnostics["rejectedDecisionSnapshot"];
};

export type ProductDiscoveryResult = {
  requestedItem: string;
  status: ProductDiscoveryStatus;
  product: ProductDiscoveryProduct | null;
  sources: ProductDiscoverySource[];
  diagnostics?: ProductDiscoveryDiagnostics;
};
