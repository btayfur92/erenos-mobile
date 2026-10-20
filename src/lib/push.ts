import "server-only";
import webpush from "web-push";
import { createAdminClient } from "./supabase/admin";
import { withBase } from "./config";

export interface PushPayload {
  title: string;
  body: string;
  /** Uygulama içi yol, ör. "/kayit/123" */
  url?: string;
  tag?: string;
}

let configured = false;
function configure() {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:bilgi@erenosmedikal.com", pub, priv);
  configured = true;
  return true;
}

/**
 * Bildirimi tüm kullanıcıların tüm cihazlarına gönderir.
 * excludeUserId verilirse işlemi yapan kişinin kendi cihazları atlanır.
 */
export async function sendToAll(payload: PushPayload, opts: { excludeUserId?: string; onlyUserId?: string } = {}) {
  if (!configure()) {
    console.warn("[push] VAPID anahtarları tanımlı değil, bildirim gönderilmedi.");
    return { sent: 0, failed: 0 };
  }
  const admin = createAdminClient();
  let query = admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, user_id");
  if (opts.excludeUserId) query = query.neq("user_id", opts.excludeUserId);
  if (opts.onlyUserId) query = query.eq("user_id", opts.onlyUserId);
  const { data: subs, error } = await query;
  if (error || !subs) {
    console.error("[push] abonelikler okunamadı", error);
    return { sent: 0, failed: 0 };
  }

  const body = JSON.stringify({ ...payload, url: withBase(payload.url ?? "/") });
  const expired: string[] = [];
  let sent = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, {
          TTL: 60 * 60 * 4,
          urgency: "high",
        });
        sent++;
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) expired.push(s.id);
        else console.error("[push] gönderim hatası", status, (err as Error).message);
      }
    }),
  );

  if (expired.length) await admin.from("push_subscriptions").delete().in("id", expired);
  return { sent, failed: subs.length - sent };
}
