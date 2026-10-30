"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect, RedirectType } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { sendToAll, type PushPayload } from "@/lib/push";
import {
  canDeliver,
  canSell,
  isTenderType,
  RECORD_TYPE_LABEL,
  REMINDER_INTERVALS,
  UNITS,
  type Customer,
  type ManualDirection,
  type Product,
  type RecordType,
} from "@/lib/types";
import { formatQty } from "@/lib/format";
import { normalizePhone, PHONE_ERROR } from "@/lib/phone";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(error: unknown): ActionResult {
  const message = (error as { message?: string })?.message ?? (typeof error === "string" ? error : "Beklenmeyen bir hata oluştu.");
  return { ok: false, error: message };
}

/** Bildirimi yanıt döndükten sonra herkese gönderir (işlemi yapan hariç). */
function notify(payload: PushPayload, actorId: string) {
  after(async () => {
    try {
      await sendToAll(payload, { excludeUserId: actorId });
    } catch (err) {
      console.error("[push] bildirim gönderilemedi", err);
    }
  });
}

const NO_PERMISSION = "Bu işlem için yetkiniz yok.";

/** Kullanıcı tipine göre yetki: "sell" satış kayıtları ve sevkiyata aktarma, "deliver" teslim işaretleme. */
async function requireRole(need: "sell" | "deliver") {
  const ctx = await requireUser();
  return (need === "sell" ? canSell : canDeliver)(ctx.profile.role) ? ctx : null;
}

function refresh() {
  revalidatePath("/", "layout");
}

export interface LineInput {
  id?: string; // düzenlemede mevcut kalem
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number | null; // ihalede null (fiyat sonradan girilir)
  currency: string;
  region?: string; // DMO ihalesi: ürünün istendiği şehir
}

export interface RecordInput {
  id?: string;
  type: RecordType;
  record_date: string;
  /** İhale saati "HH:MM"; boşsa 09:00. */
  tender_time?: string;
  file_no: string;
  hospital: string;
  contact_name: string;
  contact_phone: string;
  contact_ext: string;
  notes: string;
  lines: LineInput[];
}

export async function saveRecord(input: RecordInput): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  if (!input.hospital.trim()) return { ok: false, error: input.type === "genel_siparis" ? "Müşteri adı gerekli." : "Hastane adı gerekli." };
  const lines = input.lines.filter((l) => l.product_name.trim());
  if (!lines.length) return { ok: false, error: "En az bir ürün kalemi girin." };
  if (lines.some((l) => !(Number(l.quantity) > 0))) return { ok: false, error: "Ürün miktarları sıfırdan büyük olmalı." };
  if (input.type === "dmo_ihalesi" && lines.some((l) => !l.region?.trim())) return { ok: false, error: "Her ürün için şehir girin." };
  if (!isTenderType(input.type) && lines.some((l) => l.unit_price === null || !(Number(l.unit_price) >= 0)))
    return { ok: false, error: "Fiyatları kontrol edin." };
  const phone = input.contact_phone.trim() ? normalizePhone(input.contact_phone) : "";
  if (phone === null) return { ok: false, error: PHONE_ERROR };
  const ext = input.contact_ext.trim();
  if (ext && !/^\d{1,6}$/.test(ext)) return { ok: false, error: "Dahili yalnızca rakamlardan oluşmalı." };

  const { data, error } = await supabase.rpc("save_record", {
    p_id: input.id ?? null,
    p_type: input.type,
    p_record_date: input.record_date,
    p_file_no: input.file_no,
    p_hospital: input.hospital,
    p_contact_name: input.contact_name,
    p_contact_phone: phone,
    p_contact_ext: ext,
    p_notes: input.notes,
    p_lines: lines,
    p_tender_time: isTenderType(input.type) ? input.tender_time || "09:00" : null,
  });
  if (error) return fail(error);

  if (!input.id) {
    notify(
      {
        title: `Yeni ${RECORD_TYPE_LABEL[input.type]}`,
        body: `${input.hospital.trim()}${input.file_no ? ` · ${input.file_no}` : ""} · ${lines.length} kalem`,
        url: `/kayit/${data}`,
      },
      user.id,
    );
  }
  refresh();
  // Düzenlemeden sonra form geri gelinen kayıt sayfasına döner (geçmişte aynı sayfa iki kez birikmesin).
  if (input.id) return { ok: true, id: input.id };
  // Yeni kayıtta yönlendirme sunucuda yapılır: hedef liste aynı yanıtla gelir (ayrı bir gidiş-dönüş beklenmez).
  // Doğrudan temin ve genel satış Gündem'e, diğerleri kendi sekmesine düşer.
  redirect(
    input.type === "yaklasik_maliyet"
      ? "/?f=ym"
      : input.type === "dmo_ihalesi"
        ? "/?f=dmo"
        : input.type === "ihale_siparisi"
          ? "/?f=ihale&d=surec"
          : "/",
    RedirectType.replace,
  );
}

