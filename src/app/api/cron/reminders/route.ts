import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendToAll } from "@/lib/push";
import { CONTRACT_ALARM_HOUR, isExtendedTime, isWorkingTime, istanbulHour, REMINDER_INTERVAL_MS } from "@/lib/workhours";
import { todayIstanbul } from "@/lib/format";
import { alarmDays, daysUntil, tenderAt, tenderCountdown, type RecordType } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * Hatırlatmalar: aranmamış doğrudan teminler, istenip henüz gönderilmemiş numuneler (DT ve ihale),
 * yaklaşan ihaleler (ihale saatinden 3 gün, DMO ihalesinde 2 gün önce 2 saatte bir, son 24 saatte saatte bir) ve son ayındaki
 * ihale sözleşmeleri (her gün 14:00'te bir kez) mesai saatlerinde herkese gider. Kişiye özel anımsatıcılar yalnızca
 * eklenen kişilere, kişinin ayarına göre mesai saatlerinde ya da her gün 08:00–22:00 arasında gider.
 * Supabase pg_cron (supabase/cron.sql) her gün 08:00–22:00 arasında 15 dakikada bir çağırır.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? request.nextUrl.searchParams.get("key");
  if (!secret || given !== secret) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const force = request.nextUrl.searchParams.get("force") === "1";
  const admin = createAdminClient();

  // Anımsatıcılar her kişinin kendi saat aralığına göre gider (mesai ya da 08:00–22:00), bu yüzden önce çalışır.
  const personal = await sendPersonalReminders(admin, force);
  if ("error" in personal) return NextResponse.json({ error: personal.error }, { status: 500 });
  if (!force && !isWorkingTime()) return NextResponse.json({ skipped: "mesai dışı", personal: personal.sent });

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
            body: `${sampleDue[0].type === "ihale_siparisi" ? "Hastane ihalesi" : "Doğrudan temin"}${sampleDue[0].file_no ? ` (${sampleDue[0].file_no})` : ""} için istenen numune henüz gönderilmedi.`,
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

  // Yaklaşan ihaleler: ihale saatinden 72 saat (DMO ihalesinde 48 saat) önce başlar (2 saatte bir), son 24 saatte saatte bir;
  // ihale saatinde durur. DMO'da teminat adımı yoktur (süresiz teminat).
  const today = todayIstanbul();
  const addDays = (n: number) => new Date(Date.parse(today) + n * 86_400_000).toISOString().slice(0, 10);
  const nowMs = Date.now();
  const { data: tenders, error: tenderError } = await admin
    .from("records")
    .select("id, type, hospital, file_no, record_date, tender_time, guarantee_paid_at, prices_entered_at, last_reminded_at")
    .in("type", ["ihale_siparisi", "dmo_ihalesi"])
    .eq("status", "ihale_bekliyor")
    .gte("record_date", today)
    .lte("record_date", addDays(3))
    .order("record_date", { ascending: true });
  if (tenderError) return NextResponse.json({ error: tenderError.message }, { status: 500 });
  const DAY_MS = 24 * 60 * 60 * 1000;
  const tenderDue = (tenders ?? []).filter((t) => {
    const left = tenderAt(t.record_date, t.tender_time) - nowMs;
    if (left <= 0 || left > (t.type === "dmo_ihalesi" ? 2 : 3) * DAY_MS) return false;
    const interval = left <= DAY_MS ? 60 * 60 * 1000 : REMINDER_INTERVAL_MS;
    return !t.last_reminded_at || Date.parse(t.last_reminded_at) <= nowMs - interval + 60_000;
  });
  for (const t of tenderDue) {
    const lastDay = tenderAt(t.record_date, t.tender_time) - nowMs <= DAY_MS;
    const dmo = t.type === "dmo_ihalesi";
    const missing = [!dmo && !t.guarantee_paid_at && "teminat yatırılmadı", !t.prices_entered_at && "fiyatlarımız girilmedi"].filter(
      Boolean,
    );
    payloads.push({
      title: `${dmo ? "DMO · " : ""}${tenderCountdown(t.record_date, today, t.tender_time, nowMs)}: ${t.hospital}`,
      body: lastDay
        ? missing.length
          ? `Son gün: ${missing.join(", ")}.`
          : dmo
            ? "Fiyatlar girildi. Evrakları son kez kontrol edin."
            : "Teminat yatırıldı, fiyatlar girildi. Evrakları son kez kontrol edin."
        : `${t.file_no ? `${t.file_no} · ` : ""}Şartname ve evrakları inceleyin, gelen evrakı hastaneye gönderin.`,
      url: `/kayit/${t.id}`,
      tag: `ihale-${t.id}`,
    });
  }

  // Sözleşmesinin son ayındaki ihaleler ve teslim süresinin son 7 günündeki DMO siparişleri: kalan ürünler için hastaneyle iletişime geçilmeli.
  // Her gün saat 14:00'te bir kez bildirilir (contract_alarm_sent_at bugünün tarihinden önceyse).
  let alarmIds: string[] = [];
  if (force || istanbulHour() >= CONTRACT_ALARM_HOUR) {
    const todayStart = new Date(`${today}T00:00:00+03:00`).toISOString();
    const { data: contracts, error: contractError } = await admin
      .from("records")
      .select("id, type, hospital, file_no, contract_end")
      .in("type", ["ihale_siparisi", "dmo_ihalesi"])
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
      const alarms = contracts.filter((c) => open.has(c.id) && daysUntil(c.contract_end!, today) <= alarmDays(c.type as RecordType));
      alarmIds = alarms.map((c) => c.id);
      for (const c of alarms) {
        const left = daysUntil(c.contract_end!, today);
        const dmo = c.type === "dmo_ihalesi";
        payloads.push({
          title: dmo ? `DMO teslim süresi bitiyor: ${c.hospital}` : `Sözleşme son ayında: ${c.hospital}`,
          body: dmo
            ? `${left ? `${left} gün kaldı` : "Bugün son gün"}. Kalan ürünlerin teslimini tamamlayın.`
            : `${left ? `${left} gün kaldı` : "Bugün son gün"}. Kalan ürünleri hastanenin istemesi için iletişime geçin.`,
          url: `/kayit/${c.id}`,
          tag: `sozlesme-${c.id}`,
        });
      }
    }
  }

  if (!payloads.length) return NextResponse.json({ due: 0, personal: personal.sent });

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
    personal: personal.sent,
    results,
  });
}

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Anımsatıcılar: başlangıç anından itibaren her aralıkta (starts_at + k * aralık) bir bildirim.
 * Kişinin saat aralığı dışında kalan aralıklar, aralık açılınca bir kez gönderilir. Tamamlayan kişiye gitmez.
 */
