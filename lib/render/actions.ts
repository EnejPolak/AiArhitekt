"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { getProjectById } from "@/lib/projects/queries";
import { MVP_PROJECT_TYPE } from "@/lib/projects/types";
import { projectIdInputSchema } from "@/lib/projects/schema";
import { createPersistClient } from "@/lib/supabase/persist";
import { PROJECT_ASSETS_BUCKET, RENDER_SIGNED_PREVIEW_TTL_SECONDS } from "./constants";
import { RenderError, renderErrorMessage } from "./errors";
import { generateRoomRender, prepareRenderSource } from "./generate";
import { getProjectRoomPreferences } from "@/lib/project-preferences/queries";
import { projectRoomPreferencesToRenderPreferences } from "@/lib/project-preferences/adapter";
import { EMPTY_PROJECT_ROOM_PREFERENCES } from "@/lib/project-preferences/types";
import { listProjectRoomRenders, markCurrent } from "./queries";
import { parseRoomRenderPath } from "./path";
import type { MissingRenderReference, RoomRenderView } from "./types";

export type RenderActionFail = {
  ok: false;
  code: string;
  message: string;
  retryAfterSeconds?: number;
  missingReferences?: MissingRenderReference[];
};

export type GenerateRenderActionOk = {
  ok: true;
  render: RoomRenderView;
  reused: boolean;
  previewUrl: string | null;
};

export type LoadRenderActionOk = {
  ok: true;
  fingerprint: string | null;
  currentRender: RoomRenderView | null;
  latestSucceeded: RoomRenderView | null;
  processing: RoomRenderView | null;
  stale: boolean;
  previewUrl: string | null;
  renders: RoomRenderView[];
  missingReferences: MissingRenderReference[];
  readinessCode: string | null;
  readinessMessage: string | null;
};

export type RenderActionResult = GenerateRenderActionOk | RenderActionFail;
export type LoadRenderActionResult = LoadRenderActionOk | RenderActionFail;

const generateInputSchema = z.object({
  projectId: projectIdInputSchema.shape.projectId,
  force: z.boolean().optional(),
});

function fail(error: RenderError): RenderActionFail {
  return {
    ok: false,
    code: error.code,
    message: error.message,
    retryAfterSeconds: error.retryAfterSeconds,
    missingReferences: error.missingReferences.length > 0 ? error.missingReferences : undefined,
  };
}

function fromCaught(error: unknown): RenderActionFail {
  if (error instanceof RenderError) return fail(error);
  return fail(new RenderError("failed", renderErrorMessage("failed")));
}

async function requireOwnedRoomProject(projectId: string) {
  const user = await getVerifiedUser();
  if (!user) throw new RenderError("unauthenticated", renderErrorMessage("unauthenticated"));
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project) throw new RenderError("not_found", renderErrorMessage("not_found"));
  if (project.project_type !== MVP_PROJECT_TYPE) {
    throw new RenderError("invalid_input", renderErrorMessage("invalid_input"));
  }
  if (project.user_id !== user.id) {
    throw new RenderError("not_found", renderErrorMessage("not_found"));
  }
  return { user, supabase, project };
}

async function signedPreview(
  supabase: Awaited<ReturnType<typeof createClient>>,
  render: RoomRenderView | null
): Promise<string | null> {
  if (!render || render.status !== "succeeded" || !render.outputStoragePath) return null;
  const parsed = parseRoomRenderPath(render.outputStoragePath);
  if (!parsed || parsed.projectId !== render.projectId || parsed.renderId !== render.id) {
    return null;
  }
  const { data } = await supabase.storage
    .from(PROJECT_ASSETS_BUCKET)
    .createSignedUrl(render.outputStoragePath, RENDER_SIGNED_PREVIEW_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

const READINESS_CODES = new Set([
  "missing_photo",
  "missing_analysis",
  "missing_discovery",
  "stale_source",
  "no_confirmed_products",
  "reference_grounding_unavailable",
  "too_many_references",
]);

export async function loadRoomRenderState(input: {
  projectId: string;
}): Promise<LoadRenderActionResult> {
  const parsed = generateInputSchema.safeParse({
    projectId: input.projectId,
  });
  if (!parsed.success) {
    return fail(new RenderError("invalid_input", renderErrorMessage("invalid_input")));
  }

  try {
    const { supabase } = await requireOwnedRoomProject(parsed.data.projectId);
    const stored = await getProjectRoomPreferences(supabase, parsed.data.projectId);
    const preferences = projectRoomPreferencesToRenderPreferences(
      stored ?? EMPTY_PROJECT_ROOM_PREFERENCES
    );
    const renders = await listProjectRoomRenders(supabase, parsed.data.projectId);
    const latestSucceeded = renders.find((row) => row.status === "succeeded") ?? null;
    const processing = renders.find((row) => row.status === "processing") ?? null;

    try {
      const source = await prepareRenderSource(supabase, parsed.data.projectId, preferences);
      const marked = markCurrent(renders, source.fingerprint);
      const current = marked.find((row) => row.isCurrent) ?? null;
      return {
        ok: true,
        fingerprint: source.fingerprint,
        currentRender: current,
        latestSucceeded: marked.find((row) => row.status === "succeeded") ?? null,
        processing: marked.find((row) => row.status === "processing") ?? null,
        stale: Boolean(latestSucceeded && !current),
        previewUrl: await signedPreview(supabase, current),
        renders: marked,
        missingReferences: source.missing,
        readinessCode: null,
        readinessMessage: null,
      };
    } catch (error) {
      if (error instanceof RenderError && READINESS_CODES.has(error.code)) {
        return {
          ok: true,
          fingerprint: null,
          currentRender: null,
          latestSucceeded,
          processing,
          stale: Boolean(latestSucceeded),
          previewUrl: await signedPreview(supabase, latestSucceeded),
          renders,
          missingReferences: error.missingReferences,
          readinessCode: error.code,
          readinessMessage: error.message,
        };
      }
      throw error;
    }
  } catch (error) {
    return fromCaught(error);
  }
}

export async function generateRoomRenderAction(input: {
  projectId: string;
  force?: boolean;
}): Promise<RenderActionResult> {
  const parsed = generateInputSchema.safeParse(input);
  if (!parsed.success) {
    return fail(new RenderError("invalid_input", renderErrorMessage("invalid_input")));
  }

  try {
    const { user, supabase, project } = await requireOwnedRoomProject(parsed.data.projectId);
    const persistClient = createPersistClient();
    const stored = await getProjectRoomPreferences(supabase, parsed.data.projectId);
    const preferences = projectRoomPreferencesToRenderPreferences(
      stored ?? EMPTY_PROJECT_ROOM_PREFERENCES
    );
    const result = await generateRoomRender({
      userClient: supabase,
      persistClient,
      ownerUserId: user.id,
      projectId: project.id,
      preferences,
      force: Boolean(parsed.data.force),
    });
    return {
      ok: true,
      render: { ...result.render, isCurrent: true },
      reused: result.reused,
      previewUrl: await signedPreview(supabase, result.render),
    };
  } catch (error) {
    return fromCaught(error);
  }
}
