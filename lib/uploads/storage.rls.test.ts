/**
 * Storage + project_uploads RLS against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "./constants";
import { buildRoomPhotoPath } from "./path";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing Storage tests against hosted Supabase.");
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
    email: `p14-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

const JPEG = new Blob(
  [new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9])],
  { type: "image/jpeg" }
);

describe("project-uploads Storage RLS (local)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let projectA: string;
  let pathA: string;
  let uploadA: string;

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    userB = await signUp("b");
    const created = await userA.client
      .from("projects")
      .insert({
        user_id: userA.user.id,
        name: "Room A",
        project_type: "room-renovation",
      })
      .select("id")
      .single();
    if (!created.data) throw new Error("Could not create project A");
    projectA = created.data.id;
    uploadA = randomUUID();
    pathA = buildRoomPhotoPath(projectA, uploadA, "image/jpeg");
  });

  it("anonymous cannot upload, read, delete, or read metadata", async () => {
    const anon = publicClient();
    const upload = await anon.storage.from(PROJECT_UPLOADS_BUCKET).upload(pathA, JPEG, {
      contentType: "image/jpeg",
    });
    expect(upload.error).toBeTruthy();

    const read = await anon.storage.from(PROJECT_UPLOADS_BUCKET).download(pathA);
    expect(read.error).toBeTruthy();

    const del = await anon.storage.from(PROJECT_UPLOADS_BUCKET).remove([pathA]);
    expect(del.error || (del.data && del.data.length === 0)).toBeTruthy();

    const meta = await anon.from("project_uploads").select("*");
    expect(meta.data).toBeFalsy();
    expect(meta.error).toBeTruthy();
  });

  it("User A can upload, persist, replace, and delete own photo", async () => {
    const uploaded = await userA.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .upload(pathA, JPEG, { contentType: "image/jpeg", upsert: false });
    expect(uploaded.error).toBeNull();

    const meta = await userA.client
      .from("project_uploads")
      .insert({
        project_id: projectA,
        kind: "room_photo",
        storage_bucket: PROJECT_UPLOADS_BUCKET,
        storage_path: pathA,
        original_filename: "room.jpg",
        mime_type: "image/jpeg",
        size_bytes: 22,
      })
      .select("id")
      .single();
    expect(meta.error).toBeNull();

    const replacementId = randomUUID();
    const replacementPath = buildRoomPhotoPath(projectA, replacementId, "image/jpeg");
    const replaced = await userA.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .upload(replacementPath, JPEG, { contentType: "image/jpeg" });
    expect(replaced.error).toBeNull();

    const updated = await userA.client
      .from("project_uploads")
      .update({ storage_path: replacementPath })
      .eq("project_id", projectA)
      .select("storage_path")
      .single();
    expect(updated.data?.storage_path).toBe(replacementPath);

    const removedOld = await userA.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .remove([pathA]);
    expect(removedOld.error).toBeNull();

    pathA = replacementPath;
    uploadA = replacementId;
  });

  it("User B cannot use User A project UUID or path", async () => {
    const stealUpload = await userB.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .upload(pathA, JPEG, { contentType: "image/jpeg", upsert: true });
    expect(stealUpload.error).toBeTruthy();

    const read = await userB.client.storage.from(PROJECT_UPLOADS_BUCKET).download(pathA);
    expect(read.error).toBeTruthy();

    const signed = await userB.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .createSignedUrl(pathA, 60);
    expect(signed.error || !signed.data?.signedUrl).toBeTruthy();

    const del = await userB.client.storage.from(PROJECT_UPLOADS_BUCKET).remove([pathA]);
    const stillThere = await userA.client.storage.from(PROJECT_UPLOADS_BUCKET).download(pathA);
    expect(stillThere.error).toBeNull();
    expect(del.data?.length ?? 0).toBe(0);

    const meta = await userB.client
      .from("project_uploads")
      .select("*")
      .eq("project_id", projectA);
    expect(meta.data).toEqual([]);

    const patch = await userB.client
      .from("project_uploads")
      .update({ original_filename: "stolen.jpg" })
      .eq("project_id", projectA)
      .select("id");
    expect(patch.data).toEqual([]);
  });

  it("rejects malformed storage paths for User A", async () => {
    const traversal = await userA.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .upload(`projects/${projectA}/uploads/../../secret.jpg`, JPEG, {
        contentType: "image/jpeg",
      });
    expect(traversal.error).toBeTruthy();

    const extra = await userA.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .upload(`projects/${projectA}/other/${uploadA}.jpg`, JPEG, {
        contentType: "image/jpeg",
      });
    expect(extra.error).toBeTruthy();

    const originalName = await userA.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .upload(`projects/${projectA}/uploads/my photo.jpg`, JPEG, {
        contentType: "image/jpeg",
      });
    expect(originalName.error).toBeTruthy();
  });
});
