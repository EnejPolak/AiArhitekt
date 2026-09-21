/**
 * Source-photo linkage + mocked provider persistence against local Supabase only.
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { loadReusableRoomAnalysis, runRoomAnalysis } from "./analyze";
import { AnalysisError } from "./errors";
import { validRoomAnalysisResult } from "./fixtures";
import { expireLocalRoomAnalysisCooldown } from "./localCooldownSetup";
import { deleteProjectRoomAnalysis, getProjectRoomAnalysis } from "./queries";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing analysis source tests against hosted Supabase.");
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
    email: `p15-src-${label}-${randomUUID()}@example.com`,
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

async function seedProjectWithPhoto(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Source photo",
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
  if (uploaded.error) throw uploaded.error;
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
  if (!meta.data) throw new Error(meta.error?.message ?? "metadata failed");
  return { projectId, uploadId: meta.data.id, path: meta.data.storage_path };
}

describe("room analysis source + mocked provider (local)", () => {
  let userA: { client: Client; user: User };
  let userB: { client: Client; user: User };
  let seeded: { projectId: string; uploadId: string; path: string };

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    userB = await signUp("b");
    seeded = await seedProjectWithPhoto(userA.client, userA.user.id);
  });

  it("rejects an invalid project UUID without a provider call", async () => {
    const analyzeImage = vi.fn();
    await expect(
      runRoomAnalysis(userA.client, "not-a-uuid", { analyzeImage })
    ).rejects.toMatchObject({ code: "missing_photo" });
    expect(analyzeImage).not.toHaveBeenCalled();
  });

  it("persists a valid mocked analysis tied to the current photo", async () => {
    const analyzeImage = vi.fn(async () => ({
      result: validRoomAnalysisResult,
      meta: { provider: "openai" as const, model: "gpt-4o" as const },
    }));

    const first = await runRoomAnalysis(userA.client, seeded.projectId, { analyzeImage });
    expect(first.reused).toBe(false);
    expect(first.analysis.source_upload_id).toBe(seeded.uploadId);
    expect(first.analysis.source_storage_path).toBe(seeded.path);
    expect(first.analysis.schema_version).toBe(2);
    expect(first.analysis.provider).toBe("openai");
    expect(first.analysis.model).toBe("gpt-4o");
    expect(analyzeImage).toHaveBeenCalledTimes(1);

    const second = await runRoomAnalysis(userA.client, seeded.projectId, { analyzeImage });
    expect(second.reused).toBe(true);
    expect(second.analysis.id).toBe(first.analysis.id);
    expect(analyzeImage).toHaveBeenCalledTimes(1);

    const loaded = await loadReusableRoomAnalysis(userA.client, seeded.projectId);
    expect(loaded?.id).toBe(first.analysis.id);
    expect(analyzeImage).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous valid analysis when explicit re-analysis fails", async () => {
    const before = await getProjectRoomAnalysis(userA.client, seeded.projectId);
    expect(before).toBeTruthy();

    const analyzeImage = vi.fn(async () => {
      throw new AnalysisError("provider_failed", "Could not analyze the room. Try again.");
    });

    await expireLocalRoomAnalysisCooldown(seeded.projectId);

    await expect(
      runRoomAnalysis(userA.client, seeded.projectId, { force: true, analyzeImage })
    ).rejects.toMatchObject({ code: "provider_failed" });

    const after = await getProjectRoomAnalysis(userA.client, seeded.projectId);
    expect(after?.id).toBe(before?.id);
    expect(after?.analysis.roomType).toBe("living-room");
  });

  it("can re-analyze the same photo after a successful provider call", async () => {
    const analyzeImage = vi.fn(async () => ({
      result: {
        ...validRoomAnalysisResult,
        analysis: {
          ...validRoomAnalysisResult.analysis,
          roomType: "bedroom" as const,
        },
      },
      meta: { provider: "openai" as const, model: "gpt-4o" as const },
    }));

    await expireLocalRoomAnalysisCooldown(seeded.projectId);

    const result = await runRoomAnalysis(userA.client, seeded.projectId, {
      force: true,
      analyzeImage,
    });
    expect(result.reused).toBe(false);
    expect(result.analysis.analysis.roomType).toBe("bedroom");
    expect(analyzeImage).toHaveBeenCalledTimes(1);
  });

  it("does not treat another user's upload as a valid source", async () => {
    const other = await seedProjectWithPhoto(userB.client, userB.user.id);
    const insert = await userA.client.from("project_room_analyses").insert({
      project_id: seeded.projectId,
      source_upload_id: other.uploadId,
      source_storage_path: other.path,
      schema_version: 1,
      provider: "openai",
      model: "gpt-4o",
      analysis: validRoomAnalysisResult.analysis,
      design_requirements: validRoomAnalysisResult.designRequirements,
    });
    expect(insert.error).toBeTruthy();
  });

  it("invalidates analysis when the current photo path is replaced", async () => {
    const replacementId = randomUUID();
    const replacementPath = buildRoomPhotoPath(seeded.projectId, replacementId, "image/jpeg");
    const uploaded = await userA.client.storage
      .from(PROJECT_UPLOADS_BUCKET)
      .upload(replacementPath, JPEG, { contentType: "image/jpeg" });
    expect(uploaded.error).toBeNull();

    const updated = await userA.client
      .from("project_uploads")
      .update({ storage_path: replacementPath })
      .eq("project_id", seeded.projectId)
      .select("id, storage_path")
      .single();
    expect(updated.data?.storage_path).toBe(replacementPath);

    const loaded = await loadReusableRoomAnalysis(userA.client, seeded.projectId);
    expect(loaded).toBeNull();

    const leftover = await getProjectRoomAnalysis(userA.client, seeded.projectId);
    expect(leftover).toBeNull();

    seeded = {
      projectId: seeded.projectId,
      uploadId: updated.data!.id,
      path: replacementPath,
    };
  });

  it("invalidates analysis when the room photo is removed", async () => {
    await expireLocalRoomAnalysisCooldown(seeded.projectId);
    const analyzeImage = vi.fn(async () => ({
      result: validRoomAnalysisResult,
      meta: { provider: "openai" as const, model: "gpt-4o" as const },
    }));
    await runRoomAnalysis(userA.client, seeded.projectId, { analyzeImage });

    await deleteProjectRoomAnalysis(userA.client, seeded.projectId);
    await userA.client.from("project_uploads").delete().eq("project_id", seeded.projectId);

    const loaded = await loadReusableRoomAnalysis(userA.client, seeded.projectId);
    expect(loaded).toBeNull();
  });
});
