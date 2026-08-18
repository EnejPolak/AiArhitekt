import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { listActiveProjects, listArchivedProjects, getProjectById } from "./queries";
import type { ProjectRow } from "./types";

export async function loadWorkspaceProjects(): Promise<{
  active: ProjectRow[];
  archived: ProjectRow[];
}> {
  const user = await getVerifiedUser();
  if (!user) return { active: [], archived: [] };
  const supabase = await createClient();
  const [active, archived] = await Promise.all([
    listActiveProjects(supabase),
    listArchivedProjects(supabase),
  ]);
  return { active, archived };
}

export async function loadOwnedProject(projectId: string): Promise<ProjectRow | null> {
  const user = await getVerifiedUser();
  if (!user) return null;
  const supabase = await createClient();
  return getProjectById(supabase, projectId);
}
