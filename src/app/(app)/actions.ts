"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { sendToAll, type PushPayload } from "@/lib/push";
import { RECORD_TYPE_LABEL, type RecordType } from "@/lib/types";
import { formatQty } from "@/lib/format";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function fail(error: unknown): ActionResult {
  const message =
    (error as { message?: string })?.message ?? (typeof error === "string" ? error : "Beklenmeyen bir hata oluştu.");
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

  const { data, error } = await supabase.rpc("save_record", {
    p_id: input.id ?? null,
    p_type: input.type,
    p_record_date: input.record_date,
    p_file_no: input.file_no,
    p_hospital: input.hospital,
    p_contact_name: input.contact_name,
    p_contact_phone: input.contact_phone,
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
      title: approved ? "Doğrudan temin onaylandı" : "Doğrudan temin reddedildi",
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
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc("create_shipment", {
    p_record_id: recordId,
    p_note: note,
    p_items: items.filter((i) => Number(i.quantity) > 0),
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

export async function convertToDt(recordId: string, recordDate: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  const { data, error } = await supabase.rpc("convert_ym_to_dt", { p_record_id: recordId, p_record_date: recordDate });
  if (error) return fail(error);
  const { data: rec } = await supabase.from("records").select("hospital, file_no").eq("id", data).single();
  notify(
    {
      title: "Yaklaşık maliyet doğrudan temine dönüştü",
      body: `${rec?.hospital ?? ""}${rec?.file_no ? ` · ${rec.file_no}` : ""}`,
      url: `/kayit/${data}`,
    },
    user.id,
  );
  refresh();
  return { ok: true, id: data as string };
}

export async function setYmStatus(recordId: string, status: "acik" | "ihale_donustu" | "kapandi"): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { error } = await supabase
    .from("records")
    .update({ status })
    .eq("id", recordId)
    .eq("type", "yaklasik_maliyet")
    .neq("status", "dt_donustu");
  if (error) return fail(error);
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
