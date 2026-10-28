import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToAll } from "@/lib/push";
import { CONTRACT_ALARM_HOUR, isWorkingTime, istanbulHour, REMINDER_INTERVAL_MS } from "@/lib/workhours";
import { todayIstanbul } from "@/lib/format";
import { daysUntil, tenderAt, tenderCountdown } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Hatırlatmalar: aranmamış doğrudan teminler, istenip henüz gönderilmemiş numuneler (DT ve ihale),
 * yaklaşan ihaleler (ihale saatinden 3 gün önce 2 saatte bir, son 24 saatte saatte bir) ve son ayındaki
 * ihale sözleşmeleri (her gün 14:00'te bir kez). Supabase pg_cron (supabase/cron.sql) mesai saatlerinde 15 dakikada
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

  // Yaklaşan ihaleler: ihale saatinden 72 saat önce başlar (2 saatte bir), son 24 saatte saatte bir; ihale saatinde durur.
  const today = todayIstanbul();
  const addDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
  const nowMs = Date.now();
  const { data: tenders, error: tenderError } = await admin
    .from("records")
    .select("id, hospital, file_no, record_date, tender_time, guarantee_paid_at, prices_entered_at, last_reminded_at")
    .eq("type", "ihale_siparisi")
    .eq("status", "ihale_bekliyor")
    .gte("record_date", today)
    .lte("record_date", addDays(3))
    .order("record_date", { ascending: true });
  if (tenderError) return NextResponse.json({ error: tenderError.message }, { status: 500 });
  const DAY_MS = 24 * 60 * 60 * 1000;
  const tenderDue = (tenders ?? []).filter((t) => {
    const left = tenderAt(t.record_date, t.tender_time) - nowMs;
    if (left <= 0 || left > 3 * DAY_MS) return false;
    const interval = left <= DAY_MS ? 60 * 60 * 1000 : REMINDER_INTERVAL_MS;
    return !t.last_reminded_at || Date.parse(t.last_reminded_at) <= nowMs - interval + 60_000;
  });
  for (const t of tenderDue) {
    const lastDay = tenderAt(t.record_date, t.tender_time) - nowMs <= DAY_MS;
    const missing = [!t.guarantee_paid_at && "teminat yatırılmadı", !t.prices_entered_at && "fiyatlarımız girilmedi"].filter(Boolean);
    payloads.push({
      title: `${tenderCountdown(t.record_date, today, t.tender_time, nowMs)}: ${t.hospital}`,
      body: lastDay
        ? missing.length
          ? `Son gün: ${missing.join(", ")}.`
          : "Teminat yatırıldı, fiyatlar girildi. Evrakları son kez kontrol edin."
        : `${t.file_no ? `${t.file_no} · ` : ""}Şartname ve evrakları inceleyin, gelen evrakı hastaneye gönderin.`,
      url: `/kayit/${t.id}`,
      tag: `ihale-${t.id}`,
    });
  }

  // Sözleşmesinin son ayındaki ihaleler: kalan ürünler için hastaneyle iletişime geçilmeli.
  // Son ayın her günü saat 14:00'te bir kez bildirilir (contract_alarm_sent_at bugünün tarihinden önceyse).
  let alarmIds: string[] = [];
  if (force || istanbulHour() >= CONTRACT_ALARM_HOUR) {
    const todayStart = new Date(`${today}T00:00:00+03:00`).toISOString();
    const { data: contracts, error: contractError } = await admin
      .from("records")
      .select("id, hospital, file_no, contract_end")
      .eq("type", "ihale_siparisi")
      .eq("status", "onaylandi")
      .or(`contract_alarm_sent_at.is.null,contract_alarm_sent_at.lt.${todayStart}`)
      .gte("contract_end", today)
      .lte("contract_end", addDays(30));
    if (contractError) return NextResponse.json({ error: contractError.message }, { status: 500 });
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
        const left = daysUntil(c.contract_end!, today);
        payloads.push({
          title: `Sözleşme son ayında: ${c.hospital}`,
          body: `${left ? `${left} gün kaldı` : "Bugün son gün"}. Kalan ürünleri hastanenin istemesi için iletişime geçin.`,
          url: `/kayit/${c.id}`,
          tag: `sozlesme-${c.id}`,
        });
      }
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
