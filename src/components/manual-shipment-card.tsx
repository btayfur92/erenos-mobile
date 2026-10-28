"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/sheet";
import { CheckCircle2, Loader2, PackageCheck, PackageOpen, Pencil, Truck, X } from "lucide-react";
import { cancelManualShipment, completeManualShipment } from "@/app/(app)/actions";
import { ManualShipmentSheet } from "@/components/add-shipment";
import { KindBadge } from "@/components/shipment-card";
import { formatDate, formatDateTime, formatQty, todayIstanbul } from "@/lib/format";
import type { ManualShipment } from "@/lib/types";

/** Elle eklenen sevkiyat kartı: gelecek (tedarikçiden bize) ya da doğrudan temine bağlı olmayan gidecek. */
/** canDeliver: gidecekte teslim edildi işaretleyebilir (satış kullanıcısında yok; gelecekte teslim alındıyı herkes işaretler). */
export function ManualShipmentCard({
  item,
  names,
  canDeliver = true,
}: {
  item: ManualShipment;
  names?: Record<string, string>;
  canDeliver?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [editing, setEditing] = useState(false);
  const gelecek = item.direction === "gelecek";
  const done = item.status === "tamamlandi";
  const late = !done && item.due_date < todayIstanbul();
  const doneLabel = gelecek ? "Teslim alındı" : "Teslim edildi";
  const kind = gelecek ? "Gelecek" : "Gidecek";
  const [delivering, setDelivering] = useState(false);
  // Parça teslimler: kalan miktar sevkiyat programında görünür.
  const deliveries = [...(item.manual_shipment_deliveries ?? [])].sort((a, b) => a.delivered_at.localeCompare(b.delivered_at));
  const delivered = deliveries.reduce((t, d) => t + Number(d.quantity), 0);
  const total = Number(item.quantity);
  const remaining = Math.max(total - delivered, 0);

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
        <b className="shrink-0 font-semibold tabular-nums">
          {formatQty(item.quantity)} <span className="font-normal text-muted">{item.unit}</span>
        </b>
      </div>
      {delivered > 0 && (
        <div className="mt-2 space-y-1.5">
          <div className="flex h-1.5 overflow-hidden rounded-full bg-line">
            <div className="bg-emerald-500" style={{ width: `${Math.min((delivered / total) * 100, 100)}%` }} />
          </div>
          <p className="flex justify-between text-[13px] tabular-nums">
            <span className="text-emerald-700">
              {gelecek ? "Teslim alınan" : "Teslim edilen"}: <b className="font-semibold">{formatQty(delivered)}</b>
            </span>
            {!done && (
              <span className="text-accent-600">
                Kalan: <b className="font-semibold">{formatQty(remaining)}</b> {item.unit}
              </span>
            )}
          </p>
          {(deliveries.length > 1 || !done) && (
            <ul className="space-y-0.5 text-[12px] text-muted">
              {deliveries.map((d) => (
                <li key={d.id}>
                  {formatQty(d.quantity)} {item.unit} · {formatDateTime(d.delivered_at)}
                  {d.delivered_by && names?.[d.delivered_by] ? ` · ${names[d.delivered_by]}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
        (canDeliver || gelecek) && (
          <button className="btn-primary mt-3 w-full py-2.5" disabled={pending} onClick={() => setDelivering(true)}>
            {pending ? <Loader2 size={16} className="animate-spin" /> : <PackageCheck size={17} />} {doneLabel}
          </button>
        )
      )}
      {error && <p className="mt-2 text-sm font-medium text-accent-700">{error}</p>}
      {!done && <ManualShipmentSheet open={editing} onClose={() => setEditing(false)} item={item} />}
      {!done && (
        <DeliverSheet
          key={String(delivering)}
          open={delivering}
          onClose={() => setDelivering(false)}
          id={item.id}
          remaining={remaining}
          unit={item.unit}
          title={gelecek ? "Teslim alınan miktar" : "Teslim edilen miktar"}
        />
      )}
    </div>
  );
}

function parseNum(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

/** Parça teslim: bu sefer teslim edilen miktar. Kalanın tamamı girilirse sevkiyat tamamlanır. */
function DeliverSheet({
  open,
  onClose,
  id,
  remaining,
  unit,
  title,
}: {
  open: boolean;
  onClose: () => void;
  id: string;
  remaining: number;
  unit: string;
  title: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [qty, setQty] = useState(String(remaining).replace(".", ","));
  const [bad, setBad] = useState(false);
  const reject = (msg: string) => (setQty(""), setBad(true), setError(msg));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = parseNum(qty);
    if (!(q > 0)) return reject("Miktar sıfırdan büyük olmalı.");
    if (q > remaining) return reject(`Kalan miktardan fazla girilemez (kalan: ${formatQty(remaining)} ${unit}).`);
    start(async () => {
      const r = await completeManualShipment(id, q);
      if (!r.ok) return setError(r.error);
      onClose();
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          Kalan <b className="text-ink">{formatQty(remaining)}</b> {unit}. Bir kısmı teslim edildiyse o miktarı girin; kalan sevkiyat
          programında görünmeye devam eder.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={qty}
            onChange={(e) => (setBad(false), setQty(e.target.value))}
            aria-invalid={bad || undefined}
            inputMode="decimal"
            className="input flex-1"
            aria-label="Teslim miktarı"
            autoFocus
          />
          <span className="w-14 text-[14px] text-muted">{unit}</span>
          <button type="button" onClick={() => setQty(String(remaining).replace(".", ","))} className="btn-secondary px-3 py-2 text-[13px]">
            Tamamı
          </button>
        </div>
        {error && <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending ? <Loader2 size={18} className="animate-spin" /> : <PackageCheck size={18} />} Kaydet
        </button>
      </form>
    </Sheet>
  );
}
