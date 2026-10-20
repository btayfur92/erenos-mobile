import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToAll } from "@/lib/push";
import { isWorkingTime, REMINDER_INTERVAL_MS } from "@/lib/workhours";

export const dynamic = "force-dynamic";

/**
 * Aranmamış doğrudan teminler için hatırlatma.
 * Supabase pg_cron (supabase/cron.sql) mesai saatlerinde 15 dakikada bir çağırır;
 * her kayıt için en fazla 2 saatte bir bildirim gider, mesai dışında hiç gitmez.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("key");
  if (!secret || given !== secret) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const force = request.nextUrl.searchParams.get("force") === "1";
  if (!force && !isWorkingTime()) return NextResponse.json({ skipped: "mesai dışı" });

  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - REMINDER_INTERVAL_MS + 60_000).toISOString(); // 1 dk tolerans
  const { data: due, error } = await admin
    .from("records")
    .select("id, hospital, file_no")
    .eq("type", "dogrudan_temin")
    .eq("status", "arama_bekliyor")
    .or(`last_reminded_at.lte.${cutoff},and(last_reminded_at.is.null,created_at.lte.${cutoff})`)
    .order("record_date", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due?.length) return NextResponse.json({ due: 0 });

  const payload =
    due.length === 1
      ? {
          title: `Hastane aranmalı: ${due[0].hospital}`,
          body: `Doğrudan temin${due[0].file_no ? ` (${due[0].file_no})` : ""} için arama yapılıp not girilmedi.`,
          url: `/kayit/${due[0].id}`,
          tag: "arama-hatirlatma",
        }
      : {
          title: `${due.length} doğrudan temin için hastane aranmalı`,
          body: due
            .slice(0, 4)
            .map((r) => r.hospital)
            .join(", ") + (due.length > 4 ? ` ve ${due.length - 4} diğer` : ""),
          url: "/?f=arama",
          tag: "arama-hatirlatma",
        };

  const result = await sendToAll(payload);
  await admin
    .from("records")
    .update({ last_reminded_at: new Date().toISOString() })
    .in(
      "id",
      due.map((r) => r.id),
    );

  return NextResponse.json({ due: due.length, ...result });
}

export const GET = handle;
export const POST = handle;
