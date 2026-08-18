import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function getVerifiedUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

export async function requireAppUser() {
  const user = await getVerifiedUser();
  if (!user) {
    redirect("/sign-in?next=/app");
  }
  return user;
}
