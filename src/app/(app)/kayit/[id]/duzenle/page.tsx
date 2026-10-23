import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { RecordForm } from "@/components/record-form";
import type { SalesRecord } from "@/lib/types";

export default async function EditRecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();
  const { data: r } = await supabase.from("records").select("*, record_lines(*)").eq("id", id).single<SalesRecord>();
  if (!r) notFound();
  const lines = [...(r.record_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <>
      <PageHeader title="Kaydı düzenle" subtitle={r.hospital} back={`/kayit/${id}`} />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <RecordForm
          lockedType
          initial={{
            id: r.id,
            type: r.type,
            record_date: r.record_date,
            file_no: r.file_no ?? "",
            hospital: r.hospital,
            contact_name: r.contact_name ?? "",
            contact_phone: r.contact_phone ?? "",
            contact_ext: r.contact_ext ?? "",
            notes: r.notes ?? "",
            lines: lines.map((l) => ({
              product_name: l.product_name,
              quantity: Number(l.quantity),
              unit: l.unit,
              unit_price: Number(l.unit_price),
              currency: l.currency,
            })),
          }}
        />
      </main>
    </>
  );
}
