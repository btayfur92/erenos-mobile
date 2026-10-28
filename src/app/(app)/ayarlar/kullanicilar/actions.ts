"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeUsername, usernameToEmail } from "@/lib/config";
import { USER_ROLES, type UserRole } from "@/lib/types";

export type UserActionResult = { ok: true; message?: string } | { ok: false; error: string };

const MIN_PASSWORD = 6;

export async function createUser(input: {
  username: string;
  full_name: string;
  password: string;
  role: UserRole;
}): Promise<UserActionResult> {
  await requireAdmin();
  if (!USER_ROLES.some((r) => r.value === input.role)) return { ok: false, error: "Kullanıcı tipini seçin." };
  const username = normalizeUsername(input.username);
  if (username.length < 3) return { ok: false, error: "Kullanıcı adı en az 3 karakter olmalı (harf, rakam, nokta)." };
  if (input.password.length < MIN_PASSWORD) return { ok: false, error: `Şifre en az ${MIN_PASSWORD} karakter olmalı.` };

  const admin = createAdminClient();
  const { data: existing } = await admin.from("profiles").select("id").eq("username", username).maybeSingle();
  if (existing) return { ok: false, error: "Bu kullanıcı adı zaten kullanılıyor." };

  const { error } = await admin.auth.admin.createUser({
    email: usernameToEmail(username),
    password: input.password,
    email_confirm: true,
    user_metadata: { username, full_name: input.full_name.trim(), role: input.role },
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/ayarlar/kullanicilar");
  return { ok: true, message: `${username} oluşturuldu.` };
}

export async function resetPassword(userId: string, password: string): Promise<UserActionResult> {
  await requireAdmin();
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Şifre en az ${MIN_PASSWORD} karakter olmalı.` };
  const { error } = await createAdminClient().auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true, message: "Şifre güncellendi." };
}

export async function updateUser(
  userId: string,
  patch: { full_name?: string; username?: string; role?: UserRole; active?: boolean },
): Promise<UserActionResult> {
  const { user } = await requireAdmin();
  if (userId === user.id && ((patch.role !== undefined && patch.role !== "admin") || patch.active === false)) {
    return { ok: false, error: "Kendi admin yetkinizi kaldıramaz veya kendinizi pasife alamazsınız." };
  }
  if (patch.role !== undefined && !USER_ROLES.some((r) => r.value === patch.role)) return { ok: false, error: "Kullanıcı tipini seçin." };
  const admin = createAdminClient();

  if (patch.username !== undefined) {
    patch.username = normalizeUsername(patch.username);
    if (patch.username.length < 3) return { ok: false, error: "Kullanıcı adı en az 3 karakter olmalı (harf, rakam, nokta)." };
    const { data: taken } = await admin.from("profiles").select("id").eq("username", patch.username).neq("id", userId).maybeSingle();
    if (taken) return { ok: false, error: "Bu kullanıcı adı zaten kullanılıyor." };
    // Giriş e-postası kullanıcı adından türetildiği için onu da güncelle.
    const { error: authError } = await admin.auth.admin.updateUserById(userId, {
      email: usernameToEmail(patch.username),
      email_confirm: true,
    });
    if (authError) return { ok: false, error: authError.message };
  }

  const { error } = await admin.from("profiles").update(patch).eq("id", userId);
  if (error) return { ok: false, error: error.message };

  if (patch.active !== undefined) {
    // Pasif kullanıcının oturum açması da engellenir.
    await admin.auth.admin.updateUserById(userId, { ban_duration: patch.active ? "none" : "876000h" });
    if (!patch.active) await admin.from("push_subscriptions").delete().eq("user_id", userId);
  }
  revalidatePath("/ayarlar/kullanicilar");
  return { ok: true, message: "Kaydedildi." };
}
