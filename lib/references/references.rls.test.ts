/**
 * Product reference asset RLS + validated acquire against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/lib/database.types";
import { LOCAL_ANON_JWT, LOCAL_SERVICE_ROLE_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { acquireProductReferenceAsset } from "./acquire";
import { PROJECT_ASSETS_BUCKET } from "./constants";
import { createSolidPng } from "./imageFixtures";
import { buildProductReferencePath } from "./path";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing product reference RLS tests against hosted Supabase.");
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
    email: `p17-ref-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

const JPEG_BYTES = createSolidPng(128, 128);
const JPEG = new Blob([JPEG_BYTES], { type: "image/png" });

async function seedProject(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Reference RLS",
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
    .select("id, storage_path")
    .single();
  if (!meta.data) throw new Error(meta.error?.message ?? "upload");
  const analysis = await client
    .from("project_room_analyses")
    .insert({
      project_id: projectId,
      source_upload_id: meta.data.id,
      source_storage_path: meta.data.storage_path,
      schema_version: 1,
      provider: "openai",
      model: "gpt-4o",
      analysis: validRoomAnalysisResult.analysis,
      design_requirements: validRoomAnalysisResult.designRequirements,
    })
    .select("id, updated_at")
    .single();
  if (!analysis.data) throw new Error(analysis.error?.message ?? "analysis");
  return { projectId, analysisId: analysis.data.id, analysisUpdatedAt: analysis.data.updated_at };
}

async function persistAndConfirm(owner: { client: Client; user: User }, seeded: Awaited<ReturnType<typeof seedProject>>) {
  const persist = persistClient();
  const { error } = await persist.rpc("replace_project_product_discovery_result", {
    p_owner_user_id: owner.user.id,
    p_project_id: seeded.projectId,
    p_discovery: {
      source_analysis_id: seeded.analysisId,
      source_analysis_updated_at: seeded.analysisUpdatedAt,
      location_input: "Ljubljana",
      latitude: 46.05,
      longitude: 14.5,
      radius_km: 20,
      searched_item_count: 1,
      not_searched_count: 0,
      allowlist_domains: ["localhome.si"],
      unmatched_requirements: [],
    } as unknown as Json,
    p_selections: [
      {
        requirement_type: "furniture",
        requirement_key: "furniture:sofa:0",
        requirement_snapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
        item_spec: "modern beige sofa",
        product_title: "Modern beige sofa",
        product_url: "https://www.localhome.si/p/sofa",
        product_image_url: "https://cdn.localhome.si/sofa.jpg",
        price: 199.99,
        currency: "EUR",
        retailer_domain: "localhome.si",
        retailer_name: "Local Home Store",
        has_reference_image: true,
      },
    ] as unknown as Json,
  });
  if (error) throw new Error(error.message);
  const selection = await owner.client
    .from("project_product_selections")
    .select("id")
    .eq("project_id", seeded.projectId)
    .single();
  if (!selection.data) throw new Error("missing selection");
  const confirmed = await owner.client
    .from("project_product_selections")
    .update({ is_confirmed: true })
    .eq("id", selection.data.id)
    .select("id")
    .single();
  if (!confirmed.data) throw new Error("confirm failed");
  return confirmed.data.id;
}

describe("product reference assets RLS (local)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let seededA: Awaited<ReturnType<typeof seedProject>>;
  let seededB: Awaited<ReturnType<typeof seedProject>>;
  let selectionA: string;
  let storagePathA: string;

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
    selectionA = await persistAndConfirm(userA, seededA);
  });

  it("anonymous and User A cannot insert reference metadata or upload to project-assets", async () => {
    const anon = publicClient();
    const path = buildProductReferencePath(seededA.projectId, selectionA, "image/png");
    const anonUpload = await anon.storage.from(PROJECT_ASSETS_BUCKET).upload(path, JPEG, {
      contentType: "image/jpeg",
    });
    expect(anonUpload.error).toBeTruthy();

    const userUpload = await userA.client.storage.from(PROJECT_ASSETS_BUCKET).upload(path, JPEG, {
      contentType: "image/jpeg",
    });
    expect(userUpload.error).toBeTruthy();

    const insert = await userA.client.from("project_product_reference_assets").insert({
      project_id: seededA.projectId,
      selection_id: selectionA,
      source_image_url: "https://cdn.localhome.si/sofa.jpg",
      storage_path: path,
      mime_type: "image/jpeg",
      size_bytes: JPEG_BYTES.byteLength,
      source_hash: createHash("sha256").update(JPEG_BYTES).digest("hex"),
    });
    expect(insert.error).toBeTruthy();

    const rpc = await userA.client.rpc("upsert_project_product_reference_asset", {
      p_owner_user_id: userA.user.id,
      p_project_id: seededA.projectId,
      p_selection_id: selectionA,
      p_source_image_url: "https://cdn.localhome.si/sofa.jpg",
      p_storage_path: path,
      p_mime_type: "image/jpeg",
      p_size_bytes: JPEG_BYTES.byteLength,
      p_source_hash: createHash("sha256").update(JPEG_BYTES).digest("hex"),
      p_width: null,
      p_height: null,
    });
    expect(rpc.error).toBeTruthy();
  });

  it("trusted acquire stores a private copy after mocked PNG fetch and reuses it", async () => {
    let fetches = 0;
    const fetch = async () => {
      fetches += 1;
      return new Response(JPEG_BYTES, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(JPEG_BYTES.byteLength) },
      });
    };
    const asset = await acquireProductReferenceAsset({
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seededA.projectId,
      selectionId: selectionA,
      sourceImageUrl: "https://cdn.localhome.si/sofa.jpg",
      sourcePageUrl: "https://www.localhome.si/p/sofa",
      lookup: async () => ({ address: "203.0.113.10", family: 4 }),
      fetch,
    });
    storagePathA = asset.storagePath;
    expect(asset.sourceHash).toBe(createHash("sha256").update(JPEG_BYTES).digest("hex"));
    expect(asset.mimeType).toBe("image/png");
    expect(asset.sourcePageUrl).toBe("https://www.localhome.si/p/sofa");
    expect(asset.storagePath).toBe(
      buildProductReferencePath(seededA.projectId, selectionA, "image/png")
    );

    const reused = await acquireProductReferenceAsset({
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seededA.projectId,
      selectionId: selectionA,
      sourceImageUrl: "https://cdn.localhome.si/sofa-other.jpg",
      lookup: async () => ({ address: "203.0.113.10", family: 4 }),
      fetch,
    });
    expect(reused.id).toBe(asset.id);
    expect(reused.sourceHash).toBe(asset.sourceHash);
    expect(fetches).toBe(1);

    const read = await userA.client
      .from("project_product_reference_assets")
      .select("id, source_hash")
      .eq("selection_id", selectionA)
      .single();
    expect(read.data?.source_hash).toBe(asset.sourceHash);

    const download = await userA.client.storage.from(PROJECT_ASSETS_BUCKET).download(storagePathA);
    expect(download.error).toBeNull();
    expect(download.data).toBeTruthy();
  });

  it("User B cannot read User A reference metadata or storage objects", async () => {
    const meta = await userB.client
      .from("project_product_reference_assets")
      .select("id")
      .eq("selection_id", selectionA);
    expect(meta.data).toEqual([]);

    const download = await userB.client.storage.from(PROJECT_ASSETS_BUCKET).download(storagePathA);
    expect(download.error).toBeTruthy();

    const otherSelection = await persistAndConfirm(userB, seededB);
    const otherPath = buildProductReferencePath(seededB.projectId, otherSelection, "image/jpeg");
    const cross = await persistClient().storage.from(PROJECT_ASSETS_BUCKET).upload(otherPath, JPEG, {
      contentType: "image/jpeg",
      upsert: true,
    });
    expect(cross.error).toBeNull();
    const stolen = await userA.client.storage.from(PROJECT_ASSETS_BUCKET).download(otherPath);
    expect(stolen.error).toBeTruthy();
  });
});
