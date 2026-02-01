import { NextResponse } from "next/server";
import { RateLimiter, getClientIP } from "@/lib/rateLimit";
import {
  checkDailyCap,
  waitForRateLimit,
  incrementDailyUsage,
  getSerpCachedByKey,
  setSerpCachedByKey,
} from "@/lib/serpGuardrails";
import { serpCacheKey, normalizeDomain } from "@/lib/serp/domains";
import { fetchSerp } from "@/lib/serp/provider";
import {
  type SerpOrganicResult,
  pickBestCandidate,
} from "@/lib/serp/pickBest";
import { buildPlannedQueries, itemSpecToKeywords } from "@/lib/serp/queryGen";
import { parsePriceFromSnippet, enrichProductPage } from "@/lib/serp/enrich";
import { rankDomainsBySuccess, recordDomainOutcome } from "@/lib/serp/domainStats";

export const runtime = "nodejs";

const rateLimiter = new RateLimiter(30, 60000);

interface SerpSearchRequest {
  dryRun?: boolean;
  items?: string[];
  allowlistDomains?: string[];
  maxResultsPerItem?: number;
  maxCandidates?: number;
  maxRequests?: number;
  debug?: boolean;
}

type ApiPicked = {
  title: string;
  url: string;
  price: number | null;
  currency: "EUR" | null;
  image: string | null;
  domain: string;
  confidence: number;
  reasons: string[];
};

type ApiResult = {
  item: string;
  picked: ApiPicked | null;
  topCandidates?: Array<{ title: string; url: string; snippet: string; score: number }>;
};

function clampNumber(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => typeof i === "string")
    .map((i) => i.trim())
    .filter((i) => i.length > 0);
}

function normalizeAllowlist(domains: unknown): string[] {
  if (!Array.isArray(domains)) return [];
  return domains
    .filter((d) => typeof d === "string" && d.trim())
    .map((d) => d.trim());
}

function stripDomainTokensFromItem(item: string, allowlistDomains: string[]): string {
  const domainTokens = new Set(
    allowlistDomains
      .map(normalizeDomain)
      .filter(Boolean)
      .flatMap((d) => [d, d.split(".")[0]])
  );
  const parts = item
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => {
      const normalized = t.toLowerCase().replace(/[^\w.]/g, "");
      return !domainTokens.has(normalized);
    });
  return parts.join(" ").trim();
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

    const body: SerpSearchRequest = await req.json().catch(() => ({}));
    const items = normalizeItems(body.items);
    const allowlistDomains = normalizeAllowlist(body.allowlistDomains);

    if (items.length === 0) {
      return NextResponse.json(
        { error: "At least one item spec is required", status: 400 },
        { status: 400 }
      );
    }

    const dryRun = body.dryRun === true;
    const maxRequests = clampNumber(body.maxRequests ?? 6, 1, 20);
    const maxCandidates = clampNumber(body.maxCandidates ?? 8, 1, 20);
    const debug = body.debug === true;

    if (allowlistDomains.length === 0) {
      return NextResponse.json(
        {
          error: "allowlistDomains required",
          details: "No store domains provided. Run D) first.",
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

    const rankedDomains = await rankDomainsBySuccess(allowlistDomains);
    if (rankedDomains.length === 0) {
      return NextResponse.json(
        { error: "allowlistDomains required", details: "No valid store domains provided.", status: 400 },
        { status: 400 }
      );
    }
    const sanitizedItems = items.map((item) => stripDomainTokensFromItem(item, rankedDomains));
    if (sanitizedItems.some((item) => item.length === 0)) {
      return NextResponse.json(
        { error: "Invalid item spec", details: "Item specs must not contain store domains.", status: 400 },
        { status: 400 }
      );
    }
    let maxDomainsPerItem = Math.min(rankedDomains.length, 2);
    if (items.length * maxDomainsPerItem > maxRequests && maxDomainsPerItem > 1) {
      maxDomainsPerItem = 1;
    }
    const selectedDomains = rankedDomains.slice(0, maxDomainsPerItem);

    const plannedQueries = buildPlannedQueries(sanitizedItems, selectedDomains);
    const totalPlanned = plannedQueries.flat.length;
    const totalRequests = Math.min(maxRequests, totalPlanned);
    const toExecute = plannedQueries.flat.slice(0, totalRequests);

    const candidatesByItem = new Map<string, Map<string, SerpOrganicResult>>();
    const domainsByItem = new Map<string, Set<string>>();
    const results: ApiResult[] = sanitizedItems.map((item) => ({ item, picked: null }));
    let executedCount = 0;

    if (dryRun) {
    } else {
      for (const { item, query } of toExecute) {
        const cacheKey = serpCacheKey(query, selectedDomains);
        let organic: SerpOrganicResult[] | null = null;
        let fromCache = false;

        const cached = getSerpCachedByKey(cacheKey);
        if (cached?.organic?.length) {
          organic = cached.organic as SerpOrganicResult[];
          fromCache = true;
        }

        if (!organic) {
          const cap = await checkDailyCap();
          if (!cap.allowed) break;
          await waitForRateLimit();
          organic = await fetchSerp(query, { allowedDomains: selectedDomains });
          setSerpCachedByKey(cacheKey, {
            organic: organic.map((r) => ({
              title: r.title,
              link: r.link,
              snippet: r.snippet ?? "",
              price: r.price,
              image: r.image,
            })),
          });
          if (!fromCache) await incrementDailyUsage();
        }

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
          const domain = normalizeDomain(result.link);
          if (domain) {
            const domainSet = domainsByItem.get(item) ?? new Set<string>();
            domainSet.add(domain);
            domainsByItem.set(item, domainSet);
          }
        }
        candidatesByItem.set(item, itemMap);
      }
    }

    const updatedCapCheck = await checkDailyCap();

    if (!dryRun) {
      for (let i = 0; i < results.length; i++) {
        const item = results[i].item;
        const candidates = Array.from(candidatesByItem.get(item)?.values() ?? []);
        const keywords = itemSpecToKeywords(item, selectedDomains);
        const tokens = keywords.split(/\s+/).filter(Boolean);
        const { picked, topCandidates } = pickBestCandidate(tokens, candidates, maxCandidates);

        if (picked) {
          const parsed = parsePriceFromSnippet(picked.snippet, picked.price);
          let price = parsed.price;
          let currency = parsed.currency;
          let image = picked.image ?? null;

          if ((price == null || image == null) && process.env.ENRICH_PRODUCT_PAGE === "true") {
            const enriched = await enrichProductPage(picked.url);
            price = price ?? enriched.price;
            currency = currency ?? enriched.currency;
            image = image ?? enriched.image;
          }

          results[i].picked = {
            title: picked.title,
            url: picked.url,
            price,
            currency,
            image,
            domain: picked.domain,
            confidence: picked.confidence,
            reasons: picked.reasons,
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
          results[i].topCandidates = topCandidates.map((c) => ({
            title: c.title,
            url: c.url,
            snippet: c.snippet ?? "",
            score: c.score,
          }));
        }
      }
    }

    return NextResponse.json({
      dryRun,
      plannedQueries: plannedQueries.planned,
      executedCount,
      dailyUsed: updatedCapCheck.used,
      dailyRemaining: updatedCapCheck.remaining,
      results,
      status: 200,
    });
  } catch (error: any) {
    console.error("SERP search error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message, status: 500 },
      { status: 500 }
    );
  }
}
