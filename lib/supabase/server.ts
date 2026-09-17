import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/database.types";
import { getSupabasePublicConfig } from "@/lib/env/supabase";
import { supabaseNoStoreFetch } from "@/lib/supabase/noStoreFetch";

export async function createClient() {
  const cookieStore = await cookies();
  const { url, publishableKey } = getSupabasePublicConfig();

  return createServerClient<Database>(url, publishableKey, {
    global: { fetch: supabaseNoStoreFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
          if (process.env.NODE_ENV !== "production") {
            console.info("[auth-cookies]", JSON.stringify({ stage: "setAll", count: cookiesToSet.length, threw: false }));
          }
        } catch {
          if (process.env.NODE_ENV !== "production") {
            console.info("[auth-cookies]", JSON.stringify({ stage: "setAll", count: cookiesToSet.length, threw: true }));
          }
        }
      },
    },
  });
}
