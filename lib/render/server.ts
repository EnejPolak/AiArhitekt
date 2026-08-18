import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { listProjectRoomRenders } from "./queries";
import type { RoomRenderView } from "./types";

/** DB read only. Never calls OpenAI Images. */
export async function loadPersistedRoomRenders(projectId: string): Promise<RoomRenderView[]> {
  const user = await getVerifiedUser();
  if (!user) return [];
  const supabase = await createClient();
  return listProjectRoomRenders(supabase, projectId);
}
