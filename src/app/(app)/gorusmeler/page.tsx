import type { Metadata } from "next";
import { MessagesSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Görüşmeler" };

/** Görüşmeler bölümü. İçeriği Bülent'in tarifiyle doldurulacak; şimdilik yer tutucu. */
export default async function MeetingsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Görüşmeler" />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <EmptyState icon={<MessagesSquare size={26} />} title="Görüşmeler yakında" text="Bu bölümün içeriği hazırlanıyor." />
      </main>
    </>
  );
}