export async function logCall(recordId: string, note: string, keepReminding: boolean): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase } = ctx;
  if (!note.trim()) return { ok: false, error: "Görüşme notu gerekli." };
  const { error } = await supabase.rpc("log_call", {
    p_record_id: recordId,
    p_note: note,
    p_keep_reminding: keepReminding,
  });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

export interface SampleInput {
  product_name: string;
  quantity: number;
  unit: string;
}

/** Hastanenin istediği numune (sonuçtan önce, isteğe bağlı adım). Gönderilene kadar düzeltilebilir. */
export async function requestSample(recordId: string, note: string, items: SampleInput[]): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  if (!items.length) return { ok: false, error: "İstenen en az bir numune seçin." };
  if (items.some((i) => !(i.quantity > 0))) return { ok: false, error: "Numune miktarı sıfırdan büyük olmalı." };
  const { data: before } = await supabase.from("records").select("status, hospital, file_no").eq("id", recordId).single();
  const { error } = await supabase.rpc("request_sample", { p_record_id: recordId, p_note: note, p_items: items });
  if (error) return fail(error);
  notify(
    {
      title: `${before?.status === "numune_istendi" ? "Numune talebi güncellendi" : "Numune istendi"}: ${before?.hospital ?? ""}`,
      body: items.map((i) => `${formatQty(i.quantity)} ${i.unit} ${i.product_name}`).join(", "),
      url: `/kayit/${recordId}`,
    },
    user.id,
  );
  refresh();
  return { ok: true };
}

export async function markSampleSent(recordId: string): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  const { error } = await supabase.rpc("mark_sample_sent", { p_record_id: recordId });
  if (error) return fail(error);
  const { data: rec } = await supabase.from("records").select("hospital, file_no").eq("id", recordId).single();
  notify(
    {
      title: `Numune gönderildi: ${rec?.hospital ?? ""}`,
      body: `Doğrudan temin${rec?.file_no ? ` (${rec.file_no})` : ""} için sonuç bekleniyor.`,
      url: `/kayit/${recordId}`,
    },
    user.id,
  );
  refresh();
  return { ok: true };
}

export async function setResult(
  recordId: string,
  approved: boolean,
  note: string,
  lines: { line_id: string; approved_qty: number }[],
  contractEnd: string | null = null,
  contractStart: string | null = null,
): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  const { data: before } = await supabase.from("records").select("status, type").eq("id", recordId).single();
  const wasDecided = before?.status === "onaylandi" || before?.status === "reddedildi";
  const tender = !!before && isTenderType(before.type);
  const dmo = before?.type === "dmo_ihalesi";
  if (tender && approved && !contractStart) return { ok: false, error: dmo ? "Sipariş tarihini girin." : "Sözleşme imza tarihini girin." };
  if (tender && approved && !contractEnd) return { ok: false, error: "Teslim son tarihini girin." };
  if (tender && approved && contractEnd! < contractStart!)
    return {
      ok: false,
      error: dmo ? "Teslim son tarihi sipariş tarihinden önce olamaz." : "Teslim son tarihi imza tarihinden önce olamaz.",
    };
  const label = before?.type === "genel_siparis" ? "Genel satış" : dmo ? "DMO ihalesi" : tender ? "Hastane ihalesi" : "Doğrudan temin";
  const { error } = await supabase.rpc("set_result", {
    p_record_id: recordId,
    p_approved: approved,
    p_note: note,
    p_lines: approved ? lines : null,
    p_contract_end: tender && approved ? contractEnd : null,
    p_contract_start: tender && approved ? contractStart : null,
  });
  if (error) return fail(error);

  const { data: rec } = await supabase.from("records").select("hospital, file_no").eq("id", recordId).single();
  notify(
    {
      title: wasDecided
        ? `${label} sonucu güncellendi`
        : dmo && approved
          ? "DMO ihalesi siparişi geldi"
          : tender && approved
            ? "Hastane ihalesi sözleşmesi imzalandı"
            : approved
              ? `${label} onaylandı`
              : `${label} reddedildi`,
      body: `${rec?.hospital ?? ""}${rec?.file_no ? ` · ${rec.file_no}` : ""}${approved ? ` · ${lines.length} kalem ${dmo ? "siparişli" : tender ? "sözleşmeli" : "onaylandı"}` : ""}`,
      url: `/kayit/${recordId}`,
    },
    user.id,
  );
  refresh();
  return { ok: true };
}

