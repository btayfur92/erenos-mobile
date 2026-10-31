import Link from "next/link";
import { Search } from "lucide-react";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ShipmentCard } from "@/components/shipment-card";
import { ManualShipmentCard } from "@/components/manual-shipment-card";
import { AddShipment } from "@/components/add-shipment";
import { canDeliver, canSell, type ManualShipment, type Profile, type Shipment } from "@/lib/types";

export const metadata: Metadata = { title: "Sevkiyat" };

/**
 * Sevkiyat programı. Gidecek (onaylanan doğrudan teminlerden aktarılan ya da elle eklenen) ve gelecek
 * (tedarikçiden bize) sevkiyatlar tek listede, tarih sırasıyla: bekleyenlerde en yakın tarih üstte, tamamlananlarda en son teslim üstte.
 */
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ d?: string; q?: string }> }) {
  const { d, q = "" } = await searchParams;
  const done = d === "tamam" || d === "teslim";
  const { supabase, profile } = await requireUser();
  const deliverer = canDeliver(profile.role);
  const seller = canSell(profile.role);

  const [{ data: outgoing }, { data: manual }, { data: profiles }] = await Promise.all([
    done
      ? supabase
          .from("shipments")
          .select("*, records(id, hospital, file_no, record_date), shipment_items(*, record_lines(product_name, unit, region))")
          .eq("status", "teslim_edildi")
          .order("delivered_at", { ascending: false })
          .limit(q ? 1000 : 200)
          .returns<Shipment[]>()
      : supabase
          .from("shipments")
          .select("*, records(id, hospital, file_no, record_date), shipment_items(*, record_lines(product_name, unit, region))")
          .eq("status", "sevk_bekliyor")
          .order("planned_date", { ascending: true })
          .order("requested_at", { ascending: true })
          .limit(q ? 1000 : 200)
          .returns<Shipment[]>(),
    done
      ? supabase
          .from("manual_shipments")
          .select("*, manual_shipment_deliveries(*)")
          .eq("status", "tamamlandi")
          .order("completed_at", { ascending: false })
          .limit(q ? 1000 : 200)
          .returns<ManualShipment[]>()
      : supabase
          .from("manual_shipments")
          .select("*, manual_shipment_deliveries(*)")
          .eq("status", "bekliyor")
          .order("due_date", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(q ? 1000 : 200)
          .returns<ManualShipment[]>(),
    supabase.from("profiles").select("id, full_name, username").returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));
  // Arama: hastane / firma, dosya no, ürün ve not içinde (büyük-küçük harf ve Türkçe karakter duyarsız).
  const norm = (v: string | null | undefined) => (v ?? "").toLocaleLowerCase("tr");
  const term = norm(q.trim());
  const has = (...vals: (string | null | undefined)[]) => !term || vals.some((v) => norm(v).includes(term));
  const list = [
    ...(outgoing ?? [])
      .filter((s) =>
        has(s.records?.hospital, s.records?.file_no, s.note, ...(s.shipment_items ?? []).map((i) => i.record_lines?.product_name)),
      )
      .map((s) => ({
        at: (done ? s.delivered_at : s.planned_date) ?? "",
        node: <ShipmentCard key={`s-${s.id}`} shipment={s} names={names} showRecord canDeliver={deliverer} canCancel={seller} />,
      })),
    ...(manual ?? [])
      .filter((m) => has(m.party, m.product_details, m.note))
      .map((m) => ({
        at: (done ? m.completed_at : m.due_date) ?? "",
        node: <ManualShipmentCard key={`m-${m.id}`} item={m} names={names} canDeliver={deliverer} />,
      })),
  ].sort((x, y) => (done ? y.at.localeCompare(x.at) : x.at.localeCompare(y.at)));

  return (
    <>
      <PageHeader title="Sevkiyat" subtitle={done ? "Tamamlanan sevkiyatlar" : "Sevkiyat programı"} action={<AddShipment />} />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <form className="relative mb-3" action="">
          {done && <input type="hidden" name="d" value="tamam" />}
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Hastane, firma, dosya no veya ürün ara"
            className="input pl-10"
            type="search"
            enterKeyHint="search"
          />
        </form>
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
          <Link
            href={q ? `/sevkiyat?q=${encodeURIComponent(q)}` : "/sevkiyat"}
            prefetch
            className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${!done ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
          >
            Bekleyen Sevkiyatlar
          </Link>
          <Link
            href={`/sevkiyat?d=tamam${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            prefetch
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
                term
                  ? "Aramayla eşleşen sevkiyat yok."
                  : done
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
