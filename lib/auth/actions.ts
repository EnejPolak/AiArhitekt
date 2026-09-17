"use server";

import { redirect } from "next/navigation";
import {
  authErrorMessage,
  mapAuthError,
  type AuthErrorCode,
} from "@/lib/auth/errors";
import { logAuthDiagnostic } from "@/lib/auth/diagnostics";
import { MissingSupabaseConfigError, getAppOrigin } from "@/lib/env/supabase";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/auth/redirect";
import { signInSchema, signUpSchema } from "@/lib/auth/schemas";
import { interpretSignUpData } from "@/lib/auth/signUpResult";
import { createClient } from "@/lib/supabase/server";

export type AuthActionResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; code: AuthErrorCode; message: string };

function fail(code: AuthErrorCode, message?: string): AuthActionResult {
  return { ok: false, code, message: message ?? authErrorMessage(code) };
}

function fromCaught(error: unknown, stage: "auth.sign_up" | "auth.sign_in"): AuthActionResult {
  if (error instanceof MissingSupabaseConfigError) {
    logAuthDiagnostic(stage, { code: "config", name: error.name, message: error.message });
    return fail("config");
  }
  const raw =
    error && typeof error === "object"
      ? (error as { message?: string; code?: string; name?: string; status?: number })
      : { message: "network" };
  logAuthDiagnostic(stage, raw);
  const mapped = mapAuthError(raw);
  return fail(mapped.code, mapped.message);
}

export async function signIn(input: {
  email: string;
  password: string;
}): Promise<AuthActionResult> {
  const parsed = signInSchema.safeParse({
    email: input.email,
    password: input.password,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    if (issue?.path[0] === "email") return fail("invalid_email", issue.message);
    if (issue?.path[0] === "password") {
      return fail("invalid_password", "Enter your password.");
    }
    return fail("generic");
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    logAuthDiagnostic("auth.sign_in", error, {
      userReturned: Boolean(data?.user),
      sessionReturned: Boolean(data?.session),
    });
    if (error) {
      const mapped = mapAuthError(error);
      return fail(mapped.code, mapped.message);
    }
    return { ok: true };
  } catch (error) {
    return fromCaught(error, "auth.sign_in");
  }
}

export async function signUp(input: {
  email: string;
  password: string;
  confirmPassword: string;
  agreeToTerms: boolean;
}): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = String(issue?.path[0] ?? "");
    if (path === "email") return fail("invalid_email", issue?.message);
    if (path === "password" || path === "confirmPassword") {
      return fail("invalid_password", issue?.message);
    }
    return fail("generic", issue?.message);
  }

  try {
    const supabase = await createClient();
    const origin = getAppOrigin();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(DEFAULT_POST_AUTH_PATH)}`,
      },
    });
    if (error) {
      logAuthDiagnostic("auth.sign_up", error);
      const mapped = mapAuthError(error);
      return fail(mapped.code, mapped.message);
    }
    return interpretSignUpData(data);
  } catch (error) {
    return fromCaught(error, "auth.sign_up");
  }
}

export async function signOut(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Still send the user to a public page.
  }
  redirect("/sign-in");
}
