/**
 * RLS integration tests against local Supabase only.
 * Never use NEXT_PUBLIC_SUPABASE_URL from .env.local — that may point at hosted.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";

const LOCAL_URL = localSupabaseApiUrl();
const LOCAL_ANON = LOCAL_ANON_JWT;

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  const normalized = url.toLowerCase();
  if (normalized.includes("supabase.co") || !normalized.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing RLS tests against hosted Supabase. Use local 127.0.0.1 only.");
  }
}

function publicClient(): Client {
  assertLocalOnly(LOCAL_URL);
  return createClient<Database>(LOCAL_URL, LOCAL_ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUp(label: string): Promise<{ client: Client; user: User }> {
  const client = publicClient();
  const email = `p13-${label}-${randomUUID()}@example.com`;
  const { data, error } = await client.auth.signUp({
    email,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(
      `Local signup failed (${error?.message ?? "no session"}). Start local Supabase with npm run db:start.`
    );
  }
  return { client, user: data.user };
}

async function pingLocal() {
  assertLocalOnly(LOCAL_URL);
  const response = await fetch(`${LOCAL_URL}/auth/v1/health`);
  if (!response.ok) {
    throw new Error(
      `Local Supabase is not reachable at ${LOCAL_URL}. Run npm run db:start and npm run db:reset.`
    );
  }
}

describe("projects RLS (local Supabase)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let projectId: string;

  beforeAll(async () => {
    await pingLocal();
    userA = await signUp("a");
    userB = await signUp("b");
  });

  it("anonymous cannot select, insert, update, or delete projects", async () => {
    const anon = publicClient();
    const fakeId = randomUUID();

    const select = await anon.from("projects").select("*");
    expect(select.data).toBeFalsy();
    expect(select.error).toBeTruthy();

    const insert = await anon.from("projects").insert({
      user_id: fakeId,
      name: "anon",
      project_type: "room-renovation",
    });
    expect(insert.error).toBeTruthy();

    const update = await anon
      .from("projects")
      .update({ name: "hacked" })
      .eq("id", fakeId);
    expect(update.error).toBeTruthy();

    const del = await anon.from("projects").delete().eq("id", fakeId);
    expect(del.error).toBeTruthy();
  });

  it("User A can create, read, update, archive, restore, and delete own project", async () => {
    const created = await userA.client
      .from("projects")
      .insert({
        user_id: userA.user.id,
        name: "A kitchen",
        project_type: "room-renovation",
      })
      .select("id, user_id, name, archived_at, current_step_key, flow_version")
      .single();

    expect(created.error).toBeNull();
    expect(created.data?.user_id).toBe(userA.user.id);
    expect(created.data?.current_step_key).toBe("greeting");
    expect(created.data?.flow_version).toBe(1);
    projectId = created.data!.id;

    const listed = await userA.client
      .from("projects")
      .select("id")
      .is("archived_at", null);
    expect(listed.data?.some((row) => row.id === projectId)).toBe(true);

    const renamed = await userA.client
      .from("projects")
      .update({ name: "A kitchen v2" })
      .eq("id", projectId)
      .select("name")
      .single();
    expect(renamed.data?.name).toBe("A kitchen v2");

    const archived = await userA.client
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", projectId)
      .select("archived_at")
      .single();
    expect(archived.data?.archived_at).toBeTruthy();

    const restored = await userA.client
      .from("projects")
      .update({ archived_at: null })
      .eq("id", projectId)
      .select("archived_at")
      .single();
    expect(restored.data?.archived_at).toBeNull();
  });

  it("User B cannot read, rename, archive, restore, or delete User A project", async () => {
    expect(projectId).toBeTruthy();

    const read = await userB.client
      .from("projects")
      .select("*")
      .eq("id", projectId);
    expect(read.error).toBeNull();
    expect(read.data).toEqual([]);

    const rename = await userB.client
      .from("projects")
      .update({ name: "stolen" })
      .eq("id", projectId)
      .select("id");
    expect(rename.data).toEqual([]);

    const archive = await userB.client
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", projectId)
      .select("id");
    expect(archive.data).toEqual([]);

    const restore = await userB.client
      .from("projects")
      .update({ archived_at: null })
      .eq("id", projectId)
      .select("id");
    expect(restore.data).toEqual([]);

    const del = await userB.client
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select("id");
    expect(del.data).toEqual([]);

    const stillThere = await userA.client
      .from("projects")
      .select("id, name")
      .eq("id", projectId)
      .single();
    expect(stillThere.data?.id).toBe(projectId);
    expect(stillThere.data?.name).toBe("A kitchen v2");
  });

  it("User A cannot create a project owned by User B", async () => {
    const forged = await userA.client.from("projects").insert({
      user_id: userB.user.id,
      name: "forged",
      project_type: "home-renovation",
    });
    expect(forged.error).toBeTruthy();
    expect(forged.data).toBeFalsy();

    const asB = await userB.client
      .from("projects")
      .select("id")
      .eq("name", "forged");
    expect(asB.data).toEqual([]);
  });

  it("User A cannot transfer ownership to User B", async () => {
    const transfer = await userA.client
      .from("projects")
      .update({ user_id: userB.user.id })
      .eq("id", projectId)
      .select("user_id");
    expect(transfer.error || !transfer.data?.length).toBeTruthy();

    const row = await userA.client
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();
    expect(row.data?.user_id).toBe(userA.user.id);
  });

  it("User A can permanently delete their own project", async () => {
    const del = await userA.client
      .from("projects")
      .delete()
      .eq("id", projectId)
      .select("id")
      .single();
    expect(del.error).toBeNull();
    expect(del.data?.id).toBe(projectId);

    const gone = await userA.client
      .from("projects")
      .select("id")
      .eq("id", projectId);
    expect(gone.data).toEqual([]);
  });
});