async function tenderInfo(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], recordId: string) {
  const { data } = await supabase.from("records").select("hospital, file_no").eq("id", recordId).single();
  return `${data?.hospital ?? ""}${data?.file_no ? ` · ${data.file_no}` : ""}`;
}

/** İhale: teminat yatırıldı (paid=false geri alır). */
export async function setGuarantee(recordId: string, paid: boolean): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  const { error } = await supabase.rpc("set_guarantee", { p_record_id: recordId, p_paid: paid });
  if (error) return fail(error);
  if (paid) notify({ title: "Teminat yatırıldı", body: await tenderInfo(supabase, recordId), url: `/kayit/${recordId}` }, user.id);
  refresh();
  return { ok: true };
}

/** İhale: verdiğimiz birim fiyatlar (tüm kalemler). */
export async function setOurPrices(
  recordId: string,
  lines: { line_id: string; unit_price: number; currency: string }[],
): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  if (lines.some((l) => !(l.unit_price >= 0))) return { ok: false, error: "Her kalem için birim fiyat girin." };
  const { data: before } = await supabase.from("records").select("prices_entered_at, type").eq("id", recordId).single();
  const { error } = await supabase.rpc("set_our_prices", { p_record_id: recordId, p_lines: lines });
  if (error) return fail(error);
  notify(
    {
      title: `${before?.type === "dmo_ihalesi" ? "DMO ihalesi" : "Hastane ihalesi"} fiyatlarımız ${before?.prices_entered_at ? "güncellendi" : "girildi"}`,
      body: await tenderInfo(supabase, recordId),
      url: `/kayit/${recordId}`,
    },
    user.id,
  );
  refresh();
  return { ok: true };
}

/** İhale: rakip firmanın fiyatları (yeni ya da düzeltme; oldCompany düzeltilen firmanın eski adı). */
export async function saveCompetitor(
  recordId: string,
  company: string,
  oldCompany: string | null,
  prices: { line_id: string; unit_price: number | null; currency: string }[],
): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  if (!company.trim()) return { ok: false, error: "Firma adı gerekli." };
  if (!prices.some((p) => p.unit_price !== null)) return { ok: false, error: "En az bir kalem için fiyat girin." };
  const { error } = await supabase.rpc("save_competitor", {
    p_record_id: recordId,
    p_company: company,
    p_old_company: oldCompany,
    p_prices: prices,
  });
  if (error) return fail(error);
  if (!oldCompany) {
    notify(
      { title: `Rakip fiyatı girildi: ${company.trim()}`, body: await tenderInfo(supabase, recordId), url: `/kayit/${recordId}` },
      user.id,
    );
  }
  refresh();
  return { ok: true };
}

export async function deleteCompetitor(recordId: string, company: string): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase } = ctx;
  const { error } = await supabase.from("tender_bids").delete().eq("record_id", recordId).eq("company", company);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

