import Link from "next/link";
import { CheckCircle2, Clock, FileText, Search, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fetchProgress } from "@/lib/queries";
import { getRates } from "@/lib/fx";
import { PageHeader } from "@/components/page-header";
import { RecordCard } from "@/components/record-card";
import { EmptyState } from "@/components/empty-state";
import { ChipStrip } from "@/components/chip-strip";
import { RejectedList } from "@/components/rejected-list";
import type { SalesRecord } from "@/lib/types";

const FILTERS = [
  { key: "gundem", label: "Gündemdekiler" },
  { key: "dt", label: "Doğrudan Temin" },
  { key: "ym", label: "Yaklaşık Maliyet" },
  { key: "arama", label: "Arama bekleyen" },
  { key: "red", label: "Reddedilen" },
] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; d?: string }> }) {
  const { f = "gundem", q = "", d: dParam } = await searchParams;
  // Doğrudan Temin sekmesi sonuçlanmış kayıtları Onaylanan / Reddedilen olarak ayırır.
  // Yaklaşık maliyetler Gündem'e girmez; kendi sekmesinde Bekleyen / Onaylanan / Reddedilen olarak durur.
  const d = dParam ?? (f === "ym" ? "bekle" : "onay");
  const resolved = d === "red" ? "reddedildi" : d === "bekle" && f === "ym" ? "acik" : "onaylandi";
  const { supabase, profile } = await requireUser();

  let query = supabase
    .from("records")
    .select("*, record_lines(*)")
    .in("type", ["yaklasik_maliyet", "dogrudan_temin"])
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  // Gündem: henüz sonuçlanmamış doğrudan teminler.
  if (f === "gundem") query = query.eq("type", "dogrudan_temin").in("status", ["arama_bekliyor", "arandi"]);
  if (f === "arama") query = query.eq("status", "arama_bekliyor");
  if (f === "dt") query = query.eq("type", "dogrudan_temin").eq("status", resolved);
  if (f === "ym") query = query.eq("type", "yaklasik_maliyet").eq("status", resolved);

  const term = q.trim().replace(/[%,()]/g, " ");
  if (term) {
    const { data: hits } = await supabase.from("record_lines").select("record_id").ilike("product_name", `%${term}%`).limit(500);
    const ids = [...new Set((hits ?? []).map((h) => h.record_id))];
    const ors = [`hospital.ilike.%${term}%`, `file_no.ilike.%${term}%`, `contact_name.ilike.%${term}%`];
    if (ids.length) ors.push(`id.in.(${ids.join(",")})`);
    query = query.or(ors.join(","));
  }

  // "Reddedilen" sekmesi kayıt yerine fiyat arşivini (RejectedList) gösterir.
  const [{ data: records }, { count: waitingCount }] = await Promise.all([
    f === "red" ? Promise.resolve({ data: [] as SalesRecord[] }) : query.returns<SalesRecord[]>(),
    supabase.from("records").select("id", { count: "exact", head: true }).eq("status", "arama_bekliyor"),
  ]);
  const [progress, rates] = await Promise.all([
    fetchProgress(
      supabase,
      (records ?? []).filter((r) => r.status === "onaylandi").map((r) => r.id),
    ),
    getRates(),
  ]);

  const firstName = (profile.full_name || profile.username).split(" ")[0];

  return (
    <>
      <PageHeader title="Satış Takibi" subtitle={`Merhaba ${firstName}`} />
      <main className="mx-auto max-w-xl px-4 pt-4">
        {!!waitingCount && (
          <Link
            href="/?f=arama"
            scroll={false}
            className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-accent-600 to-accent-500 px-2.5 py-1.5 text-white shadow-card"
          >
            <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-white/20 px-1.5 text-[15px] font-bold">{waitingCount}</span>
            <b className="text-[15px] font-semibold">Aranması gereken hastane var</b>
          </Link>
        )}

        <form className="relative" action="">
          {f !== "gundem" && <input type="hidden" name="f" value={f} />}
          {dParam && <input type="hidden" name="d" value={dParam} />}
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Hastane, dosya no veya ürün ara"
            className="input pl-10"
            type="search"
            enterKeyHint="search"
          />
        </form>

        <ChipStrip>
          {FILTERS.map((x) => {
            const params = new URLSearchParams();
            if (x.key !== "gundem") params.set("f", x.key);
            if (q) params.set("q", q);
            const active = f === x.key;
            return (
              <Link
                key={x.key}
                href={`/${params.size ? `?${params}` : ""}`}
                scroll={false}
                aria-current={active ? "page" : undefined}
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
        </ChipStrip>

        {(f === "dt" || f === "ym") && (
          <div className={`mt-3 grid gap-1 rounded-2xl bg-white p-1 ring-1 ring-line ${f === "ym" ? "grid-cols-3" : "grid-cols-2"}`}>
            {(
              [
                ...(f === "ym" ? ([["bekle", "Bekleyenler", Clock, "bg-brand-50 text-brand-700"]] as const) : []),
                ["onay", "Onaylananlar", CheckCircle2, "bg-emerald-50 text-emerald-700"],
                ["red", "Reddedilenler", XCircle, "bg-accent-50 text-accent-700"],
              ] as const
            ).map(([key, label, Icon, activeCls]) => {
              const params = new URLSearchParams({ f });
              if (key !== (f === "ym" ? "bekle" : "onay")) params.set("d", key);
              if (q) params.set("q", q);
              return (
                <Link
                  key={key}
                  href={`/?${params}`}
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold ${d === key ? activeCls : "text-muted"}`}
                >
                  <Icon size={16} /> {label}
                </Link>
              );
            })}
          </div>
        )}

        {f === "red" ? (
          <RejectedList supabase={supabase} term={term} />
        ) : (
          <div className="mt-4 space-y-3">
            {records?.length ? (
              records.map((r) => <RecordCard key={r.id} record={r} progress={progress} rates={rates} />)
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
        )}
      </main>
    </>
  );
}
