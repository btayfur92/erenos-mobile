import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ShipmentCard } from "@/components/shipment-card";
import { ManualShipmentCard } from "@/components/manual-shipment-card";
import { AddShipment } from "@/components/add-shipment";
import type { ManualShipment, Profile, Shipment } from "@/lib/types";

export const metadata: Metadata = { title: "Sevkiyat" };

/**
 * Sevkiyat programı. Gidecek (onaylanan doğrudan teminlerden aktarılan ya da elle eklenen) ve gelecek
 * (tedarikçiden bize) sevkiyatlar tek listede, tarih sırasıyla: bekleyenlerde en yakın tarih üstte, tamamlananlarda en son teslim üstte.
 */
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const done = d === "tamam" || d === "teslim";
  const { supabase } = await requireUser();

  const [{ data: outgoing }, { data: manual }, { data: profiles }] = await Promise.all([
    done
      ? supabase
          .from("shipments")
          .select("*, records(id, hospital, file_no, record_date), shipment_items(*, record_lines(product_name, unit))")
          .eq("status", "teslim_edildi")
          .order("delivered_at", { ascending: false })
          .limit(200)
          .returns<Shipment[]>()
      : supabase
          .from("shipments")
          .select("*, records(id, hospital, file_no, record_date), shipment_items(*, record_lines(product_name, unit))")
          .eq("status", "sevk_bekliyor")
          .order("planned_date", { ascending: true })
          .order("requested_at", { ascending: true })
          .limit(200)
          .returns<Shipment[]>(),
    done
      ? supabase
          .from("manual_shipments")
          .select("*")
          .eq("status", "tamamlandi")
          .order("completed_at", { ascending: false })
          .limit(200)
          .returns<ManualShipment[]>()
      : supabase
          .from("manual_shipments")
          .select("*")
          .eq("status", "bekliyor")
          .order("due_date", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(200)
          .returns<ManualShipment[]>(),
    supabase.from("profiles").select("id, full_name, username").returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));
  const list = [
    ...(outgoing ?? []).map((s) => ({
      at: (done ? s.delivered_at : s.planned_date) ?? "",
      node: <ShipmentCard key={`s-${s.id}`} shipment={s} names={names} showRecord />,
    })),
    ...(manual ?? []).map((m) => ({
      at: (done ? m.completed_at : m.due_date) ?? "",
      node: <ManualShipmentCard key={`m-${m.id}`} item={m} names={names} />,
    })),
  ].sort((x, y) => (done ? y.at.localeCompare(x.at) : x.at.localeCompare(y.at)));

  return (
    <>
      <PageHeader title="Sevkiyat" subtitle={done ? "Tamamlanan sevkiyatlar" : "Sevkiyat programı"} action={<AddShipment />} />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
          <Link
            href="/sevkiyat"
            className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${!done ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
          >
            Bekleyen Sevkiyatlar
          </Link>
          <Link
            href="/sevkiyat?d=tamam"
            className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${done ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
          >
            Tamamlanan Sevkiyatlar
          </Link>
        </div>

        <div className="mt-5 space-y-3">
          {list.length ? (
            list.map((x) => x.node)
          ) : (
            <Empty
              text={
                done
                  ? "Tamamlanan sevkiyat yok."
                  : "Doğrudan teminden aktarılanlar ve sağ üstteki “Ekle” düğmesiyle eklenen gelecek ve gidecek sevkiyatlar burada tarih sırasıyla görünür."
              }
            />
          )}
        </div>
      </main>
    </>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line bg-white/60 px-4 py-5 text-center text-[13px] text-muted">{text}</p>;
}
