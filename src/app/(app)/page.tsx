import Link from "next/link";
import { AlarmClock, ChartColumn, CheckCircle2, Clock, FileSignature, FileText, Gavel, Search, XCircle } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fetchProgress } from "@/lib/queries";
import { getRates } from "@/lib/fx";
import { PageHeader } from "@/components/page-header";
import { RecordCard } from "@/components/record-card";
import { EmptyState } from "@/components/empty-state";
import { ChipStrip } from "@/components/chip-strip";
import { RejectedList } from "@/components/rejected-list";
import { inLastMonth, isFullyDelivered, isTenderType, tenderAt, type SalesRecord } from "@/lib/types";
import { todayIstanbul } from "@/lib/format";

const FILTERS = [
  { key: "gundem", label: "Gündemdekiler" },
  { key: "ihale", label: "Hastane İhalesi" },
  { key: "dt", label: "Doğrudan Temin" },
  { key: "dmo", label: "DMO İhalesi" },
  { key: "gs", label: "Genel Satış" },
  { key: "ym", label: "Yaklaşık Maliyet" },
  { key: "arama", label: "Arama bekleyen" },
  { key: "red", label: "Reddedilen" },
] as const;

export default async function HomePage({ searchParams }: { searchParams: Promise<{ f?: string; q?: string; d?: string }> }) {
  const { f = "gundem", q = "", d: dParam } = await searchParams;
  // Doğrudan Temin sekmesi sonuçlanmış kayıtları Onaylanan / Reddedilen olarak ayırır.
  // Yaklaşık maliyetler Gündem'e girmez; kendi sekmesinde Bekleyen / Onaylanan / Reddedilen olarak durur.
  // Genel satış onaylanana kadar Gündem'de, sonra Genel Satış sekmesinde (teslimatı sürenler üstte).
  // Hastane İhalesi ve DMO İhalesi: ihale tarihi/saati geçene kadar Gündem'de; sonuçlanmamışlar (ihale öncesi ve sonrası) Süreçte'de;
  // sonuç girilince Sözleşmeli / Siparişli ya da Reddedilen'de. Reddedilen bölümü bize kalmayan ürünleri kalem bazında gösterir.
  const tf = f === "ihale" || f === "dmo";
  const d = dParam ?? (f === "ym" ? "bekle" : tf ? "surec" : "onay");
  const today = todayIstanbul();
  const resolved = d === "red" ? "reddedildi" : d === "bekle" && f === "ym" ? "acik" : "onaylandi";
  const { supabase, user, profile } = await requireUser();

  let query = supabase
    .from("records")
    .select("*, record_lines(*)")
    .in("type", ["yaklasik_maliyet", "dogrudan_temin", "genel_siparis", "ihale_siparisi", "dmo_ihalesi"])
    .order("record_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);

  // Gündem: henüz sonuçlanmamış doğrudan teminler, onay bekleyen genel satışlar (DT hiç "acik" olmaz, GS hiç aranmaz)
  // ve ihale tarihi/saati henüz gelmemiş ihaleler (saat kontrolü aşağıda). Sözleşmeli / siparişli ihaleler Gündem'e girmez.
  if (f === "gundem")
    query = query.or(
      `and(type.in.(dogrudan_temin,genel_siparis),status.in.(arama_bekliyor,arandi,numune_istendi,numune_gonderildi,acik)),and(type.in.(ihale_siparisi,dmo_ihalesi),status.in.(ihale_bekliyor,numune_istendi,numune_gonderildi),record_date.gte.${today})`,
    );
  if (tf) {
    query = query.eq("type", f === "dmo" ? "dmo_ihalesi" : "ihale_siparisi");
    query =
      d === "onay"
        ? query.eq("status", "onaylandi")
        : d === "red"
          ? query.eq("status", "reddedildi")
          : query.in("status", ["ihale_bekliyor", "numune_istendi", "numune_gonderildi"]);
  }
  if (f === "arama") query = query.eq("status", "arama_bekliyor");
  if (f === "dt") query = query.eq("type", "dogrudan_temin").eq("status", resolved);
  if (f === "gs") query = query.eq("type", "genel_siparis").eq("status", "onaylandi");
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
  // Birbirinden bağımsız sorgular aynı anda gider (her biri veritabanına ayrı bir gidiş-dönüş).
  const ratesPromise = getRates();
  const [{ data: records }, { count: waitingCount }, { count: myReminders }] = await Promise.all([
    f === "red" || (tf && d === "red") ? Promise.resolve({ data: [] as SalesRecord[] }) : query.returns<SalesRecord[]>(),
    supabase.from("records").select("id", { count: "exact", head: true }).eq("status", "arama_bekliyor"),
    // Anımsatıcı rozeti: bana eklenmiş, başlamış ve henüz tamamlamadığım anımsatıcılar.
    supabase
      .from("reminder_recipients")
      .select("reminder_id, reminders!inner(starts_at)", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("done_at", null)
      .lte("reminders.starts_at", new Date().toISOString()),
  ]);
  const [progress, rates] = await Promise.all([
    fetchProgress(
      supabase,
      (records ?? []).filter((r) => r.status === "onaylandi").map((r) => r.id),
    ),
    ratesPromise,
  ]);

  // Doğrudan Temin ve Genel Satış: tamamı teslim edilenler en alta (kendi içlerinde tarih sırası korunur).
  // İhale: süreçtekiler en yakın ihale tarihi üstte; sözleşmeliler en yakın bitiş üstte, tamamı teslim edilenler en altta.
  let list = records ?? [];
  if (f === "gs" || f === "dt")
    list = [...list].sort((a, b) => Number(isFullyDelivered(a, progress)) - Number(isFullyDelivered(b, progress)));
  if (tf && d === "surec") list = [...list].sort((a, b) => a.record_date.localeCompare(b.record_date));
  if (tf && d === "onay")
    list = [...list].sort(
      (a, b) =>
        Number(isFullyDelivered(a, progress)) - Number(isFullyDelivered(b, progress)) ||
        (a.contract_end ?? "").localeCompare(b.contract_end ?? ""),
    );
  // Gündem'de ihale saati geçmiş ihaleler gösterilmez (Süreçte'de kalır).
  const now = Date.now();
  if (f === "gundem") list = list.filter((r) => !isTenderType(r.type) || tenderAt(r.record_date, r.tender_time) > now);

  const firstName = (profile.full_name || profile.username).split(" ")[0];

  return (
    <>
      <PageHeader
        title="Satış Takibi"
        subtitle={`Merhaba ${firstName}`}
        action={
          <div className="flex items-center gap-2">
            <Link
              href="/raporlar"
              prefetch
              className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600 shadow-sm ring-1 ring-brand-100 transition active:scale-95"
              aria-label="Raporlar"
            >
              <ChartColumn size={21} />
            </Link>
            <Link
              href="/animsaticilar"
              prefetch
              className={`relative grid h-10 w-10 place-items-center rounded-xl shadow-sm transition active:scale-95 ${
                myReminders ? "bg-brand-600 text-white shadow-brand-600/30" : "bg-brand-50 text-brand-600 ring-1 ring-brand-100"
              }`}
              aria-label={myReminders ? `Anımsatıcılar, ${myReminders} bekleyen` : "Anımsatıcılar"}
            >
              <AlarmClock size={21} />
              {!!myReminders && (
                <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-accent-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">
                  {myReminders}
                </span>
              )}
            </Link>
          </div>
        }
      />
      <main className="mx-auto max-w-xl px-4 pt-4">
        {!!waitingCount && (
          <Link
            href="/?f=arama"
            prefetch
            scroll={false}
            className="mb-4 flex items-center gap-3 rounded-2xl bg-gradient-to-r from-accent-600 to-accent-500 px-2.5 py-1.5 text-white shadow-card"
          >
            <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-white/20 px-1.5 text-[15px] font-bold">
              {waitingCount}
            </span>
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
                prefetch
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

        {tf && (
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
            {(
              [
                ["surec", "Süreçte", Gavel, "bg-teal-50 text-teal-700"],
                ["onay", f === "dmo" ? "Siparişli" : "Sözleşmeli", FileSignature, "bg-emerald-50 text-emerald-700"],
                ["red", "Reddedilen", XCircle, "bg-accent-50 text-accent-700"],
              ] as const
            ).map(([key, label, Icon, activeCls]) => {
              const params = new URLSearchParams({ f });
              if (key !== "surec") params.set("d", key);
              if (q) params.set("q", q);
              return (
                <Link
                  key={key}
                  href={`/?${params}`}
                  prefetch
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold ${d === key ? activeCls : "text-muted"}`}
                >
                  <Icon size={16} /> {label}
                </Link>
              );
            })}
          </div>
        )}

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
                  prefetch
                  className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold ${d === key ? activeCls : "text-muted"}`}
                >
                  <Icon size={16} /> {label}
                </Link>
              );
            })}
          </div>
        )}

        {f === "red" || (tf && d === "red") ? (
          <RejectedList supabase={supabase} term={term} types={tf ? [f === "dmo" ? "dmo_ihalesi" : "ihale_siparisi"] : undefined} />
        ) : (
          <div className="mt-4 space-y-3">
            {list?.length ? (
              list.map((r) => <RecordCard key={r.id} record={r} progress={progress} rates={rates} alarm={inLastMonth(r, today)} />)
            ) : (
              <EmptyState
                icon={<FileText size={26} />}
                title={term ? "Sonuç bulunamadı" : "Henüz kayıt yok"}
                text={
                  term
                    ? "Farklı bir arama deneyin."
                    : f === "gs"
                      ? "Onaylanan genel satışlar burada görünür."
                      : tf && d !== "surec"
                        ? d === "onay"
                          ? f === "dmo"
                            ? "Siparişi gelen DMO ihaleleri burada görünür."
                            : "Sözleşmesi imzalanan ihaleler burada görünür."
                          : `Reddedilen ${f === "dmo" ? "DMO ihaleleri" : "ihaleler"} burada görünür.`
                        : "İlk kaydı alttaki + ile ekleyin."
                }
              >
                {!term && (
                  <Link href={tf ? `/yeni?tip=${f}` : "/yeni"} className="btn-primary">
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
