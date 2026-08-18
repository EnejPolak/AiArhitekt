import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { loadCurrentProductDiscovery } from "./discover";
import type { ProductDiscoveryView, ProductSelectionView } from "./types";

/** DB read only. Never calls Geocode, Places, SERP, or OpenAI. */
export async function loadPersistedProductDiscovery(projectId: string): Promise<{
  discovery: ProductDiscoveryView;
  selections: ProductSelectionView[];
} | null> {
  const user = await getVerifiedUser();
  if (!user) return null;
  const supabase = await createClient();
  return loadCurrentProductDiscovery(supabase, projectId);
}
