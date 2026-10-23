"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, PackageCheck, PackageOpen, Pencil, X } from "lucide-react";
import { cancelIncoming, markReceived } from "@/app/(app)/actions";
import { IncomingSheet } from "@/components/add-incoming";
import { KindBadge } from "@/components/shipment-card";
import { formatDate, formatDateTime, formatQty, todayIstanbul } from "@/lib/format";
import type { IncomingShipment } from "@/lib/types";

/** Gelecek sevkiyat kartı: tedarikçiden bize gelecek ürün. */
export function IncomingCard({ item, names }: { item: IncomingShipment; names?: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const received = item.status === "teslim_alindi";
  const late = !received && item.expected_date < todayIstanbul();

  const act = (fn: () => ReturnType<typeof markReceived>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
    });

  return (
    <div className={`card p-4 ${received ? "opacity-90" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${received ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-700"}`}
        >
          {received ? <PackageCheck size={20} /> : <PackageOpen size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <KindBadge kind="gelecek" />
          <b className="block truncate text-[15px] font-semibold">{item.supplier}</b>
          <p className="text-[12px] text-muted">
            <b className={`font-semibold ${late ? "text-accent-600" : "text-ink/80"}`}>
              Beklenen: {formatDate(item.expected_date)}
              {late ? " · gecikti" : ""}
            </b>
            {item.created_by && names?.[item.created_by] ? ` · ${names[item.created_by]}` : ""}
          </p>
        </div>
        {!received && !confirmCancel && (
          <div className="-mr-1 -mt-1 flex">
            <button
              onClick={() => setEditing(true)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
              aria-label="Gelecek sevkiyatı düzenle"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setConfirmCancel(true)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
              aria-label="Gelecek sevkiyatı sil"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3 rounded-xl bg-canvas px-3 py-2 text-[14px]">
        <span className="min-w-0 whitespace-pre-line">{item.product_details}</span>
        {item.quantity !== null && (
          <b className="shrink-0 font-semibold tabular-nums">
            {formatQty(item.quantity)} <span className="font-normal text-muted">{item.unit}</span>
          </b>
        )}
      </div>
      {item.note && <p className="mt-2 text-[13px] text-muted">{item.note}</p>}

      {received ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
          <CheckCircle2 size={15} /> Teslim alındı {item.received_at ? formatDateTime(item.received_at) : ""}
          {item.received_by && names?.[item.received_by] ? ` · ${names[item.received_by]}` : ""}
        </p>
      ) : confirmCancel ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-secondary py-2.5" onClick={() => setConfirmCancel(false)}>
            Vazgeç
          </button>
          <button className="btn-danger py-2.5" disabled={pending} onClick={() => act(() => cancelIncoming(item.id))}>
            {pending && <Loader2 size={16} className="animate-spin" />} Sil
          </button>
        </div>
      ) : (
        <button className="btn-primary mt-3 w-full py-2.5" disabled={pending} onClick={() => act(() => markReceived(item.id))}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={17} />} Teslim alındı
        </button>
      )}
      {error && <p className="mt-2 text-sm font-medium text-accent-700">{error}</p>}
      {!received && <IncomingSheet open={editing} onClose={() => setEditing(false)} item={item} />}
    </div>
  );
}
