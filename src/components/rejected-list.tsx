import Link from "next/link";
import { Archive } from "lucide-react";
import type { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/empty-state";
import { formatDate, formatMoney, formatQty } from "@/lib/format";
import type { RecordLine, SalesRecord } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

type Row = RecordLine & { records: Pick<SalesRecord, "id" | "hospital" | "file_no" | "record_date" | "status" | "created_at"> };

/**
 * Reddedilen doğrudan teminlerin kalemleri ve onaylanan teminlerde onaylanmayan kalemler:
 * "hangi ürüne hangi fiyatı verdik, reddedildi" bilgisini ürün ve hastane bazında arar.
 * Ana ekrandaki "Reddedilen" sekmesinde gösterilir.
 */
export async function RejectedList({ supabase, term }: { supabase: SupabaseClient; term: string }) {
  let query = supabase
    .from("record_lines")
    .select("*, records!inner(id, hospital, file_no, record_date, status, type, created_at)")
    .eq("records.type", "dogrudan_temin")
    .eq("approved", false)
    .in("records.status", ["reddedildi", "onaylandi"])
    .order("created_at", { ascending: false })
    .limit(300);
  if (term) query = query.or(`product_name.ilike.%${term}%`);

  const { data } = await query.returns<Row[]>();
  let rows = data ?? [];
  if (term) {
    // Hastane adına göre de ara
    const { data: byHospital } = await supabase
      .from("record_lines")
      .select("*, records!inner(id, hospital, file_no, record_date, status, type, created_at)")
      .eq("records.type", "dogrudan_temin")
      .eq("approved", false)
      .in("records.status", ["reddedildi", "onaylandi"])
      .ilike("records.hospital", `%${term}%`)
      .order("created_at", { ascending: false })
      .limit(300)
      .returns<Row[]>();
    const seen = new Set(rows.map((r) => r.id));
    rows = [...rows, ...(byHospital ?? []).filter((r) => !seen.has(r.id))];
  }
  // En yeni tarih en üstte; aynı gündekilerde son girilen önce.
  rows.sort(
    (a, b) => b.records.record_date.localeCompare(a.records.record_date) || b.records.created_at.localeCompare(a.records.created_at),
  );

  // Kayıt bazında grupla
  const groups = new Map<string, { rec: Row["records"]; lines: Row[] }>();
  for (const r of rows) {
    const g = groups.get(r.records.id) ?? { rec: r.records, lines: [] };
    g.lines.push(r);
    groups.set(r.records.id, g);
  }

  return (
    <div className="mt-4 space-y-3">
      {groups.size ? (
        [...groups.values()].map(({ rec, lines }) => (
          <Link key={rec.id} href={`/kayit/${rec.id}`} className="card block p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-[15px] font-semibold">{rec.hospital}</h3>
                <p className="text-[12px] text-muted">
                  {formatDate(rec.record_date)}
                  {rec.file_no ? ` · ${rec.file_no}` : ""}
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                  rec.status === "reddedildi" ? "bg-accent-50 text-accent-700" : "bg-amber-50 text-amber-700"
                }`}
              >
                {rec.status === "reddedildi" ? "Reddedildi" : "Kısmen onaylandı"}
              </span>
            </div>
            <ul className="mt-3 divide-y divide-line/70 rounded-xl bg-canvas px-3">
              {lines.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
                  <span className="min-w-0">
                    <span className="block truncate">{l.product_name}</span>
                    <span className="text-[12px] text-muted">
                      {formatQty(l.quantity)} {l.unit}
                    </span>
                  </span>
                  <b className="shrink-0 font-semibold tabular-nums">{formatMoney(l.unit_price, l.currency)}</b>
                </li>
              ))}
            </ul>
          </Link>
        ))
      ) : (
        <EmptyState
          icon={<Archive size={26} />}
          title={term ? "Sonuç bulunamadı" : "Reddedilen kayıt yok"}
          text={term ? undefined : "Reddedilen doğrudan teminler fiyatlarıyla birlikte burada saklanır."}
        />
      )}
    </div>
  );
}
