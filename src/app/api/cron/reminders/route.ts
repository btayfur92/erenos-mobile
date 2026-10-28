import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToAll } from "@/lib/push";
import { isWorkingTime, REMINDER_INTERVAL_MS } from "@/lib/workhours";

export const dynamic = "force-dynamic";

/**
 * Aranmamış doğrudan teminler ve istenip henüz gönderilmemiş numuneler için hatırlatma.
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
  const dueFor = (status: "arama_bekliyor" | "numune_istendi") =>
    admin
      .from("records")
      .select("id, hospital, file_no")
      .eq("type", "dogrudan_temin")
      .eq("status", status)
      .or(`last_reminded_at.lte.${cutoff},and(last_reminded_at.is.null,created_at.lte.${cutoff})`)
      .order("record_date", { ascending: true });
  const [calls, samples] = await Promise.all([dueFor("arama_bekliyor"), dueFor("numune_istendi")]);
  const error = calls.error ?? samples.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Due = { id: string; hospital: string; file_no: string | null }[];
  const list = (due: Due) =>
    due
      .slice(0, 4)
      .map((r) => r.hospital)
      .join(", ") + (due.length > 4 ? ` ve ${due.length - 4} diğer` : "");
  const payloads = [];
  const callDue = (calls.data ?? []) as Due;
  if (callDue.length) {
    payloads.push(
      callDue.length === 1
        ? {
            title: `Hastane aranmalı: ${callDue[0].hospital}`,
            body: `Doğrudan temin${callDue[0].file_no ? ` (${callDue[0].file_no})` : ""} için arama yapılıp not girilmedi.`,
            url: `/kayit/${callDue[0].id}`,
            tag: "arama-hatirlatma",
          }
        : {
            title: `${callDue.length} doğrudan temin için hastane aranmalı`,
            body: list(callDue),
            url: "/?f=arama",
            tag: "arama-hatirlatma",
          },
    );
  }
  // Numune istenmiş, henüz "Numune gönderildi" denmemiş kayıtlar.
  const sampleDue = (samples.data ?? []) as Due;
  if (sampleDue.length) {
    payloads.push(
      sampleDue.length === 1
        ? {
            title: `Numune gönderilmeli: ${sampleDue[0].hospital}`,
            body: `Doğrudan temin${sampleDue[0].file_no ? ` (${sampleDue[0].file_no})` : ""} için istenen numune henüz gönderilmedi.`,
            url: `/kayit/${sampleDue[0].id}`,
            tag: "numune-hatirlatma",
          }
        : {
            title: `${sampleDue.length} doğrudan temin için numune gönderilmeli`,
            body: list(sampleDue),
            url: "/",
            tag: "numune-hatirlatma",
          },
    );
  }
  if (!payloads.length) return NextResponse.json({ due: 0 });

  const results = [];
  for (const payload of payloads) results.push(await sendToAll(payload));
  await admin
    .from("records")
    .update({ last_reminded_at: new Date().toISOString() })
    .in(
      "id",
      [...callDue, ...sampleDue].map((r) => r.id),
    );

  return NextResponse.json({ calls: callDue.length, samples: sampleDue.length, results });
}

export const GET = handle;
export const POST = handle;
