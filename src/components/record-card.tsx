import Link from "next/link";
import { BadgeCheck, ChevronRight, Circle, Phone, Siren } from "lucide-react";
import { formatDate, formatQty, singleTotal, todayIstanbul } from "@/lib/format";
import { daysUntil, isTenderType, lineName, tenderTime, isFullyDelivered, type LineProgress, type SalesRecord } from "@/lib/types";
import { StatusBadge, TypeBadge, statusLabel } from "./status-badge";
import { ContractTimeBar, ProgressBar } from "./line-progress";

export function RecordCard({
  record,
  progress,
  rates,
  alarm = false,
}: {
  record: SalesRecord;
  progress: Map<string, LineProgress>;
  rates: Record<string, number> | null;
  alarm?: boolean; // ihale sözleşmesi son ayda: kırmızı çerçeve
}) {
  const lines = [...(record.record_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const approvedLines = lines.filter((l) => l.approved);
  const tender = isTenderType(record.type);
  const dmo = record.type === "dmo_ihalesi";
  const isApproved = record.status === "onaylandi" && record.type !== "yaklasik_maliyet";
  const fullyDelivered = isFullyDelivered(record, progress);
  const today = todayIstanbul();
  const red = alarm && !fullyDelivered;

  return (
    <Link href={`/kayit/${record.id}`} className={`card block p-4 transition active:scale-[0.99] ${red ? "ring-2 ring-accent-500" : ""}`}>
      {red && record.contract_end && (
        <p className="-mx-4 -mt-4 mb-3 flex items-center gap-1.5 rounded-t-2xl bg-accent-600 px-4 py-1.5 text-[13px] font-semibold text-white">
          <Siren size={15} /> Sözleşme son ayında · {Math.max(daysUntil(record.contract_end, today), 0)} gün kaldı
        </p>
      )}
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type={record.type} />
        <span className="text-xs text-muted">
          {tender ? "İhale: " : ""}
          {formatDate(record.record_date)}
          {tender ? ` · ${tenderTime(record.tender_time)}` : ""}
        </span>
      </div>

      <div className="mt-2.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold leading-snug">{record.hospital}</h3>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {record.file_no ? `${tender ? "İhale" : "Dosya"} no: ${record.file_no}` : `${tender ? "İhale" : "Dosya"} no girilmedi`}
            {record.contact_name ? ` · ${record.contact_name}` : ""}
          </p>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-muted/60" />
      </div>

      {tender && record.status === "ihale_bekliyor" && (
        <div className="mt-2.5 flex flex-wrap gap-1.5 text-[12px] font-medium">
          {(
            [
              [!!record.guarantee_paid_at, "Teminat"],
              [!!record.prices_entered_at, "Fiyatlarımız"],
            ] as const
          )
            .filter(([, label]) => !(dmo && label === "Teminat")) // DMO'da süresiz teminat var
            .map(([done, label]) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${done ? "bg-emerald-50 text-emerald-700" : "bg-canvas text-muted"}`}
              >
                {done ? <BadgeCheck size={13} /> : <Circle size={11} />} {label}
              </span>
            ))}
        </div>
      )}

      {isApproved ? (
        <div className="mt-3 space-y-2.5">
          {tender && record.contract_start && record.contract_end && (
            <ContractTimeBar
              start={record.contract_start}
              end={record.contract_end}
              today={today}
              {...(dmo ? { label: "Teslim süresi", alarmDays: 7 } : {})}
            />
          )}
          {approvedLines.map((l) => {
            const p = progress.get(l.id);
            if (!p) return null;
            return (
              <div key={l.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium">{lineName(l)}</span>
                  <span className="shrink-0 tabular-nums text-muted">
                    <b className="font-semibold text-brand-600">{formatQty(p.delivered)}</b>
                    {Number(p.in_shipment) > 0 && <span className="text-brand-400"> +{formatQty(p.in_shipment)} sevkte</span>}
                    {" / "}
                    {formatQty(p.approved_qty)} {l.unit}
                  </span>
                </div>
                <ProgressBar p={p} />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {lines.slice(0, 3).map((l) => (
            <span key={l.id} className="max-w-full truncate rounded-lg bg-canvas px-2 py-1 text-[12px] text-ink/80">
              {lineName(l)} · {formatQty(l.quantity)} {l.unit}
            </span>
          ))}
          {lines.length > 3 && <span className="rounded-lg bg-canvas px-2 py-1 text-[12px] text-muted">+{lines.length - 3} kalem</span>}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-line/70 pt-3">
        <StatusBadge status={record.status} label={fullyDelivered ? "Tamamı teslim edildi" : statusLabel(record)} />
        <span className="flex items-center gap-1 text-[13px] font-semibold tabular-nums text-ink/80">
          {record.status === "arama_bekliyor" && record.contact_phone && <Phone size={13} className="text-accent-600" />}
          {singleTotal(isApproved ? approvedLines.map((l) => ({ ...l, quantity: l.approved_qty ?? 0 })) : lines, rates)}
        </span>
      </div>
    </Link>
  );
}
