import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineProgress } from "./types";

/** Verilen kayıtların kalem ilerlemelerini line_id -> progress olarak döndürür. */
export async function fetchProgress(supabase: SupabaseClient, recordIds: string[]) {
  const map = new Map<string, LineProgress>();
  if (!recordIds.length) return map;
  const { data } = await supabase.from("line_progress").select("*").in("record_id", recordIds);
  for (const p of (data ?? []) as LineProgress[]) map.set(p.line_id, p);
  return map;
}
