import type {
  CanonicalSerpResponse,
  CanonicalSerpSearchInput,
  CanonicalSerpSearchOutcome,
} from "@/lib/serp/search";
import { OPENAI_PRODUCT_SEARCH_CONCURRENCY } from "./constants";
import { productDiscoveryResultToCanonicalItem } from "./adapter";
import { normalizeProductDiscoveryAllowlist } from "./domains";
import { searchProductItem } from "./searchItem";
import type { ProductDiscoveryResult } from "./types";

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current]!, current);
    }
  });
  await Promise.all(runners);
  return results;
}

function normalizeItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
        results: productDiscoveryResults.map(productDiscoveryResultToCanonicalItem),
        status: 200,
        stoppedReason: null,
        productDiscoveryResults,
      },
    };
  }

  const productDiscoveryResults = await mapWithConcurrency(
    items,
    OPENAI_PRODUCT_SEARCH_CONCURRENCY,
    async (requestedItem) =>
      searchProductItem({
        requestedItem,
        allowlistDomains,
      })
  );

  const executedCount = productDiscoveryResults.filter(
    (result) => result.diagnostics?.searchUsed === true || result.status === "error"
  ).length;
  const providerSuccesses = productDiscoveryResults.filter((result) => result.status === "found").length;
  const providerFailures = productDiscoveryResults.filter(
    (result) => result.status === "error" || result.status === "not_found"
  ).length;

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
    results: productDiscoveryResults.map(productDiscoveryResultToCanonicalItem),
    status: 200,
    stoppedReason: null,
    productDiscoveryResults,
  };

  return { ok: true, response };
}
