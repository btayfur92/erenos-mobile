import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Uyanık tutma: Supabase pg_cron (supabase/cron.sql) mesai saatlerinde 5 dakikada bir çağırır.
 * Sunucu uzun süre istek almazsa uykuya geçer ve uygulamanın ilk açılışı gecikir; bu istek onu sıcak tutar.
 */
export function GET() {
  return NextResponse.json({ ok: true });
}
