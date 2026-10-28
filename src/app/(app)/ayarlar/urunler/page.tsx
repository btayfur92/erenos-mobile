import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { fetchCards } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { CardManager } from "@/components/cards";

export const metadata: Metadata = { title: "Ürünler" };

/** Ürün kartları. Kalemde kullanılan kart silinemez, adı değişince kalemlerdeki ad da değişir. */
export default async function ProductsPage() {
  const { supabase } = await requireUser();
  const [{ products }, { data: lines }] = await Promise.all([
    fetchCards(supabase),
    supabase.from("record_lines").select("product_id").not("product_id", "is", null).limit(50000),
  ]);
  const usage: Record<string, number> = {};
  for (const x of lines ?? []) usage[x.product_id] = (usage[x.product_id] ?? 0) + 1;

  return (
    <>
      <PageHeader title="Ürünler" subtitle="Kartlar" back="/ayarlar" />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <CardManager kind="product" cards={products} usage={usage} />
      </main>
    </>
  );
}
