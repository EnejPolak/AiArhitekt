import { z } from "zod";
import {
  associateProductImage,
  type ProductReferenceFailureCode,
} from "@/lib/references/imageEvidence";
import type { FetchLike } from "@/lib/references/fetchImage";
import type { AddressLookup } from "@/lib/references/ssrf";
import type { CanonicalSelectionFields } from "./mapProduct";
import { usableProductImageUrl } from "./mapProduct";
import {
  downloadCandidateReferenceImage,
  enrichRankedCandidateFromProductPage,
} from "./candidatePageEnrichment";
import {
  unmatchedRequirementSchema,
  type SearchableRequirement,
  type UnmatchedRequirement,
} from "./itemSpecs";
import type { RankedProductCandidate } from "./style/types";
import type { ResolvedDiscoverySelection } from "./resolveProducts";
import {
  MAX_RECOVERY_SEARCHES_PER_REQUIREMENT,
  candidateUrlKey,
  mergeRankedCandidatePool,
  type RequirementCandidatePool,
} from "./candidatePool";

export {
  MAX_CANDIDATES_PER_REQUIREMENT,
  MAX_RECOVERY_SEARCHES_PER_REQUIREMENT,
  mergeRankedCandidatePool,
  type RequirementCandidatePool,
} from "./candidatePool";
export { isRequiredUnresolvedReason } from "./itemSpecs";

export type RequirementSlotStatus = "pending" | "resolving" | "ready" | "unresolved";

export const CANDIDATE_FAILURE_CODES = [
  "association_unverified",
  "invalid_image",
  "merchant_blocked",
  "category_unverified",
  "no_image",
  "fetch_failed",
  "wrong_category",
  "wrong_product",
] as const;

export type CandidateFailureCode = (typeof CANDIDATE_FAILURE_CODES)[number] | string;

export const rejectedCandidateSchema = z.object({
  productUrl: z.string().min(1).max(2048),
  merchant: z.string().min(1).max(253),
  failureCode: z.string().min(1).max(80),
});

export type RejectedCandidate = z.infer<typeof rejectedCandidateSchema>;

export type RenderReadyEvaluation = {
  ready: boolean;
  failureCode?: string;
  cachedBytesValid?: boolean;
};

export {
  completeRoomGate,
  isArchitecturalFinishRequirement,
  type CompleteRoomGate,
} from "./completeRoomGate";

export function isRejectedCandidateUrl(
  rejected: RejectedCandidate[],
  productUrl: string
): boolean {
  const key = candidateUrlKey(productUrl);
  return rejected.some((item) => candidateUrlKey(item.productUrl) === key);
}

export function rememberRejectedCandidate(
  rejected: RejectedCandidate[],
  next: RejectedCandidate
): RejectedCandidate[] {
  const key = candidateUrlKey(next.productUrl);
  const parsed = rejectedCandidateSchema.parse(next);
  if (isRejectedCandidateUrl(rejected, next.productUrl)) {
    return rejected.map((item) => (candidateUrlKey(item.productUrl) === key ? parsed : item));
  }
  return [...rejected, parsed];
}

export function evaluateCandidateRenderReady(
  candidate: RankedProductCandidate
): RenderReadyEvaluation {
  if (!candidate.hardValid) {
    return { ready: false, failureCode: "category_unverified" };
  }
  const product = candidate.product;
  if (!product.productUrl) {
    return { ready: false, failureCode: "wrong_product" };
  }
  const imageUrl = product.productImageUrl;
  if (!imageUrl) {
    return { ready: false, failureCode: "no_image" };
  }
  const associated = associateProductImage({
    url: imageUrl,
    source: "search_evidence",
    productUrl: product.productUrl,
    merchantDomain: product.retailerDomain,
    sourcePageUrl: product.productUrl,
  });
  const evidence = (product as CanonicalSelectionFields).imageEvidence ?? [];
  const evidenceReady = evidence.some((item) => item.exactProductAssociation);
  if (!associated && !evidenceReady) {
    return { ready: false, failureCode: "association_unverified" };
  }
  return { ready: true, cachedBytesValid: false };
}

export function recoveryExcludeProductUrls(rejected: RejectedCandidate[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of rejected) {
    const key = candidateUrlKey(item.productUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.productUrl);
  }
  return out;
}

/** Session-only: merchant pages repeatedly failed reference fetch in this resolution attempt. */
export const MERCHANT_DOMAIN_STATUS_REFERENCE_FETCH_BLOCKED = "reference_fetch_blocked";
const REFERENCE_FETCH_BLOCKED_DOMAIN_MIN = 2;

function merchantDomainKey(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/^www\./, "");
}

export function referenceFetchBlockedDomains(rejected: RejectedCandidate[]): string[] {
  const counts = new Map<string, number>();
  for (const item of rejected) {
    if (item.failureCode !== "merchant_blocked") continue;
    const domain = merchantDomainKey(item.merchant);
    if (!domain) continue;
    counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= REFERENCE_FETCH_BLOCKED_DOMAIN_MIN)
    .map(([domain]) => domain)
    .sort();
}

