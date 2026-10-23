"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, PhoneCall, Trash2, Truck, Undo2, XCircle } from "lucide-react";
import {
  createShipment,
  deleteRecord,
  logCall,
  setResult,
  setYmStatus,
  type ActionResult,
} from "@/app/(app)/actions";
import { Sheet } from "./sheet";
import { formatMoney, formatPhone, formatQty, todayIstanbul } from "@/lib/format";
import { telHref } from "@/lib/phone";
import type { LineProgress, RecordLine, SalesRecord } from "@/lib/types";

function parseNum(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<ActionResult>, onOk?: (r: ActionResult & { ok: true }) => void) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else onOk?.(r);
    });
  return { pending, error, run, setError };
}

function ErrorText({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>;
}

function Spinner({ show }: { show: boolean }) {
  return show ? <Loader2 size={18} className="animate-spin" /> : null;
}

export function RecordActions({
  record,
  lines,
  progress,
}: {
  record: SalesRecord;
  lines: RecordLine[];
  progress: Record<string, LineProgress>;
}) {
  const [sheet, setSheet] = useState<null | "call" | "result" | "ship">(null);
  const close = () => setSheet(null);
  const isDt = record.type === "dogrudan_temin";
  const canCall = isDt && (record.status === "arama_bekliyor" || record.status === "arandi");
  const decided = record.status === "onaylandi" || record.status === "reddedildi";
  const canShip =
    record.status === "onaylandi" && lines.some((l) => l.approved && Number(progress[l.id]?.remaining ?? 0) > 0);
  const ym = useAction();

  return (
    <>
      <div className="grid gap-2">
        {canCall && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSheet("call")} className={record.status === "arama_bekliyor" ? "btn-danger" : "btn-secondary"}>
              <PhoneCall size={18} /> Arandı
            </button>
            <button onClick={() => setSheet("result")} className="btn-primary">
              <CheckCircle2 size={18} /> Sonuç gir
            </button>
          </div>
        )}
        {canShip && (
          <button onClick={() => setSheet("ship")} className="btn-primary">
            <Truck size={18} /> Sevkiyata aktar
          </button>
        )}
        {isDt && decided && (
          <button onClick={() => setSheet("result")} className="btn-secondary">
            <Pencil size={17} /> Sonucu düzenle
          </button>
        )}
        {!isDt && record.status === "acik" && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => ym.run(() => setYmStatus(record.id, "onaylandi"))} className="btn-primary" disabled={ym.pending}>
              <CheckCircle2 size={18} /> Onaylandı
            </button>
            <button onClick={() => ym.run(() => setYmStatus(record.id, "reddedildi"))} className="btn-secondary text-accent-600" disabled={ym.pending}>
              <XCircle size={18} /> Reddedildi
            </button>
          </div>
        )}
        {!isDt && decided && (
          <button onClick={() => ym.run(() => setYmStatus(record.id, "acik"))} className="btn-secondary" disabled={ym.pending}>
            <Undo2 size={18} /> Sonucu geri al
          </button>
        )}
        <ErrorText error={ym.error} />
      </div>

      <CallSheet open={sheet === "call"} onClose={close} record={record} />
      {/* Her açılışta güncel sonuçla yeniden başlasın diye yalnızca açıkken bağlanır */}
      {sheet === "result" && <ResultSheet open onClose={close} record={record} lines={lines} progress={progress} />}
      <ShipmentSheet open={sheet === "ship"} onClose={close} record={record} lines={lines} progress={progress} />
    </>
  );
}

export function DeleteButton({ record }: { record: SalesRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn w-full text-accent-600 hover:bg-accent-50">
        <Trash2 size={18} /> Kaydı sil
      </button>
      <DeleteSheet open={open} onClose={() => setOpen(false)} record={record} />
    </>
  );
}

