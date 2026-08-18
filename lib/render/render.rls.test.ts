/**
 * Room render RLS + trusted write isolation against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/lib/database.types";
import { LOCAL_ANON_JWT, LOCAL_SERVICE_ROLE_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { ROOM_RENDER_MODEL, ROOM_RENDER_PROVIDER } from "./constants";

const LOCAL_URL = localSupabaseApiUrl();
type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing room render RLS tests against hosted Supabase.");
  }
}

function publicClient(): Client {
  assertLocalOnly(LOCAL_URL);
  return createClient<Database>(LOCAL_URL, LOCAL_ANON_JWT, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function persistClient(): Client {
  assertLocalOnly(LOCAL_URL);
  return createClient<Database>(LOCAL_URL, LOCAL_SERVICE_ROLE_JWT, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signUp(label: string) {
  const client = publicClient();
  const { data, error } = await client.auth.signUp({
    email: `p17b-rls-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

const JPEG = new Blob(
  [
    Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
      0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]),
  ],
  { type: "image/jpeg" }
);

async function seedProject(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Render RLS",
      project_type: "room-renovation",
    })
    .select("id")
    .single();
  if (!created.data) throw new Error(created.error?.message ?? "project");
  const projectId = created.data.id;
  const uploadId = randomUUID();
  const path = buildRoomPhotoPath(projectId, uploadId, "image/jpeg");
  const uploaded = await client.storage.from(PROJECT_UPLOADS_BUCKET).upload(path, JPEG, {
    contentType: "image/jpeg",
  });
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
    .select("id")
    .single();
  if (!meta.data) throw new Error(meta.error?.message ?? "upload");
  return { projectId, uploadId: meta.data.id };
}

describe("project_room_renders RLS (local)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let seededA: Awaited<ReturnType<typeof seedProject>>;
  let seededB: Awaited<ReturnType<typeof seedProject>>;
  let renderA: string;

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    userB = await signUp("b");
    seededA = await seedProject(userA.client, userA.user.id);
    seededB = await seedProject(userB.client, userB.user.id);

    const inserted = await persistClient().rpc("insert_project_room_render_processing", {
      p_owner_user_id: userA.user.id,
      p_project_id: seededA.projectId,
      p_source_upload_id: seededA.uploadId,
      p_source_analysis_id: null,
      p_source_analysis_updated_at: null,
      p_source_discovery_id: null,
      p_source_fingerprint: "ab".repeat(32),
      p_provider: ROOM_RENDER_PROVIDER,
      p_model: ROOM_RENDER_MODEL,
      p_schema_version: 1,
      p_prompt_snapshot: { prompt: "test" } as unknown as Json,
      p_reference_snapshot: [] as unknown as Json,
    });
    if (inserted.error) throw new Error(inserted.error.message);
    renderA = (inserted.data as { id: string }).id;
  });

  it("anonymous has no render access and cannot claim", async () => {
    const anon = publicClient();
    const select = await anon.from("project_room_renders").select("*");
    expect(select.data == null || select.data.length === 0).toBe(true);
    expect(select.error).toBeTruthy();
    const insert = await anon.from("project_room_renders").insert({
      project_id: seededA.projectId,
      source_fingerprint: "cd".repeat(32),
      provider: "openai",
      model: "gpt-image-1.5",
      schema_version: 1,
      status: "succeeded",
    });
    expect(insert.error).toBeTruthy();
    const claim = await anon.rpc("claim_room_render_slot", { p_project_id: seededA.projectId });
    expect(claim.error).toBeTruthy();
  });

  it("User A can read own render metadata but cannot insert or mark succeeded", async () => {
    const owned = await userA.client
      .from("project_room_renders")
      .select("id, status")
      .eq("id", renderA)
      .single();
    expect(owned.error).toBeNull();
    expect(owned.data?.status).toBe("processing");

    const insert = await userA.client.from("project_room_renders").insert({
      project_id: seededA.projectId,
      source_fingerprint: "cd".repeat(32),
      provider: "openai",
      model: "gpt-image-1.5",
      schema_version: 1,
      status: "succeeded",
    });
    expect(insert.error).toBeTruthy();

    const patch = await userA.client
      .from("project_room_renders")
      .update({
        status: "succeeded",
        output_storage_path: `projects/${seededA.projectId}/renders/${renderA}.png`,
        provider: "forged",
        model: "forged-model",
      })
      .eq("id", renderA)
      .select("id");
    expect(patch.error).toBeTruthy();
    expect(patch.data == null || patch.data.length === 0).toBe(true);

    const deleted = await userA.client
      .from("project_room_renders")
      .delete()
      .eq("id", renderA)
      .select("id");
    expect(deleted.error).toBeTruthy();
    expect(deleted.data == null || deleted.data.length === 0).toBe(true);

    const rpc = await userA.client.rpc("complete_project_room_render", {
      p_owner_user_id: userA.user.id,
      p_project_id: seededA.projectId,
      p_render_id: renderA,
      p_output_storage_path: `projects/${seededA.projectId}/renders/${renderA}.png`,
      p_output_mime_type: "image/png",
      p_output_size_bytes: 12,
      p_output_hash: "ab".repeat(32),
    });
    expect(rpc.error).toBeTruthy();
  });

  it("User B cannot read, claim, or complete User A renders", async () => {
    const read = await userB.client
      .from("project_room_renders")
      .select("id")
      .eq("id", renderA);
    expect(read.data).toEqual([]);

    const claim = await userB.client.rpc("claim_room_render_slot", {
      p_project_id: seededA.projectId,
    });
    expect(claim.error).toBeTruthy();

    const stolenOwner = await persistClient().rpc("insert_project_room_render_processing", {
      p_owner_user_id: userB.user.id,
      p_project_id: seededA.projectId,
      p_source_upload_id: seededA.uploadId,
      p_source_analysis_id: null,
      p_source_analysis_updated_at: null,
      p_source_discovery_id: null,
      p_source_fingerprint: "ef".repeat(32),
      p_provider: ROOM_RENDER_PROVIDER,
      p_model: ROOM_RENDER_MODEL,
      p_schema_version: 1,
      p_prompt_snapshot: {} as unknown as Json,
      p_reference_snapshot: [] as unknown as Json,
    });
    expect(stolenOwner.error).toBeTruthy();

    const complete = await persistClient().rpc("complete_project_room_render", {
      p_owner_user_id: userB.user.id,
      p_project_id: seededA.projectId,
      p_render_id: renderA,
      p_output_storage_path: `projects/${seededA.projectId}/renders/${renderA}.png`,
      p_output_mime_type: "image/png",
      p_output_size_bytes: 12,
      p_output_hash: "ab".repeat(32),
    });
    expect(complete.error).toBeTruthy();

    const stillA = await userA.client
      .from("project_room_renders")
      .select("status")
      .eq("id", renderA)
      .single();
    expect(stillA.data?.status).toBe("processing");
  });

  it("forged product rows still cannot be inserted as trusted commerce or render inputs", async () => {
    const forged = await userA.client.from("project_product_selections").insert({
      project_id: seededA.projectId,
      discovery_id: randomUUID(),
      requirement_type: "furniture",
      requirement_key: "furniture:sofa:0",
      requirement_snapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
      item_spec: "fake sofa",
      product_title: "Forged sofa",
      product_url: "https://evil.example/p/sofa",
      product_image_url: "https://evil.example/sofa.jpg",
      price: 9.99,
      currency: "EUR",
      retailer_domain: "evil.example",
      has_reference_image: true,
      is_confirmed: true,
    });
    expect(forged.error).toBeTruthy();

    const claimed = await userB.client.rpc("claim_room_render_slot", {
      p_project_id: seededB.projectId,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toMatchObject({ claimed: true });
  });
});
