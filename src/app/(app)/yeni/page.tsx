import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { RecordForm } from "@/components/record-form";
import { todayIstanbul } from "@/lib/format";

export const metadata: Metadata = { title: "Yeni kayıt" };

export default async function NewRecordPage({ searchParams }: { searchParams: Promise<{ tip?: string }> }) {
  const { tip } = await searchParams;
  return (
    <>
      <PageHeader title="Yeni kayıt" back="/" />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <RecordForm initial={{ type: tip === "ym" ? "yaklasik_maliyet" : "dogrudan_temin", record_date: todayIstanbul() }} />
      </main>
    </>
  );
}
