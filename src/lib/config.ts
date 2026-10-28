/** Alt yol (ör. "/mobiluygulama"); kökte (varsayılan) "". next.config.ts normalize edip aynı değişkene yazar. */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");
/** Manifest ve service worker kapsamı: kökte "/" olmalı (boş değer kurulumu bozar). */
export const APP_SCOPE = BASE_PATH || "/";
export const TIME_ZONE = "Europe/Istanbul";

/** Dosya yollarını basePath ile birleştirir (sw.js, ikonlar gibi Next dışı istekler için). */
export function withBase(path: string) {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}

const TR_MAP: Record<string, string> = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };

/** Kullanıcı adını normalize eder: küçük harf, Türkçe karakterler sadeleşir. */
export function normalizeUsername(raw: string) {
  return raw
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[çğıöşü]/g, (c) => TR_MAP[c] ?? c)
    .replace(/[^a-z0-9._-]/g, "");
}

/** Supabase Auth e-posta ister; kullanıcı adını arka planda e-postaya çeviririz. */
export function usernameToEmail(username: string) {
  const domain = process.env.AUTH_EMAIL_DOMAIN || "erenos.local";
  return `${normalizeUsername(username)}@${domain}`;
}
