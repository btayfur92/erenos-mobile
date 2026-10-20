import Link from "next/link";
import type { Metadata } from "next";
import { Truck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { ShipmentCard } from "@/components/shipment-card";
import { EmptyState } from "@/components/empty-state";
import type { Profile, Shipment } from "@/lib/types";

export const metadata: Metadata = { title: "Sevkiyat" };

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  const delivered = d === "teslim";
  const { supabase } = await requireUser();

  const [{ data: shipments }, { data: profiles }] = await Promise.all([
    supabase
      .from("shipments")
      .select("*, records(id, hospital, file_no, record_date), shipment_items(*, record_lines(product_name, unit))")
      .eq("status", delivered ? "teslim_edildi" : "sevk_bekliyor")
      .order(delivered ? "delivered_at" : "requested_at", { ascending: !delivered })
      .limit(200)
      .returns<Shipment[]>(),
    supabase.from("profiles").select("id, full_name, username").returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));

  return (
    <>
      <PageHeader title="Sevkiyat" subtitle={delivered ? "Teslim edilenler" : "Hastanelerin istediği ürünler"} />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
          <Link href="/sevkiyat" className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${!delivered ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}>
            Sevk bekleyen
          </Link>
          <Link href="/sevkiyat?d=teslim" className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${delivered ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}>
            Teslim edilen
          </Link>
        </div>
        <div className="mt-4 space-y-3">
          {shipments?.length ? (
            shipments.map((s) => <ShipmentCard key={s.id} shipment={s} names={names} showRecord />)
          ) : (
            <EmptyState
              icon={<Truck size={26} />}
              title={delivered ? "Teslim edilen sevkiyat yok" : "Bekleyen sevkiyat yok"}
              text={delivered ? undefined : "Onaylanan doğrudan teminlerden hastanenin istediği miktarlar burada görünür."}
            />
          )}
        </div>
      </main>
    </>
  );
}