/** Sözleşmeli ihalede iş artışı / eksiltmesi (sözleşme miktarının en fazla %20'si). */
export async function adjustContract(recordId: string, lineId: string, quantity: number, note: string): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  if (!(quantity > 0)) return { ok: false, error: "Miktar sıfırdan büyük olmalı." };
  const { data: line } = await supabase.from("record_lines").select("product_name, unit, approved_qty").eq("id", lineId).single();
  const { error } = await supabase.rpc("adjust_contract", { p_line_id: lineId, p_qty: quantity, p_note: note });
  if (error) return fail(error);
  if (line && Number(line.approved_qty) !== quantity) {
    notify(
      {
        title: `${quantity > Number(line.approved_qty) ? "İş artışı" : "İş eksiltmesi"}: ${line.product_name}`,
        body: `${formatQty(line.approved_qty)} → ${formatQty(quantity)} ${line.unit} · ${await tenderInfo(supabase, recordId)}`,
        url: `/kayit/${recordId}`,
      },
      user.id,
    );
  }
  refresh();
  return { ok: true };
}

export async function createShipment(
  recordId: string,
  note: string,
  items: { line_id: string; quantity: number }[],
  plannedDate: string,
): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plannedDate)) return { ok: false, error: "Sevk tarihini seçin." };
  const { data, error } = await supabase.rpc("create_shipment", {
    p_record_id: recordId,
    p_note: note,
    p_items: items.filter((i) => Number(i.quantity) > 0),
    p_planned_date: plannedDate,
  });
  if (error) return fail(error);

  const { data: rec } = await supabase.from("records").select("hospital").eq("id", recordId).single();
  const { data: lines } = await supabase
    .from("record_lines")
    .select("id, product_name, unit")
    .in(
      "id",
      items.map((i) => i.line_id),
    );
  const summary = items
    .filter((i) => Number(i.quantity) > 0)
    .map((i) => {
      const l = lines?.find((x) => x.id === i.line_id);
      return `${formatQty(i.quantity)} ${l?.unit ?? ""} ${l?.product_name ?? ""}`.trim();
    })
    .join(", ");
  notify({ title: `Sevkiyat talebi: ${rec?.hospital ?? ""}`, body: summary, url: "/sevkiyat" }, user.id);
  refresh();
  return { ok: true, id: data as string };
}

export async function markDelivered(shipmentId: string): Promise<ActionResult> {
  const ctx = await requireRole("deliver");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  const { data, error } = await supabase
    .from("shipments")
    .update({ status: "teslim_edildi", delivered_at: new Date().toISOString(), delivered_by: user.id })
    .eq("id", shipmentId)
    .eq("status", "sevk_bekliyor")
    .select("record_id, records(hospital)")
    .single();
  if (error) return fail(error);
  const hospital = (data?.records as unknown as { hospital: string } | null)?.hospital ?? "";
  notify({ title: "Sevkiyat teslim edildi", body: hospital, url: `/kayit/${data.record_id}` }, user.id);
  refresh();
  return { ok: true };
}

export async function cancelShipment(shipmentId: string): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase } = ctx;
  const { error } = await supabase.from("shipments").delete().eq("id", shipmentId).eq("status", "sevk_bekliyor");
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

/**
 * Yaklaşık maliyet sonucu (takip amaçlı): her kalem için hastanenin yaklaşık maliyet fiyatı ve onay/red; kısmi onay olabilir.
 * reopen=true sonucu geri alır (girilen yaklaşık maliyet fiyatları saklanır).
 */
export async function setYmResult(
  recordId: string,
  lines: { line_id: string; approved: boolean; ym_price: number | null }[],
  note: string,
  reopen = false,
): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase, user } = ctx;
  const { data: before } = await supabase.from("records").select("status").eq("id", recordId).single();
  const { error } = await supabase.rpc("set_ym_result", { p_record_id: recordId, p_lines: lines, p_note: note, p_reopen: reopen });
  if (error) return fail(error);
  if (!reopen) {
    const { data: rec } = await supabase.from("records").select("hospital, file_no").eq("id", recordId).single();
    const won = lines.filter((l) => l.approved).length;
    notify(
      {
        title:
          before?.status === "onaylandi" || before?.status === "reddedildi"
            ? "Yaklaşık maliyet sonucu güncellendi"
            : won === 0
              ? "Yaklaşık maliyet reddedildi"
              : won < lines.length
                ? "Yaklaşık maliyet kısmen onaylandı"
                : "Yaklaşık maliyet onaylandı",
        body: `${rec?.hospital ?? ""}${rec?.file_no ? ` · ${rec.file_no}` : ""} · ${won}/${lines.length} kalem onaylandı`,
        url: `/kayit/${recordId}`,
      },
      user.id,
    );
  }
  refresh();
  return { ok: true };
}

