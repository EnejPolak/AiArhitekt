import { NextResponse } from "next/server";
import { isDebugApiAllowed } from "@/lib/env/deployment";
import { resetDailyUsage, checkDailyCap } from "@/lib/serpGuardrails";
import { sanitizedInternalErrorResponse } from "@/lib/api/publicError";

export const runtime = "nodejs";

/**
 * POST /api/serp/reset-usage
 * Resets daily SERP usage counter to 0 so remaining = cap again.
 * Debug-only: production deployments always reject this route.
 */
export async function POST() {
  if (!isDebugApiAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const usage = await resetDailyUsage();
    const cap = await checkDailyCap();
    return NextResponse.json({
      ok: true,
      message: "Daily SERP usage reset to 0.",
      usage: { date: usage.date, used: usage.used },
      remaining: cap.remaining,
    });
  } catch (e: unknown) {
    return sanitizedInternalErrorResponse("SERP reset-usage error:", e);
  }
}
