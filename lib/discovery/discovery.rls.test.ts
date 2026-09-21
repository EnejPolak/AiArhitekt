import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import type { Database, Json } from "@/lib/database.types";
import { LOCAL_ANON_JWT, LOCAL_SERVICE_ROLE_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing product discovery RLS tests against hosted Supabase.");
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
    email: `p17-rls-${label}-${randomUUID()}@example.com`,
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

async function seedProject(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Discovery RLS",
      project_type: "room-renovation",
    })
    .select("id")
    .single();
  if (!created.data) throw new Error(`Could not create project: ${created.error?.message ?? "unknown"}`);
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
  const analysis = await client
    .from("project_room_analyses")
    .insert({
      project_id: projectId,
      source_upload_id: meta.data.id,
      source_storage_path: meta.data.storage_path,
      schema_version: 2,
      provider: "openai",
      model: "gpt-4o",
      analysis: validRoomAnalysisResult.analysis,
      design_requirements: validRoomAnalysisResult.designRequirements,
    })
    .select("id, updated_at")
    .single();
  if (!analysis.data) throw new Error(analysis.error?.message ?? "analysis failed");
  return { projectId, analysisId: analysis.data.id, analysisUpdatedAt: analysis.data.updated_at };
}

async function persistCanonical(
  ownerUserId: string,
  seeded: { projectId: string; analysisId: string; analysisUpdatedAt: string }
) {
  const persist = persistClient();
  const { data, error } = await persist.rpc("replace_project_product_discovery_result", {
    p_owner_user_id: ownerUserId,
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
  if (error || data == null) {
    throw new Error(`Trusted persist failed: ${error?.message ?? "no id"}`);
  }
  return String(data);
}

describe("project product discovery RLS (local)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let seededA: { projectId: string; analysisId: string; analysisUpdatedAt: string };
  let seededB: { projectId: string; analysisId: string; analysisUpdatedAt: string };
  let discoveryA: string;
  let selectionA: string;

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
  });

  it("anonymous cannot read or write discoveries or selections", async () => {
    const anon = publicClient();
    const dSelect = await anon.from("project_product_discoveries").select("*");
    expect(dSelect.data).toBeFalsy();
    expect(dSelect.error).toBeTruthy();

    const sSelect = await anon.from("project_product_selections").select("*");
    expect(sSelect.data).toBeFalsy();
    expect(sSelect.error).toBeTruthy();

    const dInsert = await anon.from("project_product_discoveries").insert({
      project_id: seededA.projectId,
      source_analysis_id: seededA.analysisId,
      source_analysis_updated_at: seededA.analysisUpdatedAt,
      location_input: "Ljubljana",
      latitude: 46.05,
      longitude: 14.5,
      radius_km: 20,
      searched_item_count: 0,
      not_searched_count: 0,
    });
    expect(dInsert.error).toBeTruthy();

    const claim = await anon.rpc("claim_product_discovery_slot", {
      p_project_id: seededA.projectId,
    });
    expect(claim.error).toBeTruthy();
  });

  it("User A cannot PostgREST-insert fake discovery or selection rows", async () => {
    const created = await userA.client
      .from("project_product_discoveries")
      .insert({
        project_id: seededA.projectId,
        source_analysis_id: seededA.analysisId,
        source_analysis_updated_at: seededA.analysisUpdatedAt,
        location_input: "Ljubljana",
        latitude: 46.05,
        longitude: 14.5,
        radius_km: 20,
        searched_item_count: 1,
        not_searched_count: 0,
        allowlist_domains: ["localhome.si"],
        unmatched_requirements: [],
      })
      .select("id")
      .single();
    expect(created.error).toBeTruthy();
    expect(created.data).toBeFalsy();

    const selection = await userA.client.from("project_product_selections").insert({
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
    expect(selection.error).toBeTruthy();
  });

  it("User A cannot call the trusted persist RPC", async () => {
    const denied = await userA.client.rpc("replace_project_product_discovery_result", {
      p_owner_user_id: userA.user.id,
      p_project_id: seededA.projectId,
      p_discovery: {
        source_analysis_id: seededA.analysisId,
        source_analysis_updated_at: seededA.analysisUpdatedAt,
        location_input: "Ljubljana",
        latitude: 46.05,
        longitude: 14.5,
        radius_km: 20,
        searched_item_count: 0,
        not_searched_count: 0,
        allowlist_domains: [],
        unmatched_requirements: [],
      } as unknown as Json,
      p_selections: [] as unknown as Json,
    });
    expect(denied.error).toBeTruthy();
  });

  it("trusted persist writes canonical rows; User A can confirm but cannot mutate commerce fields", async () => {
    discoveryA = await persistCanonical(userA.user.id, seededA);

    const owned = await userA.client
      .from("project_product_discoveries")
      .select("id, location_input")
      .eq("id", discoveryA)
      .single();
    expect(owned.error).toBeNull();
    expect(owned.data?.location_input).toBe("Ljubljana");

    const locationHack = await userA.client
      .from("project_product_discoveries")
      .update({ location_input: "Celje" } as never)
      .eq("id", discoveryA)
      .select("location_input");
    expect(locationHack.error).toBeTruthy();

    const selection = await userA.client
      .from("project_product_selections")
      .select("id, is_confirmed, price, product_url, product_title")
      .eq("discovery_id", discoveryA)
      .single();
    expect(selection.error).toBeNull();
    selectionA = selection.data!.id;
    expect(selection.data?.is_confirmed).toBe(false);
    expect(Number(selection.data?.price)).toBe(199.99);

    const confirmed = await userA.client
      .from("project_product_selections")
      .update({ is_confirmed: true })
      .eq("id", selectionA)
      .select("is_confirmed, price, product_url")
      .single();
    expect(confirmed.data?.is_confirmed).toBe(true);
    expect(Number(confirmed.data?.price)).toBe(199.99);

    const priceHack = await userA.client
      .from("project_product_selections")
      .update({ price: 9.99 } as never)
      .eq("id", selectionA)
      .select("price");
    expect(priceHack.error).toBeTruthy();

    const urlHack = await userA.client
      .from("project_product_selections")
      .update({ product_url: "https://evil.example/p/sofa" } as never)
      .eq("id", selectionA)
      .select("product_url");
    expect(urlHack.error).toBeTruthy();

    const titleHack = await userA.client
      .from("project_product_selections")
      .update({ product_title: "Cheap sofa" } as never)
      .eq("id", selectionA)
      .select("product_title");
    expect(titleHack.error).toBeTruthy();

    const imageHack = await userA.client
      .from("project_product_selections")
      .update({ product_image_url: "https://evil.example/x.jpg" } as never)
      .eq("id", selectionA)
      .select("product_image_url");
    expect(imageHack.error).toBeTruthy();

    const retailerHack = await userA.client
      .from("project_product_selections")
      .update({ retailer_domain: "evil.example" } as never)
      .eq("id", selectionA)
      .select("retailer_domain");
    expect(retailerHack.error).toBeTruthy();

    const still = await userA.client
      .from("project_product_selections")
      .select("price, product_url, product_title, retailer_domain, is_confirmed")
      .eq("id", selectionA)
      .single();
    expect(Number(still.data?.price)).toBe(199.99);
    expect(still.data?.product_url).toBe("https://www.localhome.si/p/sofa");
    expect(still.data?.product_title).toBe("Modern beige sofa");
    expect(still.data?.retailer_domain).toBe("localhome.si");
    expect(still.data?.is_confirmed).toBe(true);
  });

  it("User B cannot read, insert, confirm, or delete User A records", async () => {
    const readD = await userB.client
      .from("project_product_discoveries")
      .select("id")
      .eq("project_id", seededA.projectId);
    expect(readD.data).toEqual([]);

    const readS = await userB.client
      .from("project_product_selections")
      .select("id, product_url, price")
      .eq("project_id", seededA.projectId);
    expect(readS.data).toEqual([]);

    const insertD = await userB.client.from("project_product_discoveries").insert({
      project_id: seededA.projectId,
      source_analysis_id: seededA.analysisId,
      source_analysis_updated_at: seededA.analysisUpdatedAt,
      location_input: "Celje",
      latitude: 46.2,
      longitude: 15.2,
      radius_km: 10,
      searched_item_count: 0,
      not_searched_count: 0,
    });
    expect(insertD.error).toBeTruthy();

    const insertS = await userB.client.from("project_product_selections").insert({
      project_id: seededA.projectId,
      discovery_id: discoveryA,
      requirement_type: "furniture",
      requirement_key: "furniture:sofa:99",
      requirement_snapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
      item_spec: "fake sofa",
      product_title: "Expensive Sofa",
      product_url: "https://evil.example/p/sofa",
      price: 999,
      currency: "EUR",
      retailer_domain: "evil.example",
      has_reference_image: false,
      is_confirmed: true,
    });
    expect(insertS.error).toBeTruthy();

    const confirm = await userB.client
      .from("project_product_selections")
      .update({ is_confirmed: false })
      .eq("id", selectionA)
      .select("id");
    expect(confirm.data).toEqual([]);

    const del = await userB.client
      .from("project_product_selections")
      .delete()
      .eq("id", selectionA)
      .select("id");
    expect(del.data == null || del.data.length === 0).toBe(true);

    const stillA = await userA.client
      .from("project_product_selections")
      .select("id, is_confirmed")
      .eq("id", selectionA)
      .single();
    expect(stillA.data?.is_confirmed).toBe(true);

    const claim = await userB.client.rpc("claim_product_discovery_slot", {
      p_project_id: seededA.projectId,
    });
    expect(claim.error).toBeTruthy();

    const persistAsB = await persistClient().rpc("replace_project_product_discovery_result", {
      p_owner_user_id: userB.user.id,
      p_project_id: seededA.projectId,
      p_discovery: {
        source_analysis_id: seededA.analysisId,
        source_analysis_updated_at: seededA.analysisUpdatedAt,
        location_input: "Celje",
        latitude: 46.2,
        longitude: 15.2,
        radius_km: 10,
        searched_item_count: 0,
        not_searched_count: 0,
        allowlist_domains: [],
        unmatched_requirements: [],
      } as unknown as Json,
      p_selections: [] as unknown as Json,
    });
    expect(persistAsB.error).toBeTruthy();
  });

  it("User B can claim on their own project but cannot insert product rows", async () => {
    const claimed = await userB.client.rpc("claim_product_discovery_slot", {
      p_project_id: seededB.projectId,
    });
    expect(claimed.error).toBeNull();
    expect(claimed.data).toMatchObject({ claimed: true });

    const created = await userB.client
      .from("project_product_discoveries")
      .insert({
        project_id: seededB.projectId,
        source_analysis_id: seededB.analysisId,
        source_analysis_updated_at: seededB.analysisUpdatedAt,
        location_input: "Maribor",
        latitude: 46.55,
        longitude: 15.65,
        radius_km: 15,
        searched_item_count: 0,
        not_searched_count: 0,
      })
      .select("id")
      .single();
    expect(created.error).toBeTruthy();

    const persisted = await persistCanonical(userB.user.id, seededB);
    const owned = await userB.client
      .from("project_product_discoveries")
      .select("id")
      .eq("id", persisted)
      .single();
    expect(owned.data?.id).toBe(persisted);
  });

  it("deleting the analysis cascades the discovery and selections", async () => {
    const del = await userA.client
      .from("project_room_analyses")
      .delete()
      .eq("id", seededA.analysisId);
    expect(del.error).toBeNull();

    const leftoverD = await userA.client
      .from("project_product_discoveries")
      .select("id")
      .eq("project_id", seededA.projectId);
    expect(leftoverD.data).toEqual([]);

    const leftoverS = await userA.client
      .from("project_product_selections")
      .select("id")
      .eq("project_id", seededA.projectId);
    expect(leftoverS.data).toEqual([]);
  });
});
