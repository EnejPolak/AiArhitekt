import { NextResponse } from "next/server";
import { resetDailyUsage, checkDailyCap } from "@/lib/serpGuardrails";

export const runtime = "nodejs";

/**
 * POST /api/serp/reset-usage
 * Resets daily SERP usage counter to 0 so remaining = cap again.
 */
export async function POST() {
  try {
    const usage = await resetDailyUsage();
    const cap = await checkDailyCap();
    return NextResponse.json({
      ok: true,
      message: "Daily SERP usage reset to 0.",
      usage: { date: usage.date, used: usage.used },
      remaining: cap.remaining,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Failed to reset usage" },
      { status: 500 }
    );
  }
}
