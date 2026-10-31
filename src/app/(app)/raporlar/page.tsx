import Link from "next/link";
import type { Metadata } from "next";
import { Building2, ChartColumn, NotebookPen, Package, Trophy } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fetchCards } from "@/lib/queries";
import { getRates, type Rates } from "@/lib/fx";
import { formatDate, formatDateWithDay, formatMoney, formatQty, toTry } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { TypeBadge } from "@/components/status-badge";
import { ReportPicker } from "@/components/report-picker";
import { lineName, type Meeting, type RecordLine, type SalesRecord, type TenderBid } from "@/lib/types";

export const metadata: Metadata = { title: "Raporlar" };

type Outcome = "onay" | "red" | "bekliyor";

/** Kalemin sonucu: kalem onayı yoksa (yaklaşık maliyet) kaydın sonucu geçerlidir. */
function outcome(r: Pick<SalesRecord, "status">, l: Pick<RecordLine, "approved">): Outcome {
  if (l.approved === true || (l.approved === null && r.status === "onaylandi")) return "onay";
  if (l.approved === false || (l.approved === null && r.status === "reddedildi")) return "red";
  return "bekliyor";
}

function OutcomeChip({
  r,
  l,
}: {
  r: Pick<SalesRecord, "type" | "status">;
  l: Pick<RecordLine, "approved" | "approved_qty" | "quantity" | "unit">;
}) {
  const o = outcome(r, l);
  const onay = r.type === "ihale_siparisi" ? "Sözleşmeli" : r.type === "dmo_ihalesi" ? "Siparişli" : "Onaylandı";
  const red = r.type === "dmo_ihalesi" ? "Kazanılmadı" : "Reddedildi";
  const changed = o === "onay" && l.approved_qty !== null && Number(l.approved_qty) !== Number(l.quantity);
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[12px] font-semibold ${
        o === "onay" ? "bg-emerald-50 text-emerald-700" : o === "red" ? "bg-accent-50 text-accent-700" : "bg-canvas text-muted"
      }`}
    >
      {o === "onay" ? onay : o === "red" ? red : "Sonuç bekleniyor"}
      {changed ? ` · ${formatQty(l.approved_qty)} ${l.unit}` : ""}
    </span>
  );
}

/** Kalemde bizim fiyatımız ve rakiplerin fiyatları, TL karşılığına göre ucuzdan pahalıya. */
function Competitors({ l, bids, rates }: { l: RecordLine; bids: TenderBid[]; rates: Rates | null }) {
  if (!bids.length) return null;
  const rows = [
    ...(l.unit_price !== null ? [{ company: "Erenos (biz)", us: true, price: Number(l.unit_price), currency: l.currency }] : []),
    ...bids.map((b) => ({ company: b.company, us: false, price: Number(b.unit_price), currency: b.currency })),
  ].sort((a, b) => (toTry(a.price, a.currency, rates) ?? Infinity) - (toTry(b.price, b.currency, rates) ?? Infinity));
  const rank = rows.findIndex((x) => x.us) + 1;
  return (
    <div className="mt-2 rounded-xl bg-canvas px-3 py-2">
      <p className="mb-1 flex items-center justify-between text-[12px] font-semibold text-muted">
        <span>Rakip fiyatları</span>
        {rank > 0 && (
          <span className={`inline-flex items-center gap-1 ${rank === 1 ? "text-emerald-700" : "text-amber-700"}`}>
            {rank === 1 && <Trophy size={12} />} {rank}. sıradayız
          </span>
        )}
      </p>
      <ol className="space-y-0.5">
        {rows.map((x, i) => (
          <li
            key={x.company}
            className={`flex items-baseline justify-between gap-3 text-[13px] ${x.us ? "font-semibold text-brand-700" : ""}`}
          >
            <span className="min-w-0 truncate">
              {i + 1}. {x.company}
            </span>
            <span className="shrink-0 tabular-nums">{formatMoney(x.price, x.currency)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Stat({ value, label, cls = "text-ink" }: { value: number; label: string; cls?: string }) {
  return (
    <div className="rounded-xl bg-white px-2 py-2.5 text-center ring-1 ring-line">
      <div className={`text-[18px] font-semibold tabular-nums ${cls}`}>{value}</div>
      <div className="text-[11px] font-medium text-muted">{label}</div>
    </div>
  );
}

const sectionTitle = "mb-2 mt-6 px-1 text-[13px] font-bold uppercase tracking-wider text-muted";
const priceText = (l: RecordLine) =>
  `${formatQty(l.quantity)} ${l.unit}${l.unit_price === null ? " · fiyat girilmedi" : ` × ${formatMoney(l.unit_price, l.currency)}`}${
    l.ym_price != null ? ` · YM ${formatMoney(l.ym_price, l.currency)}` : ""
  }`;

/**
 * Raporlar: hastane/müşteri seçilince ona verilen tüm fiyatlar (tarih, sonuç, rakip fiyatları) ve görüşmeleri;
 * ürün seçilince hangi hastane/müşteriye hangi tarihte hangi fiyat ve adetle verildiği, sonucu ve rakip fiyatları.
 */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ t?: string; id?: string; v?: string }> }) {
  const { t, id, v } = await searchParams;
  const kind = t === "urun" ? "urun" : "musteri";
  const { supabase } = await requireUser();
  const { customers, products } = await fetchCards(supabase);
  const card = id ? (kind === "musteri" ? customers.find((c) => c.id === id) : products.find((p) => p.id === id)) : undefined;

  const tabs = (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
      {(
        [
          ["musteri", "Hastane / Müşteri", Building2],
          ["urun", "Ürün", Package],
        ] as const
      ).map(([k, label, Icon]) => (
        <Link
          key={k}
          href={`/raporlar?t=${k}`}
          className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold ${kind === k ? "bg-brand-50 text-brand-700" : "text-muted"}`}
        >
          <Icon size={16} /> {label}
        </Link>
      ))}
    </div>
  );

  if (!card) {
    return (
      <>
        <PageHeader title="Raporlar" subtitle="Fiyat geçmişi ve görüşmeler" back="/" />
        <main className="mx-auto max-w-xl px-4 pt-4">
          {tabs}
          <p className="mb-3 mt-4 px-1 text-[13px] text-muted">
            {kind === "musteri"
              ? "Hastane veya müşteri seçin: verilen fiyatlar, sonuçları, rakip fiyatları ve görüşmeler görünür."
              : "Ürün seçin: hangi hastane/müşteriye hangi tarihte hangi fiyat ve adetle verildiği, sonuçları ve rakip fiyatları görünür."}
          </p>
          <ReportPicker
            kind={kind}
            cards={
              kind === "musteri"
                ? customers.map((c) => ({ id: c.id, name: c.name, sub: [c.district, c.city].filter(Boolean).join(" / ") || undefined }))
                : products.map((p) => ({ id: p.id, name: p.name, sub: p.unit }))
            }
          />
        </main>
      </>
    );
  }

  const rates = await getRates();
  const head = (
    <div className="mt-4 flex items-center gap-3 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15">
        {kind === "musteri" ? <Building2 size={22} /> : <Package size={22} />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-[17px] font-semibold leading-snug">{card.name}</h2>
        <p className="truncate text-[13px] text-white/75">
          {"city" in card ? [card.district, card.city].filter(Boolean).join(" / ") || "Hastane / müşteri" : `Ürün · ${card.unit}`}
        </p>
      </div>
      <Link href={`/raporlar?t=${kind}`} className="shrink-0 rounded-lg bg-white/15 px-3 py-1.5 text-[13px] font-semibold">
        Değiştir
      </Link>
    </div>
  );

  if (kind === "musteri") {
    const [{ data: recs }, { data: meetings }] = await Promise.all([
      supabase
        .from("records")
        .select("*, record_lines(*), tender_bids(*)")
        .eq("customer_id", card.id)
        .order("record_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500)
        .returns<(SalesRecord & { tender_bids: TenderBid[] })[]>(),
      supabase
        .from("meetings")
        .select("*")
        .eq("customer_id", card.id)
        .order("meeting_date", { ascending: false })
        .limit(200)
        .returns<Meeting[]>(),
    ]);
    const records = recs ?? [];
    const view = v === "gorusmeler" ? "gorusmeler" : "urunler";
    const allLines = records.flatMap((r) => (r.record_lines ?? []).map((l) => outcome(r, l)));

    return (
      <>
        <PageHeader title="Raporlar" subtitle="Hastane / müşteri" back="/raporlar?t=musteri" />
        <main className="mx-auto max-w-xl px-4 pt-4">
          {tabs}
          {head}
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
            {(
              [
                ["urunler", "Ürünler", Package, records.length],
                ["gorusmeler", "Görüşmeler", NotebookPen, meetings?.length ?? 0],
              ] as const
            ).map(([k, label, Icon, count]) => (
              <Link
                key={k}
                href={`/raporlar?t=musteri&id=${card.id}${k === "gorusmeler" ? "&v=gorusmeler" : ""}`}
                replace
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold ${view === k ? "bg-brand-50 text-brand-700" : "text-muted"}`}
              >
                <Icon size={16} /> {label}
                <span
                  className={`rounded-full px-1.5 text-[12px] tabular-nums ${view === k ? "bg-brand-600 text-white" : "bg-canvas text-muted"}`}
                >
                  {count}
                </span>
              </Link>
            ))}
          </div>

          {view === "urunler" ? (
            <>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Stat value={records.length} label="Teklif" />
                <Stat value={allLines.filter((o) => o === "onay").length} label="Onaylanan kalem" cls="text-emerald-700" />
                <Stat value={allLines.filter((o) => o === "red").length} label="Reddedilen kalem" cls="text-accent-600" />
              </div>

              <h2 className={sectionTitle}>Verilen fiyatlar</h2>
              {records.length ? (
                <div className="space-y-3">
                  {records.map((r) => {
                    const lines = [...(r.record_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
                    return (
                      <Link key={r.id} href={`/kayit/${r.id}`} className="card block p-4">
                        <div className="flex items-center justify-between gap-2">
                          <TypeBadge type={r.type} />
                          <span className="text-[12px] text-muted">{formatDate(r.record_date)}</span>
                        </div>
                        {r.file_no && <p className="mt-1.5 text-[12px] text-muted">Dosya / ihale no: {r.file_no}</p>}
                        <div className="mt-2 divide-y divide-line/70">
                          {lines.map((l) => (
                            <div key={l.id} className="py-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <b className="block text-[14px] font-semibold leading-snug">{lineName(l)}</b>
                                  <span className="text-[13px] text-muted">{priceText(l)}</span>
                                </div>
                                <OutcomeChip r={r} l={l} />
                              </div>
                              <Competitors l={l} bids={(r.tender_bids ?? []).filter((b) => b.line_id === l.id)} rates={rates} />
                            </div>
                          ))}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <p className="card p-4 text-[14px] text-muted">Bu hastane / müşteri için henüz kayıt yok.</p>
              )}
            </>
          ) : meetings?.length ? (
            <div className="mt-3 space-y-2">
              {meetings.map((m) => (
                <div key={m.id} className="card p-4">
                  <p className="text-[12px] font-semibold text-ink/80">
                    {formatDateWithDay(m.meeting_date)} · <span className="font-normal text-muted">{m.department}</span>
                    {m.private && <span className="ml-1.5 rounded-md bg-amber-50 px-1.5 py-px text-[11px] text-amber-700">Özel</span>}
                  </p>
                  <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed">{m.note}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="card mt-3 flex items-center gap-2 p-4 text-[14px] text-muted">
              <NotebookPen size={16} /> Bu hastane için görüşme notu yok.
            </p>
          )}
        </main>
      </>
    );
  }

  type ProductLine = RecordLine & {
    records: Pick<SalesRecord, "id" | "type" | "status" | "record_date" | "hospital" | "file_no" | "created_at">;
  };
  const { data: rows } = await supabase
    .from("record_lines")
    .select("*, records!inner(id, type, status, record_date, hospital, file_no, created_at)")
    .eq("product_id", card.id)
    .limit(2000)
    .returns<ProductLine[]>();
  const lines = (rows ?? []).sort(
    (a, b) => b.records.record_date.localeCompare(a.records.record_date) || b.records.created_at.localeCompare(a.records.created_at),
  );
  const { data: bids } = lines.length
    ? await supabase
        .from("tender_bids")
        .select("*")
        .in(
          "line_id",
          lines.map((l) => l.id),
        )
        .returns<TenderBid[]>()
    : { data: [] as TenderBid[] };
  const outs = lines.map((l) => outcome(l.records, l));

  return (
    <>
      <PageHeader title="Raporlar" subtitle="Ürün" back="/raporlar?t=urun" />
      <main className="mx-auto max-w-xl px-4 pt-4">
        {tabs}
        {head}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Stat value={lines.length} label="Teklif" />
          <Stat value={outs.filter((o) => o === "onay").length} label="Onaylanan" cls="text-emerald-700" />
          <Stat value={outs.filter((o) => o === "red").length} label="Reddedilen" cls="text-accent-600" />
        </div>

        <h2 className={sectionTitle}>Verilen fiyatlar</h2>
        {lines.length ? (
          <div className="space-y-2">
            {lines.map((l) => (
              <Link key={l.id} href={`/kayit/${l.records.id}`} className="card block p-4">
                <div className="flex items-center justify-between gap-2">
                  <TypeBadge type={l.records.type} />
                  <span className="text-[12px] text-muted">{formatDate(l.records.record_date)}</span>
                </div>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <b className="block text-[15px] font-semibold leading-snug">{l.records.hospital}</b>
                    <span className="text-[13px] text-muted">
                      {l.region ? `${l.region} · ` : ""}
                      {priceText(l)}
                    </span>
                  </div>
                  <OutcomeChip r={l.records} l={l} />
                </div>
                <Competitors l={l} bids={(bids ?? []).filter((b) => b.line_id === l.id)} rates={rates} />
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon={<ChartColumn size={26} />} title="Kayıt yok" text="Bu ürün için henüz fiyat verilmedi." />
        )}
      </main>
    </>
  );
}
