import { NextResponse } from "next/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { isDebugApiAllowed } from "@/lib/env/deployment";

export const UNAUTHENTICATED_SPEND_BODY = {
  ok: false,
  error: "unauthenticated",
  message: "Sign in to continue.",
  status: 401,
} as const;

export function unauthenticatedSpendResponse(): NextResponse {
  return NextResponse.json(UNAUTHENTICATED_SPEND_BODY, { status: 401 });
}

/**
 * Spend-capable HTTP routes require a verified app user in production.
 * Local/preview api-debug may skip auth only when `isDebugApiAllowed()` is true.
 * Production never allows that bypass.
 */
export async function requireSpendRouteAuth(): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  if (isDebugApiAllowed()) {
    return { ok: true };
  }
  const user = await getVerifiedUser();
  if (!user) {
    return { ok: false, response: unauthenticatedSpendResponse() };
  }
  return { ok: true };
}
