import type {
  CanonicalSerpResponse,
  CanonicalSerpSearchInput,
  CanonicalSerpSearchOutcome,
} from "@/lib/serp/search";
import { OPENAI_PRODUCT_SEARCH_CONCURRENCY, OPENAI_PRODUCT_SEARCH_TIMEOUT_MS } from "./constants";
import { productDiscoveryResultToCanonicalItem } from "./adapter";
import { attachStepCCandidatePool } from "./stepCCandidates";
import { normalizeProductDiscoveryAllowlist } from "./domains";
import { searchProductItem } from "./searchItem";
import type { ProductDiscoveryResult } from "./types";

function normalizeItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function openaiKeyConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

function remainingMs(deadlineAt?: number): number | null {
  if (!deadlineAt) return null;
  return deadlineAt - Date.now();
}

function deadlineSkippedResult(
  requestedItem: string,
  allowedDomainsCount: number
): ProductDiscoveryResult {
  return {
    requestedItem,
    status: "error",
    product: null,
    sources: [],
    diagnostics: {
      searchUsed: false,
      allowedDomainsCount,
      errorCode: "deadline",
    },
  };
}

function noRetailersResults(items: string[]): ProductDiscoveryResult[] {
  return items.map((requestedItem) => ({
    requestedItem,
    status: "no_retailers" as const,
    product: null,
    sources: [],
    diagnostics: { searchUsed: false, allowedDomainsCount: 0 },
  }));
}

function buildDryRunResponse(
  items: string[],
  allowlistDomains: string[]
): CanonicalSerpResponse {
  const plannedQueries = Object.fromEntries(
    items.map((item) => [item, [`openai:web_search:${allowlistDomains.join(",")}`]])
  );

  return {
    dryRun: true,
    plannedQueries,
    plannedTotalQueries: items.length,
    effectiveMaxRequests: items.length,
    executedCount: 0,
    providerRequests: 0,
    providerAttempts: 0,
    providerSuccesses: 0,
    providerFailures: 0,
    cacheHits: 0,
    logicalQueries: 0,
    queryFailures: [],
    dailyUsed: 0,
    dailyRemaining: 0,
    results: items.map((item) => ({
      item,
      picked: null,
      topCandidates: [],
    })),
    status: 200,
    stoppedReason: null,
  };
}

export type OpenAIProductDiscoveryResponse = CanonicalSerpResponse & {
  productDiscoveryResults?: ProductDiscoveryResult[];
};

export async function runOpenAIProductDiscovery(
  input: CanonicalSerpSearchInput
): Promise<CanonicalSerpSearchOutcome> {
  const items = normalizeItems(input.items);
  if (items.length === 0) {
    return { ok: false, httpStatus: 400, error: "At least one item spec is required" };
  }

  const rawAllowlist = Array.isArray(input.allowlistDomains)
    ? input.allowlistDomains.filter((domain) => typeof domain === "string" && domain.trim()).map((domain) => domain.trim())
    : [];
  const allowlistDomains = normalizeProductDiscoveryAllowlist(rawAllowlist);
  const dryRun = input.dryRun === true;

  if (dryRun) {
    return { ok: true, response: buildDryRunResponse(items, allowlistDomains) };
  }

  if (allowlistDomains.length === 0) {
    const productDiscoveryResults = noRetailersResults(items);
    return {
      ok: true,
      response: {
        dryRun: false,
        plannedQueries: Object.fromEntries(items.map((item) => [item, []])),
        plannedTotalQueries: 0,
        effectiveMaxRequests: items.length,
        executedCount: 0,
        providerRequests: 0,
        providerAttempts: 0,
        providerSuccesses: 0,
        providerFailures: 0,
        cacheHits: 0,
        logicalQueries: 0,
        queryFailures: [],
        dailyUsed: 0,
        dailyRemaining: 0,
        results: productDiscoveryResults.map((result) =>
          productDiscoveryResultToCanonicalItem(attachStepCCandidatePool(result, input.excludeProductUrls))
        ),
        status: 200,
        stoppedReason: null,
        productDiscoveryResults: productDiscoveryResults.map((result) =>
          attachStepCCandidatePool(result, input.excludeProductUrls)
        ),
      },
    };
  }

  if (!openaiKeyConfigured()) {
    return { ok: false, httpStatus: 500, error: "OPENAI_API_KEY not configured" };
  }

  const minRemainingBeforeRequestMs = input.minRemainingBeforeRequestMs ?? 0;
  const productDiscoveryResults: ProductDiscoveryResult[] = new Array(items.length);
  let nextIndex = 0;

  async function runDeadlineBoundWorker() {
    while (true) {
      const remaining = remainingMs(input.deadlineAt);
      if (remaining != null && remaining < minRemainingBeforeRequestMs) {
        return;
      }
      const current = nextIndex;
      nextIndex += 1;
      if (current >= items.length) return;
      const requestedItem = items[current]!;
      const timeoutMs =
        remaining == null
          ? OPENAI_PRODUCT_SEARCH_TIMEOUT_MS
          : Math.min(OPENAI_PRODUCT_SEARCH_TIMEOUT_MS, Math.max(1, remaining));
      productDiscoveryResults[current] = await searchProductItem({
        requestedItem,
        allowlistDomains,
        timeoutMs,
        marketContext: input.marketContext,
        excludeProductUrls: input.excludeProductUrls,
        referenceFetchBlockedDomains: input.referenceFetchBlockedDomains,
      });
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(OPENAI_PRODUCT_SEARCH_CONCURRENCY, items.length) }, () =>
      runDeadlineBoundWorker()
    )
  );

  for (let i = 0; i < items.length; i += 1) {
    if (!productDiscoveryResults[i]) {
      productDiscoveryResults[i] = deadlineSkippedResult(items[i]!, allowlistDomains.length);
    }
  }

  const executedCount = productDiscoveryResults.filter(
    (result) => result.diagnostics?.searchUsed === true || result.status === "error"
  ).length;
  const providerSuccesses = productDiscoveryResults.filter((result) => result.status === "found").length;
  const providerFailures = productDiscoveryResults.filter(
    (result) => result.status === "error" || result.status === "not_found"
  ).length;
  const stoppedForDeadline = productDiscoveryResults.some(
    (result) => result.diagnostics?.errorCode === "deadline"
  );

  const response: OpenAIProductDiscoveryResponse = {
    dryRun: false,
    plannedQueries: Object.fromEntries(
      items.map((item) => [item, [`openai:web_search:${allowlistDomains.join(",")}`]])
    ),
    plannedTotalQueries: items.length,
    effectiveMaxRequests: items.length,
    executedCount,
    providerRequests: executedCount,
    providerAttempts: executedCount,
    providerSuccesses,
    providerFailures,
    cacheHits: 0,
    logicalQueries: items.length,
    queryFailures: [],
    dailyUsed: 0,
    dailyRemaining: 0,
    results: productDiscoveryResults.map((result) =>
      productDiscoveryResultToCanonicalItem(attachStepCCandidatePool(result, input.excludeProductUrls))
    ),
    status: 200,
    stoppedReason: stoppedForDeadline ? "deadline" : null,
    productDiscoveryResults: productDiscoveryResults.map((result) =>
      attachStepCCandidatePool(result, input.excludeProductUrls)
    ),
  };

  return { ok: true, response };
}
