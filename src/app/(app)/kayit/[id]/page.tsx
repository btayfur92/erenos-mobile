import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, MessageSquareText, Pencil, Phone, User } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { fetchProgress } from "@/lib/queries";
import { formatDate, formatDateTime, formatMoney, formatQty, totalsByCurrency } from "@/lib/format";
import { RECORD_TYPE_LABEL, type CallLog, type LineProgress, type Profile, type SalesRecord, type Shipment } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { ProgressBar, ProgressStats } from "@/components/line-progress";
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

  const [{ data: calls }, { data: shipments }, { data: profiles }, progressMap, linked] = await Promise.all([
    supabase.from("call_logs").select("*").eq("record_id", id).order("created_at", { ascending: false }).returns<CallLog[]>(),
    supabase
      .from("shipments")
      .select("*, shipment_items(*, record_lines(product_name, unit))")
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
  ]);

  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));
  const progress: Record<string, LineProgress> = Object.fromEntries(progressMap);
  const lines = [...(record.record_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const decided = record.status === "onaylandi" || record.status === "reddedildi";
  const source = linked.data?.find((r) => r.id === record.source_record_id);
  const converted = linked.data?.find((r) => r.id === record.converted_record_id);

  return (
    <>
      <PageHeader
        title={record.hospital}
        subtitle={RECORD_TYPE_LABEL[record.type]}
        back={record.status === "reddedildi" ? "/reddedilenler" : "/"}
        action={
          !decided && (
            <Link href={`/kayit/${id}/duzenle`} className="grid h-10 w-10 place-items-center rounded-xl text-brand-600 hover:bg-brand-50" aria-label="Düzenle">
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
              <span className="text-[13px] text-white/75">{formatDate(record.record_date)}</span>
            </div>
            <h2 className="mt-3 text-xl font-semibold leading-snug">{record.hospital}</h2>
            <p className="mt-0.5 text-[14px] text-white/75">{record.file_no ? `Dosya / ihale no: ${record.file_no}` : "Dosya no girilmedi"}</p>
            <p className="mt-4 text-[13px] text-white/70">Toplam teklif</p>
            <p className="text-2xl font-semibold tabular-nums tracking-tight">{totalsByCurrency(lines)}</p>
          </div>
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={record.status} />
              {record.result_at && <span className="text-xs text-muted">{formatDateTime(record.result_at)}</span>}
            </div>
            {(record.contact_name || record.contact_phone) && (
              <div className="flex items-center gap-3 rounded-xl bg-canvas p-3">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-white text-brand-600 ring-1 ring-line">
                  <User size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-semibold">{record.contact_name || "İlgili kişi"}</p>
                  {record.contact_phone && <p className="text-[13px] text-muted">{record.contact_phone}</p>}
                </div>
                {record.contact_phone && (
                  <a href={`tel:${record.contact_phone}`} className="grid h-10 w-10 place-items-center rounded-full bg-brand-600 text-white" aria-label="Ara">
                    <Phone size={17} />
                  </a>
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
              <Link href={`/kayit/${source.id}`} className="flex items-center justify-between rounded-xl bg-brand-50 p-3 text-[14px] font-medium text-brand-700">
                Yaklaşık maliyetten dönüştürüldü <ArrowRight size={16} />
              </Link>
            )}
            {converted && (
              <Link href={`/kayit/${converted.id}`} className="flex items-center justify-between rounded-xl bg-brand-50 p-3 text-[14px] font-medium text-brand-700">
                Doğrudan temin kaydına git <ArrowRight size={16} />
              </Link>
            )}
            <RecordActions key={record.id} record={record} lines={lines} progress={progress} />
          </div>
        </div>

        <Section title={`Ürünler · ${lines.length} kalem`}>
          <div className="space-y-2">
            {lines.map((l) => {
              const p = progress[l.id];
              const rejected = decided && l.approved === false;
              return (
                <div key={l.id} className={`card p-4 ${rejected ? "opacity-60" : ""}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold leading-snug">{l.product_name}</p>
                      <p className="mt-0.5 text-[13px] text-muted">
                        {formatQty(l.quantity)} {l.unit} × {formatMoney(l.unit_price, l.currency)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-semibold tabular-nums">{formatMoney(Number(l.quantity) * Number(l.unit_price), l.currency)}</p>
                      {record.status === "onaylandi" && record.type === "dogrudan_temin" && (
                        <span className={`text-[12px] font-semibold ${l.approved ? "text-emerald-700" : "text-accent-600"}`}>
                          {l.approved ? "Onaylandı" : "Onaylanmadı"}
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

        {!!shipments?.length && (
          <Section title="Sevkiyatlar">
            <div className="space-y-2">
              {shipments.map((s) => (
                <ShipmentCard key={s.id} shipment={s} names={names} />
              ))}
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
              <p className="card p-4 text-[14px] text-muted">Henüz görüşme kaydı yok. Hastane arandıktan sonra not girilene kadar hatırlatma gönderilir.</p>
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
