import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BadgeCheck, FlaskConical, MessageSquareText, Pencil, Phone, Send, Tag, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fetchProgress } from "@/lib/queries";
import { formatDate, formatDateTime, formatMoney, formatPhone, formatQty, singleTotal, todayIstanbul } from "@/lib/format";
import { getRates } from "@/lib/fx";
import { telHref } from "@/lib/phone";
import {
  RECORD_TYPE_LABEL,
  lineName,
  isTenderType,
  tenderCountdown,
  tenderTime,
  type CallLog,
  type ContractAdjustment,
  type LineProgress,
  type Profile,
  type SalesRecord,
  type SampleItem,
  type Shipment,
  type TenderBid,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { ContractTimeBar, ProgressBar, ProgressStats } from "@/components/line-progress";
import { TenderComparison } from "@/components/tender";
import { DeleteButton, RecordActions } from "@/components/record-actions";
import { ShipmentCard } from "@/components/shipment-card";

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center justify-between px-1">
        <h2 className="text-[13px] font-bold uppercase tracking-wider text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireUser();

  const { data: record } = await supabase.from("records").select("*, record_lines(*)").eq("id", id).single<SalesRecord>();
  if (!record) notFound();

  const tender = isTenderType(record.type);
  const dmo = record.type === "dmo_ihalesi";
  const [
    { data: calls },
    { data: shipments },
    { data: profiles },
    progressMap,
    linked,
    rates,
    { data: samples },
    { data: bids },
    { data: adjustments },
  ] = await Promise.all([
    supabase.from("call_logs").select("*").eq("record_id", id).order("created_at", { ascending: false }).returns<CallLog[]>(),
    supabase
      .from("shipments")
      .select("*, shipment_items(*, record_lines(product_name, unit, region))")
      .eq("record_id", id)
      .order("requested_at", { ascending: false })
      .returns<Shipment[]>(),
    supabase.from("profiles").select("id, full_name, username").returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
    fetchProgress(supabase, [id]),
    record.source_record_id || record.converted_record_id
      ? supabase
          .from("records")
          .select("id, type, record_date")
          .in("id", [record.source_record_id, record.converted_record_id].filter(Boolean) as string[])
      : Promise.resolve({ data: [] as { id: string; type: string; record_date: string }[] }),
    getRates(),
    supabase.from("sample_items").select("*").eq("record_id", id).order("sort_order").returns<SampleItem[]>(),
    tender
      ? supabase.from("tender_bids").select("*").eq("record_id", id).order("created_at").returns<TenderBid[]>()
      : Promise.resolve({ data: [] as TenderBid[] }),
    tender
      ? supabase
          .from("contract_adjustments")
          .select("*")
          .eq("record_id", id)
          .order("created_at", { ascending: false })
          .returns<ContractAdjustment[]>()
      : Promise.resolve({ data: [] as ContractAdjustment[] }),
  ]);
  const today = todayIstanbul();

  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));
  const progress: Record<string, LineProgress> = Object.fromEntries(progressMap);
  const lines = [...(record.record_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const decided = record.status === "onaylandi" || record.status === "reddedildi";
  const gs = record.type === "genel_siparis";
  // Onaylanan DT ve genel satışta toplam, onaylanan miktarlar üzerinden hesaplanır.
  const approved = record.status === "onaylandi" && (record.type === "dogrudan_temin" || gs || tender);
  const source = linked.data?.find((r) => r.id === record.source_record_id);
  const converted = linked.data?.find((r) => r.id === record.converted_record_id);

  return (
    <>
      <PageHeader
        title={record.hospital}
        subtitle={RECORD_TYPE_LABEL[record.type]}
        back={
          tender
            ? `/?f=${dmo ? "dmo" : "ihale"}${record.status === "onaylandi" ? "&d=onay" : record.status === "reddedildi" ? "&d=red" : ""}`
            : record.status === "reddedildi"
              ? "/?f=red"
              : gs && record.status === "onaylandi"
                ? "/?f=gs"
                : "/"
        }
        action={
          // İhale ve DMO ihalesi sonuçlandıktan sonra da düzenlenebilir (ad, şehir, iletişim; kalem eklenip silinemez).
          (!decided || tender) && (
            <Link
              href={`/kayit/${id}/duzenle`}
              className="grid h-10 w-10 place-items-center rounded-xl text-brand-600 hover:bg-brand-50"
              aria-label="Düzenle"
            >
              <Pencil size={19} />
            </Link>
          )
        }
      />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
            <div className="flex items-center justify-between">
              <span className="rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-bold tracking-wide">
                {RECORD_TYPE_LABEL[record.type].toLocaleUpperCase("tr-TR")}
              </span>
              <span className="text-[13px] text-white/75">
                {tender ? "İhale tarihi: " : ""}
                {formatDate(record.record_date)}
                {tender ? ` · ${tenderTime(record.tender_time)}` : ""}
              </span>
            </div>
            <h2 className="mt-3 text-xl font-semibold leading-snug">{record.hospital}</h2>
            <p className="mt-0.5 text-[14px] text-white/75">
              {record.file_no
                ? `${tender ? "İhale" : "Dosya / ihale"} no: ${record.file_no}`
                : `${tender ? "İhale" : "Dosya"} no girilmedi`}
            </p>
            <p className="mt-4 text-[13px] text-white/70">
              {approved
                ? dmo
                  ? "Sipariş toplamı"
                  : tender
                    ? "Sözleşme toplamı"
                    : "Onaylanan toplam"
                : gs
                  ? "Sipariş toplamı"
                  : "Toplam teklif"}
            </p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">
              {singleTotal(
                approved ? lines.filter((l) => l.approved).map((l) => ({ ...l, quantity: Number(l.approved_qty ?? 0) })) : lines,
                rates,
              )}
            </p>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={record.status} label={statusLabel(record)} />
              {record.result_at && <span className="text-xs text-muted">{formatDateTime(record.result_at)}</span>}
            </div>
            {(record.contact_name || record.contact_phone) && (
              <div className="flex items-center gap-3 rounded-xl bg-canvas p-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-brand-600 ring-1 ring-line">
                  <User size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{record.contact_name || "İlgili kişi"}</p>
                  {record.contact_phone && (
                    <p className="text-[13px] text-muted">{formatPhone(record.contact_phone, record.contact_ext)}</p>
                  )}
                </div>
                {record.contact_phone && (
                  <a
                    href={telHref(record.contact_phone)}
                    className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white"
                    aria-label="Ara"
                  >
                    <Phone size={17} />
                  </a>
                )}
              </div>
            )}
            {tender && record.status !== "onaylandi" && record.status !== "reddedildi" && (
              <div className="space-y-1.5 rounded-xl bg-canvas p-3 text-[13px]">
                {record.status === "ihale_bekliyor" && (
                  <p className="font-semibold text-teal-700">{tenderCountdown(record.record_date, today, record.tender_time)}</p>
                )}
                {!dmo && (
                  <p className={`flex items-center gap-1.5 ${record.guarantee_paid_at ? "text-emerald-700" : "text-muted"}`}>
                    <BadgeCheck size={14} />
                    {record.guarantee_paid_at
                      ? `Teminat yatırıldı · ${formatDateTime(record.guarantee_paid_at)}${record.guarantee_paid_by && names[record.guarantee_paid_by] ? ` · ${names[record.guarantee_paid_by]}` : ""}`
                      : "Teminat henüz yatırılmadı"}
                  </p>
                )}
                <p className={`flex items-center gap-1.5 ${record.prices_entered_at ? "text-emerald-700" : "text-muted"}`}>
                  <Tag size={14} />
                  {record.prices_entered_at
                    ? `Fiyatlarımız girildi · ${formatDateTime(record.prices_entered_at)}`
                    : "Fiyatlarımız henüz girilmedi"}
                </p>
                {record.status === "ihale_bekliyor" && (
                  <p className="text-muted">
                    {dmo
                      ? "İhaleden 2 gün önce mesai içinde 2 saatte bir, son 24 saatte saatte bir herkese hatırlatma gider. DMO ihalelerinde süresiz teminat olduğu için teminat adımı yoktur."
                      : "İhaleden 3 gün önce mesai içinde 2 saatte bir, son 24 saatte saatte bir herkese hatırlatma gider."}
                  </p>
                )}
              </div>
            )}
            {record.notes && <p className="whitespace-pre-line text-[14px] text-ink/80">{record.notes}</p>}
            {record.result_note && (
              <p className="rounded-xl bg-canvas p-3 text-[14px]">
                <b className="font-semibold">Sonuç notu: </b>
                {record.result_note}
              </p>
            )}
            {source && (
              <Link
                href={`/kayit/${source.id}`}
                className="flex items-center justify-between rounded-xl bg-brand-50 p-3 text-[14px] font-medium text-brand-700"
              >
                Yaklaşık maliyetten dönüştürüldü <ArrowRight size={16} />
              </Link>
            )}
            {converted && (
              <Link
                href={`/kayit/${converted.id}`}
                className="flex items-center justify-between rounded-xl bg-brand-50 p-3 text-[14px] font-medium text-brand-700"
              >
                Doğrudan temin kaydına git <ArrowRight size={16} />
              </Link>
            )}
            <RecordActions key={record.id} record={record} lines={lines} progress={progress} samples={samples ?? []} />
          </div>
        </div>

        <Section title={`Ürünler · ${lines.length} kalem`}>
          <div className="space-y-2">
            {lines.map((l) => {
              const p = progress[l.id];
              const rejected = decided && l.approved === false;
              // Onaylanan kalemde toplam adet artık onaylanan adettir; teklif adedi gösterilmez.
              const qty = record.status === "onaylandi" && l.approved ? Number(l.approved_qty ?? l.quantity) : Number(l.quantity);
              // İhalede iş artışı / eksiltmesi: sözleşme miktarına göre fark.
              const change =
                tender && l.approved && l.contract_qty && Number(l.approved_qty) !== Number(l.contract_qty)
                  ? Math.round(((Number(l.approved_qty) - Number(l.contract_qty)) / Number(l.contract_qty)) * 1000) / 10
                  : 0;
              return (
                <div key={l.id} className={`card p-4 ${rejected ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug">{lineName(l)}</p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {formatQty(qty)} {l.unit}
                        {l.unit_price === null ? " · fiyat girilmedi" : ` × ${formatMoney(l.unit_price, l.currency)}`}
                      </p>
                      {change !== 0 && (
                        <p className={`mt-0.5 text-[12px] font-semibold ${change > 0 ? "text-emerald-700" : "text-amber-700"}`}>
                          Sözleşme {formatQty(l.contract_qty)} {l.unit} · iş {change > 0 ? "artışı" : "eksiltmesi"} %{Math.abs(change)}
                        </p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      {l.unit_price !== null && (
                        <p className="text-[15px] font-semibold tabular-nums">{formatMoney(qty * Number(l.unit_price), l.currency)}</p>
                      )}
                      {approved && (
                        <span className={`text-[12px] font-semibold ${l.approved ? "text-emerald-700" : "text-accent-600"}`}>
                          {l.approved ? (dmo ? "Siparişli" : tender ? "Sözleşmeli" : "Onaylandı") : tender ? "Reddedildi" : "Onaylanmadı"}
                        </span>
                      )}
                    </div>
                  </div>
                  {l.approved && p && (
                    <div className="mt-3 space-y-2">
                      <ProgressBar p={p} />
                      <ProgressStats p={p} unit={l.unit} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {tender && record.status === "onaylandi" && record.contract_start && record.contract_end && (
          <Section title={dmo ? "Sipariş ve teslim" : "Sözleşme"}>
            <div className="card space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2 text-[13px]">
                <p>
                  <span className="block text-muted">{dmo ? "Sipariş" : "İmza"}</span>
                  <b className="font-semibold">{formatDate(record.contract_start)}</b>
                </p>
                <p>
                  <span className="block text-muted">{dmo ? "Teslim son tarihi" : "Bitiş"}</span>
                  <b className="font-semibold">{formatDate(record.contract_end)}</b>
                </p>
              </div>
              <ContractTimeBar
                start={record.contract_start}
                end={record.contract_end}
                today={today}
                {...(dmo ? { label: "Teslim süresi", alarmDays: 7 } : {})}
              />
              {(() => {
                const totalQty = lines.filter((l) => l.approved).reduce((t, l) => t + Number(l.approved_qty ?? 0), 0);
                const delivered = lines.filter((l) => l.approved).reduce((t, l) => t + Number(progress[l.id]?.delivered ?? 0), 0);
                const inShip = lines.filter((l) => l.approved).reduce((t, l) => t + Number(progress[l.id]?.in_shipment ?? 0), 0);
                const pct = totalQty ? Math.round((delivered / totalQty) * 100) : 0;
                return (
                  <div>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                      <span className="font-medium">Ürün baremi (tüm kalemler)</span>
                      <span className="shrink-0 tabular-nums text-muted">%{pct} teslim edildi</span>
                    </div>
                    <ProgressBar
                      p={{
                        line_id: "",
                        record_id: record.id,
                        approved_qty: totalQty,
                        delivered,
                        in_shipment: inShip,
                        remaining: totalQty - delivered - inShip,
                      }}
                    />
                  </div>
                );
              })()}
              {!!adjustments?.length && (
                <div className="border-t border-line/70 pt-3">
                  <p className="mb-1.5 text-[12px] font-bold uppercase tracking-wider text-muted">İş artışı / eksiltmesi</p>
                  <ul className="space-y-1 text-[13px]">
                    {adjustments.map((a) => {
                      const l = lines.find((x) => x.id === a.line_id);
                      return (
                        <li key={a.id}>
                          <b className="font-semibold">{l?.product_name}</b>: {formatQty(a.old_qty)} → {formatQty(a.new_qty)} {l?.unit}
                          <span className="text-muted">
                            {" "}
                            · {formatDateTime(a.created_at)}
                            {a.created_by && names[a.created_by] ? ` · ${names[a.created_by]}` : ""}
                            {a.note ? ` · ${a.note}` : ""}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </Section>
        )}

        {tender && (
          <Section title="Fiyat karşılaştırması">
            <TenderComparison record={record} lines={lines} bids={bids ?? []} rates={rates} />
          </Section>
        )}

        {!!shipments?.length && (
          <Section title="Sevkiyatlar">
            <div className="space-y-2">
              {shipments.map((s) => (
                <ShipmentCard key={s.id} shipment={s} names={names} />
              ))}
            </div>
          </Section>
        )}

        {record.sample_requested_at && !!samples?.length && (
          <Section title="Numune">
            <div className="card p-4">
              <ul className="space-y-1.5">
                {samples.map((x) => (
                  <li key={x.id} className="flex items-baseline justify-between gap-3 text-[14px]">
                    <span className="min-w-0 truncate">{x.product_name}</span>
                    <b className="shrink-0 font-semibold tabular-nums">
                      {formatQty(x.quantity)} <span className="font-normal text-muted">{x.unit}</span>
                    </b>
                  </li>
                ))}
              </ul>
              {record.sample_note && <p className="mt-2 whitespace-pre-line text-[13px] text-muted">{record.sample_note}</p>}
              <div className="mt-3 space-y-1 border-t border-line/70 pt-3 text-[13px]">
                <p className="flex items-center gap-1.5 text-violet-700">
                  <FlaskConical size={14} /> İstendi: {formatDateTime(record.sample_requested_at)}
                </p>
                {record.sample_sent_at ? (
                  <p className="flex items-center gap-1.5 text-sky-700">
                    <Send size={14} /> Gönderildi: {formatDateTime(record.sample_sent_at)}
                    {record.sample_sent_by && names[record.sample_sent_by] ? ` · ${names[record.sample_sent_by]}` : ""}
                  </p>
                ) : (
                  !decided && (
                    <p className="text-muted">Henüz gönderilmedi. Gönderilene kadar mesai içinde 2 saatte bir hatırlatma gider.</p>
                  )
                )}
              </div>
            </div>
          </Section>
        )}

        {record.type === "dogrudan_temin" && (
          <Section title="Görüşmeler">
            {calls?.length ? (
              <ol className="card divide-y divide-line/70">
                {calls.map((c) => (
                  <li key={c.id} className="flex gap-3 p-4">
                    <MessageSquareText size={18} className="mt-0.5 shrink-0 text-brand-400" />
                    <div className="min-w-0">
                      <p className="whitespace-pre-line text-[14px]">{c.note}</p>
                      <p className="mt-1 text-[12px] text-muted">
                        {formatDateTime(c.created_at)}
                        {c.created_by && names[c.created_by] ? ` · ${names[c.created_by]}` : ""}
                        {c.keep_reminding ? " · Tekrar aranacak" : ""}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="card p-4 text-[14px] text-muted">
                Henüz görüşme kaydı yok. Hastane arandıktan sonra not girilene kadar hatırlatma gönderilir.
              </p>
            )}
          </Section>
        )}

        <div className="mt-8 border-t border-line pt-4">
          <p className="mb-2 text-center text-[12px] text-muted">
            {record.created_by && names[record.created_by] ? `${names[record.created_by]} tarafından ` : ""}
            {formatDateTime(record.created_at)} tarihinde oluşturuldu
          </p>
          <DeleteButton record={record} />
        </div>
      </main>
    </>
  );
}
