import { NextResponse } from "next/server";
import { parseAuthCallbackSearch } from "@/lib/auth/callback";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const parsed = parseAuthCallbackSearch(requestUrl.searchParams);
  const failure = NextResponse.redirect(
    new URL("/sign-in?error=callback", requestUrl.origin)
  );

  if (parsed.kind === "invalid") {
    return failure;
  }

  try {
    const supabase = await createClient();

    if (parsed.kind === "code") {
      const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
      if (error) return failure;
    } else {
      const { error } = await supabase.auth.verifyOtp({
        type: parsed.type,
        token_hash: parsed.tokenHash,
      });
      if (error) return failure;
    }

    return NextResponse.redirect(new URL(parsed.next, requestUrl.origin));
  } catch {
    return failure;
  }
}