async function sendPersonalReminders(admin: Admin, force: boolean): Promise<{ sent: number } | { error: string }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("reminder_recipients")
    .select(
      "reminder_id, user_id, last_sent_at, reminders!inner(id, title, detail, starts_at, interval_minutes), profiles!inner(extended_hours, active)",
    )
    .is("done_at", null)
    .lte("reminders.starts_at", nowIso)
    .eq("profiles.active", true);
  if (error) return { error: error.message };

  type Row = {
    reminder_id: string;
    user_id: string;
    last_sent_at: string | null;
    reminders: { id: string; title: string; detail: string | null; starts_at: string; interval_minutes: number };
    profiles: { extended_hours: boolean; active: boolean };
  };
  const now = Date.now();
  const working = isWorkingTime(),
    extended = isExtendedTime();
  const due = ((data ?? []) as unknown as Row[]).filter((r) => {
    if (!force && !(r.profiles.extended_hours ? extended : working)) return false;
    const start = Date.parse(r.reminders.starts_at),
      step = r.reminders.interval_minutes * 60_000;
    const latestSlot = start + Math.floor((now - start) / step) * step;
    return !r.last_sent_at || Date.parse(r.last_sent_at) < latestSlot;
  });

  for (const r of due) {
    await sendToAll(
      {
        title: `Anımsatıcı: ${r.reminders.title}`,
        body: r.reminders.detail || "Tamamladığınızda uygulamadan “Tamamlandı” deyin.",
        url: "/animsaticilar",
        tag: `animsatici-${r.reminder_id}`,
      },
      { onlyUserId: r.user_id },
    );
    await admin.from("reminder_recipients").update({ last_sent_at: nowIso }).eq("reminder_id", r.reminder_id).eq("user_id", r.user_id);
  }
  return { sent: due.length };
}

export const GET = handle;
export const POST = handle;
