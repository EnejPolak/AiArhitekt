import {
  checkDailyCap,
  waitForRateLimit,
  incrementDailyUsage,
  getSerpCachedByKey,
  setSerpCachedByKey,
} from "@/lib/serpGuardrails";
import { serpCacheKey, normalizeDomainToRoot, validateAndNormalizeAllowlist } from "@/lib/serp/domains";
import { fetchSerp } from "@/lib/serp/provider";
import {
  type SerpOrganicResult,
  pickBestCandidate,
  getTopCandidatesWithFlags,
} from "@/lib/serp/pickBest";
import { buildPlannedQueriesFromBundles, itemSpecToKeywords, stripStoreNamesAndDomainsFromItem } from "@/lib/serp/queryGen";
import { itemSpecToCategory } from "@/lib/serp/taxonomy";
import { rulesBundle } from "@/lib/serp/searchBundle";
import { parsePriceFromAny, enrichProductPage } from "@/lib/serp/enrich";
import { rankDomainsBySuccess, recordDomainOutcome } from "@/lib/serp/domainStats";

const TOP_CANDIDATES_COUNT = 5;

export type CanonicalSerpPicked = {
  title: string;
  url: string;
  image: string | null;
  price: number | null;
  currency: "EUR" | null;
  score: number;
  confidence: number;
  reasons: string[];
  domain: string;
  snippet: string | null;
};

export type CanonicalSerpTopCandidate = {
  title: string;
  url: string;
  domain: string;
  snippet?: string;
  price?: { value: number; currency: "EUR" } | null;
  image?: string | null;
  score: number;
  flags: {
    isProductLikeUrl: boolean;
    isCategoryLikeUrl: boolean;
    hasToolIntent: boolean;
    hasHomeIntent: boolean;
  };
};

export type CanonicalSerpItemResult = {
  item: string;
  category?: string;
  topCandidates: CanonicalSerpTopCandidate[];
  picked?: CanonicalSerpPicked | null;
  executedQueries?: string[];
};

export type SerpQueryFailureCode =
  | "provider_timeout"
  | "provider_5xx"
  | "network_error"
  | "invalid_response";

export type SerpQueryFailure = {
  item: string;
  query: string;
  code: SerpQueryFailureCode;
  message: string;
  providerStatus?: number;
};

export type CanonicalSerpResponse = {
  dryRun: boolean;
  plannedQueries: Record<string, string[]>;
  plannedTotalQueries: number;
  effectiveMaxRequests: number;
  domainsPerItemUsed?: number;
  variantsUsed?: string;
  /** Live SerpAPI calls attempted (success + failure; excludes cache hits). */
  executedCount: number;
  /** Alias for executedCount — live provider attempts only. */
  providerRequests: number;
  /** Alias for providerRequests — counts dispatched attempts including failures. */
  providerAttempts: number;
  providerSuccesses: number;
  providerFailures: number;
  /** Logical queries satisfied from cache without a provider call. */
  cacheHits: number;
  /** Total logical queries attempted (provider + cache). */
  logicalQueries: number;
  /** Per-query provider failures; successful queries are omitted. */
  queryFailures: SerpQueryFailure[];
  dailyUsed: number;
  dailyRemaining: number;
  results: CanonicalSerpItemResult[];
  status: number;
  executedQueriesPerItem?: Record<string, string[]>;
  stoppedReason?: "budget" | "deadline" | "daily_cap" | null;
  /** Present when Step C uses OpenAI product discovery (api-debug). */
  productDiscoveryResults?: import("@/lib/productDiscovery/types").ProductDiscoveryResult[];
};

