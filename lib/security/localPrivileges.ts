import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function localDbContainerName(): string {
  const toml = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");
  const projectId = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1];
  if (!projectId) {
    throw new Error("Could not read project_id from supabase/config.toml");
  }
  return `supabase_db_${projectId}`;
}

/** Local test helper. Queries has_table_privilege in the local Postgres container. */
export function localHasTablePrivilege(
  role: "anon" | "authenticated" | "service_role",
  table: string,
  privilege: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "TRUNCATE"
): boolean {
  if (!/^[a-z_]+$/.test(table)) {
    throw new Error("Invalid table name for local privilege check.");
  }
  const container = localDbContainerName();
  const out = execFileSync(
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
      "-tA",
      "-c",
      `select has_table_privilege('${role}', 'public.${table}', '${privilege}');`,
    ],
    { encoding: "utf8", timeout: 15_000 }
  );
  return out.trim() === "t";
}

/** Local test helper. Queries has_column_privilege in the local Postgres container. */
export function localHasColumnPrivilege(
  role: "anon" | "authenticated" | "service_role",
  table: string,
  column: string,
  privilege: "SELECT" | "INSERT" | "UPDATE" | "REFERENCES"
): boolean {
  if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(column)) {
    throw new Error("Invalid table or column name for local privilege check.");
  }
  const container = localDbContainerName();
  const out = execFileSync(
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
      "-tA",
      "-c",
      `select has_column_privilege('${role}', 'public.${table}', '${column}', '${privilege}');`,
    ],
    { encoding: "utf8", timeout: 15_000 }
  );
  return out.trim() === "t";
}
