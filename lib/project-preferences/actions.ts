"use server";

import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/auth/session";
import { getProjectById } from "@/lib/projects/queries";
import { MVP_PROJECT_TYPE } from "@/lib/projects/types";
import { projectIdInputSchema } from "@/lib/projects/schema";
import {
  ProjectPreferencesError,
  projectPreferencesErrorMessage,
} from "./errors";
import { saveProjectRoomPreferencesInputSchema } from "./schema";
import { getProjectRoomPreferences, upsertProjectRoomPreferences } from "./queries";
import type { ProjectRoomPreferences, ProjectRoomPreferencesPatch } from "./types";

export type ProjectPreferencesActionFail = { ok: false; code: string; message: string };

export type LoadProjectRoomPreferencesResult =
  | { ok: true; preferences: ProjectRoomPreferences | null }
  | ProjectPreferencesActionFail;

export type SaveProjectRoomPreferencesResult =
  | { ok: true; preferences: ProjectRoomPreferences }
  | ProjectPreferencesActionFail;

function fail(
  code: ProjectPreferencesError["code"],
  message?: string,
  op: "load" | "mutate" = "mutate"
): ProjectPreferencesActionFail {
  return {
    ok: false,
    code,
    message: message ?? projectPreferencesErrorMessage(code, op),
  };
}

function fromCaught(
  error: unknown,
  op: "load" | "mutate" = "mutate"
): ProjectPreferencesActionFail {
  if (error instanceof ProjectPreferencesError) {
    return fail(error.code, error.message, op);
  }
  return fail("failed", undefined, op);
}

async function requireOwnedRoomProject(projectId: string) {
  const user = await getVerifiedUser();
  if (!user) {
    throw new ProjectPreferencesError(
      "unauthenticated",
      projectPreferencesErrorMessage("unauthenticated")
    );
  }
  const supabase = await createClient();
  const project = await getProjectById(supabase, projectId);
  if (!project) {
    throw new ProjectPreferencesError("not_found", projectPreferencesErrorMessage("not_found"));
  }
  if (project.project_type !== MVP_PROJECT_TYPE) {
    throw new ProjectPreferencesError(
      "invalid_input",
      projectPreferencesErrorMessage("invalid_input")
    );
  }
  return { supabase, project };
}

export async function loadProjectRoomPreferencesAction(input: {
  projectId: string;
}): Promise<LoadProjectRoomPreferencesResult> {
  const parsed = projectIdInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const { supabase } = await requireOwnedRoomProject(parsed.data.projectId);
    const preferences = await getProjectRoomPreferences(supabase, parsed.data.projectId);
    return { ok: true, preferences };
  } catch (error) {
    return fromCaught(error, "load");
  }
}

export async function saveProjectRoomPreferencesAction(input: {
  projectId: string;
  patch: ProjectRoomPreferencesPatch;
}): Promise<SaveProjectRoomPreferencesResult> {
  const parsed = saveProjectRoomPreferencesInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    const { supabase } = await requireOwnedRoomProject(parsed.data.projectId);
    const preferences = await upsertProjectRoomPreferences(
      supabase,
      parsed.data.projectId,
      parsed.data.patch
    );
    return { ok: true, preferences };
  } catch (error) {
    return fromCaught(error);
  }
}