export function deprioritizeBlockedMerchantCandidates(
  candidates: RankedProductCandidate[],
  blockedDomains: string[]
): RankedProductCandidate[] {
  if (!blockedDomains.length) return candidates;
  const blocked = new Set(blockedDomains.map((domain) => merchantDomainKey(domain)));
  const preferred: RankedProductCandidate[] = [];
  const rest: RankedProductCandidate[] = [];
  for (const candidate of candidates) {
    const domain = merchantDomainKey(candidate.product.retailerDomain);
    if (blocked.has(domain)) rest.push(candidate);
    else preferred.push(candidate);
  }
  return [...preferred, ...rest];
}

export function requirementRetrySearchHints(rejected: RejectedCandidate[]): {
  excludeProductUrls: string[];
  referenceFetchBlockedDomains: string[];
} {
  return {
    excludeProductUrls: recoveryExcludeProductUrls(rejected),
    referenceFetchBlockedDomains: referenceFetchBlockedDomains(rejected),
  };
}

export async function evaluateCandidateRenderReadyWithFetch(
  candidate: RankedProductCandidate,
  options: { fetch?: FetchLike; lookup?: AddressLookup } = {}
): Promise<RenderReadyEvaluation> {
  if (!candidate.hardValid) {
    return { ready: false, failureCode: "category_unverified" };
  }
  if (!candidate.product.productUrl) {
    return { ready: false, failureCode: "wrong_product" };
  }

  // Valid merchant URL + category is enough to attempt one product-page enrichment.
  // Step C imageUrl is only a claim and must not block that fetch.
  // Production actions pass fetch: globalThis.fetch. Tests omit fetch to stay offline.
  if (options.fetch) {
    const page = await enrichRankedCandidateFromProductPage(candidate, options);
    const hasImage =
      usableProductImageUrl(candidate.product.productImageUrl) != null ||
      ((candidate.product as CanonicalSelectionFields).imageEvidence ?? []).some(
        (item) => item.exactProductAssociation
      );
    if (!hasImage) {
      return { ready: false, failureCode: page.failureCode ?? "no_image" };
    }
  }

  const base = evaluateCandidateRenderReady(candidate);
  if (!base.ready) return base;
  return downloadCandidateReferenceImage(candidate, options);
}

export async function selectFirstRenderReadyCandidate(input: {
  candidates: RankedProductCandidate[];
  rejected?: RejectedCandidate[];
  evaluate: (
    candidate: RankedProductCandidate
  ) => RenderReadyEvaluation | Promise<RenderReadyEvaluation>;
}): Promise<{
  selected: RankedProductCandidate | null;
  rejected: RejectedCandidate[];
  cachedBytesValid: boolean;
}> {
  let rejected = [...(input.rejected ?? [])];
  for (const candidate of input.candidates) {
    if (isRejectedCandidateUrl(rejected, candidate.product.productUrl)) continue;
    const verdict = await input.evaluate(candidate);
    if (verdict.ready) {
      return {
        selected: candidate,
        rejected,
        cachedBytesValid: verdict.cachedBytesValid === true,
      };
    }
    rejected = rememberRejectedCandidate(rejected, {
      productUrl: candidate.product.productUrl,
      merchant: candidate.product.retailerDomain || candidate.product.retailerName || "unknown",
      failureCode: verdict.failureCode ?? "no_image",
    });
  }
  return { selected: null, rejected, cachedBytesValid: false };
}

export type RecoverRequirementCandidates = (input: {
  requirement: SearchableRequirement;
  rejected: RejectedCandidate[];
}) => Promise<RankedProductCandidate[]> | RankedProductCandidate[];

export async function resolveRequirementSlot(input: {
  requirement: SearchableRequirement;
  candidates: RankedProductCandidate[];
  rejected?: RejectedCandidate[];
  recoverySearchesUsed?: number;
  evaluate: (
    candidate: RankedProductCandidate
  ) => RenderReadyEvaluation | Promise<RenderReadyEvaluation>;
  recover?: RecoverRequirementCandidates;
}): Promise<{
  status: RequirementSlotStatus;
  selected: RankedProductCandidate | null;
  rejected: RejectedCandidate[];
  recoverySearchesUsed: number;
  recoveredFromSearch: boolean;
  cachedBytesValid: boolean;
}> {
  let rejected = [...(input.rejected ?? [])];
  let recoverySearchesUsed = input.recoverySearchesUsed ?? 0;
  let recoveredFromSearch = false;

  const first = await selectFirstRenderReadyCandidate({
    candidates: input.candidates,
    rejected,
    evaluate: input.evaluate,
  });
  rejected = first.rejected;
  if (first.selected) {
    return {
      status: "ready",
      selected: first.selected,
      rejected,
      recoverySearchesUsed,
      recoveredFromSearch,
      cachedBytesValid: first.cachedBytesValid,
    };
  }

  if (
    input.recover &&
    recoverySearchesUsed < MAX_RECOVERY_SEARCHES_PER_REQUIREMENT
  ) {
    recoverySearchesUsed += 1;
    recoveredFromSearch = true;
    const extra = await input.recover({ requirement: input.requirement, rejected });
    const pool = mergeRankedCandidatePool(
      [],
      extra.filter((candidate) => !isRejectedCandidateUrl(rejected, candidate.product.productUrl))
    );
    const second = await selectFirstRenderReadyCandidate({
      candidates: pool,
      rejected,
      evaluate: input.evaluate,
    });
    rejected = second.rejected;
    if (second.selected) {
      return {
        status: "ready",
        selected: second.selected,
        rejected,
        recoverySearchesUsed,
        recoveredFromSearch,
        cachedBytesValid: second.cachedBytesValid,
      };
    }
  }

  return {
    status: "unresolved",
    selected: null,
    rejected,
    recoverySearchesUsed,
    recoveredFromSearch,
    cachedBytesValid: false,
  };
}

