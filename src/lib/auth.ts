import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import type { Profile } from "./types";

/** Oturumdaki kullanıcı ve profili. Oturum yoksa login'e yönlendirir. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login?hata=pasif");
  }
  return { supabase, user, profile };
});

export async function requireAdmin() {
  const ctx = await requireUser();
  if (!ctx.profile.is_admin) redirect("/");
  return ctx;
}
