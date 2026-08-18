import { NextResponse } from "next/server";
import { RateLimiter, getClientIP } from "@/lib/rateLimit";
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
import { parsePriceFromSnippet, parsePriceFromAny, enrichProductPage } from "@/lib/serp/enrich";
import { rankDomainsBySuccess, recordDomainOutcome } from "@/lib/serp/domainStats";
import { serpSearchRequestSchema } from "@/lib/schemas/serp";

// Node runtime required: lib/serp/domains uses Node crypto for cache key hash (no Edge).
export const runtime = "nodejs";

const rateLimiter = new RateLimiter(30, 60000);

/** Request contract: items (specs only), allowlistDomains from Places D, optional domainCategoryMap for category-based routing. */
interface SerpSearchRequest {
  dryRun?: boolean;
  maxRequests?: number;
  /** When true: fewer domains/variants, cap 50 requests, no enrich, 10s timeout, ~30–45s typical for 8–12 items. */
  fastMode?: boolean;
  items: string[];
  allowlistDomains: string[];
  /** Optional: domain → taxonomy categories from Places (D) domainCategoryMapStores; enables category-based domain routing. */
  domainCategoryMap?: Record<string, string[]>;
  /** Optional: preferred domains (one per line or array); matched domains appear first per item, then hash-ordered fill. */
  preferredDomains?: string[] | string;
  language?: string;
  country?: string;
  debug?: boolean;
}

/** One best product per item (or null). Canonical: url + numeric price or null. */
type ApiPicked = {
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

const TOP_CANDIDATES_COUNT = 5; // 3–5; max 2 per domain in getTopCandidatesWithFlags

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

type ApiResult = {
  item: string;
  category?: string;
  topCandidates: TopCandidateApi[];
  picked?: ApiPicked | null;
  /** When debug=true: queries executed for this item. */
  executedQueries?: string[];
};

/** Response contract: exactly one result per item. */
type SerpResponse = {
  dryRun: boolean;
  plannedQueries: Record<string, string[]>;
  plannedTotalQueries: number;
  effectiveMaxRequests: number;
  domainsPerItemUsed?: number;
  variantsUsed?: string;
  executedCount: number;
  dailyUsed: number;
  dailyRemaining: number;
  results: ApiResult[];
  status: number;
  /** When debug=true: queries executed per item. */
  executedQueriesPerItem?: Record<string, string[]>;
};

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

export async function POST(req: Request) {
  try {
    const clientIP = getClientIP(req);
    const rateLimitCheck = rateLimiter.check(clientIP);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          error: "rate_limited",
          details: "Too many requests. Please try again later.",
          resetAt: rateLimitCheck.resetAt,
          status: 429,
        },
        { status: 429 }
      );
    }

    const parsedBody = serpSearchRequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: "Invalid SERP request", details: parsedBody.error.flatten(), status: 400 },
        { status: 400 }
      );
    }
    const body = parsedBody.data;
    const items = normalizeItems(body.items);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one item spec is required", status: 400 },
        { status: 400 }
      );
    }

    const rawAllowlist = Array.isArray(body.allowlistDomains)
      ? (body.allowlistDomains as string[]).filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim())
      : [];
    const allowlistDomains = validateAndNormalizeAllowlist(rawAllowlist);
    const domainCategoryMap =
      body.domainCategoryMap && typeof body.domainCategoryMap === "object"
        ? (body.domainCategoryMap as Record<string, string[]>)
        : undefined;
    const preferredDomains: string[] | undefined = Array.isArray(body.preferredDomains)
      ? (body.preferredDomains as string[]).filter((d: string) => typeof d === "string" && d.trim()).map((d: string) => d.trim())
      : typeof body.preferredDomains === "string"
        ? (body.preferredDomains as string)
            .split(/[\r\n]+/)
            .map((d: string) => d.trim())
            .filter(Boolean)
        : undefined;

    if (allowlistDomains.length === 0) {
      return NextResponse.json(
        {
          error: "allowlistDomains required",
          details: "Run Places (D) first to get domains.",
          status: 400,
        },
        { status: 400 }
      );
    }

    const dryRun = body.dryRun === true;
    const fastMode = body.fastMode === true;
    const userMaxRequests = clampNumber(body.maxRequests ?? 10, 1, 80);
    const maxCandidates = 8;
    const debug = body.debug === true;

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
      return NextResponse.json(
        {
          error: "Invalid item spec",
          details: "Item specs must not contain only store names or domains.",
          status: 400,
        },
        { status: 400 }
      );
    }

    if (!process.env.SERPAPI_KEY && !dryRun) {
      return NextResponse.json(
        { error: "SERPAPI_KEY not configured", status: 500 },
        { status: 500 }
      );
    }

    const capCheck = await checkDailyCap();
    if (!capCheck.allowed && !dryRun) {
      return NextResponse.json(
        {
          error: "Daily SERP cap reached",
          details: `Used ${capCheck.used}/${capCheck.remaining + capCheck.used} requests today. Try again tomorrow.`,
          dailyUsed: capCheck.used,
          dailyRemaining: capCheck.remaining,
          status: 429,
        },
        { status: 429 }
      );
    }

    const bundles = items.map((item) => rulesBundle(item, rankedDomains));
    const { planned, flat } = buildPlannedQueriesFromBundles(
      bundles,
      rankedDomains,
      domainCategoryMap,
      preferredDomains?.length ? preferredDomains : undefined,
      fastMode
        ? { domainsPerItem: 2, queryVariantsPerDomain: 2 }
        : undefined
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
    const results: ApiResult[] = items.map((item) => ({
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
        const capCheck = await checkDailyCap();
        if (!capCheck.allowed) break;

        const processOne = async ({
          item,
          query,
        }: { item: string; query: string }): Promise<{
          item: string;
          query: string;
          organic: SerpOrganicResult[];
        }> => {
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
        const tokens = keywords.split(/\s+/).filter(Boolean);

        const priceFn = (r: SerpOrganicResult) =>
          parsePriceFromAny(r.snippet, r.price, r.richSnippetPrice);
        const topWithFlags = getTopCandidatesWithFlags(
          tokens,
          candidates,
          TOP_CANDIDATES_COUNT,
          priceFn
        );
        results[i].topCandidates = topWithFlags;
        results[i].category = itemSpecToCategory(item);

        const { picked } = pickBestCandidate(tokens, candidates, maxCandidates);
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
    const response: SerpResponse = {
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
    return NextResponse.json(response);
  } catch (error: any) {
    console.error("SERP search error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message, status: 500 },
      { status: 500 }
    );
  }
}
