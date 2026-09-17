import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicConfig } from "@/lib/env/supabase";
import { isSafeInternalPath } from "@/lib/auth/redirect";
import { supabaseNoStoreFetch } from "@/lib/supabase/noStoreFetch";

/**
 * Optimistic session refresh + cookie write.
 * Not the authorization boundary — `/app` layout calls getUser().
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const { url, publishableKey } = getSupabasePublicConfig();

  const supabase = createServerClient<Database>(url, publishableKey, {
    global: { fetch: supabaseNoStoreFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          supabaseResponse.headers.set(key, value);
        });
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const hasUser = Boolean(data?.claims);

  const path = request.nextUrl.pathname;

  if (path.startsWith("/app") && !hasUser) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/sign-in";
    const nextPath = `${path}${request.nextUrl.search}`;
    redirectUrl.search = "";
    if (isSafeInternalPath(nextPath)) {
      redirectUrl.searchParams.set("next", nextPath);
    }
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  if ((path === "/sign-in" || path === "/sign-up") && hasUser) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/app";
    redirectUrl.search = "";
    return copyCookies(supabaseResponse, NextResponse.redirect(redirectUrl));
  }

  return supabaseResponse;
}

function copyCookies(from: NextResponse, to: NextResponse): NextResponse {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
  from.headers.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") return;
    if (!to.headers.has(key)) to.headers.set(key, value);
  });
  return to;
}
