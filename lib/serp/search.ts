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
};

type TopCandidateApi = {
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
  topCandidates: TopCandidateApi[];
  picked?: CanonicalSerpPicked | null;
  executedQueries?: string[];
};

export type CanonicalSerpResponse = {
  dryRun: boolean;
  plannedQueries: Record<string, string[]>;
  plannedTotalQueries: number;
  effectiveMaxRequests: number;
  domainsPerItemUsed?: number;
  variantsUsed?: string;
  executedCount: number;
  dailyUsed: number;
  dailyRemaining: number;
  results: CanonicalSerpItemResult[];
  status: number;
  executedQueriesPerItem?: Record<string, string[]>;
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
  const userMaxRequests = clampNumber(input.maxRequests ?? 10, 1, 80);
  const maxCandidates = 8;
  const debug = input.debug === true;

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
    const effectiveMaxRequests = Math.min(cap, Math.max(userMaxRequests, suggestedMaxRequests));
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
    let executedCount = 0;

    const concurrency = fastMode ? 2 : 1;

    if (!dryRun) {
      for (let i = 0; i < toExecute.length; i += concurrency) {
        const batch = toExecute.slice(i, i + concurrency);
        const liveCap = await checkDailyCap();
        if (!liveCap.allowed) break;

        const processOne = async ({
          item,
          query,
        }: {
          item: string;
          query: string;
        }): Promise<{ item: string; query: string; organic: SerpOrganicResult[] }> => {
          const cacheKey = serpCacheKey(query, rankedDomains);
          const cached = getSerpCachedByKey(cacheKey);
          if (cached?.organic?.length) {
            return { item, query, organic: cached.organic as SerpOrganicResult[] };
          }
          await waitForRateLimit();
          const organic = await fetchSerp(query, {
            allowedDomains: rankedDomains,
            timeoutMs: fastMode ? 10000 : undefined,
          });
          setSerpCachedByKey(cacheKey, {
            organic: organic.map((r) => ({
              title: r.title,
              link: r.link,
              snippet: r.snippet ?? "",
              price: r.price,
              image: r.image,
            })),
          });
          await incrementDailyUsage();
          return { item, query, organic };
        };

        const outcomes = await Promise.all(batch.map(processOne));

        for (const { item, query, organic } of outcomes) {
          const list = executedQueriesByItem.get(item) ?? [];
          list.push(query);
          executedQueriesByItem.set(item, list);
          executedCount++;
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
      executedCount,
      dailyUsed: quota.used,
      dailyRemaining: quota.remaining,
      results,
      status: 200,
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
