"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sendToAll, type PushPayload } from "@/lib/push";
import { RECORD_TYPE_LABEL, type ManualDirection, type RecordType } from "@/lib/types";
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

function refresh() {
  revalidatePath("/", "layout");
}

export interface LineInput {
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  currency: string;
}

export interface RecordInput {
  id?: string;
  type: RecordType;
  record_date: string;
  file_no: string;
  hospital: string;
  contact_name: string;
  contact_phone: string;
  contact_ext: string;
  notes: string;
  lines: LineInput[];
}

export async function saveRecord(input: RecordInput): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!input.hospital.trim()) return { ok: false, error: "Hastane adı gerekli." };
  const lines = input.lines.filter((l) => l.product_name.trim());
  if (!lines.length) return { ok: false, error: "En az bir ürün kalemi girin." };
  if (lines.some((l) => !(Number(l.quantity) > 0))) return { ok: false, error: "Ürün miktarları sıfırdan büyük olmalı." };
  if (lines.some((l) => !(Number(l.unit_price) >= 0))) return { ok: false, error: "Fiyatları kontrol edin." };
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
  return { ok: true, id: data as string };
}

export async function logCall(recordId: string, note: string, keepReminding: boolean): Promise<ActionResult> {
  const { supabase } = await requireUser();
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

export async function setResult(
  recordId: string,
  approved: boolean,
  note: string,
  lines: { line_id: string; approved_qty: number }[],
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data: before } = await supabase.from("records").select("status").eq("id", recordId).single();
  const wasDecided = before?.status === "onaylandi" || before?.status === "reddedildi";
  const { error } = await supabase.rpc("set_dt_result", {
    p_record_id: recordId,
    p_approved: approved,
    p_note: note,
    p_lines: approved ? lines : null,
  });
  if (error) return fail(error);

  const { data: rec } = await supabase.from("records").select("hospital, file_no").eq("id", recordId).single();
  notify(
    {
      title: wasDecided ? "Doğrudan temin sonucu güncellendi" : approved ? "Doğrudan temin onaylandı" : "Doğrudan temin reddedildi",
      body: `${rec?.hospital ?? ""}${rec?.file_no ? ` · ${rec.file_no}` : ""}${approved ? ` · ${lines.length} kalem onaylandı` : ""}`,
      url: `/kayit/${recordId}`,
    },
    user.id,
  );
  refresh();
  return { ok: true };
}

export async function createShipment(
  recordId: string,
  note: string,
  items: { line_id: string; quantity: number }[],
  plannedDate: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
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
  const { supabase, user } = await requireUser();
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
  const { supabase } = await requireUser();
  const { error } = await supabase.from("shipments").delete().eq("id", shipmentId).eq("status", "sevk_bekliyor");
  if (error) return fail(error);
  refresh();
  return { ok: true };
}

/** Yaklaşık maliyet yalnızca takip amaçlı: onaylandı / reddedildi ya da tekrar açık. */
export async function setYmStatus(recordId: string, status: "acik" | "onaylandi" | "reddedildi"): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("records")
    .update({ status, result_at: status === "acik" ? null : new Date().toISOString() })
    .eq("id", recordId)
    .eq("type", "yaklasik_maliyet")
    .select("hospital, file_no")
    .single();
  if (error) return fail(error);
  if (status !== "acik") {
    notify(
      {
        title: status === "onaylandi" ? "Yaklaşık maliyet onaylandı" : "Yaklaşık maliyet reddedildi",
        body: `${data.hospital}${data.file_no ? ` · ${data.file_no}` : ""}`,
        url: `/kayit/${recordId}`,
      },
      user.id,
    );
  }
  refresh();
  return { ok: true };
}

export async function deleteRecord(recordId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
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
  quantity: number | null;
  unit: string;
  due_date: string;
  note: string;
}

function checkManual(input: ManualShipmentInput): string | null {
  if (input.direction !== "gelecek" && input.direction !== "gidecek") return "Sevkiyat türünü seçin.";
  const gelecek = input.direction === "gelecek";
  if (!input.party.trim()) return gelecek ? "Tedarikçi adı gerekli." : "Hastane / alıcı adı gerekli.";
  if (!input.product_details.trim()) return "Ürün detayını girin.";
  if (input.quantity !== null && !(input.quantity > 0)) return "Miktar sıfırdan büyük olmalı ya da boş bırakılmalı.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.due_date)) return gelecek ? "Beklenen tarihi seçin." : "Sevk tarihini seçin.";
  return null;
}

const manualFields = (input: ManualShipmentInput) => ({
  party: input.party.trim(),
  product_details: input.product_details.trim(),
  quantity: input.quantity,
  unit: input.quantity !== null ? input.unit : null,
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

/** Gelecekte "Teslim alındı", gidecekte "Teslim edildi". */
export async function completeManualShipment(id: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase
    .from("manual_shipments")
    .update({ status: "tamamlandi", completed_at: new Date().toISOString(), completed_by: user.id })
    .eq("id", id)
    .eq("status", "bekliyor")
    .select("direction, party, product_details")
    .single();
  if (error) return fail(error);
  const verb = data.direction === "gelecek" ? "teslim alındı" : "teslim edildi";
  notify({ title: `Sevkiyat ${verb}: ${data.party}`, body: data.product_details, url: "/sevkiyat?d=tamam" }, user.id);
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
