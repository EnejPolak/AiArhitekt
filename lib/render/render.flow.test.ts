/**
 * Mocked gpt-image-1.5 room render against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createHash, randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database, Json } from "@/lib/database.types";
import { LOCAL_ANON_JWT, LOCAL_SERVICE_ROLE_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { validRoomAnalysisResult } from "@/lib/analysis/fixtures";
import { acquireProductReferenceAsset } from "@/lib/references/acquire";
import { PROJECT_ASSETS_BUCKET } from "@/lib/references/constants";
import { shoppingPreferenceFingerprint } from "@/lib/discovery/preferenceHash";
import { generateRoomRender, prepareRenderSource } from "./generate";
import { expireLocalRoomRenderCooldown } from "./localCooldownSetup";
import { RenderError } from "./errors";
import { listProjectRoomRenders } from "./queries";
import { removeProjectAssetObjects } from "@/lib/references/storageCleanup";
import type { RoomImageEditFn } from "./openai";
import { PRODUCT_FIDELITY_DISCLAIMER } from "./constants";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing room render tests against hosted Supabase.");
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
    email: `p17b-flow-${label}-${randomUUID()}@example.com`,
    password: "local-rls-test-pass-12",
  });
  if (error || !data.user || !data.session) {
    throw new Error(`Local signup failed: ${error?.message ?? "no session"}`);
  }
  return { client, user: data.user };
}

function jpeg(tag: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
    0x00, 0x01, tag, 0x00, 0xff, 0xd9,
  ]);
}

const ROOM_JPEG = jpeg(0x10);
const PNG_OUT = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

const PREFS = {
  selectedStyles: ["warm-minimal"],
  budgetLevel: "balanced" as const,
  wallMainColor: "warm greige",
  wallAccentColor: "olive green",
  flooring: "keep" as const,
  underfloorHeating: false,
  bedType: "none" as const,
  notes: "",
};

type ProductSeed = {
  requirementType: "furniture" | "material";
  requirementKey: string;
  itemSpec: string;
  productTitle: string;
  snapshot: unknown;
  bytes: Uint8Array;
};

async function seedProject(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Render flow",
      project_type: "room-renovation",
    })
    .select("id")
    .single();
  if (!created.data) throw new Error(created.error?.message ?? "project");
  const projectId = created.data.id;
  const uploadId = randomUUID();
  const path = buildRoomPhotoPath(projectId, uploadId, "image/jpeg");
  const uploaded = await client.storage.from(PROJECT_UPLOADS_BUCKET).upload(path, ROOM_JPEG, {
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
      size_bytes: ROOM_JPEG.byteLength,
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
  return {
    projectId,
    uploadId: meta.data.id,
    path: meta.data.storage_path,
    analysisId: analysis.data.id,
    analysisUpdatedAt: analysis.data.updated_at,
  };
}

async function persistProducts(
  owner: { client: Client; user: User },
  seeded: Awaited<ReturnType<typeof seedProject>>,
  products: ProductSeed[]
) {
  const persist = persistClient();
  const preferenceFingerprint = shoppingPreferenceFingerprint(PREFS);
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
      searched_item_count: products.length,
      not_searched_count: 0,
      allowlist_domains: ["localhome.si"],
      unmatched_requirements: [],
      source_preferences: preferenceFingerprint.snapshot,
      source_preferences_hash: preferenceFingerprint.hash,
    } as unknown as Json,
    p_selections: products.map((item, index) => ({
      requirement_type: item.requirementType,
      requirement_key: item.requirementKey,
      requirement_snapshot: item.snapshot,
      item_spec: item.itemSpec,
      product_title: item.productTitle,
      product_url: `https://www.localhome.si/p/${index + 1}`,
      product_image_url: `https://cdn.localhome.si/${index + 1}.jpg`,
      price: 100 + index,
      currency: "EUR",
      retailer_domain: "localhome.si",
      retailer_name: "Local Home Store",
      has_reference_image: true,
    })) as unknown as Json,
  });
  if (error) throw new Error(error.message);

  const rows = await owner.client
    .from("project_product_selections")
    .select("id, requirement_key")
    .eq("project_id", seeded.projectId)
    .order("created_at", { ascending: true });
  if (!rows.data) throw new Error("missing selections");

  for (const row of rows.data) {
    const product = products.find((item) => item.requirementKey === row.requirement_key);
    if (!product) throw new Error("missing product seed");
    const confirmed = await owner.client
      .from("project_product_selections")
      .update({ is_confirmed: true })
      .eq("id", row.id)
      .select("id")
      .single();
    if (!confirmed.data) throw new Error("confirm failed");
    await acquireProductReferenceAsset({
      persistClient: persist,
      ownerUserId: owner.user.id,
      projectId: seeded.projectId,
      selectionId: row.id,
      sourceImageUrl: `https://cdn.localhome.si/${row.requirement_key}.jpg`,
      lookup: async () => ({ address: "203.0.113.10", family: 4 }),
      fetch: async () =>
        new Response(product.bytes, {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(product.bytes.byteLength),
          },
        }),
    });
  }
  return rows.data;
}

function sofaOnly(): ProductSeed[] {
  return [
    {
      requirementType: "furniture",
      requirementKey: "furniture:sofa:0",
      itemSpec: "sofa",
      productTitle: "Modern beige sofa",
      snapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
      bytes: jpeg(0x21),
    },
  ];
}

describe("product-conditioned room render (local, mocked OpenAI)", () => {
  let userA: { client: Client; user: User };

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
  });

  it("generate calls the image editor once; duplicate generate does not", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, sofaOnly());
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));

    const first = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    expect(first.providerCalls).toBe(1);
    expect(first.reused).toBe(false);
    expect(first.render.status).toBe("succeeded");
    expect(edit).toHaveBeenCalledTimes(1);

    const second = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    expect(second.providerCalls).toBe(0);
    expect(second.reused).toBe(true);
    expect(second.render.id).toBe(first.render.id);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("supplies room bytes first then deterministic private product bytes, not product titles", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const sofaBytes = jpeg(0x31);
    const tableBytes = jpeg(0x32);
    const lampBytes = jpeg(0x33);
    const floorBytes = jpeg(0x34);
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, [
      {
        requirementType: "furniture",
        requirementKey: "furniture:sofa:0",
        itemSpec: "sofa",
        productTitle: "Modern beige sofa",
        snapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
        bytes: sofaBytes,
      },
      {
        requirementType: "furniture",
        requirementKey: "furniture:coffee-table:1",
        itemSpec: "coffee table",
        productTitle: "Oak coffee table",
        snapshot: { category: "coffee table", quantity: 1, placementNotes: null, constraints: [] },
        bytes: tableBytes,
      },
      {
        requirementType: "furniture",
        requirementKey: "furniture:floor-lamp:2",
        itemSpec: "floor lamp",
        productTitle: "Black floor lamp",
        snapshot: { category: "floor lamp", quantity: 1, placementNotes: null, constraints: [] },
        bytes: lampBytes,
      },
      {
        requirementType: "material",
        requirementKey: "material:floor:wood-look-flooring:0",
        itemSpec: "wood-look flooring",
        productTitle: "Matte oak flooring",
        snapshot: validRoomAnalysisResult.designRequirements.materialNeeds[0],
        bytes: floorBytes,
      },
    ]);

    const edit = vi.fn<RoomImageEditFn>(async (input) => {
      expect(input.images).toHaveLength(5);
      expect(Buffer.from(input.images[0].bytes).equals(Buffer.from(ROOM_JPEG))).toBe(true);
      expect(Buffer.from(input.images[1].bytes).equals(Buffer.from(sofaBytes))).toBe(true);
      expect(Buffer.from(input.images[2].bytes).equals(Buffer.from(tableBytes))).toBe(true);
      expect(Buffer.from(input.images[3].bytes).equals(Buffer.from(floorBytes))).toBe(true);
      expect(Buffer.from(input.images[4].bytes).equals(Buffer.from(lampBytes))).toBe(true);
      expect(input.prompt).toContain("Image 1 is the original room");
      expect(input.prompt).toContain("Image 2 is the exact selected furniture reference");
      expect(input.images.every((image) => !image.filename.includes("http"))).toBe(true);
      return { bytes: PNG_OUT, mime: "image/png" };
    });

    await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("returns reference_missing without calling the provider", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    const persist = persistClient();
    const preferenceFingerprint = shoppingPreferenceFingerprint(PREFS);
    const { error } = await persist.rpc("replace_project_product_discovery_result", {
      p_owner_user_id: userA.user.id,
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
        source_preferences: preferenceFingerprint.snapshot,
        source_preferences_hash: preferenceFingerprint.hash,
      } as unknown as Json,
      p_selections: [
        {
          requirement_type: "furniture",
          requirement_key: "furniture:sofa:0",
          requirement_snapshot: validRoomAnalysisResult.designRequirements.furnitureNeeds[0],
          item_spec: "sofa",
          product_title: "Modern beige sofa",
          product_url: "https://www.localhome.si/p/1",
          product_image_url: "https://cdn.localhome.si/1.jpg",
          price: 199,
          currency: "EUR",
          retailer_domain: "localhome.si",
          retailer_name: "Local Home Store",
          has_reference_image: true,
        },
      ] as unknown as Json,
    });
    expect(error).toBeNull();
    const selection = await userA.client
      .from("project_product_selections")
      .select("id")
      .eq("project_id", seeded.projectId)
      .single();
    await userA.client
      .from("project_product_selections")
      .update({ is_confirmed: true })
      .eq("id", selection.data!.id);
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));
    await expect(
      generateRoomRender({
        userClient: userA.client,
        persistClient: persist,
        ownerUserId: userA.user.id,
        projectId: seeded.projectId,
        preferences: PREFS,
        editImage: edit,
      })
    ).rejects.toMatchObject({ code: "reference_missing" });
    expect(edit).not.toHaveBeenCalled();
  });

  it("kill switch returns render_disabled with zero provider calls", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "false");
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, sofaOnly());
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));
    await expect(
      generateRoomRender({
        userClient: userA.client,
        persistClient: persistClient(),
        ownerUserId: userA.user.id,
        projectId: seeded.projectId,
        preferences: PREFS,
        editImage: edit,
      })
    ).rejects.toMatchObject({ code: "render_disabled" });
    expect(edit).not.toHaveBeenCalled();
  });

  it("two concurrent generates result in exactly one provider edit", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, sofaOnly());
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = 0;
    const edit = vi.fn<RoomImageEditFn>(async () => {
      started += 1;
      await gate;
      return { bytes: PNG_OUT, mime: "image/png" };
    });
    const input = {
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    };
    const first = generateRoomRender(input);
    await vi.waitFor(() => expect(started).toBe(1));
    const second = generateRoomRender(input);
    const early = await Promise.race([
      second,
      new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 200)),
    ]);
    if (early !== "pending") {
      expect(early.providerCalls).toBe(0);
    }
    release();
    const results = await Promise.allSettled([first, second]);
    const fulfilled = results.filter(
      (result): result is PromiseFulfilledResult<Awaited<typeof first>> => result.status === "fulfilled"
    );
    const providerCalls = fulfilled.reduce((sum, result) => sum + result.value.providerCalls, 0);
    expect(providerCalls).toBe(1);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("same fingerprint already processing does not start another provider call", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, sofaOnly());
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const blocked: RoomImageEditFn = async (input) => {
      await gate;
      return edit(input);
    };
    const firstPromise = generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: blocked,
    });
    await vi.waitFor(async () => {
      const rows = await listProjectRoomRenders(userA.client, seeded.projectId);
      expect(rows.some((row) => row.status === "processing")).toBe(true);
    });
    const second = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    expect(second.providerCalls).toBe(0);
    expect(second.render.status).toBe("processing");
    release();
    const first = await firstPromise;
    expect(first.providerCalls).toBe(1);
    expect(edit).toHaveBeenCalledTimes(1);
  });

  it("regenerate after cooldown calls the provider again and failed regen keeps the previous success", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, sofaOnly());
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));
    const first = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    expect(first.render.status).toBe("succeeded");
    await expireLocalRoomRenderCooldown(seeded.projectId);

    edit.mockRejectedValueOnce(new RenderError("provider_failed", "boom"));
    await expect(
      generateRoomRender({
        userClient: userA.client,
        persistClient: persistClient(),
        ownerUserId: userA.user.id,
        projectId: seeded.projectId,
        preferences: PREFS,
        force: true,
        editImage: edit,
      })
    ).rejects.toMatchObject({ code: "provider_failed" });

    const rows = await listProjectRoomRenders(userA.client, seeded.projectId);
    expect(rows.some((row) => row.id === first.render.id && row.status === "succeeded")).toBe(true);
    expect(rows.some((row) => row.status === "failed")).toBe(true);

    await expireLocalRoomRenderCooldown(seeded.projectId);
    const regenerated = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      force: true,
      editImage: edit,
    });
    expect(regenerated.providerCalls).toBe(1);
    expect(regenerated.render.id).not.toBe(first.render.id);
    expect(regenerated.render.status).toBe("succeeded");
    expect(edit).toHaveBeenCalledTimes(3);
  });

  it("changing confirmed products makes the previous render stale without auto-generating", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    const products = [
      ...sofaOnly(),
      {
        requirementType: "furniture" as const,
        requirementKey: "furniture:coffee-table:1",
        itemSpec: "coffee table",
        productTitle: "Oak coffee table",
        snapshot: { category: "coffee table", quantity: 1, placementNotes: null, constraints: [] },
        bytes: jpeg(0x41),
      },
    ];
    const rows = await persistProducts(userA, seeded, products);
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));
    const first = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    const table = rows.find((row) => row.requirement_key === "furniture:coffee-table:1");
    await userA.client
      .from("project_product_selections")
      .update({ is_confirmed: false })
      .eq("id", table!.id);

    const source = await prepareRenderSource(userA.client, seeded.projectId, PREFS);
    expect(source.fingerprint).not.toBe(first.render.sourceFingerprint);
    expect(edit).toHaveBeenCalledTimes(1);
    const listed = await listProjectRoomRenders(userA.client, seeded.projectId);
    const historical = listed.find((row) => row.id === first.render.id);
    expect(historical?.status).toBe("succeeded");
    expect(historical?.sourceFingerprint).not.toBe(source.fingerprint);
  });

  it("hard-delete cleanup removes private render objects via Storage API", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, sofaOnly());
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));
    const generated = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    expect(generated.render.outputStoragePath).toBeTruthy();
    await removeProjectAssetObjects(userA.client, seeded.projectId);
    const download = await userA.client.storage
      .from(PROJECT_ASSETS_BUCKET)
      .download(generated.render.outputStoragePath!);
    expect(download.error).toBeTruthy();
  });

  it("persists prompt and reference snapshots without signed URLs or secrets", async () => {
    vi.stubEnv("OPENAI_IMAGE_RENDER_ENABLED", "true");
    const seeded = await seedProject(userA.client, userA.user.id);
    await persistProducts(userA, seeded, sofaOnly());
    const edit = vi.fn<RoomImageEditFn>(async () => ({ bytes: PNG_OUT, mime: "image/png" }));
    const generated = await generateRoomRender({
      userClient: userA.client,
      persistClient: persistClient(),
      ownerUserId: userA.user.id,
      projectId: seeded.projectId,
      preferences: PREFS,
      editImage: edit,
    });
    const snapshot = JSON.stringify(generated.render.promptSnapshot);
    const refs = JSON.stringify(generated.render.referenceSnapshot);
    expect(snapshot).toContain("Image 1 is the original room");
    expect(refs).toContain("furniture:sofa:0");
    expect(snapshot).not.toContain("SUPABASE_SECRET");
    expect(refs).not.toContain("token=");
    expect(PRODUCT_FIDELITY_DISCLAIMER).toContain("selected product references");
    expect(generated.render.outputHash).toBe(createHash("sha256").update(PNG_OUT).digest("hex"));
  });
});
