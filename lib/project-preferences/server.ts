import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { getProjectRoomPreferences } from "./queries";
import type { ProjectRoomPreferences } from "./types";

/** DB read only. Never calls Geocode, Places, SERP, or OpenAI. */
export async function loadPersistedProjectRoomPreferences(
  projectId: string
): Promise<ProjectRoomPreferences | null> {
  const user = await getVerifiedUser();
  if (!user) return null;
  const supabase = await createClient();
  return getProjectRoomPreferences(supabase, projectId);
}