function CallSheet({ open, onClose, record }: { open: boolean; onClose: () => void; record: SalesRecord }) {
  const { pending, error, run } = useAction();
  const [note, setNote] = useState("");
  const [keep, setKeep] = useState(false);
  return (
    <Sheet open={open} onClose={onClose} title="Görüşme notu">
      <div className="space-y-4">
        {record.contact_phone && (
          <a href={telHref(record.contact_phone)} className="btn-secondary w-full">
            <PhoneCall size={18} /> {record.contact_name ? `${record.contact_name} · ` : ""}
            {formatPhone(record.contact_phone, record.contact_ext)}
          </a>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          className="input resize-none"
          placeholder="Görüşmede ne konuşuldu? Ör. Komisyon yarın toplanacak, Perşembe tekrar arayın."
          autoFocus
        />
        <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-canvas p-3.5">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="mt-0.5 h-5 w-5 accent-brand-600" />
          <span className="text-sm">
            <b className="block font-semibold">Tekrar aranacak</b>
            <span className="text-muted">Hatırlatma bildirimleri devam etsin (2 saatte bir, mesai içinde).</span>
          </span>
        </label>
        <ErrorText error={error} />
        <button
          className="btn-primary w-full"
          disabled={pending || !note.trim()}
          onClick={() => run(() => logCall(record.id, note, keep), () => (setNote(""), onClose()))}
        >
          <Spinner show={pending} /> Kaydet
        </button>
      </div>
    </Sheet>
  );
}

function ResultSheet({
  open,
  onClose,
  record,
  lines,
  progress,
}: {
  open: boolean;
  onClose: () => void;
  record: SalesRecord;
  lines: RecordLine[];
  progress: Record<string, LineProgress>;
}) {
  const { pending, error, run, setError } = useAction();
  const editing = record.status === "onaylandi" || record.status === "reddedildi";
  const [mode, setMode] = useState<"onay" | "red">(record.status === "reddedildi" ? "red" : "onay");
  const [note, setNote] = useState(editing ? (record.result_note ?? "") : "");
  const [sel, setSel] = useState<Record<string, { on: boolean; qty: string }>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        {
          on: record.status === "onaylandi" ? Boolean(l.approved) : true,
          qty: String(l.approved_qty ?? l.quantity).replace(".", ","),
        },
      ]),
    ),
  );
  const shipped = (lineId: string) => Number(progress[lineId]?.in_shipment ?? 0) + Number(progress[lineId]?.delivered ?? 0);

  function submit() {
    if (mode === "red") {
      if (lines.some((l) => shipped(l.id) > 0)) return setError("Bu kayıtta sevkiyat var. Reddetmek için önce sevkiyatları iptal edin.");
      return run(() => setResult(record.id, false, note, []), onClose);
    }
    const chosen = lines.filter((l) => sel[l.id]?.on).map((l) => ({ line_id: l.id, approved_qty: parseNum(sel[l.id].qty) }));
    if (!chosen.length) return setError("Onaylanan en az bir kalem seçin.");
    if (chosen.some((c) => !(c.approved_qty > 0))) return setError("Onaylanan miktarları kontrol edin.");
    const blocked = lines.find((l) => shipped(l.id) > (chosen.find((c) => c.line_id === l.id)?.approved_qty ?? 0));
    if (blocked) {
      return setError(
        `${blocked.product_name} için ${formatQty(shipped(blocked.id))} ${blocked.unit} sevkiyata aktarılmış. Onaylanan miktar bunun altına inemez.`,
      );
    }
    run(() => setResult(record.id, true, note, chosen), onClose);
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Sonucu düzenle" : "Doğrudan temin sonucu"}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1">
          <button
            onClick={() => setMode("onay")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold ${mode === "onay" ? "bg-white text-emerald-700 shadow-sm" : "text-muted"}`}
          >
            <CheckCircle2 size={17} /> Onaylandı
          </button>
          <button
            onClick={() => setMode("red")}
            className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold ${mode === "red" ? "bg-white text-accent-600 shadow-sm" : "text-muted"}`}
          >
            <XCircle size={17} /> Reddedildi
          </button>
        </div>

        {mode === "onay" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">Onaylanan kalemleri seçin ve onaylanan miktarı düzeltin.</p>
            {lines.map((l) => {
              const s = sel[l.id];
              return (
                <div key={l.id} className={`rounded-xl p-3 ring-1 transition ${s.on ? "bg-white ring-brand-200" : "bg-canvas ring-transparent"}`}>
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={s.on}
                      onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...s, on: e.target.checked } }))}
                      className="mt-0.5 h-5 w-5 accent-brand-600"
                    />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[15px] font-semibold">{l.product_name}</b>
                      <span className="text-[13px] text-muted">
                        Teklif: {formatQty(l.quantity)} {l.unit} · {formatMoney(l.unit_price, l.currency)}
                      </span>
                    </span>
                  </label>
                  {s.on && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-8">
                      <span className="text-[13px] text-muted">Onaylanan</span>
                      <input
                        value={s.qty}
                        onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...s, qty: e.target.value } }))}
                        inputMode="decimal"
                        className="input w-28 py-2 text-right"
                        aria-label={`${l.product_name} onaylanan miktar`}
                      />
                      <span className="text-[13px] text-muted">{l.unit}</span>
                      {shipped(l.id) > 0 && (
                        <span className="w-full text-[12px] text-muted">
                          {formatQty(shipped(l.id))} {l.unit} sevkiyata aktarıldı, bunun altına inilemez.
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-canvas p-3.5 text-sm text-muted">
            Kayıt <b className="text-ink">Reddedilenler</b> arşivine taşınır. Verilen fiyatlar daha sonra bakabilmeniz için saklanır.
          </p>
        )}

        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-none" placeholder="Not (isteğe bağlı)" />
        <ErrorText error={error} />
        <button className={mode === "onay" ? "btn-primary w-full" : "btn-danger w-full"} disabled={pending} onClick={submit}>
          <Spinner show={pending} /> {mode === "onay" ? "Onaylandı olarak kaydet" : "Reddedildi olarak kaydet"}
        </button>
      </div>
    </Sheet>
  );
}

