import { NextResponse } from "next/server";
import { RateLimiter, getClientIP } from "@/lib/rateLimit";
import {
  checkDailyCap,
  waitForRateLimit,
  incrementDailyUsage,
} from "@/lib/serpGuardrails";
import { fetchSerp } from "@/lib/serp/provider";
import { pickBestResult, type SerpOrganicResult } from "@/lib/serp/pickBest";

export const runtime = "nodejs";

// Rate limiter: 30 requests per minute per IP
const rateLimiter = new RateLimiter(30, 60000);

interface SerpSearchRequest {
  queries: string[] | string; // Support both array and newline-separated string
  maxRequests?: number;
  dryRun?: boolean;
}

export async function POST(req: Request) {
  try {
    // Rate limiting
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

    // Parse and validate body
    const body: SerpSearchRequest = await req.json().catch(() => ({}));

    // Normalize queries: support both array and newline-separated string
    let queries: string[] = [];
    if (typeof body.queries === "string") {
      queries = body.queries
        .split("\n")
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
    } else if (Array.isArray(body.queries)) {
      queries = body.queries
        .filter((q) => typeof q === "string")
        .map((q) => q.trim())
        .filter((q) => q.length > 0);
    }

    if (queries.length === 0) {
      return NextResponse.json(
        {
          error: "At least one valid query string is required",
          status: 400,
        },
        { status: 400 }
      );
    }

    const maxRequests = Math.min(10, Math.max(1, body.maxRequests || 8)); // Hard cap <= 10
    const dryRun = body.dryRun !== false; // Default true

    // Check API key
    if (!process.env.SERPAPI_KEY) {
      return NextResponse.json(
        { error: "SERPAPI_KEY not configured", status: 500 },
        { status: 500 }
      );
    }

    // Check daily cap
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

    // Limit queries to maxRequests
    const plannedQueries = queries.slice(0, maxRequests);

    // Execute queries (or dry run)
    const resultsByQuery: Record<
      string,
      {
        picked: {
          title: string;
          link: string;
          snippet?: string;
          score: number;
          reasons: string[];
        } | null;
        top: SerpOrganicResult[];
        rawOrganicCount?: number;
        filteredCount?: number;
        // Backward compatibility: keep old format
        organic?: Array<{ title: string; link: string; snippet: string }>;
      }
    > = {};
    let executedCount = 0;

    if (dryRun) {
      // Dry run: return planned queries only
      for (const query of plannedQueries) {
        resultsByQuery[query] = {
          picked: null,
          top: [],
          rawOrganicCount: 0,
          filteredCount: 0,
        };
      }
    } else {
      // Check if we have enough remaining quota
      const remainingAfterCheck = capCheck.remaining;
      const queriesToExecute = Math.min(plannedQueries.length, remainingAfterCheck);

      for (let i = 0; i < queriesToExecute; i++) {
        const query = plannedQueries[i];
        try {
          // Wait for rate limit
          await waitForRateLimit();

          // Fetch SERP results
          const organic = await fetchSerp(query);

          // Pick best result (now returns object with picked, rawOrganicCount, filteredCount)
          const pickResult = pickBestResult(query, organic);

          // Increment usage
          await incrementDailyUsage();

          // Store results
          resultsByQuery[query] = {
            picked: pickResult.picked
              ? {
                  title: pickResult.picked.title,
                  link: pickResult.picked.link,
                  snippet: pickResult.picked.snippet,
                  score: pickResult.picked.score,
                  reasons: pickResult.picked.reasons,
                }
              : null,
            top: organic.slice(0, 5), // Top 5 for debugging
            rawOrganicCount: pickResult.rawOrganicCount,
            filteredCount: pickResult.filteredCount,
            // Backward compatibility
            organic: organic.map((r) => ({
              title: r.title,
              link: r.link,
              snippet: r.snippet || "",
            })),
          };

          executedCount++;
        } catch (error: any) {
          // If daily cap is hit during execution, stop
          if (error.message?.includes("Daily SERP cap reached") || error.message?.includes("cap reached")) {
            break;
          }
          // Log error but continue with other queries
          console.error(`SERP request failed for query "${query}":`, error);
          resultsByQuery[query] = {
            picked: null,
            top: [],
            rawOrganicCount: 0,
            filteredCount: 0,
            organic: [],
          };
        }
      }
    }

    // Get updated daily usage
    const updatedCapCheck = await checkDailyCap();

    return NextResponse.json({
      dryRun,
      plannedQueries,
      executedCount,
      dailyUsed: updatedCapCheck.used,
      dailyRemaining: updatedCapCheck.remaining,
      resultsByQuery,
    });
  } catch (error: any) {
    console.error("SERP search error:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
        status: 500,
      },
      { status: 500 }
    );
  }
}
