import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { ProjectPreferencesError } from "./errors";
import { getProjectRoomPreferences } from "./queries";
import type { ProjectRoomPreferences } from "./types";

/** DB read only. Never calls Geocode, Places, SERP, or OpenAI. */
export async function loadPersistedProjectRoomPreferences(
  projectId: string
): Promise<ProjectRoomPreferences | null> {
  const user = await getVerifiedUser();
  if (!user) return null;
  const supabase = await createClient();
  try {
    return await getProjectRoomPreferences(supabase, projectId);
  } catch (error) {
    const code = error instanceof ProjectPreferencesError ? error.code : "unknown";
    console.error("[project-preferences] load_failed", { code });
    return null;
  }
}