export type CanonicalSerpSearchInput = {
  items: string[];
  allowlistDomains: string[];
  dryRun?: boolean;
  maxRequests?: number;
  fastMode?: boolean;
  domainCategoryMap?: Record<string, string[]>;
  preferredDomains?: string[] | string;
  debug?: boolean;
  /** Wall-clock ms timestamp — do not start new provider calls near this deadline. */
  deadlineAt?: number;
  /** Minimum ms that must remain before starting another provider call. */
  minRemainingBeforeRequestMs?: number;
  /** Per-request timeout passed to fetchSerp. */
  providerTimeoutMs?: number;
  /** When false, skip automatic retry on provider timeout. */
  retryOnTimeout?: boolean;
  /** Project-persisted market for OpenAI Step C search. Not used by SerpAPI. */
  marketContext?: {
    countryCode?: string | null;
    formattedLocation?: string | null;
    merchantDomains?: string[];
  };
};

export type CanonicalSerpSearchOutcome =
  | { ok: true; response: CanonicalSerpResponse }
  | { ok: false; httpStatus: number; error: string; details?: unknown };

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => typeof i === "string")
    .map((i) => (i as string).trim())
    .filter((i) => i.length > 0);
}

type ClassifiedSerpQueryError = {
  code: SerpQueryFailureCode;
  message: string;
  providerStatus?: number;
  systemic: boolean;
};

function classifySerpQueryError(error: unknown): ClassifiedSerpQueryError {
  const message = error instanceof Error ? error.message : String(error);
  const bounded = message.slice(0, 200);

  if (/429|quota|rate limit/i.test(message)) {
    return { code: "provider_5xx", message: bounded, providerStatus: 429, systemic: true };
  }
  if (/401|403|unauthorized|forbidden/i.test(message)) {
    return { code: "provider_5xx", message: bounded, providerStatus: 403, systemic: true };
  }
  if (/timeout|abort/i.test(message)) {
    return { code: "provider_timeout", message: bounded, systemic: false };
  }
  const httpMatch = message.match(/SERP API error:\s*(\d{3})/i);
  if (httpMatch) {
    const status = parseInt(httpMatch[1]!, 10);
    if (status === 429) {
      return { code: "provider_5xx", message: bounded, providerStatus: 429, systemic: true };
    }
    if (status >= 500) {
      return { code: "provider_5xx", message: bounded, providerStatus: status, systemic: false };
    }
    if (status >= 400) {
      return { code: "invalid_response", message: bounded, providerStatus: status, systemic: false };
    }
  }
  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND/i.test(message)) {
    return { code: "network_error", message: bounded, systemic: false };
  }
  return { code: "invalid_response", message: bounded, systemic: false };
}

function logSerpQueryError(event: {
  item: string;
  query: string;
  code: SerpQueryFailureCode;
  message: string;
  providerStatus?: number;
  elapsedMs: number;
}): void {
  if (process.env.NODE_ENV === "production") return;
  console.error("[serp-query-error]", event);
}

type QuerySettlement =
  | {
      status: "success";
      item: string;
      query: string;
      organic: SerpOrganicResult[];
      fromCache: boolean;
    }
  | {
      status: "failed";
      item: string;
      query: string;
      failure: SerpQueryFailure;
    }
  | {
      status: "systemic";
      httpStatus: number;
      error: string;
      details: string;
    };

/**
 * Canonical C-module search used by POST /api/serp/search and P1.6 discovery.
 * Do not call SerpAPI from anywhere else.
 */
