import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "./supabase/server";
import { canSell, type Profile } from "./types";

/** Oturumdaki kullanıcı ve profili. Oturum yoksa login'e yönlendirir. */
export const requireUser = cache(async () => {
  const supabase = await createClient();
  // Oturum JWT'si yerelde doğrulanır (her sayfada Auth sunucusuna ayrı istek atılmaz).
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims.sub;
  if (!id) redirect("/login");
  const user = { id };
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single<Profile>();
  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    redirect("/login?hata=pasif");
  }
  return { supabase, user, profile };
});

/** Satış kaydı açma/düzenleme ekranları: sevkiyat kullanıcısı ana sayfaya döner. */
export async function requireSeller() {
  const ctx = await requireUser();
  if (!canSell(ctx.profile.role)) redirect("/");
  return ctx;
}

export async function requireAdmin() {
  const ctx = await requireUser();
  if (!ctx.profile.is_admin) redirect("/");
  return ctx;
}
