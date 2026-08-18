"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { getProjectById } from "@/lib/projects/queries";
import { MVP_PROJECT_TYPE } from "@/lib/projects/types";
import { projectIdInputSchema } from "@/lib/projects/schema";
import { z } from "zod";
import { loadReusableRoomAnalysis, runRoomAnalysis } from "./analyze";
import { AnalysisError, analysisErrorMessage } from "./errors";
import type { ProjectRoomAnalysisRow } from "./queries";
import type { RoomAnalysisView } from "./types";

const analyzeRoomInputSchema = z.object({
  projectId: projectIdInputSchema.shape.projectId,
  reanalyze: z.boolean().optional(),
});

export type AnalyzeRoomActionResult =
  | { ok: true; analysis: RoomAnalysisView; reused: boolean }
  | { ok: false; code: string; message: string };

export type LoadRoomAnalysisActionResult =
  | { ok: true; analysis: RoomAnalysisView | null }
  | { ok: false; code: string; message: string };

function toView(row: ProjectRoomAnalysisRow): RoomAnalysisView {
  return {
    id: row.id,
    schemaVersion: row.schema_version,
    provider: row.provider,
    model: row.model,
    sourceUploadId: row.source_upload_id,
    sourceStoragePath: row.source_storage_path,
    analysis: row.analysis,
    designRequirements: row.design_requirements,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fail(
  code: AnalysisError["code"],
  message?: string
): { ok: false; code: string; message: string } {
  return { ok: false, code, message: message ?? analysisErrorMessage(code) };
}

function fromCaught(error: unknown): { ok: false; code: string; message: string } {
  if (error instanceof AnalysisError) {
    return fail(error.code, error.message);
  }
  return fail("failed");
}

async function requireOwnedRoomProject(projectId: string) {
  const user = await getVerifiedUser();
  if (!user) throw new AnalysisError("unauthenticated", analysisErrorMessage("unauthenticated"));
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project) throw new AnalysisError("not_found", analysisErrorMessage("not_found"));
  if (project.project_type !== MVP_PROJECT_TYPE) {
    throw new AnalysisError("invalid_input", analysisErrorMessage("invalid_input"));
  }
  return { supabase, project };
}

export async function loadRoomAnalysis(input: {
  projectId: string;
}): Promise<LoadRoomAnalysisActionResult> {
  const parsed = projectIdInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const { supabase } = await requireOwnedRoomProject(parsed.data.projectId);
    const row = await loadReusableRoomAnalysis(supabase, parsed.data.projectId);
    return { ok: true, analysis: row ? toView(row) : null };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function analyzeRoom(input: {
  projectId: string;
  reanalyze?: boolean;
}): Promise<AnalyzeRoomActionResult> {
  const parsed = analyzeRoomInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const { supabase } = await requireOwnedRoomProject(parsed.data.projectId);
    const { analysis, reused } = await runRoomAnalysis(supabase, parsed.data.projectId, {
      force: Boolean(parsed.data.reanalyze),
    });
    return { ok: true, analysis: toView(analysis), reused };
  } catch (error) {
    return fromCaught(error);
  }
}