export async function deleteRecord(recordId: string): Promise<ActionResult> {
  const ctx = await requireRole("sell");
  if (!ctx) return { ok: false, error: NO_PERMISSION };
  const { supabase } = ctx;
  const { error } = await supabase.from("records").delete().eq("id", recordId);
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Elle eklenen sevkiyatlar: gelecek (tedarikçiden bize) ve doğrudan temine bağlı olmayan gidecek
// ---------------------------------------------------------------------------

export interface ManualShipmentInput {
  direction: ManualDirection;
  party: string;
  product_details: string;
  quantity: number;
  unit: string;
  due_date: string;
  note: string;
}

function checkManual(input: ManualShipmentInput): string | null {
  if (input.direction !== "gelecek" && input.direction !== "gidecek") return "Sevkiyat türünü seçin.";
  const gelecek = input.direction === "gelecek";
  if (!input.party.trim()) return gelecek ? "Tedarikçi adı gerekli." : "Hastane / alıcı adı gerekli.";
  if (!input.product_details.trim()) return "Ürün detayını girin.";
  if (!(input.quantity > 0)) return "Miktarı girin (sıfırdan büyük olmalı).";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) return gelecek ? "Beklenen tarihi seçin." : "Sevk tarihini seçin.";
  return null;
}

const manualFields = (input: ManualShipmentInput) => ({
  party: input.party.trim(),
  product_details: input.product_details.trim(),
  quantity: input.quantity,
  unit: input.unit,
  due_date: input.due_date,
  note: input.note.trim() || null,
});

export async function createManualShipment(input: ManualShipmentInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const invalid = checkManual(input);
  if (invalid) return { ok: false, error: invalid };
  const { data, error } = await supabase
    .from("manual_shipments")
    .insert({ direction: input.direction, ...manualFields(input) })
    .select("id")
    .single();
  if (error) return fail(error);
  const kind = input.direction === "gelecek" ? "Gelecek" : "Gidecek";
  notify({ title: `${kind} sevkiyat: ${input.party.trim()}`, body: input.product_details.trim(), url: "/sevkiyat" }, user.id);
  refresh();
  return { ok: true, id: data.id };
}

/** Yanlış girilen sevkiyatı düzeltir; türü ve tamamlanmış olanlar değişmez. Bildirim gönderilmez. */
export async function updateManualShipment(id: string, input: ManualShipmentInput): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const invalid = checkManual(input);
  if (invalid) return { ok: false, error: invalid };
  const { data, error } = await supabase
    .from("manual_shipments")
    .update(manualFields(input))
    .eq("id", id)
    .eq("status", "bekliyor")
    .select("id");
  if (error) return fail(error);
  if (!data?.length) return { ok: false, error: "Bu sevkiyat tamamlanmış ya da silinmiş." };
  refresh();
  return { ok: true, id };
}

/**
 * Gelecekte "Teslim alındı", gidecekte "Teslim edildi". Parça teslim edilebilir
 * (quantity); kalan sıfıra inince sevkiyat tamamlanır. quantity null ise kalanın tamamı teslim sayılır.
 */
export async function completeManualShipment(id: string, quantity: number | null = null): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  if (!canDeliver(profile.role)) {
    // Satış yalnızca gelecek sevkiyatta "teslim alındı" diyebilir.
    const { data: m } = await supabase.from("manual_shipments").select("direction").eq("id", id).single();
    if (m?.direction !== "gelecek") return { ok: false, error: NO_PERMISSION };
  }
  if (quantity !== null && !(quantity > 0)) return { ok: false, error: "Teslim miktarı sıfırdan büyük olmalı." };
  const { data: done, error } = await supabase.rpc("deliver_manual_shipment", { p_id: id, p_quantity: quantity });
  if (error) return fail(error);
  const { data } = await supabase.from("manual_shipments").select("direction, party, product_details, unit").eq("id", id).single();
  if (data) {
    const verb = data.direction === "gelecek" ? "teslim alındı" : "teslim edildi";
    notify(
      done
        ? { title: `Sevkiyat ${verb}: ${data.party}`, body: data.product_details, url: "/sevkiyat?d=tamam" }
        : {
            title: `Sevkiyat kısmen ${verb}: ${data.party}`,
            body: `${quantity !== null ? `${formatQty(quantity)} ${data.unit ?? ""} · ` : ""}${data.product_details}`,
            url: "/sevkiyat",
          },
      user.id,
    );
  }
  refresh();
  return { ok: true };
}

