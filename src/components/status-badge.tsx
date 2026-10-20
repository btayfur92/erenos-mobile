import { STATUS_LABEL, type RecordStatus } from "@/lib/types";

const STYLE: Record<RecordStatus, string> = {
  acik: "bg-brand-50 text-brand-700",
  dt_donustu: "bg-canvas text-muted",
  ihale_donustu: "bg-canvas text-muted",
  kapandi: "bg-canvas text-muted",
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

export function TypeBadge({ type }: { type: "yaklasik_maliyet" | "dogrudan_temin" | string }) {
  const isDt = type === "dogrudan_temin";
  return (
    <span
      className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold tracking-wide ${
        isDt ? "bg-brand-600 text-white" : "bg-brand-100 text-brand-700"
      }`}
    >
      {isDt ? "DOĞRUDAN TEMİN" : "YAKLAŞIK MALİYET"}
    </span>
  );
}
