import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToAll } from "@/lib/push";
import { isWorkingTime, REMINDER_INTERVAL_MS } from "@/lib/workhours";
import { todayIstanbul } from "@/lib/format";
import { daysUntil } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Hatırlatmalar: aranmamış doğrudan teminler, istenip henüz gönderilmemiş numuneler (DT ve ihale),
 * yaklaşan ihaleler (ihaleden 3 gün önce 2 saatte bir, son gün saatte bir) ve son ayına giren
 * ihale sözleşmeleri (bir kez). Supabase pg_cron (supabase/cron.sql) mesai saatlerinde 15 dakikada
 * bir çağırır; mesai dışında hiç bildirim gitmez.
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
      .select("id, hospital, file_no, type")
      .in("type", status === "numune_istendi" ? ["dogrudan_temin", "ihale_siparisi"] : ["dogrudan_temin"])
      .eq("status", status)
      .or(`last_reminded_at.lte.${cutoff},and(last_reminded_at.is.null,created_at.lte.${cutoff})`)
      .order("record_date", { ascending: true });
  const [calls, samples] = await Promise.all([dueFor("arama_bekliyor"), dueFor("numune_istendi")]);
  const error = calls.error ?? samples.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Due = { id: string; hospital: string; file_no: string | null; type?: string }[];
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
            body: `${sampleDue[0].type === "ihale_siparisi" ? "İhale" : "Doğrudan temin"}${sampleDue[0].file_no ? ` (${sampleDue[0].file_no})` : ""} için istenen numune henüz gönderilmedi.`,
            url: `/kayit/${sampleDue[0].id}`,
            tag: "numune-hatirlatma",
          }
        : {
            title: `${sampleDue.length} kayıt için numune gönderilmeli`,
            body: list(sampleDue),
            url: "/",
            tag: "numune-hatirlatma",
          },
    );
  }

  // Yaklaşan ihaleler: ihaleden 3 gün önce başlar (2 saatte bir); son gün (ihaleden bir gün önce) saatte bir.
  const today = todayIstanbul();
  const addDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
  const { data: tenders, error: tenderError } = await admin
    .from("records")
    .select("id, hospital, file_no, record_date, guarantee_paid_at, prices_entered_at, last_reminded_at")
    .eq("type", "ihale_siparisi")
    .eq("status", "ihale_bekliyor")
    .gte("record_date", addDays(1))
    .lte("record_date", addDays(3))
    .order("record_date", { ascending: true });
  if (tenderError) return NextResponse.json({ error: tenderError.message }, { status: 500 });
  const tenderDue = (tenders ?? []).filter((t) => {
    const interval = daysUntil(t.record_date, today) <= 1 ? 60 * 60 * 1000 : REMINDER_INTERVAL_MS;
    return !t.last_reminded_at || Date.parse(t.last_reminded_at) <= Date.now() - interval + 60_000;
  });
  for (const t of tenderDue) {
    const d = daysUntil(t.record_date, today);
    const missing = [!t.guarantee_paid_at && "teminat yatırılmadı", !t.prices_entered_at && "fiyatlarımız girilmedi"].filter(Boolean);
    payloads.push({
      title: d <= 1 ? `İhale yarın: ${t.hospital}` : `İhaleye ${d} gün kaldı: ${t.hospital}`,
      body:
        d <= 1
          ? missing.length
            ? `Bugün son gün: ${missing.join(", ")}.`
            : "Teminat yatırıldı, fiyatlar girildi. Evrakları son kez kontrol edin."
          : `${t.file_no ? `${t.file_no} · ` : ""}Şartname ve evrakları inceleyin, gelen evrakı hastaneye gönderin.`,
      url: `/kayit/${t.id}`,
      tag: `ihale-${t.id}`,
    });
  }

  // Sözleşmesinin son ayına giren ihaleler: kalan ürünler için hastaneyle iletişime geçilmeli (bir kez bildirilir).
  const { data: contracts, error: contractError } = await admin
    .from("records")
    .select("id, hospital, file_no, contract_end")
    .eq("type", "ihale_siparisi")
    .eq("status", "onaylandi")
    .is("contract_alarm_sent_at", null)
    .lte("contract_end", addDays(30));
  if (contractError) return NextResponse.json({ error: contractError.message }, { status: 500 });
  let alarmIds: string[] = [];
  if (contracts?.length) {
    const { data: prog } = await admin
      .from("line_progress")
      .select("record_id, remaining")
      .in(
        "record_id",
        contracts.map((c) => c.id),
      );
    const open = new Set((prog ?? []).filter((p) => Number(p.remaining) > 0).map((p) => p.record_id));
    const alarms = contracts.filter((c) => open.has(c.id));
    alarmIds = alarms.map((c) => c.id);
    for (const c of alarms) {
      const left = Math.max(daysUntil(c.contract_end!, today), 0);
      payloads.push({
        title: `Sözleşme son ayında: ${c.hospital}`,
        body: `${left} gün kaldı. Kalan ürünleri hastanenin istemesi için iletişime geçin.`,
        url: `/kayit/${c.id}`,
        tag: `sozlesme-${c.id}`,
      });
    }
  }

  if (!payloads.length) return NextResponse.json({ due: 0 });

  const results = [];
  for (const payload of payloads) results.push(await sendToAll(payload));
  const now = new Date().toISOString();
  const reminded = [...callDue, ...sampleDue, ...tenderDue].map((r) => r.id);
  if (reminded.length) await admin.from("records").update({ last_reminded_at: now }).in("id", reminded);
  if (alarmIds.length) await admin.from("records").update({ contract_alarm_sent_at: now }).in("id", alarmIds);

  return NextResponse.json({
    calls: callDue.length,
    samples: sampleDue.length,
    tenders: tenderDue.length,
    contracts: alarmIds.length,
    results,
  });
}

export const GET = handle;
export const POST = handle;
