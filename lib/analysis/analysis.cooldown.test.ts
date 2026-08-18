/**
 * Durable per-project cooldown + mocked OpenAI call counts (local Supabase only).
 */
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Database } from "@/lib/database.types";
import { LOCAL_ANON_JWT, localSupabaseApiUrl } from "@/lib/supabase/localUrl";
import { PROJECT_UPLOADS_BUCKET } from "@/lib/uploads/constants";
import { buildRoomPhotoPath } from "@/lib/uploads/path";
import { runRoomAnalysis } from "./analyze";
import { validRoomAnalysisResult } from "./fixtures";
import { expireLocalRoomAnalysisCooldown } from "./localCooldownSetup";

const LOCAL_URL = localSupabaseApiUrl();

type Client = SupabaseClient<Database>;

function assertLocalOnly(url: string) {
  if (url.toLowerCase().includes("supabase.co") || !url.startsWith("http://127.0.0.1:")) {
    throw new Error("Refusing cooldown tests against hosted Supabase.");
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
    email: `p151-${label}-${randomUUID()}@example.com`,
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

function mockAnalyze() {
  return vi.fn(async () => ({
    result: validRoomAnalysisResult,
    meta: { provider: "openai" as const, model: "gpt-4o" as const },
  }));
}

async function seedProjectWithPhoto(client: Client, userId: string) {
  const created = await client
    .from("projects")
    .insert({
      user_id: userId,
      name: "Cooldown",
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
    .select("id")
    .single();
  if (!meta.data) throw new Error(meta.error?.message ?? "metadata failed");
  return projectId;
}

describe("room analysis cooldown + provider call counts (local)", () => {
  let userA: { client: Client; user: User };
  let projectA: string;
  let projectB: string;
  let concurrentProject: string;

  beforeAll(async () => {
    assertLocalOnly(LOCAL_URL);
    const health = await fetch(`${LOCAL_URL}/auth/v1/health`);
    if (!health.ok) {
      throw new Error("Local Supabase is not reachable. Run npm run db:start.");
    }
    userA = await signUp("a");
    projectA = await seedProjectWithPhoto(userA.client, userA.user.id);
    projectB = await seedProjectWithPhoto(userA.client, userA.user.id);
    concurrentProject = await seedProjectWithPhoto(userA.client, userA.user.id);
  });

  it("first analysis makes one provider call; reuse makes zero; immediate re-analyze is rejected", async () => {
    const analyzeImage = mockAnalyze();

    const first = await runRoomAnalysis(userA.client, projectA, { analyzeImage });
    expect(first.reused).toBe(false);
    expect(analyzeImage).toHaveBeenCalledTimes(1);

    const second = await runRoomAnalysis(userA.client, projectA, { analyzeImage });
    expect(second.reused).toBe(true);
    expect(analyzeImage).toHaveBeenCalledTimes(1);

    await expect(
      runRoomAnalysis(userA.client, projectA, { force: true, analyzeImage })
    ).rejects.toMatchObject({ code: "rate_limited" });
    expect(analyzeImage).toHaveBeenCalledTimes(1);
  });

  it("re-analyze after cooldown makes one additional provider call", async () => {
    const analyzeImage = mockAnalyze();
    await expireLocalRoomAnalysisCooldown(projectA);
    const result = await runRoomAnalysis(userA.client, projectA, { force: true, analyzeImage });
    expect(result.reused).toBe(false);
    expect(analyzeImage).toHaveBeenCalledTimes(1);
  });

  it("cooldown is per project, not global", async () => {
    const analyzeImage = mockAnalyze();
    const result = await runRoomAnalysis(userA.client, projectB, { analyzeImage });
    expect(result.reused).toBe(false);
    expect(analyzeImage).toHaveBeenCalledTimes(1);
  });

  it("two concurrent forced calls grant exactly one provider start", async () => {
    const analyzeImage = mockAnalyze();
    const results = await Promise.allSettled([
      runRoomAnalysis(userA.client, concurrentProject, { force: true, analyzeImage }),
      runRoomAnalysis(userA.client, concurrentProject, { force: true, analyzeImage }),
    ]);

    const fulfilled = results.filter((item) => item.status === "fulfilled");
    const rejected = results.filter((item) => item.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]).toMatchObject({
      status: "rejected",
      reason: expect.objectContaining({ code: "rate_limited" }),
    });
    expect(analyzeImage).toHaveBeenCalledTimes(1);
  });
});