export async function runCanonicalSerpSearch(
  input: CanonicalSerpSearchInput
): Promise<CanonicalSerpSearchOutcome> {
  const items = normalizeItems(input.items);
  if (items.length === 0) {
    return { ok: false, httpStatus: 400, error: "At least one item spec is required" };
  }

  const rawAllowlist = Array.isArray(input.allowlistDomains)
    ? input.allowlistDomains.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim())
    : [];
  const allowlistDomains = validateAndNormalizeAllowlist(rawAllowlist);
  const domainCategoryMap =
    input.domainCategoryMap && typeof input.domainCategoryMap === "object"
      ? input.domainCategoryMap
      : undefined;
  const preferredDomains: string[] | undefined = Array.isArray(input.preferredDomains)
    ? input.preferredDomains.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim())
    : typeof input.preferredDomains === "string"
      ? input.preferredDomains
          .split(/[\r\n]+/)
          .map((d) => d.trim())
          .filter(Boolean)
      : undefined;

  if (allowlistDomains.length === 0) {
    return {
      ok: false,
      httpStatus: 400,
      error: "allowlistDomains required",
      details: "Run Places (D) first to get domains.",
    };
  }

  const dryRun = input.dryRun === true;
  const fastMode = input.fastMode === true;
  const explicitMaxRequests = input.maxRequests != null;
  const userMaxRequests = clampNumber(input.maxRequests ?? 10, 1, 80);
  const maxCandidates = 8;
  const debug = input.debug === true;
  const deadlineAt = input.deadlineAt;
  const minRemainingBeforeRequestMs = input.minRemainingBeforeRequestMs ?? 0;
  const providerTimeoutMs = input.providerTimeoutMs;
  const retryOnTimeout = input.retryOnTimeout !== false;

  try {
    let rankedDomains = await rankDomainsBySuccess(allowlistDomains);
    const preferredSet = new Set(
      (preferredDomains ?? []).map((d) => normalizeDomainToRoot(d)).filter(Boolean)
    );
    if (fastMode) {
      const ikea = "ikea.com";
      const hasIkea = rankedDomains.some((d) => normalizeDomainToRoot(d) === ikea);
      if (hasIkea && !preferredSet.has(ikea)) {
        rankedDomains = [...rankedDomains.filter((d) => normalizeDomainToRoot(d) !== ikea), ikea];
      }
    }

    const domainsPerItemUsed = fastMode ? 2 : 4;
    const variantsUsed = fastMode ? "strict+relaxed" : "strict+relaxed+synonym";
    const sanitizedItems = items.map((item) => stripStoreNamesAndDomainsFromItem(item, rankedDomains));
    if (sanitizedItems.some((s) => !s.trim())) {
      return {
        ok: false,
        httpStatus: 400,
        error: "Invalid item spec",
        details: "Item specs must not contain only store names or domains.",
      };
    }

    if (!process.env.SERPAPI_KEY && !dryRun) {
      return { ok: false, httpStatus: 500, error: "SERPAPI_KEY not configured" };
    }

    const capCheck = await checkDailyCap();
    if (!capCheck.allowed && !dryRun) {
      return {
        ok: false,
        httpStatus: 429,
        error: "Daily SERP cap reached",
        details: `Used ${capCheck.used}/${capCheck.remaining + capCheck.used} requests today. Try again tomorrow.`,
      };
    }

    const bundles = items.map((item) => rulesBundle(item, rankedDomains));
    const { planned, flat } = buildPlannedQueriesFromBundles(
      bundles,
      rankedDomains,
      domainCategoryMap,
      preferredDomains?.length ? preferredDomains : undefined,
      fastMode ? { domainsPerItem: 2, queryVariantsPerDomain: 2 } : undefined
    );
    const plannedTotalQueries = flat.length;
    const suggestedMaxRequests = fastMode
      ? Math.min(flat.length, items.length * 4)
      : Math.min(flat.length, Math.max(items.length * 6, 12));
    const cap = fastMode ? 50 : 80;
    const effectiveMaxRequests = explicitMaxRequests
      ? Math.min(cap, flat.length, userMaxRequests)
      : Math.min(cap, Math.max(userMaxRequests, suggestedMaxRequests));
    const toExecute = flat.slice(0, effectiveMaxRequests);

    const candidatesByItem = new Map<string, Map<string, SerpOrganicResult>>();
    const domainsByItem = new Map<string, Set<string>>();
    const executedQueriesByItem = new Map<string, string[]>();
    const results: CanonicalSerpItemResult[] = items.map((item) => ({
      item,
      category: itemSpecToCategory(item),
      topCandidates: [],
      picked: null,
    }));
    let providerAttempts = 0;
    let providerSuccesses = 0;
    let providerFailures = 0;
    let cacheHits = 0;
    let logicalQueries = 0;
    const queryFailures: SerpQueryFailure[] = [];
    let stoppedReason: CanonicalSerpResponse["stoppedReason"] = null;

    const concurrency = fastMode ? 2 : 1;

    const deadlineInsufficient = (): boolean => {
      if (!deadlineAt) return false;
      return Date.now() >= deadlineAt - minRemainingBeforeRequestMs;
    };

    if (!dryRun) {
      for (let i = 0; i < toExecute.length; i += concurrency) {
        if (providerAttempts >= effectiveMaxRequests) {
          stoppedReason = "budget";
          break;
        }
        if (deadlineInsufficient()) {
          stoppedReason = "deadline";
          break;
        }

        const batch = toExecute.slice(i, i + concurrency);
        const liveCap = await checkDailyCap();
        if (!liveCap.allowed) {
          stoppedReason = "daily_cap";
          break;
        }

        const processOne = async ({
          item,
          query,
        }: {
          item: string;
          query: string;
        }): Promise<QuerySettlement> => {
          logicalQueries++;
          const cacheKey = serpCacheKey(query, rankedDomains);
          const cached = getSerpCachedByKey(cacheKey);
          if (cached?.organic?.length) {
            cacheHits++;
            return {
              status: "success",
              item,
              query,
              organic: cached.organic as SerpOrganicResult[],
              fromCache: true,
            };
          }
          if (providerAttempts >= effectiveMaxRequests || deadlineInsufficient()) {
            return {
              status: "failed",
              item,
              query,
              failure: {
                item,
                query,
                code: "network_error",
                message: "Skipped: budget or deadline exhausted",
              },
            };
          }

          await waitForRateLimit();
          const started = Date.now();
          try {
            const organic = await fetchSerp(query, {
              allowedDomains: rankedDomains,
              timeoutMs: providerTimeoutMs ?? (fastMode ? 10000 : undefined),
              retryOnTimeout,
            });
            // Count every dispatched live provider HTTP attempt (success or failure).
            await incrementDailyUsage();
            providerAttempts++;
            providerSuccesses++;
            setSerpCachedByKey(cacheKey, {
              organic: organic.map((r) => ({
                title: r.title,
                link: r.link,
                snippet: r.snippet ?? "",
                price: r.price,
                image: r.image,
              })),
            });
            return { status: "success", item, query, organic, fromCache: false };
          } catch (error: unknown) {
            const classified = classifySerpQueryError(error);
            if (classified.systemic) {
              return {
                status: "systemic",
                httpStatus: classified.providerStatus ?? 429,
                error:
                  classified.providerStatus === 429
                    ? "Daily SERP cap reached"
                    : "SERP provider error",
                details: classified.message,
              };
            }
            await incrementDailyUsage();
            providerAttempts++;
            providerFailures++;
            logSerpQueryError({
              item,
              query,
              code: classified.code,
              message: classified.message,
              providerStatus: classified.providerStatus,
              elapsedMs: Date.now() - started,
            });
            return {
              status: "failed",
              item,
              query,
              failure: {
                item,
                query,
                code: classified.code,
                message: classified.message,
                providerStatus: classified.providerStatus,
              },
            };
          }
        };

        const settlements = await Promise.all(batch.map(processOne));

        for (const settlement of settlements) {
          if (settlement.status === "systemic") {
            return {
              ok: false,
              httpStatus: settlement.httpStatus,
              error: settlement.error,
              details: settlement.details,
            };
          }
          if (settlement.status === "failed") {
            if (settlement.failure.message !== "Skipped: budget or deadline exhausted") {
              queryFailures.push(settlement.failure);
            }
            continue;
          }

          const { item, query, organic } = settlement;
          if (!organic.length) continue;
          const list = executedQueriesByItem.get(item) ?? [];
          list.push(query);
          executedQueriesByItem.set(item, list);
          const itemMap = candidatesByItem.get(item) ?? new Map<string, SerpOrganicResult>();
          for (const result of organic) {
            if (!result.link) continue;
            const existing = itemMap.get(result.link);
            if (!existing) {
              itemMap.set(result.link, result);
            } else {
              itemMap.set(result.link, {
                ...existing,
                price: existing.price ?? result.price,
                image: existing.image ?? result.image,
                snippet: existing.snippet || result.snippet,
                title: existing.title || result.title,
              });
            }
            const domain = normalizeDomainToRoot(result.link);
            if (domain) {
              const domainSet = domainsByItem.get(item) ?? new Set<string>();
              domainSet.add(domain);
              domainsByItem.set(item, domainSet);
            }
          }
          candidatesByItem.set(item, itemMap);
        }
      }
    }

    if (!dryRun) {
      const enrichEnabled = !fastMode && process.env.ENRICH_PRODUCT_PAGE === "true";
      for (let i = 0; i < results.length; i++) {
        const item = results[i].item;
        const bundle = bundles.find((b) => b.item === item);
        const candidates = Array.from(candidatesByItem.get(item)?.values() ?? []);
        const keywords = bundle?.keywords ?? itemSpecToKeywords(item, rankedDomains);
        const tokenList = keywords.split(/\s+/).filter(Boolean);

        const priceFn = (r: SerpOrganicResult) =>
          parsePriceFromAny(r.snippet, r.price, r.richSnippetPrice);
        const topWithFlags = getTopCandidatesWithFlags(
          tokenList,
          candidates,
          TOP_CANDIDATES_COUNT,
          priceFn
        );
        results[i].topCandidates = topWithFlags;
        results[i].category = itemSpecToCategory(item);

        const { picked } = pickBestCandidate(tokenList, candidates, maxCandidates);
        if (picked) {
          const parsed = parsePriceFromAny(picked.snippet, picked.price, undefined);
          let price: number | null = parsed?.value ?? null;
          let currency: string | null = parsed?.currency ?? null;
          let image = picked.image ?? undefined;

          if (enrichEnabled && (price == null || image == null)) {
            const enriched = await enrichProductPage(picked.url);
            price = price ?? enriched.price;
            currency = currency ?? enriched.currency;
            image = image ?? enriched.image ?? undefined;
          }

          results[i].picked = {
            title: picked.title,
            url: picked.url,
            image: image ?? null,
            price: price,
            currency: currency === "EUR" ? "EUR" : null,
            score: picked.score,
            confidence: picked.confidence,
            reasons: picked.reasons,
            domain: picked.domain,
            snippet: picked.snippet?.trim() ? picked.snippet.trim() : null,
          };

          await recordDomainOutcome(picked.domain, true);
        } else {
          const domainSet = domainsByItem.get(item);
          if (domainSet) {
            for (const domain of domainSet) {
              await recordDomainOutcome(domain, false);
            }
          }
        }

        if (debug) {
          results[i].executedQueries = executedQueriesByItem.get(item) ?? [];
        }
      }
    }

    const quota = await checkDailyCap();
    const response: CanonicalSerpResponse = {
      dryRun,
      plannedQueries: planned,
      plannedTotalQueries,
      effectiveMaxRequests,
      domainsPerItemUsed,
      variantsUsed,
      executedCount: providerAttempts,
      providerRequests: providerAttempts,
      providerAttempts,
      providerSuccesses,
      providerFailures,
      cacheHits,
      logicalQueries,
      queryFailures,
      dailyUsed: quota.used,
      dailyRemaining: quota.remaining,
      results,
      status: 200,
      stoppedReason,
    };
    if (debug) {
      const executedQueriesPerItem: Record<string, string[]> = {};
      executedQueriesByItem.forEach((queries, item) => {
        executedQueriesPerItem[item] = queries;
      });
      response.executedQueriesPerItem = executedQueriesPerItem;
    }
    return { ok: true, response };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return { ok: false, httpStatus: 500, error: "Internal server error", details: message };
  }
}
