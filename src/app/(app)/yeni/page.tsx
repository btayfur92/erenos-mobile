import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { RecordForm } from "@/components/record-form";
import { todayIstanbul } from "@/lib/format";
import { requireUser } from "@/lib/auth";
import { fetchCards } from "@/lib/queries";

export const metadata: Metadata = { title: "Yeni kayıt" };

export default async function NewRecordPage({ searchParams }: { searchParams: Promise<{ tip?: string }> }) {
  const { tip } = await searchParams;
  const { supabase } = await requireUser();
  const { customers, products } = await fetchCards(supabase);
  return (
    <>
      <PageHeader title="Yeni kayıt" back="/" />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <RecordForm
          customers={customers}
          products={products}
          initial={{
            type:
              tip === "ym"
                ? "yaklasik_maliyet"
                : tip === "gs"
                  ? "genel_siparis"
                  : tip === "ihale"
                    ? "ihale_siparisi"
                    : tip === "dmo"
                      ? "dmo_ihalesi"
                      : "dogrudan_temin",
            record_date: todayIstanbul(),
          }}
        />
      </main>
    </>
  );
}
