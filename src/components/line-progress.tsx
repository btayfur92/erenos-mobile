import { formatQty } from "@/lib/format";
import type { LineProgress } from "@/lib/types";

/** Onaylanan miktar içinde teslim / sevkte / kalan dağılımı. */
export function ProgressBar({ p }: { p: LineProgress }) {
  const total = Number(p.approved_qty) || 1;
  const d = (Number(p.delivered) / total) * 100;
  const s = (Number(p.in_shipment) / total) * 100;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-line">
      <div className="bg-brand-600" style={{ width: `${d}%` }} />
      <div className="bg-brand-300" style={{ width: `${s}%` }} />
    </div>
  );
}

export function ProgressStats({ p, unit }: { p: LineProgress; unit: string }) {
  const items = [
    { label: "Toplam", value: p.approved_qty, cls: "text-ink" },
    { label: "Sevkte", value: p.in_shipment, cls: "text-brand-400" },
    { label: "Teslim", value: p.delivered, cls: "text-brand-600" },
    { label: "Kalan", value: p.remaining, cls: Number(p.remaining) > 0 ? "text-accent-600" : "text-muted" },
  ];
  return (
    <div className="grid grid-cols-4 gap-1 text-center">
      {items.map((i) => (
        <div key={i.label} className="rounded-lg bg-canvas px-1 py-1.5">
          <div className={`text-[13px] font-semibold tabular-nums ${i.cls}`}>{formatQty(i.value)}</div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
            {i.label}
            {i.label === "Toplam" ? ` · ${unit}` : ""}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Sözleşme süresi baremi: imza tarihinden bitiş tarihine geçen süre. Son ayda kırmızı. */
export function ContractTimeBar({ start, end, today }: { start: string; end: string; today: string }) {
  const total = Math.max(Date.parse(end) - Date.parse(start), 1);
  const elapsed = Math.min(Math.max(Date.parse(today) - Date.parse(start), 0), total);
  const left = Math.round((Date.parse(end) - Date.parse(today)) / 86_400_000);
  const alarm = left <= 30;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
        <span className="font-medium">Sözleşme süresi</span>
        <span className={`shrink-0 tabular-nums ${alarm ? "font-semibold text-accent-600" : "text-muted"}`}>
          {left > 0 ? `${left} gün kaldı` : left === 0 ? "Bugün bitiyor" : `${-left} gün önce bitti`}
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-line">
        <div className={alarm ? "bg-accent-500" : "bg-teal-500"} style={{ width: `${(elapsed / total) * 100}%` }} />
      </div>
    </div>
  );
}
