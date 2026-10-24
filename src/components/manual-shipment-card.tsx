"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, PackageCheck, PackageOpen, Pencil, Truck, X } from "lucide-react";
import { cancelManualShipment, completeManualShipment } from "@/app/(app)/actions";
import { ManualShipmentSheet } from "@/components/add-shipment";
import { KindBadge } from "@/components/shipment-card";
import { formatDate, formatDateTime, formatQty, todayIstanbul } from "@/lib/format";
import type { ManualShipment } from "@/lib/types";

/** Elle eklenen sevkiyat kartı: gelecek (tedarikçiden bize) ya da doğrudan temine bağlı olmayan gidecek. */
export function ManualShipmentCard({ item, names }: { item: ManualShipment; names?: Record<string, string> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const gelecek = item.direction === "gelecek";
  const done = item.status === "tamamlandi";
  const late = !done && item.due_date < todayIstanbul();
  const doneLabel = gelecek ? "Teslim alındı" : "Teslim edildi";
  const kind = gelecek ? "Gelecek" : "Gidecek";

  const act = (fn: () => ReturnType<typeof completeManualShipment>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
    });

  return (
    <div className={`card p-4 ${done ? "opacity-90" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            done ? "bg-emerald-50 text-emerald-600" : gelecek ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
          }`}
        >
          {done ? <PackageCheck size={20} /> : gelecek ? <PackageOpen size={20} /> : <Truck size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <KindBadge kind={item.direction} />
          <b className="block truncate text-[15px] font-semibold">{item.party}</b>
          <p className="text-[12px] text-muted">
            <b className={`font-semibold ${late ? "text-accent-600" : "text-ink/80"}`}>
              {gelecek ? "Beklenen" : "Sevk"}: {formatDate(item.due_date)}
              {late ? " · gecikti" : ""}
            </b>
            {item.created_by && names?.[item.created_by] ? ` · ${names[item.created_by]}` : ""}
          </p>
        </div>
        {!done && !confirmCancel && (
          <div className="-mr-1 -mt-1 flex">
            <button
              onClick={() => setEditing(true)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
              aria-label={`${kind} sevkiyatı düzenle`}
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setConfirmCancel(true)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
              aria-label={`${kind} sevkiyatı sil`}
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

      {done ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
          <CheckCircle2 size={15} /> {doneLabel} {item.completed_at ? formatDateTime(item.completed_at) : ""}
          {item.completed_by && names?.[item.completed_by] ? ` · ${names[item.completed_by]}` : ""}
        </p>
      ) : confirmCancel ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-secondary py-2.5" onClick={() => setConfirmCancel(false)}>
            Vazgeç
          </button>
          <button className="btn-danger py-2.5" disabled={pending} onClick={() => act(() => cancelManualShipment(item.id))}>
            {pending && <Loader2 size={16} className="animate-spin" />} Sil
          </button>
        </div>
      ) : (
        <button className="btn-primary mt-3 w-full py-2.5" disabled={pending} onClick={() => act(() => completeManualShipment(item.id))}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={17} />} {doneLabel}
        </button>
      )}
      {error && <p className="mt-2 text-sm font-medium text-accent-700">{error}</p>}
      {!done && <ManualShipmentSheet open={editing} onClose={() => setEditing(false)} item={item} />}
    </div>
  );
}
