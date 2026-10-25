import { STATUS_LABEL, type RecordStatus, type RecordType, type SalesRecord } from "@/lib/types";

const STYLE: Record<RecordStatus, string> = {
  acik: "bg-brand-50 text-brand-700",
  arama_bekliyor: "bg-accent-50 text-accent-700",
  arandi: "bg-amber-50 text-amber-700",
  onaylandi: "bg-emerald-50 text-emerald-700",
  reddedildi: "bg-canvas text-muted",
};

export function StatusBadge({ status, label }: { status: RecordStatus; label?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold ${STYLE[status]}`}>
      {status === "arama_bekliyor" && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-500 opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-600" />
        </span>
      )}
      {label ?? STATUS_LABEL[status]}
    </span>
  );
}

const TYPE_BADGE: Partial<Record<RecordType, [string, string]>> = {
  dogrudan_temin: ["DOĞRUDAN TEMİN", "bg-brand-600 text-white"],
  genel_siparis: ["GENEL SATIŞ", "bg-ink text-white"],
  yaklasik_maliyet: ["YAKLAŞIK MALİYET", "bg-brand-100 text-brand-700"],
};

export function TypeBadge({ type }: { type: RecordType }) {
  const [label, cls] = TYPE_BADGE[type] ?? TYPE_BADGE.yaklasik_maliyet!;
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${cls}`}>{label}</span>;
}

/** Genel satış girildiğinde onay bekler; "Açık" yerine bunu göster. */
export function statusLabel(record: Pick<SalesRecord, "type" | "status">) {
  return record.type === "genel_siparis" && record.status === "acik" ? "Onay bekliyor" : undefined;
}
