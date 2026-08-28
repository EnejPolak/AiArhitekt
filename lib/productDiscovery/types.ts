export type ProductDiscoveryStatus = "found" | "not_found" | "no_retailers" | "error";

export type PriceEvidence = "merchant_page" | "web_search" | "none";

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
  acceptanceChecked?: boolean;
  acceptanceSource?: "primary" | "rescue" | "targeted" | null;
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
};

export type ProductDiscoveryResult = {
  requestedItem: string;
  status: ProductDiscoveryStatus;
  product: ProductDiscoveryProduct | null;
  sources: ProductDiscoverySource[];
  diagnostics?: ProductDiscoveryDiagnostics;
};
