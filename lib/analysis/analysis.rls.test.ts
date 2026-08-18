/**
 * project_room_analyses RLS against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { validRoomAnalysisResult } from "./fixtures";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing analysis RLS tests against hosted Supabase.");
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
    email: `p15-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

const JPEG = new Blob(
  [
    new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00,
      0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]),
  ],
  { type: "image/jpeg" }
);

async function seedRoomPhoto(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Room analysis",
      project_type: "room-renovation",
    })
    .select("id")
    .single();
  if (!created.data) throw new Error("Could not create project");
  const projectId = created.data.id;
  const uploadId = randomUUID();
  const path = buildRoomPhotoPath(projectId, uploadId, "image/jpeg");
  const uploaded = await client.storage
    .from(PROJECT_UPLOADS_BUCKET)
    .upload(path, JPEG, { contentType: "image/jpeg" });
  if (uploaded.error) throw new Error(uploaded.error.message);
  const meta = await client
    .from("project_uploads")
    .insert({
      project_id: projectId,
      kind: "room_photo",
      storage_bucket: PROJECT_UPLOADS_BUCKET,
      storage_path: path,
      original_filename: "room.jpg",
      mime_type: "image/jpeg",
      size_bytes: 22,
    })
    .select("id, storage_path")
    .single();
  if (!meta.data) throw new Error(meta.error?.message ?? "upload metadata failed");
  return { projectId, uploadId: meta.data.id, path: meta.data.storage_path };
}

function analysisPayload(projectId: string, uploadId: string, path: string) {
  return {
    project_id: projectId,
    source_upload_id: uploadId,
    source_storage_path: path,
    schema_version: 1,
    provider: "openai",
    model: "gpt-4o",
    analysis: validRoomAnalysisResult.analysis,
    design_requirements: validRoomAnalysisResult.designRequirements,
  };
}

describe("project_room_analyses RLS (local)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let seededA: { projectId: string; uploadId: string; path: string };
  let seededB: { projectId: string; uploadId: string; path: string };
  let analysisA: string;

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    userB = await signUp("b");
    seededA = await seedRoomPhoto(userA.client, userA.user.id);
    seededB = await seedRoomPhoto(userB.client, userB.user.id);
  });

  it("anonymous cannot read or write analyses", async () => {
    const anon = publicClient();
    const select = await anon.from("project_room_analyses").select("*");
    expect(select.data).toBeFalsy();
    expect(select.error).toBeTruthy();

    const insert = await anon.from("project_room_analyses").insert(
      analysisPayload(seededA.projectId, seededA.uploadId, seededA.path)
    );
    expect(insert.error).toBeTruthy();

    const update = await anon
      .from("project_room_analyses")
      .update({ model: "stolen" })
      .eq("project_id", seededA.projectId);
    expect(update.error).toBeTruthy();

    const del = await anon.from("project_room_analyses").delete().eq("project_id", seededA.projectId);
    expect(del.error).toBeTruthy();
  });

  it("User A can create, read, update, and delete own analysis", async () => {
    const created = await userA.client
      .from("project_room_analyses")
      .insert(analysisPayload(seededA.projectId, seededA.uploadId, seededA.path))
      .select("id")
      .single();
    expect(created.error).toBeNull();
    analysisA = created.data!.id;

    const read = await userA.client
      .from("project_room_analyses")
      .select("id, project_id")
      .eq("id", analysisA)
      .single();
    expect(read.data?.project_id).toBe(seededA.projectId);

    const patched = await userA.client
      .from("project_room_analyses")
      .update({ model: "gpt-4o" })
      .eq("id", analysisA)
      .select("model")
      .single();
    expect(patched.error).toBeNull();
    expect(patched.data?.model).toBe("gpt-4o");
  });

  it("User B cannot read, insert, update, or delete User A analysis", async () => {
    const read = await userB.client
      .from("project_room_analyses")
      .select("*")
      .eq("project_id", seededA.projectId);
    expect(read.data).toEqual([]);

    const insert = await userB.client
      .from("project_room_analyses")
      .insert(analysisPayload(seededA.projectId, seededA.uploadId, seededA.path));
    expect(insert.error).toBeTruthy();

    const patch = await userB.client
      .from("project_room_analyses")
      .update({ model: "stolen" })
      .eq("id", analysisA)
      .select("id");
    expect(patch.data).toEqual([]);

    const del = await userB.client
      .from("project_room_analyses")
      .delete()
      .eq("id", analysisA)
      .select("id");
    expect(del.data).toEqual([]);

    const still = await userA.client
      .from("project_room_analyses")
      .select("id")
      .eq("id", analysisA)
      .single();
    expect(still.data?.id).toBe(analysisA);
  });

  it("rejects analysis sourced from another project's upload", async () => {
    const wrong = await userA.client.from("project_room_analyses").insert(
      analysisPayload(seededA.projectId, seededB.uploadId, seededB.path)
    );
    expect(wrong.error).toBeTruthy();
  });

  it("User A can delete own analysis", async () => {
    const del = await userA.client
      .from("project_room_analyses")
      .delete()
      .eq("id", analysisA)
      .select("id")
      .single();
    expect(del.error).toBeNull();
  });
});
