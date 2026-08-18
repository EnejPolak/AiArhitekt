/**
 * project_ai_request_guards RLS + claim RPC against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing guard RLS tests against hosted Supabase.");
  }
}

function publicClient(): Client {
  assertLocalOnly(LOCAL_URL);
  return createClient<Database>(LOCAL_URL, LOCAL_ANON_JWT, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUp(label: string) {
  const client = publicClient();
  const { data, error } = await client.auth.signUp({
    email: `p151-rls-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

describe("project_ai_request_guards RLS (local)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let projectA: string;
  let projectB: string;

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    userB = await signUp("b");
    const createdA = await userA.client
      .from("projects")
      .insert({
        user_id: userA.user.id,
        name: "Guard A",
        project_type: "room-renovation",
      })
      .select("id")
      .single();
    const createdB = await userB.client
      .from("projects")
      .insert({
        user_id: userB.user.id,
        name: "Guard B",
        project_type: "room-renovation",
      })
      .select("id")
      .single();
    if (!createdA.data || !createdB.data) throw new Error("Could not create projects");
    projectA = createdA.data.id;
    projectB = createdB.data.id;
  });

  it("anonymous cannot read, write, or claim", async () => {
    const anon = publicClient();
    const select = await anon.from("project_ai_request_guards").select("*");
    expect(select.data).toBeFalsy();
    expect(select.error).toBeTruthy();

    const insert = await anon.from("project_ai_request_guards").insert({
      project_id: projectA,
      operation: "room_analysis",
      last_started_at: new Date().toISOString(),
    });
    expect(insert.error).toBeTruthy();

    const claim = await anon.rpc("claim_room_analysis_slot", { p_project_id: projectA });
    expect(claim.error).toBeTruthy();
  });

  it("User A can claim own project and cannot backdate the guard", async () => {
    const claimed = await userA.client.rpc("claim_room_analysis_slot", {
      p_project_id: projectA,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toMatchObject({ claimed: true });

    const backdate = await userA.client
      .from("project_ai_request_guards")
      .update({ last_started_at: new Date(Date.now() - 120_000).toISOString() })
      .eq("project_id", projectA)
      .select("last_started_at");
    expect(backdate.data).toEqual([]);

    const deleted = await userA.client
      .from("project_ai_request_guards")
      .delete()
      .eq("project_id", projectA)
      .select("project_id");
    expect(deleted.data == null || deleted.data.length === 0).toBe(true);

    const again = await userA.client.rpc("claim_room_analysis_slot", {
      p_project_id: projectA,
    });
    expect(again.error).toBeNull();
    expect(again.data).toMatchObject({ claimed: false });
    expect(
      (again.data as { retry_after_seconds?: number }).retry_after_seconds
    ).toBeGreaterThan(0);
  });

  it("User B cannot inspect, claim, or update User A cooldown", async () => {
    const read = await userB.client
      .from("project_ai_request_guards")
      .select("*")
      .eq("project_id", projectA);
    expect(read.data).toEqual([]);

    const claim = await userB.client.rpc("claim_room_analysis_slot", {
      p_project_id: projectA,
    });
    expect(claim.error).toBeTruthy();

    const patch = await userB.client
      .from("project_ai_request_guards")
      .update({ last_started_at: new Date().toISOString() })
      .eq("project_id", projectA)
      .select("project_id");
    expect(patch.data).toEqual([]);

    const stillA = await userA.client
      .from("project_ai_request_guards")
      .select("project_id, operation")
      .eq("project_id", projectA)
      .single();
    expect(stillA.data?.operation).toBe("room_analysis");
  });

  it("User B can still claim a slot on their own project", async () => {
    const claimed = await userB.client.rpc("claim_room_analysis_slot", {
      p_project_id: projectB,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toMatchObject({ claimed: true });
  });
});
