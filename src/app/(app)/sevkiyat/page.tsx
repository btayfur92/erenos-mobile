import Link from "next/link";
import type { Metadata } from "next";
import { PackageOpen, Truck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ShipmentCard } from "@/components/shipment-card";
import { IncomingCard } from "@/components/incoming-card";
import { AddIncoming } from "@/components/add-incoming";
import type { IncomingShipment, Profile, Shipment } from "@/lib/types";

export const metadata: Metadata = { title: "Sevkiyat" };

/**
 * Sevkiyat programı. Gidecek: onaylanan doğrudan teminlerden hastaneye gidecekler.
 * Gelecek: tedarikçiden bize gelecekler. Bekleyenlerde en yakın tarih üstte, aşağı doğru ileri tarihler;
 * tamamlananlarda en son teslim üstte.
 */
export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const done = d === "tamam" || d === "teslim";
  const { supabase } = await requireUser();

  const [{ data: outgoing }, { data: incoming }, { data: profiles }] = await Promise.all([
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
          .from("incoming_shipments")
          .select("*")
          .eq("status", "teslim_alindi")
          .order("received_at", { ascending: false })
          .limit(200)
          .returns<IncomingShipment[]>()
      : supabase
          .from("incoming_shipments")
          .select("*")
          .eq("status", "bekliyor")
          .order("expected_date", { ascending: true })
          .order("created_at", { ascending: true })
          .limit(200)
          .returns<IncomingShipment[]>(),
    supabase.from("profiles").select("id, full_name, username").returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));

  return (
    <>
      <PageHeader title="Sevkiyat" subtitle={done ? "Tamamlanan sevkiyatlar" : "Sevkiyat programı"} action={<AddIncoming />} />
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

        <Section icon={<Truck size={16} />} title="Gidecek sevkiyatlar" count={outgoing?.length ?? 0}>
          {outgoing?.length ? (
            outgoing.map((s) => <ShipmentCard key={s.id} shipment={s} names={names} showRecord />)
          ) : (
            <Empty text={done ? "Teslim edilen sevkiyat yok." : "Onaylanan doğrudan teminlerden sevkiyata aktarılanlar burada görünür."} />
          )}
        </Section>

        <Section icon={<PackageOpen size={16} />} title="Gelecek sevkiyatlar" count={incoming?.length ?? 0}>
          {incoming?.length ? (
            incoming.map((i) => <IncomingCard key={i.id} item={i} names={names} />)
          ) : (
            <Empty
              text={done ? "Teslim alınan sevkiyat yok." : "Tedarikçiden gelecek ürünleri sağ üstteki “Gelecek” düğmesiyle ekleyin."}
            />
          )}
        </Section>
      </main>
    </>
  );
}

function Section({ icon, title, count, children }: { icon: React.ReactNode; title: string; count: number; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-bold uppercase tracking-wider text-muted">
        {icon} {title}
        <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-[12px] font-semibold normal-case tracking-normal text-ink/70 ring-1 ring-line">
          {count}
        </span>
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-line bg-white/60 px-4 py-5 text-center text-[13px] text-muted">{text}</p>;
}
