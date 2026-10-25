import Link from "next/link";
import { ChevronRight, Phone } from "lucide-react";
import { formatDate, formatQty, singleTotal } from "@/lib/format";
import { isFullyDelivered, type LineProgress, type SalesRecord } from "@/lib/types";
import { StatusBadge, TypeBadge, statusLabel } from "./status-badge";
import { ProgressBar } from "./line-progress";

export function RecordCard({
  record,
  progress,
  rates,
}: {
  record: SalesRecord;
  progress: Map<string, LineProgress>;
  rates: Record<string, number> | null;
}) {
  const lines = [...(record.record_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const approvedLines = lines.filter((l) => l.approved);
  const isApproved = record.status === "onaylandi" && (record.type === "dogrudan_temin" || record.type === "genel_siparis");
  const fullyDelivered = isFullyDelivered(record, progress);

  return (
    <Link href={`/kayit/${record.id}`} className="card block p-4 transition active:scale-[0.99]">
      <div className="flex items-center justify-between gap-2">
        <TypeBadge type={record.type} />
        <span className="text-xs text-muted">{formatDate(record.record_date)}</span>
      </div>

      <div className="mt-2.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[16px] font-semibold leading-snug">{record.hospital}</h3>
          <p className="mt-0.5 truncate text-[13px] text-muted">
            {record.file_no ? `Dosya no: ${record.file_no}` : "Dosya no girilmedi"}
            {record.contact_name ? ` · ${record.contact_name}` : ""}
          </p>
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-muted/60" />
      </div>

      {isApproved ? (
        <div className="mt-3 space-y-2.5">
          {approvedLines.map((l) => {
            const p = progress.get(l.id);
            if (!p) return null;
            return (
              <div key={l.id}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="truncate font-medium">{l.product_name}</span>
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
              {l.product_name} · {formatQty(l.quantity)} {l.unit}
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
