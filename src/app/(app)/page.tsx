import Link from "next/link";
import { FileText, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fetchProgress } from "@/lib/queries";
import { PageHeader } from "@/components/page-header";
import { RecordCard } from "@/components/record-card";
import { EmptyState } from "@/components/empty-state";
import type { SalesRecord } from "@/lib/types";

const FILTERS = [
  { key: "tumu", label: "Tümü" },
  { key: "arama", label: "Arama bekleyen" },
  { key: "dt", label: "Doğrudan Temin" },
  { key: "ym", label: "Yaklaşık Maliyet" },
  { key: "onay", label: "Onaylanan" },
] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string }> }) {
  const { f = "tumu", q = "" } = await searchParams;
  const { supabase, profile } = await requireUser();

  let query = supabase
    .from("records")
    .select("*, record_lines(*)")
    .in("type", ["yaklasik_maliyet", "dogrudan_temin"])
    .neq("status", "reddedildi")
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  if (f === "arama") query = query.eq("status", "arama_bekliyor");
  if (f === "dt") query = query.eq("type", "dogrudan_temin");
  if (f === "ym") query = query.eq("type", "yaklasik_maliyet");
  if (f === "onay") query = query.eq("status", "onaylandi");

  const term = q.trim().replace(/[%,()]/g, " ");
  if (term) {
    const { data: hits } = await supabase.from("record_lines").select("record_id").ilike("product_name", `%${term}%`).limit(500);
    const ids = [...new Set((hits ?? []).map((h) => h.record_id))];
    const ors = [`hospital.ilike.%${term}%`, `file_no.ilike.%${term}%`, `contact_name.ilike.%${term}%`];
    if (ids.length) ors.push(`id.in.(${ids.join(",")})`);
    query = query.or(ors.join(","));
  }

  const [{ data: records }, { count: waitingCount }] = await Promise.all([
    query.returns<SalesRecord[]>(),
    supabase.from("records").select("id", { count: "exact", head: true }).eq("status", "arama_bekliyor"),
  ]);
  const progress = await fetchProgress(
    supabase,
    (records ?? []).filter((r) => r.status === "onaylandi").map((r) => r.id),
  );

  const firstName = (profile.full_name || profile.username).split(" ")[0];

  return (
    <>
      <PageHeader title="Satış Takibi" subtitle={`Merhaba ${firstName}`} />
      <main className="mx-auto max-w-xl px-4 pt-4">
        {!!waitingCount && f !== "arama" && (
          <Link
            href="/?f=arama"
            className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-accent-600 to-accent-500 p-4 text-white shadow-card"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/20 text-lg font-bold">{waitingCount}</span>
            <span className="text-[14px] leading-snug">
              <b className="block text-[15px]">Aranması gereken hastane var</b>
              Doğrudan teminlerin sonucunu öğrenmek için arayın.
            </span>
          </Link>
        )}

        <form className="relative" action="">
          {f !== "tumu" && <input type="hidden" name="f" value={f} />}
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder="Hastane, dosya no veya ürün ara" className="input pl-10" type="search" enterKeyHint="search" />
        </form>

        <div className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {FILTERS.map((x) => {
            const params = new URLSearchParams();
            if (x.key !== "tumu") params.set("f", x.key);
            if (q) params.set("q", q);
            const active = f === x.key;
            return (
              <Link
                key={x.key}
                href={`/${params.size ? `?${params}` : ""}`}
                className={`chip ${active ? "bg-brand-600 text-white shadow-sm" : "bg-white text-ink/80 ring-1 ring-line"}`}
              >
                {x.label}
                {x.key === "arama" && !!waitingCount && (
                  <span className={`rounded-full px-1.5 text-[11px] font-bold ${active ? "bg-white/25" : "bg-accent-600 text-white"}`}>
                    {waitingCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        <div className="mt-4 space-y-3">
          {records?.length ? (
            records.map((r) => <RecordCard key={r.id} record={r} progress={progress} />)
          ) : (
            <EmptyState
              icon={<FileText size={26} />}
              title={term ? "Sonuç bulunamadı" : "Henüz kayıt yok"}
              text={term ? "Farklı bir arama deneyin." : "İlk yaklaşık maliyet veya doğrudan temin kaydını ekleyin."}
            >
              {!term && (
                <Link href="/yeni" className="btn-primary">
                  Yeni kayıt
                </Link>
              )}
            </EmptyState>
          )}
        </div>
      </main>
    </>
  );
}
