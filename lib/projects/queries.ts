import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { mapProjectDbError, ProjectError, projectErrorMessage } from "./errors";
import { projectIdSchema } from "./schema";
import type { ProjectRow, ProjectType } from "./types";
import { isProjectType } from "./types";

type Client = SupabaseClient<Database>;

const JWT_IAT_SKEW_CODE = "PGRST303";
const JWT_IAT_SKEW_RETRY_MS = 800;

async function withJwtIatSkewRetry<T>(
  run: () => PromiseLike<{ data: T; error: { message?: string; code?: string } | null }>
): Promise<{ data: T; error: { message?: string; code?: string } | null }> {
  const first = await run();
  if ((first.error?.code ?? "").toUpperCase() !== JWT_IAT_SKEW_CODE) {
    return first;
  }
  await new Promise((resolve) => setTimeout(resolve, JWT_IAT_SKEW_RETRY_MS));
  return run();
}

function asProject(row: Record<string, unknown>): ProjectRow {
  const projectType = String(row.project_type ?? "");
  if (!isProjectType(projectType)) {
    throw new ProjectError("failed", projectErrorMessage("failed", "load"));
  }
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name),
    project_type: projectType,
    current_step_key: String(row.current_step_key),
    flow_version: Number(row.flow_version),
    archived_at: (row.archived_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

export async function listActiveProjects(client: Client): Promise<ProjectRow[]> {
  const { data, error } = await withJwtIatSkewRetry(() =>
    client
      .from("projects")
      .select("*")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
  );

  if (error) throw mapProjectDbError(error, "load");
  return (data ?? []).map((row) => asProject(row as Record<string, unknown>));
}

export async function listArchivedProjects(client: Client): Promise<ProjectRow[]> {
  const { data, error } = await withJwtIatSkewRetry(() =>
    client
      .from("projects")
      .select("*")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false })
  );

  if (error) throw mapProjectDbError(error, "load");
  return (data ?? []).map((row) => asProject(row as Record<string, unknown>));
}

export async function getProjectById(
  client: Client,
  projectId: string
): Promise<ProjectRow | null> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) return null;

  const { data, error } = await withJwtIatSkewRetry(() =>
    client.from("projects").select("*").eq("id", parsed.data).maybeSingle()
  );

  if (error) throw mapProjectDbError(error, "load");
  if (!data) return null;
  return asProject(data as Record<string, unknown>);
}

export type { ProjectType };