export async function cancelManualShipment(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("manual_shipments").delete().eq("id", id).eq("status", "bekliyor");
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Görüşmeler (hastane ziyaret notları)
// ---------------------------------------------------------------------------

export interface MeetingInput {
  id?: string;
  meeting_date: string;
  hospital: string;
  department: string;
  note: string;
}

export async function saveMeeting(input: MeetingInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.meeting_date)) return { ok: false, error: "Görüşme tarihini seçin." };
  if (!input.hospital.trim()) return { ok: false, error: "Hastane adı gerekli." };
  if (!input.department.trim()) return { ok: false, error: "Servis gerekli." };
  if (!input.note.trim()) return { ok: false, error: "Görüşme notunu yazın." };
  const fields = {
    meeting_date: input.meeting_date,
    hospital: input.hospital.trim(),
    department: input.department.trim(),
    note: input.note.trim(),
  };

  // Düzeltme: bildirim gönderilmez, kimin düzelttiği kaydedilir.
  if (input.id) {
    const { error } = await supabase
      .from("meetings")
      .update({ ...fields, updated_by: user.id, updated_at: new Date().toISOString() })
      .eq("id", input.id);
    if (error) return fail(error);
    refresh();
    return { ok: true, id: input.id };
  }

  const { data, error } = await supabase.from("meetings").insert(fields).select("id").single();
  if (error) return fail(error);
  const excerpt = fields.note.length > 120 ? `${fields.note.slice(0, 117)}…` : fields.note;
  notify({ title: `Yeni görüşme notu: ${fields.hospital}`, body: `${fields.department} · ${excerpt}`, url: "/gorusmeler" }, user.id);
  refresh();
  return { ok: true, id: data.id };
}

// ---------------------------------------------------------------------------
// Anımsatıcılar (yalnızca seçilen kişilere bildirim)
// ---------------------------------------------------------------------------

export interface ReminderInput {
  id?: string;
  title: string;
  detail: string;
  /** "YYYY-MM-DD" ve "HH:MM" (İstanbul) */
  start_date: string;
  start_time: string;
  interval_minutes: number;
  users: string[];
}

export async function saveReminder(input: ReminderInput): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  if (!input.title.trim()) return { ok: false, error: "Başlık girin." };
  if (!input.users.length) return { ok: false, error: "Bildirim gidecek en az bir kişi seçin." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) return { ok: false, error: "Başlangıç tarihini seçin." };
  if (!/^\d{2}:\d{2}$/.test(input.start_time)) return { ok: false, error: "Başlangıç saatini seçin." };
  if (!REMINDER_INTERVALS.some((i) => i.minutes === input.interval_minutes)) return { ok: false, error: "Sıklığı seçin." };
  const startsAt = new Date(`${input.start_date}T${input.start_time}:00+03:00`).toISOString();

  let before: string[] = [];
  if (input.id) {
    const { data } = await supabase.from("reminder_recipients").select("user_id").eq("reminder_id", input.id);
    before = (data ?? []).map((r) => r.user_id);
  }
  const { data, error } = await supabase.rpc("save_reminder", {
    p_id: input.id ?? null,
    p_title: input.title,
    p_detail: input.detail,
    p_starts_at: startsAt,
    p_interval_minutes: input.interval_minutes,
    p_users: input.users,
  });
  if (error) return fail(error);

  // Yeni eklenen kişilere (oluşturan hariç) bilgi bildirimi; hatırlatmalar başlangıç anından itibaren gelir.
  const added = input.users.filter((u) => u !== user.id && !before.includes(u));
  if (added.length) {
    const who = profile.full_name || profile.username;
    after(async () => {
      try {
        await sendToAll(
          { title: `${who} size bir anımsatıcı ekledi`, body: input.title.trim(), url: "/animsaticilar", tag: `animsatici-${data}` },
          { onlyUserIds: added },
        );
      } catch (err) {
        console.error("[push] bildirim gönderilemedi", err);
      }
    });
  }
  refresh();
  return { ok: true, id: data as string };
}

