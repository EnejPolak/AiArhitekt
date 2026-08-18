"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getVerifiedUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ProjectError, projectErrorMessage } from "./errors";
import { removeProjectStorageObjects } from "@/lib/uploads/actions";
import { UploadError } from "@/lib/uploads/errors";
import {
  createProjectSchema,
  projectIdInputSchema,
  renameProjectSchema,
  updateWizardSchema,
} from "./schema";
import { DEFAULT_PROJECT_NAMES, DEFAULT_STEP_KEY, MVP_PROJECT_TYPE, PROJECT_FLOW_VERSION } from "./types";
import { getProjectById } from "./queries";

export type ProjectActionResult =
  | { ok: true; projectId?: string }
  | { ok: false; code: string; message: string };

function fail(code: "invalid_input" | "unauthenticated" | "not_found" | "failed", message?: string): ProjectActionResult {
  return {
    ok: false,
    code,
    message: message ?? projectErrorMessage(code),
  };
}

function isNextRedirectError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    String((error as { digest: string }).digest).startsWith("NEXT_REDIRECT")
  );
}

function fromCaught(error: unknown): ProjectActionResult {
  if (error instanceof ProjectError) {
    return fail(error.code, error.message);
  }
  return fail("failed");
}

async function requireUser() {
  const user = await getVerifiedUser();
  if (!user) throw new ProjectError("unauthenticated", projectErrorMessage("unauthenticated"));
  return user;
}

function refreshProjectViews() {
  revalidatePath("/app", "layout");
}

export async function createProject(input: {
  projectType?: string;
  name?: string;
} = {}): Promise<ProjectActionResult> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message);
  }

  try {
    const user = await requireUser();
    const supabase = await createClient();
    const name =
      parsed.data.name ?? DEFAULT_PROJECT_NAMES[MVP_PROJECT_TYPE];

    const { data, error } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name,
        project_type: MVP_PROJECT_TYPE,
        current_step_key: DEFAULT_STEP_KEY,
        flow_version: PROJECT_FLOW_VERSION,
      })
      .select("id")
      .single();

    if (error || !data) {
      return fail("failed");
    }

    refreshProjectViews();
    redirect(`/app/projects/${data.id}`);
  } catch (error) {
    if (isNextRedirectError(error)) {
      throw error;
    }
    return fromCaught(error);
  }
}

export async function renameProject(input: {
  projectId: string;
  name: string;
}): Promise<ProjectActionResult> {
  const parsed = renameProjectSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message);
  }

  try {
    await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update({ name: parsed.data.name })
      .eq("id", parsed.data.projectId)
      .select("id")
      .maybeSingle();

    if (error) return fail("failed");
    if (!data) return fail("not_found");
    refreshProjectViews();
    return { ok: true, projectId: data.id };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function archiveProject(input: {
  projectId: string;
}): Promise<ProjectActionResult> {
  const parsed = projectIdInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", parsed.data.projectId)
      .select("id")
      .maybeSingle();

    if (error) return fail("failed");
    if (!data) return fail("not_found");
    refreshProjectViews();
    return { ok: true, projectId: data.id };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function restoreProject(input: {
  projectId: string;
}): Promise<ProjectActionResult> {
  const parsed = projectIdInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    await requireUser();
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("projects")
      .update({ archived_at: null })
      .eq("id", parsed.data.projectId)
      .select("id")
      .maybeSingle();

    if (error) return fail("failed");
    if (!data) return fail("not_found");
    refreshProjectViews();
    return { ok: true, projectId: data.id };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function deleteProject(input: {
  projectId: string;
}): Promise<ProjectActionResult> {
  const parsed = projectIdInputSchema.safeParse(input);
  if (!parsed.success) return fail("invalid_input");

  try {
    await requireUser();
    const supabase = await createClient();
    try {
      await removeProjectStorageObjects(parsed.data.projectId);
    } catch (error) {
      if (error instanceof UploadError) return fail(error.code === "not_found" ? "not_found" : "failed", error.message);
      if (error instanceof ProjectError) return fail(error.code, error.message);
      return fail("failed");
    }
    const { data, error } = await supabase
      .from("projects")
      .delete()
      .eq("id", parsed.data.projectId)
      .select("id")
      .maybeSingle();

    if (error) return fail("failed");
    if (!data) return fail("not_found");
    refreshProjectViews();
    return { ok: true, projectId: data.id };
  } catch (error) {
    return fromCaught(error);
  }
}

export async function updateWizardStep(input: {
  projectId: string;
  currentStepKey: string;
  projectType: string;
  flowVersion?: number;
}): Promise<ProjectActionResult> {
  const parsed = updateWizardSchema.safeParse(input);
  if (!parsed.success) {
    return fail("invalid_input", parsed.error.issues[0]?.message);
  }

  try {
    await requireUser();
    const supabase = await createClient();
    const existing = await getProjectById(supabase, parsed.data.projectId);
    if (!existing) return fail("not_found");
    if (existing.project_type !== parsed.data.projectType) {
      return fail("invalid_input", "Unknown wizard step.");
    }

    const patch: { current_step_key: string; flow_version?: number } = {
      current_step_key: parsed.data.currentStepKey,
    };
    if (parsed.data.flowVersion != null) {
      patch.flow_version = parsed.data.flowVersion;
    }

    const { data, error } = await supabase
      .from("projects")
      .update(patch)
      .eq("id", parsed.data.projectId)
      .select("id")
      .maybeSingle();

    if (error) return fail("failed");
    if (!data) return fail("not_found");
    // Do not revalidate the workspace layout: that remounts the in-memory wizard.
    return { ok: true, projectId: data.id };
  } catch (error) {
    return fromCaught(error);
  }
}
