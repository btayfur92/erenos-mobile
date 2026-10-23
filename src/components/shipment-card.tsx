"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2, Loader2, PackageCheck, Truck, X } from "lucide-react";
import { cancelShipment, markDelivered } from "@/app/(app)/actions";
import { formatDate, formatDateTime, formatQty, todayIstanbul } from "@/lib/format";
import type { Shipment } from "@/lib/types";

export function ShipmentCard({
  shipment,
  showRecord,
  names,
}: {
  shipment: Shipment;
  showRecord?: boolean;
  names?: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const delivered = shipment.status === "teslim_edildi";
  const late = !delivered && shipment.planned_date < todayIstanbul();

  const act = (fn: () => ReturnType<typeof markDelivered>) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
    });

  return (
    <div className={`card p-4 ${delivered ? "opacity-90" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${delivered ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600"}`}
        >
          {delivered ? <PackageCheck size={20} /> : <Truck size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          {showRecord && <KindBadge kind="gidecek" />}
          {showRecord && shipment.records ? (
            <Link href={`/kayit/${shipment.records.id}`} className="block truncate text-[15px] font-semibold hover:text-brand-600">
              {shipment.records.hospital}
            </Link>
          ) : (
            <b className="block text-[15px] font-semibold">{delivered ? "Teslim edildi" : "Sevk bekliyor"}</b>
          )}
          <p className="text-[12px] text-muted">
            <b className={`font-semibold ${late ? "text-accent-600" : "text-ink/80"}`}>
              Sevk: {formatDate(shipment.planned_date)}
              {late ? " · gecikti" : ""}
            </b>
            {showRecord && shipment.records?.file_no ? ` · ${shipment.records.file_no}` : ""}
            {shipment.created_by && names?.[shipment.created_by] ? ` · ${names[shipment.created_by]}` : ""}
          </p>
        </div>
        {!delivered && !confirmCancel && (
          <button
            onClick={() => setConfirmCancel(true)}
            className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
            aria-label="Sevkiyatı iptal et"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <ul className="mt-3 divide-y divide-line/70 rounded-xl bg-canvas px-3">
        {shipment.shipment_items?.map((i) => (
          <li key={i.id} className="flex items-baseline justify-between gap-3 py-2 text-[14px]">
            <span className="truncate">{i.record_lines?.product_name}</span>
            <b className="shrink-0 font-semibold tabular-nums">
              {formatQty(i.quantity)} <span className="font-normal text-muted">{i.record_lines?.unit}</span>
            </b>
          </li>
        ))}
      </ul>
      {shipment.note && <p className="mt-2 text-[13px] text-muted">{shipment.note}</p>}

      {delivered ? (
        <p className="mt-3 flex items-center gap-1.5 text-[13px] font-medium text-emerald-700">
          <CheckCircle2 size={15} /> {shipment.delivered_at ? formatDateTime(shipment.delivered_at) : ""}
          {shipment.delivered_by && names?.[shipment.delivered_by] ? ` · ${names[shipment.delivered_by]}` : ""}
        </p>
      ) : confirmCancel ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button className="btn-secondary py-2.5" onClick={() => setConfirmCancel(false)}>
            Vazgeç
          </button>
          <button className="btn-danger py-2.5" disabled={pending} onClick={() => act(() => cancelShipment(shipment.id))}>
            {pending && <Loader2 size={16} className="animate-spin" />} Sevkiyatı iptal et
          </button>
        </div>
      ) : (
        <button className="btn-primary mt-3 w-full py-2.5" disabled={pending} onClick={() => act(() => markDelivered(shipment.id))}>
          {pending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={17} />} Teslim edildi
        </button>
      )}
      {error && <p className="mt-2 text-sm font-medium text-accent-700">{error}</p>}
    </div>
  );
}

/** Kartın gidecek mi gelecek mi olduğunu gösteren küçük etiket (sevkiyat listesi karışık sıralı). */
export function KindBadge({ kind }: { kind: "gidecek" | "gelecek" }) {
  return (
    <span
      className={`mb-0.5 inline-block rounded-md px-1.5 py-px text-[11px] font-semibold ${
        kind === "gidecek" ? "bg-brand-50 text-brand-700" : "bg-amber-50 text-amber-700"
      }`}
    >
      {kind === "gidecek" ? "Gidecek sevkiyat" : "Gelecek sevkiyat"}
    </span>
  );
}
