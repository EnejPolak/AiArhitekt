"use server";

import { redirect } from "next/navigation";
import {
  authErrorMessage,
  mapAuthError,
  type AuthErrorCode,
} from "@/lib/auth/errors";
import { MissingSupabaseConfigError, getAppOrigin } from "@/lib/env/supabase";
import { DEFAULT_POST_AUTH_PATH } from "@/lib/auth/redirect";
import { signInSchema, signUpSchema } from "@/lib/auth/schemas";
import { createClient } from "@/lib/supabase/server";

export type AuthActionResult =
  | { ok: true; needsEmailConfirmation?: boolean }
  | { ok: false; code: AuthErrorCode; message: string };

function fail(code: AuthErrorCode, message?: string): AuthActionResult {
  return { ok: false, code, message: message ?? authErrorMessage(code) };
}

function fromCaught(error: unknown): AuthActionResult {
  if (error instanceof MissingSupabaseConfigError) {
    return fail("config");
  }
  const mapped = mapAuthError(
    error && typeof error === "object"
      ? (error as { message?: string; code?: string; name?: string })
      : { message: "network" }
  );
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
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      const mapped = mapAuthError(error);
      return fail(mapped.code, mapped.message);
    }
    return { ok: true };
  } catch (error) {
    return fromCaught(error);
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
      const mapped = mapAuthError(error);
      return fail(mapped.code, mapped.message);
    }
    if (!data.session) {
      return { ok: true, needsEmailConfirmation: true };
    }
    return { ok: true };
  } catch (error) {
    return fromCaught(error);
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
