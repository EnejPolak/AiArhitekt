import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { getSupabaseSecretConfig } from "@/lib/env/supabase";

/**
 * Narrow persist client. Uses SUPABASE_SECRET_KEY to call trusted RPCs
 * (product persist, reference-asset metadata, room-render trusted writes,
 * Storage writes to project-assets).
 * Never expose this client to the browser. Do not use it for user CRUD.
 */
export function createPersistClient(): SupabaseClient<Database> {
  const { url, secretKey } = getSupabaseSecretConfig();
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
