import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { projectIdSchema } from "@/lib/projects/schema";

function localDbContainerName(): string {
  const toml = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");
  const projectId = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!projectId) {
    throw new Error("Could not read project_id from supabase/config.toml");
  }
  return `supabase_db_${projectId}`;
}

/** Local test setup only. Not a production reset API. Uses the local Postgres container. */
export async function expireLocalRoomRenderCooldown(projectId: string): Promise<void> {
  const parsed = projectIdSchema.safeParse(projectId);
  if (!parsed.success) {
    throw new Error("Invalid project id for local cooldown setup.");
  }
  const container = localDbContainerName();
  execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `update public.project_ai_request_guards
       set last_started_at = now() - interval '121 seconds'
       where project_id = '${parsed.data}'::uuid
         and operation = 'room_render';`,
    ],
    { encoding: "utf8", timeout: 15_000 }
  );
}
