import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Local API URL from supabase/config.toml. Never use hosted env URLs in tests.
 */
export function localSupabaseApiUrl(): string {
  const toml = readFileSync(join(process.cwd(), "supabase/config.toml"), "utf8");
  const apiBlock = toml.match(/\[api\]([\s\S]*?)(\n\[|\n# \[|$)/);
  const portMatch = (apiBlock?.[1] ?? "").match(/^\s*port\s*=\s*(\d+)/m);
  const port = portMatch?.[1];
  if (!port) {
    throw new Error("Could not read [api] port from supabase/config.toml");
  }
  const url = `http://127.0.0.1:${port}`;
  if (url.includes("supabase.co")) {
    throw new Error("Refusing tests against hosted Supabase.");
  }
  return url;
}

export const LOCAL_ANON_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
