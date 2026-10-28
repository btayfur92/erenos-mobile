import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Customer, LineProgress, Product } from "./types";

/** Verilen kayıtların kalem ilerlemelerini line_id -> progress olarak döndürür. */
export async function fetchProgress(supabase: SupabaseClient, recordIds: string[]) {
  const map = new Map<string, LineProgress>();
  if (!recordIds.length) return map;
  const { data } = await supabase.from("line_progress").select("*").in("record_id", recordIds);
  for (const p of (data ?? []) as LineProgress[]) map.set(p.line_id, p);
  return map;
}

/** Seçmeli alanlar için tüm hastane/müşteri ve ürün kartları (Türkçe alfabetik). */
export async function fetchCards(supabase: SupabaseClient) {
  const [{ data: customers }, { data: products }] = await Promise.all([
    supabase.from("customers").select("id, name, city, district, contact_name, contact_phone").limit(5000),
    supabase.from("products").select("id, name, unit").limit(5000),
  ]);
  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "tr");
  return {
    customers: ((customers ?? []) as Customer[]).sort(byName),
    products: ((products ?? []) as Product[]).sort(byName),
  };
}
