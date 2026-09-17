import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { loadCurrentProductDiscovery } from "./discover";
import {
  toProjectProductShoppingState,
  type ProjectProductShoppingState,
} from "./shoppingState";
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

/** Same ownership gate as loadPersistedProductDiscovery. Read-only. */
export async function loadProjectProductShoppingState(
  projectId: string
): Promise<ProjectProductShoppingState> {
  const loaded = await loadPersistedProductDiscovery(projectId);
  return toProjectProductShoppingState(loaded?.discovery ?? null, loaded?.selections ?? []);
}