export function selectionFromRenderReadyCandidate(
  requirement: SearchableRequirement,
  winner: RankedProductCandidate
): ResolvedDiscoverySelection {
  const product = winner.product as CanonicalSelectionFields;
  return {
    requirementType: requirement.requirementType,
    requirementKey: requirement.requirementKey,
    requirementSnapshot: {
      ...requirement.snapshot,
      displayLabel: requirement.displayLabel,
      provenance: requirement.provenance,
      styleFit: winner.styleFit,
      discoveryQuery: requirement.queryPlan[0] ?? requirement.itemSpec,
      discoveryQueryLevel: 1,
      searchLocale: requirement.searchLocale,
      searchCountryCode: requirement.searchCountryCode ?? null,
    },
    itemSpec: requirement.itemSpec,
    product,
  };
}

export function toUnresolvedUnmatched(input: {
  requirement: SearchableRequirement;
  reason?: Extract<UnmatchedRequirement["reason"], "no_valid_product" | "search_interrupted">;
  rejected: RejectedCandidate[];
  recoverySearchesUsed: number;
}): UnmatchedRequirement {
  return unmatchedRequirementSchema.parse({
    requirementKey: input.requirement.requirementKey,
    requirementType: input.requirement.requirementType,
    itemSpec: input.requirement.itemSpec,
    displayLabel: input.requirement.displayLabel,
    reason: input.reason ?? "no_valid_product",
    rejectedCandidates: input.rejected,
    recoverySearchesUsed: input.recoverySearchesUsed,
  });
}

export function markSlotUserRemoved(item: UnmatchedRequirement): UnmatchedRequirement {
  return unmatchedRequirementSchema.parse({
    ...item,
    reason: "user_removed",
  });
}

export async function resolveCompleteRoomSelections(input: {
  searched: SearchableRequirement[];
  pools: RequirementCandidatePool[];
  searchUnmatched: UnmatchedRequirement[];
  evaluate: (
    candidate: RankedProductCandidate
  ) => RenderReadyEvaluation | Promise<RenderReadyEvaluation>;
  recover?: RecoverRequirementCandidates;
}): Promise<{
  selections: ResolvedDiscoverySelection[];
  unmatched: UnmatchedRequirement[];
  recoverySearchCount: number;
  rejectedByRequirement: Record<string, RejectedCandidate[]>;
}> {
  const poolByKey = new Map(
    input.pools.map((pool) => [pool.requirement.requirementKey, pool.candidates])
  );
  const searchUnmatchedByKey = new Map(
    input.searchUnmatched.map((item) => [item.requirementKey, item])
  );
  const selections: ResolvedDiscoverySelection[] = [];
  const unmatched: UnmatchedRequirement[] = [];
  const rejectedByRequirement: Record<string, RejectedCandidate[]> = {};
  let recoverySearchCount = 0;

  for (const requirement of input.searched) {
    const prior = searchUnmatchedByKey.get(requirement.requirementKey);
    const slot = await resolveRequirementSlot({
      requirement,
      candidates: poolByKey.get(requirement.requirementKey) ?? [],
      rejected: prior?.rejectedCandidates ?? [],
      recoverySearchesUsed: prior?.recoverySearchesUsed ?? 0,
      evaluate: input.evaluate,
      recover: input.recover,
    });
    recoverySearchCount += slot.recoveredFromSearch ? slot.recoverySearchesUsed : 0;
    rejectedByRequirement[requirement.requirementKey] = slot.rejected;
    if (slot.status === "ready" && slot.selected) {
      selections.push(selectionFromRenderReadyCandidate(requirement, slot.selected));
      continue;
    }
    unmatched.push(
      toUnresolvedUnmatched({
        requirement,
        reason: prior?.reason === "search_interrupted" ? "search_interrupted" : "no_valid_product",
        rejected: slot.rejected,
        recoverySearchesUsed: slot.recoverySearchesUsed,
      })
    );
  }

  return { selections, unmatched, recoverySearchCount, rejectedByRequirement };
}

export function renderInventoryExcludesRejected(
  inventoryProductUrls: string[],
  rejected: RejectedCandidate[]
): boolean {
  return !inventoryProductUrls.some((url) => isRejectedCandidateUrl(rejected, url));
}

export function failureCodeFromReference(
  code: ProductReferenceFailureCode | string | null | undefined
): CandidateFailureCode {
  if (!code) return "fetch_failed";
  return code;
}
