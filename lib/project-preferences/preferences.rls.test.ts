import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { getProjectRoomPreferences, upsertProjectRoomPreferences } from "./queries";

const LOCAL_URL = localSupabaseApiUrl();
type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing room preference RLS tests against hosted Supabase.");
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
    email: `p162-prefs-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

async function seedProject(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Room prefs RLS",
      project_type: "room-renovation",
    })
    .select("id")
    .single();
  if (!created.data) throw new Error(created.error?.message ?? "project failed");
  return created.data.id;
}

describe("project_room_preferences RLS (local)", () => {
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
    projectA = await seedProject(userA.client, userA.user.id);
    projectB = await seedProject(userB.client, userB.user.id);
  });

  it("anonymous cannot read or write room preferences", async () => {
    const anon = publicClient();
    const selected = await anon.from("project_room_preferences").select("*");
    expect(selected.data).toBeFalsy();
    expect(selected.error).toBeTruthy();

    const inserted = await anon.from("project_room_preferences").insert({
      project_id: projectA,
      flooring: "marble",
      wall_main_color: "metallic black",
    });
    expect(inserted.error).toBeTruthy();
  });

  it("owner can insert, read, update, and delete their own row", async () => {
    const saved = await upsertProjectRoomPreferences(userA.client, projectA, {
      wallMainColor: "metallic black",
      wallAccentColor: "olive green",
      flooring: "marble",
    });
    expect(saved.flooring).toBe("marble");
    expect(saved.wallMainColor).toBe("metallic black");

    const loaded = await getProjectRoomPreferences(userA.client, projectA);
    expect(loaded?.flooring).toBe("marble");

    const updated = await upsertProjectRoomPreferences(userA.client, projectA, {
      flooring: "hardwood",
    });
    expect(updated.flooring).toBe("hardwood");
    expect(updated.wallMainColor).toBe("metallic black");

    const deleted = await userA.client
      .from("project_room_preferences")
      .delete()
      .eq("project_id", projectA);
    expect(deleted.error).toBeNull();
    expect(await getProjectRoomPreferences(userA.client, projectA)).toBeNull();
  });

  it("user B cannot read or write user A preferences", async () => {
    await upsertProjectRoomPreferences(userA.client, projectA, {
      flooring: "marble",
      wallMainColor: "metallic black",
    });

    const stolen = await userB.client
      .from("project_room_preferences")
      .select("*")
      .eq("project_id", projectA)
      .maybeSingle();
    expect(stolen.data).toBeNull();

    const update = await userB.client
      .from("project_room_preferences")
      .update({ flooring: "tiles" })
      .eq("project_id", projectA)
      .select();
    expect(update.data ?? []).toEqual([]);
    expect((await getProjectRoomPreferences(userA.client, projectA))?.flooring).toBe("marble");

    const insertOnA = await userB.client.from("project_room_preferences").insert({
      project_id: projectA,
      flooring: "tiles",
    });
    expect(insertOnA.error).toBeTruthy();

    await upsertProjectRoomPreferences(userB.client, projectB, { flooring: "keep" });
    const own = await getProjectRoomPreferences(userB.client, projectB);
    expect(own?.projectId).toBe(projectB);
  });
});
