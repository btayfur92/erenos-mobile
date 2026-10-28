import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { fetchCards } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { CardManager } from "@/components/cards";

export const metadata: Metadata = { title: "Hastaneler / Müşteriler" };

/** Hastane / müşteri kartları. Kayıtta veya görüşmede kullanılan kart silinemez, adı değişince kayıtlardaki ad da değişir. */
export default async function CustomersPage() {
  const { supabase } = await requireUser();
  const [{ customers }, { data: recs }, { data: meets }] = await Promise.all([
    fetchCards(supabase),
    supabase.from("records").select("customer_id").not("customer_id", "is", null).limit(20000),
    supabase.from("meetings").select("customer_id").not("customer_id", "is", null).limit(20000),
  ]);
  const usage: Record<string, number> = {};
  for (const x of [...(recs ?? []), ...(meets ?? [])]) usage[x.customer_id] = (usage[x.customer_id] ?? 0) + 1;

  return (
    <>
      <PageHeader title="Hastaneler / Müşteriler" subtitle="Kartlar" back="/ayarlar" />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <CardManager kind="customer" cards={customers} usage={usage} />
      </main>
    </>
  );
}