export async function setReminderDone(reminderId: string, done: boolean): Promise<ActionResult> {
  const { supabase, user, profile } = await requireUser();
  const { error } = await supabase.rpc("set_reminder_done", { p_reminder_id: reminderId, p_done: done });
  if (error) return fail(error);
  // Tamamlanınca anımsatıcıdaki diğer kişilere ve kurana bir kez bildirim gider.
  if (done) {
    const { data: r } = await supabase
      .from("reminders")
      .select("title, created_by, reminder_recipients(user_id)")
      .eq("id", reminderId)
      .single();
    const others = [...new Set([...(r?.reminder_recipients ?? []).map((x) => x.user_id), r?.created_by])].filter(
      (id): id is string => !!id && id !== user.id,
    );
    if (r && others.length) {
      const who = profile.full_name || profile.username;
      after(async () => {
        try {
          await sendToAll(
            { title: `${who} tamamladı`, body: r.title, url: "/animsaticilar", tag: `animsatici-tamam-${reminderId}` },
            { onlyUserIds: others },
          );
        } catch (err) {
          console.error("[push] bildirim gönderilemedi", err);
        }
      });
    }
  }
  refresh();
  return { ok: true };
}

export async function deleteReminder(reminderId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error, count } = await supabase.from("reminders").delete({ count: "exact" }).eq("id", reminderId);
  if (error) return fail(error);
  if (!count) return { ok: false, error: "Anımsatıcıyı yalnızca oluşturan kişi silebilir." };
  refresh();
  return { ok: true };
}

export async function setExtendedHours(on: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("set_extended_hours", { p_on: on });
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Kartlar: hastane/müşteri ve ürün
// ---------------------------------------------------------------------------

export type CardResult<T> = { ok: true; card: T } | { ok: false; error: string };

/** Benzersiz ad ve kullanımdaki kartın silinmesi hatalarını anlaşılır yazar. */
function cardFail(error: { code?: string; message?: string }, what: string) {
  if (error.code === "23505") return { ok: false as const, error: `Bu adla bir ${what} kartı zaten var.` };
  if (error.code === "23503") return { ok: false as const, error: `Bu ${what} kayıtlarda kullanıldığı için silinemez.` };
  return { ok: false as const, error: error.message ?? "Beklenmeyen bir hata oluştu." };
}

export interface CustomerInput {
  id?: string;
  name: string;
  city: string;
  district: string;
  contact_name: string;
  contact_phone: string;
}

export async function saveCustomer(input: CustomerInput): Promise<CardResult<Customer>> {
  const { supabase } = await requireUser();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Hastane / müşteri adı gerekli." };
  const phone = input.contact_phone.trim() ? normalizePhone(input.contact_phone) : "";
  if (phone === null) return { ok: false, error: PHONE_ERROR };
  const fields = {
    name,
    city: input.city.trim() || null,
    district: input.district.trim() || null,
    contact_name: input.contact_name.trim() || null,
    contact_phone: phone || null,
  };
  const cols = "id, name, city, district, contact_name, contact_phone";
  const { data, error } = input.id
    ? await supabase.from("customers").update(fields).eq("id", input.id).select(cols).single<Customer>()
    : await supabase.from("customers").insert(fields).select(cols).single<Customer>();
  if (error) return cardFail(error, "hastane / müşteri");
  refresh();
  return { ok: true, card: data };
}

export async function deleteCustomer(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("customers").delete().eq("id", id);
  if (error) return cardFail(error, "hastane / müşteri");
  refresh();
  return { ok: true };
}

export interface ProductInput {
  id?: string;
  name: string;
  unit: string;
}

export async function saveProduct(input: ProductInput): Promise<CardResult<Product>> {
  const { supabase } = await requireUser();
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Ürün adı gerekli." };
  const fields = { name, unit: (UNITS as readonly string[]).includes(input.unit) ? input.unit : "Adet" };
  const { data, error } = input.id
    ? await supabase.from("products").update(fields).eq("id", input.id).select("id, name, unit").single<Product>()
    : await supabase.from("products").insert(fields).select("id, name, unit").single<Product>();
  if (error) return cardFail(error, "ürün");
  refresh();
  return { ok: true, card: data };
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) return cardFail(error, "ürün");
  refresh();
  return { ok: true };
}
