import { NextResponse } from "next/server";
import { RateLimiter, getClientIP } from "@/lib/rateLimit";
import { serpSearchRequestSchema } from "@/lib/schemas/serp";
import { runCanonicalSerpSearch } from "@/lib/serp/search";

// Node runtime required: lib/serp/domains uses Node crypto for cache key hash (no Edge).
export const runtime = "nodejs";

const rateLimiter = new RateLimiter(30, 60000);

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
    const outcome = await runCanonicalSerpSearch({
      items: body.items,
      allowlistDomains: body.allowlistDomains ?? [],
      dryRun: body.dryRun,
      maxRequests: body.maxRequests,
      fastMode: body.fastMode,
      domainCategoryMap: body.domainCategoryMap,
      preferredDomains: body.preferredDomains,
      debug: body.debug,
    });

    if (!outcome.ok) {
      const payload: Record<string, unknown> = {
        error: outcome.error,
        status: outcome.httpStatus,
      };
      if (outcome.details !== undefined) payload.details = outcome.details;
      if (outcome.httpStatus === 429 && typeof outcome.details === "string") {
        payload.details = outcome.details;
      }
      return NextResponse.json(payload, { status: outcome.httpStatus });
    }

    return NextResponse.json(outcome.response);
  } catch (error: unknown) {
    console.error("SERP search error:", error);
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json(
      { error: "Internal server error", details: message, status: 500 },
      { status: 500 }
    );
  }
}