function ShipmentSheet({
  open,
  onClose,
  record,
  lines,
  progress,
}: {
  open: boolean;
  onClose: () => void;
  record: SalesRecord;
  lines: RecordLine[];
  progress: Record<string, LineProgress>;
}) {
  const { pending, error, run, setError } = useAction();
  const shippable = lines.filter((l) => l.approved && Number(progress[l.id]?.remaining ?? 0) > 0);
  const [qty, setQty] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [planned, setPlanned] = useState(todayIstanbul());

  function submit() {
    const items = shippable
      .map((l) => ({ line_id: l.id, quantity: parseNum(qty[l.id] ?? "") }))
      .filter((i) => !Number.isNaN(i.quantity) && i.quantity > 0);
    if (!items.length) return setError("Hastanenin istediği miktarı en az bir kalem için girin.");
    for (const i of items) {
      if (i.quantity > Number(progress[i.line_id].remaining)) return setError("Girilen miktar kalan onaylı miktardan fazla olamaz.");
    }
    run(() => createShipment(record.id, note, items, planned), () => (setQty({}), setNote(""), onClose()));
  }

  return (
    <Sheet open={open} onClose={onClose} title="Sevkiyata aktar">
      <div className="space-y-4">
        <p className="text-sm text-muted">Hastanenin şimdi istediği miktarı girin. Kalan miktar daha sonra ayrıca aktarılabilir.</p>
        {shippable.map((l) => {
          const p = progress[l.id];
          return (
            <div key={l.id} className="rounded-xl bg-white p-3 ring-1 ring-line">
              <b className="block truncate text-[15px] font-semibold">{l.product_name}</b>
              <p className="text-[13px] text-muted">
                Onaylanan {formatQty(p.approved_qty)} · Kalan <b className="text-ink">{formatQty(p.remaining)}</b> {l.unit}
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  value={qty[l.id] ?? ""}
                  onChange={(e) => setQty((x) => ({ ...x, [l.id]: e.target.value }))}
                  inputMode="decimal"
                  placeholder="İstenen"
                  className="input flex-1 py-2"
                  aria-label={`${l.product_name} istenen miktar`}
                />
                <button
                  type="button"
                  onClick={() => setQty((x) => ({ ...x, [l.id]: String(p.remaining).replace(".", ",") }))}
                  className="btn-secondary px-3 py-2 text-[13px]"
                >
                  Tamamı
                </button>
              </div>
            </div>
          );
        })}
        <div>
          <label className="field-label" htmlFor="planned_date">
            Sevk tarihi
          </label>
          <input id="planned_date" type="date" value={planned} onChange={(e) => setPlanned(e.target.value)} className="input" />
        </div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input resize-none" placeholder="Sevkiyat notu (isteğe bağlı)" />
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending} onClick={submit}>
          <Spinner show={pending} /> <Truck size={18} /> Sevkiyata gönder
        </button>
      </div>
    </Sheet>
  );
}

function DeleteSheet({ open, onClose, record }: { open: boolean; onClose: () => void; record: SalesRecord }) {
  const router = useRouter();
  const { pending, error, run } = useAction();
  return (
    <Sheet open={open} onClose={onClose} title="Kaydı sil">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          <b className="text-ink">{record.hospital}</b> kaydı, ürünleri, görüşme notları ve sevkiyatlarıyla birlikte kalıcı olarak silinecek.
        </p>
        <ErrorText error={error} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button className="btn-danger" disabled={pending} onClick={() => run(() => deleteRecord(record.id), () => router.replace("/"))}>
            <Spinner show={pending} /> Sil
          </button>
        </div>
      </div>
    </Sheet>
  );
}
