"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle2,
  FileSignature,
  FlaskConical,
  Landmark,
  Loader2,
  Pencil,
  PhoneCall,
  Scale,
  Send,
  Tag,
  Trash2,
  Truck,
  Undo2,
  XCircle,
} from "lucide-react";
import {
  createShipment,
  deleteRecord,
  logCall,
  markSampleSent,
  requestSample,
  setGuarantee,
  setResult,
  setYmResult,
  type ActionResult,
} from "@/app/(app)/actions";
import { Sheet } from "./sheet";
import { AdjustSheet, PricesSheet } from "./tender";
import { formatDate, formatMoney, formatPhone, formatQty, todayIstanbul } from "@/lib/format";
import { telHref } from "@/lib/phone";
import { isTenderType, lineName, type LineProgress, type RecordLine, type SalesRecord, type SampleItem } from "@/lib/types";

type EndMode = "tarih" | "ay" | "gun";

/** Başlangıç tarihine ay ya da gün ekler ("YYYY-MM-DD"). Ay eklerken gün ayın sonunu aşarsa ayın son günü alınır (31 Ocak + 1 ay = 28/29 Şubat). */
function addToDate(start: string, n: number, unit: "ay" | "gun") {
  const [y, m, d] = start.split("-").map(Number);
  const date =
    unit === "gun"
      ? new Date(Date.UTC(y, m - 1, d + n))
      : new Date(Date.UTC(y, m - 1 + n, Math.min(d, new Date(Date.UTC(y, m + n, 0)).getUTCDate())));
  return date.toISOString().slice(0, 10);
}

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
  samples = [],
}: {
  record: SalesRecord;
  lines: RecordLine[];
  progress: Record<string, LineProgress>;
  samples?: SampleItem[];
}) {
  const [sheet, setSheet] = useState<null | "call" | "result" | "ship" | "sample" | "prices" | "adjust" | "ym">(null);
  const close = () => setSheet(null);
  const isDt = record.type === "dogrudan_temin";
  const isGs = record.type === "genel_siparis";
  const isYm = record.type === "yaklasik_maliyet";
  const isTender = isTenderType(record.type);
  const isIhale = record.type === "ihale_siparisi";
  const isDmo = record.type === "dmo_ihalesi"; // DMO: teminat, numune, iş artışı/eksiltmesi yok
  const sampleable = isDt || isIhale; // numune adımı doğrudan temin ve ihalede
  const canCall = isDt && (record.status === "arama_bekliyor" || record.status === "arandi");
  const decided = record.status === "onaylandi" || record.status === "reddedildi";
  const canShip = !isYm && record.status === "onaylandi" && lines.some((l) => l.approved && Number(progress[l.id]?.remaining ?? 0) > 0);
  const ym = useAction();
  const sent = useAction();
  const guarantee = useAction();

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
            <button onClick={() => setSheet("sample")} className="btn-secondary col-span-2">
              <FlaskConical size={18} /> Numune istendi
            </button>
          </div>
        )}
        {isDmo && record.status === "ihale_bekliyor" && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSheet("prices")} className={record.prices_entered_at ? "btn-secondary" : "btn-primary"}>
              <Tag size={17} /> {record.prices_entered_at ? "Fiyatlarımız" : "Fiyatlarımızı gir"}
            </button>
            <button onClick={() => setSheet("result")} className="btn-secondary">
              <FileSignature size={17} /> Sipariş / sonuç
            </button>
          </div>
        )}
        {isIhale && record.status === "ihale_bekliyor" && (
          <div className="grid grid-cols-2 gap-2">
            {record.guarantee_paid_at ? (
              <button
                onClick={() => guarantee.run(() => setGuarantee(record.id, false))}
                className="btn-secondary text-emerald-700"
                disabled={guarantee.pending}
                title="Geri almak için dokunun"
              >
                <BadgeCheck size={18} /> Teminat yatırıldı
              </button>
            ) : (
              <button
                onClick={() => guarantee.run(() => setGuarantee(record.id, true))}
                className="btn-primary"
                disabled={guarantee.pending}
              >
                {guarantee.pending ? <Loader2 size={18} className="animate-spin" /> : <Landmark size={17} />} Teminat yatırıldı
              </button>
            )}
            <button onClick={() => setSheet("prices")} className={record.prices_entered_at ? "btn-secondary" : "btn-primary"}>
              <Tag size={17} /> {record.prices_entered_at ? "Fiyatlarımız" : "Fiyatlarımızı gir"}
            </button>
            <button onClick={() => setSheet("sample")} className="btn-secondary">
              <FlaskConical size={18} /> Numune istendi
            </button>
            <button onClick={() => setSheet("result")} className="btn-secondary">
              <FileSignature size={17} /> Sözleşme / sonuç
            </button>
          </div>
        )}
        <ErrorText error={guarantee.error} />
        {sampleable && record.status === "numune_istendi" && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => sent.run(() => markSampleSent(record.id))} className="btn-primary" disabled={sent.pending}>
              {sent.pending ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />} Numune gönderildi
            </button>
            <button onClick={() => setSheet("result")} className="btn-secondary">
              {isTender ? <FileSignature size={17} /> : <CheckCircle2 size={18} />} {isTender ? "Sözleşme / sonuç" : "Sonuç gir"}
            </button>
            <button onClick={() => setSheet("sample")} className="btn-secondary col-span-2">
              <Pencil size={17} /> Numune talebini düzenle
            </button>
          </div>
        )}
        {sampleable && record.status === "numune_gonderildi" && (
          <button onClick={() => setSheet("result")} className="btn-primary">
            {isTender ? <FileSignature size={17} /> : <CheckCircle2 size={18} />} {isTender ? "Sözleşme / sonuç" : "Sonuç gir"}
          </button>
        )}
        {isTender && (record.status === "numune_istendi" || record.status === "numune_gonderildi") && (
          <button onClick={() => setSheet("prices")} className="btn-secondary">
            <Tag size={17} /> {record.prices_entered_at ? "Fiyatlarımız" : "Fiyatlarımızı gir"}
          </button>
        )}
        <ErrorText error={sent.error} />
        {canShip && (
          <button onClick={() => setSheet("ship")} className="btn-primary">
            <Truck size={18} /> Sevkiyata aktar
          </button>
        )}
        {isGs && record.status === "acik" && (
          <button onClick={() => setSheet("result")} className="btn-primary">
            <CheckCircle2 size={18} /> Onayla
          </button>
        )}
        {isIhale && record.status === "onaylandi" && (
          <button onClick={() => setSheet("adjust")} className="btn-secondary">
            <Scale size={17} /> İş artışı / eksiltmesi
          </button>
        )}
        {(isDt || isGs || isTender) && decided && (
          <button onClick={() => setSheet("result")} className="btn-secondary">
            <Pencil size={17} />{" "}
            {isDmo && record.status === "onaylandi"
              ? "Siparişi düzenle"
              : isIhale && record.status === "onaylandi"
                ? "Sözleşmeyi düzenle"
                : "Sonucu düzenle"}
          </button>
        )}
        {isYm && record.status === "acik" && (
          <button onClick={() => setSheet("ym")} className="btn-primary">
            <CheckCircle2 size={18} /> Sonuç gir
          </button>
        )}
        {isYm && decided && (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setSheet("ym")} className="btn-secondary">
              <Pencil size={17} /> Sonucu düzenle
            </button>
            <button onClick={() => ym.run(() => setYmResult(record.id, [], "", true))} className="btn-secondary" disabled={ym.pending}>
              <Undo2 size={18} /> Sonucu geri al
            </button>
          </div>
        )}
        <ErrorText error={ym.error} />
      </div>

      <CallSheet open={sheet === "call"} onClose={close} record={record} />
      {/* Her açılışta güncel sonuçla yeniden başlasın diye yalnızca açıkken bağlanır */}
      {sheet === "result" && <ResultSheet open onClose={close} record={record} lines={lines} progress={progress} />}
      {sheet === "ym" && <YmSheet onClose={close} record={record} lines={lines} />}
      {sheet === "sample" && <SampleSheet open onClose={close} record={record} lines={lines} samples={samples} />}
      {sheet === "prices" && <PricesSheet open onClose={close} record={record} lines={lines} />}
      {sheet === "adjust" && <AdjustSheet open onClose={close} record={record} lines={lines} progress={progress} />}
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
          onClick={() =>
            run(
              () => logCall(record.id, note, keep),
              () => (setNote(""), onClose()),
            )
          }
        >
          <Spinner show={pending} /> Kaydet
        </button>
      </div>
    </Sheet>
  );
}

/** Hastanenin istediği numuneler: kalem seçilir, miktarı girilir (zorunlu). */
function SampleSheet({
  open,
  onClose,
  record,
  lines,
  samples,
}: {
  open: boolean;
  onClose: () => void;
  record: SalesRecord;
  lines: RecordLine[];
  samples: SampleItem[];
}) {
  const { pending, error, run, setError } = useAction();
  const editing = record.status === "numune_istendi";
  const [note, setNote] = useState(editing ? (record.sample_note ?? "") : "");
  const [sel, setSel] = useState<Record<string, { on: boolean; qty: string }>>(() =>
    Object.fromEntries(
      lines.map((l) => {
        const prev = samples.find((x) => x.product_name === l.product_name);
        return [l.id, { on: Boolean(prev), qty: prev ? String(prev.quantity).replace(".", ",") : "" }];
      }),
    ),
  );
  const [bad, setBad] = useState<string>();

  function submit() {
    const chosen = lines.filter((l) => sel[l.id]?.on);
    if (!chosen.length) return setError("İstenen en az bir numune seçin.");
    const wrong = chosen.find((l) => !(parseNum(sel[l.id].qty) > 0));
    if (wrong) {
      setSel((x) => ({ ...x, [wrong.id]: { ...x[wrong.id], qty: "" } }));
      setBad(wrong.id);
      document.getElementById(`sample-${wrong.id}`)?.focus();
      return setError("Numune miktarını girin (sıfırdan büyük olmalı).");
    }
    const items = chosen.map((l) => ({ product_name: l.product_name, quantity: parseNum(sel[l.id].qty), unit: l.unit }));
    run(() => requestSample(record.id, note, items), onClose);
  }

  return (
    <Sheet open={open} onClose={onClose} title={editing ? "Numune talebini düzenle" : "Numune istendi"}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Hastanenin numune istediği ürünleri seçip miktarını girin. Numune gönderildi denene kadar mesai içinde 2 saatte bir hatırlatma
          gider.
        </p>
        <div className="space-y-2">
          {lines.map((l) => {
            const s = sel[l.id];
            return (
              <div
                key={l.id}
                className={`rounded-xl p-3 ring-1 transition ${s.on ? "bg-white ring-violet-200" : "bg-canvas ring-transparent"}`}
              >
                <label className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={s.on}
                    onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...s, on: e.target.checked } }))}
                    className="mt-0.5 h-5 w-5 accent-brand-600"
                  />
                  <span className="min-w-0 flex-1">
                    <b className="block truncate text-[15px] font-semibold">{lineName(l)}</b>
                    <span className="text-[13px] text-muted">
                      Teklif: {formatQty(l.quantity)} {l.unit}
                    </span>
                  </span>
                </label>
                {s.on && (
                  <div className="mt-2.5 flex items-center gap-2 pl-8">
                    <span className="text-[13px] text-muted">Numune</span>
                    <input
                      id={`sample-${l.id}`}
                      value={s.qty}
                      onChange={(e) => {
                        if (bad === l.id) setBad(undefined);
                        setSel((x) => ({ ...x, [l.id]: { ...s, qty: e.target.value } }));
                      }}
                      aria-invalid={bad === l.id || undefined}
                      inputMode="decimal"
                      className="input w-28 py-2 text-right"
                      aria-label={`${l.product_name} numune miktarı`}
                    />
                    <span className="text-[13px] text-muted">{l.unit}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input resize-none"
          placeholder="Not (isteğe bağlı). Ör. Ameliyathaneye, Ayşe Hanım'a teslim edilecek."
        />
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending} onClick={submit}>
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
  // İhalede onay = sözleşme: sözleşmeye davet edilen ürünler ve hastanenin hepsini alacağı son tarih.
  // DMO ihalesinde onay = sipariş: bize kalan ürünler ve teslim son tarihi.
  const tender = isTenderType(record.type);
  const dmo = record.type === "dmo_ihalesi";
  const T = dmo
    ? {
        approve: "Sipariş geldi",
        pick: "Bize kalan ürünleri seçip sipariş miktarını girin. Seçilmeyen ürünler reddedilmiş sayılır.",
        start: "Sipariş tarihi",
        end: "Teslim son tarihi",
        hint: "Hastanenin bildirdiği, siparişteki tüm ürünlerin teslim edilmesi gereken son tarih.",
        qty: "Sipariş",
        none: "Siparişi gelen en az bir ürün seçin.",
        noStart: "Sipariş tarihini girin.",
        noEnd: "Teslim son tarihini girin.",
        order: "Teslim son tarihi sipariş tarihinden önce olamaz.",
        edit: "Siparişi düzenle",
        title: "DMO ihalesi sonucu",
      }
    : {
        approve: "Sözleşme imzalandı",
        pick: "Sözleşmeye davet edilen ürünleri seçip sözleşme miktarını girin. Seçilmeyen ürünler reddedilmiş sayılır.",
        start: "İmza tarihi",
        end: "Teslim son tarihi",
        hint: "İmza tarihi sözleşmenin başlangıcıdır. Teslim son tarihi, hastanenin tüm ürünleri alacağı son tarihtir.",
        qty: "Sözleşme",
        none: "Sözleşme imzalanan en az bir ürün seçin.",
        noStart: "Sözleşme imza tarihini girin.",
        noEnd: "Teslim son tarihini girin.",
        order: "Teslim son tarihi imza tarihinden önce olamaz.",
        edit: "Sözleşmeyi düzenle",
        title: "Hastane ihalesi sonucu",
      };
  const [contractStart, setContractStart] = useState(record.contract_start ?? todayIstanbul());
  const [contractEnd, setContractEnd] = useState(record.contract_end ?? "");
  // Teslim son tarihi doğrudan tarih olarak ya da imza / sipariş tarihinden itibaren ay veya gün sayısıyla girilir.
  const [endMode, setEndMode] = useState<EndMode>("tarih");
  const [endCount, setEndCount] = useState("");
  const count = /^\d{1,4}$/.test(endCount.trim()) ? Number(endCount.trim()) : 0;
  const endDate = endMode === "tarih" ? contractEnd : count > 0 && contractStart ? addToDate(contractStart, count, endMode) : "";
  const [badDate, setBadDate] = useState<"start" | "end">();
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
  // Genel satışta sipariş zaten alınmıştır: reddetme yok, onay seçili gelir.
  const gs = record.type === "genel_siparis";
  // Hatalı miktar alanı: kırmızı çerçeveyle işaretlenip temizlenir, diğer kalemler yerinde kalır.
  const [bad, setBad] = useState<string>();
  const reject = (lineId: string, msg: string) => {
    setSel((x) => ({ ...x, [lineId]: { ...x[lineId], qty: "" } }));
    setBad(lineId);
    setError(msg);
  };

  function submit() {
    if (mode === "red") {
      if (lines.some((l) => shipped(l.id) > 0)) return setError("Bu kayıtta sevkiyat var. Reddetmek için önce sevkiyatları iptal edin.");
      return run(() => setResult(record.id, false, note, []), onClose);
    }
    const chosen = lines.filter((l) => sel[l.id]?.on).map((l) => ({ line_id: l.id, approved_qty: parseNum(sel[l.id].qty) }));
    if (!chosen.length) return setError(tender ? T.none : "Onaylanan en az bir kalem seçin.");
    if (tender && lines.some((l) => sel[l.id]?.on && l.unit_price === null))
      return setError("Seçilen ürünlerin fiyatı girilmemiş. Önce “Fiyatlarımızı gir” ile verdiğimiz fiyatları girin.");
    const badField = (field: "start" | "end", msg: string) => {
      setBadDate(field);
      document.getElementById(`contract-${field}`)?.focus();
      return setError(msg);
    };
    if (tender && !contractStart) return badField("start", T.noStart);
    if (tender && !endDate)
      return badField("end", endMode === "tarih" ? T.noEnd : endMode === "ay" ? "Kaç ay olduğunu girin." : "Kaç gün olduğunu girin.");
    if (tender && endDate < contractStart) return badField("end", T.order);
    const zero = chosen.find((c) => !(c.approved_qty > 0));
    if (zero) return reject(zero.line_id, "Onaylanan miktar sıfırdan büyük olmalı.");
    const blocked = lines.find((l) => shipped(l.id) > (chosen.find((c) => c.line_id === l.id)?.approved_qty ?? 0));
    if (blocked) {
      return reject(
        blocked.id,
        `${blocked.product_name} için ${formatQty(shipped(blocked.id))} ${blocked.unit} sevkiyata aktarılmış. Onaylanan miktar bunun altına inemez.`,
      );
    }
    run(() => setResult(record.id, true, note, chosen, tender ? endDate : null, tender ? contractStart : null), onClose);
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? (tender ? T.edit : "Sonucu düzenle") : gs ? "Genel satış onayı" : tender ? T.title : "Doğrudan temin sonucu"}
    >
      <div className="space-y-4">
        {gs ? null : (
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1">
            <button
              onClick={() => setMode("onay")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold ${mode === "onay" ? "bg-white text-emerald-700 shadow-sm" : "text-muted"}`}
            >
              <CheckCircle2 size={17} /> {tender ? T.approve : "Onaylandı"}
            </button>
            <button
              onClick={() => setMode("red")}
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold ${mode === "red" ? "bg-white text-accent-600 shadow-sm" : "text-muted"}`}
            >
              <XCircle size={17} /> Reddedildi
            </button>
          </div>
        )}

        {mode === "onay" ? (
          <div className="space-y-2">
            <p className="text-sm text-muted">
              {gs
                ? "Kalemler onaylı olarak seçili geldi. Gerekirse miktarı düzeltin."
                : tender
                  ? T.pick
                  : "Onaylanan kalemleri seçin ve onaylanan miktarı düzeltin."}
            </p>
            {tender && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="field-label" htmlFor="contract-start">
                    {T.start}
                  </label>
                  <input
                    id="contract-start"
                    type="date"
                    value={contractStart}
                    onChange={(e) => (setBadDate(undefined), setContractStart(e.target.value))}
                    aria-invalid={badDate === "start" || undefined}
                    className="input"
                  />
                </div>
                <div className="col-span-2">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label className="text-[13px] font-medium text-muted" htmlFor="contract-end">
                      {T.end}
                    </label>
                    <div
                      className="grid grid-cols-3 gap-0.5 rounded-lg bg-canvas p-0.5"
                      role="group"
                      aria-label="Teslim son tarihi nasıl girilsin"
                    >
                      {(
                        [
                          ["tarih", "Tarih"],
                          ["ay", "Ay"],
                          ["gun", "Gün"],
                        ] as const
                      ).map(([k, label]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => (setBadDate(undefined), setEndCount(""), setEndMode(k))}
                          aria-pressed={endMode === k}
                          className={`rounded-md px-3 py-1 text-[13px] font-semibold ${endMode === k ? "bg-white text-brand-700 shadow-sm" : "text-muted"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {endMode === "tarih" ? (
                    <input
                      id="contract-end"
                      type="date"
                      value={contractEnd}
                      onChange={(e) => (setBadDate(undefined), setContractEnd(e.target.value))}
                      aria-invalid={badDate === "end" || undefined}
                      className="input"
                    />
                  ) : (
                    <>
                      <div className="relative">
                        <input
                          id="contract-end"
                          key={endMode}
                          value={endCount}
                          onChange={(e) => (setBadDate(undefined), setEndCount(e.target.value.replace(/\D/g, "")))}
                          aria-invalid={badDate === "end" || undefined}
                          inputMode="numeric"
                          placeholder={endMode === "ay" ? "ör. 3" : "ör. 90"}
                          className="input pr-28"
                          autoFocus
                        />
                        <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[14px] text-muted">
                          {endMode === "ay" ? "ay" : "gün"} sonra
                        </span>
                      </div>
                      <p className="mt-1 text-[13px] font-medium text-brand-700">
                        {endDate ? `Teslim son tarihi: ${formatDate(endDate)}` : `${T.start} itibarıyla sayılır.`}
                      </p>
                    </>
                  )}
                </div>
                <p className="col-span-2 -mt-1 text-[12px] text-muted">{T.hint}</p>
              </div>
            )}
            {lines.map((l) => {
              const s = sel[l.id];
              return (
                <div
                  key={l.id}
                  className={`rounded-xl p-3 ring-1 transition ${s.on ? "bg-white ring-brand-200" : "bg-canvas ring-transparent"}`}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={s.on}
                      onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...s, on: e.target.checked } }))}
                      className="mt-0.5 h-5 w-5 accent-brand-600"
                    />
                    <span className="min-w-0 flex-1">
                      <b className="block truncate text-[15px] font-semibold">{lineName(l)}</b>
                      <span className="text-[13px] text-muted">
                        {gs ? "Sipariş" : tender ? "İhale" : "Teklif"}: {formatQty(l.quantity)} {l.unit} ·{" "}
                        {l.unit_price === null ? "fiyat girilmedi" : formatMoney(l.unit_price, l.currency)}
                      </span>
                    </span>
                  </label>
                  {s.on && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-8">
                      <span className="text-[13px] text-muted">{tender ? T.qty : "Onaylanan"}</span>
                      <input
                        value={s.qty}
                        onChange={(e) => (
                          bad === l.id && setBad(undefined),
                          setSel((x) => ({ ...x, [l.id]: { ...s, qty: e.target.value } }))
                        )}
                        aria-invalid={bad === l.id || undefined}
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

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input resize-none"
          placeholder="Not (isteğe bağlı)"
        />
        <ErrorText error={error} />
        <button className={mode === "onay" ? "btn-primary w-full" : "btn-danger w-full"} disabled={pending} onClick={submit}>
          <Spinner show={pending} />{" "}
          {mode === "onay" ? (tender ? `${T.approve} olarak kaydet` : "Onaylandı olarak kaydet") : "Reddedildi olarak kaydet"}
        </button>
      </div>
    </Sheet>
  );
}

/**
 * Yaklaşık maliyet sonucu: her kalem için hastanenin yaklaşık maliyet birim fiyatı girilir ve kalem tek tek onaylanır.
 * Fiyatımız yaklaşık maliyetin altında/eşitse kalem onaylı gelir; kullanıcı değiştirebilir (kısmi onay).
 */
function YmSheet({ onClose, record, lines }: { onClose: () => void; record: SalesRecord; lines: RecordLine[] }) {
  const { pending, error, run, setError } = useAction();
  const decided = record.status === "onaylandi" || record.status === "reddedildi";
  const [note, setNote] = useState(decided ? (record.result_note ?? "") : "");
  const [bad, setBad] = useState<string>();
  const [sel, setSel] = useState<Record<string, { on: boolean; ym: string }>>(() =>
    Object.fromEntries(
      lines.map((l) => [
        l.id,
        {
          on: decided ? Boolean(l.approved) : true,
          ym: l.ym_price == null ? "" : String(l.ym_price).replace(".", ","),
        },
      ]),
    ),
  );
  const under = (l: RecordLine, ym: string) => {
    const v = parseNum(ym);
    if (l.unit_price === null || !Number.isFinite(v)) return null;
    return Number(l.unit_price) <= v;
  };
  const setYm = (l: RecordLine, ym: string) => {
    if (bad === l.id) setBad(undefined);
    const u = under(l, ym);
    setSel((x) => ({ ...x, [l.id]: { ym, on: u === null ? x[l.id].on : u } }));
  };
  const submit = () => {
    const out: { line_id: string; approved: boolean; ym_price: number | null }[] = [];
    for (const l of lines) {
      const s = sel[l.id];
      const v = s.ym.trim() ? parseNum(s.ym) : null;
      if (v !== null && (!Number.isFinite(v) || v < 0)) {
        setBad(l.id);
        setSel((x) => ({ ...x, [l.id]: { ...s, ym: "" } }));
        return setError(`${lineName(l)} için geçerli bir yaklaşık maliyet fiyatı girin.`);
      }
      out.push({ line_id: l.id, approved: s.on, ym_price: v });
    }
    run(() => setYmResult(record.id, out, note), onClose);
  };
  const won = lines.filter((l) => sel[l.id].on).length;
  return (
    <Sheet open onClose={onClose} title="Yaklaşık maliyet sonucu">
      <div className="space-y-3">
        <p className="text-sm text-muted">
          Hastanenin belirttiği yaklaşık maliyet birim fiyatlarını girin ve onaylanan kalemleri işaretleyin. İşaretlenmeyen kalemler
          reddedilmiş sayılır.
        </p>
        {lines.map((l) => {
          const s = sel[l.id];
          const u = under(l, s.ym);
          return (
            <div
              key={l.id}
              className={`rounded-xl p-3 ring-1 transition ${s.on ? "bg-white ring-brand-200" : "bg-canvas ring-transparent"}`}
            >
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={s.on}
                  onChange={(e) => setSel((x) => ({ ...x, [l.id]: { ...s, on: e.target.checked } }))}
                  className="mt-0.5 h-5 w-5 accent-brand-600"
                  aria-label={`${l.product_name} onaylandı`}
                />
                <span className="min-w-0 flex-1">
                  <b className="block text-[15px] font-semibold">{lineName(l)}</b>
                  <span className="text-[13px] text-muted">
                    {formatQty(l.quantity)} {l.unit} · Fiyatımız{" "}
                    {l.unit_price === null ? "girilmedi" : formatMoney(l.unit_price, l.currency)}
                  </span>
                </span>
                <span className={`chip shrink-0 ${s.on ? "bg-emerald-50 text-emerald-700" : "bg-accent-50 text-accent-700"}`}>
                  {s.on ? "Onaylandı" : "Reddedildi"}
                </span>
              </label>
              <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-8">
                <span className="text-[13px] text-muted">Yaklaşık maliyet</span>
                <input
                  value={s.ym}
                  onChange={(e) => setYm(l, e.target.value)}
                  aria-invalid={bad === l.id || undefined}
                  inputMode="decimal"
                  className="input w-28 py-2 text-right"
                  placeholder="Birim fiyat"
                  aria-label={`${l.product_name} yaklaşık maliyet fiyatı`}
                />
                <span className="text-[13px] text-muted">{l.currency === "TRY" ? "TL" : l.currency}</span>
                {u !== null && (
                  <span className={`w-full text-[12px] font-medium ${u ? "text-emerald-700" : "text-accent-600"}`}>
                    Fiyatımız yaklaşık maliyetin {u ? "altında" : "üstünde"}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input resize-none"
          placeholder="Not (isteğe bağlı)"
        />
        <ErrorText error={error} />
        <button className={won ? "btn-primary w-full" : "btn-danger w-full"} disabled={pending} onClick={submit}>
          <Spinner show={pending} />{" "}
          {won === 0
            ? "Reddedildi olarak kaydet"
            : won < lines.length
              ? `${won}/${lines.length} kalem onaylı kaydet`
              : "Onaylandı olarak kaydet"}
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
  const [bad, setBad] = useState<string>(); // hatalı miktar alanı: kırmızı çerçeve, yalnızca o alan temizlenir

  function submit() {
    const items = shippable
      .map((l) => ({ line_id: l.id, quantity: parseNum(qty[l.id] ?? "") }))
      .filter((i) => !Number.isNaN(i.quantity) && i.quantity > 0);
    if (!items.length) return setError("Sevk edilecek miktarı en az bir kalem için girin.");
    for (const i of items) {
      if (i.quantity > Number(progress[i.line_id].remaining)) {
        setQty((x) => ({ ...x, [i.line_id]: "" }));
        setBad(i.line_id);
        return setError("Girilen miktar kalan onaylı miktardan fazla olamaz.");
      }
    }
    run(
      () => createShipment(record.id, note, items, planned),
      () => (setQty({}), setNote(""), onClose()),
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title="Sevkiyata aktar">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {record.type === "genel_siparis" ? "Müşteriye şimdi gidecek" : "Hastanenin şimdi istediği"} miktarı girin. Kalan miktar daha sonra
          ayrıca aktarılabilir.
        </p>
        {shippable.map((l) => {
          const p = progress[l.id];
          return (
            <div key={l.id} className="rounded-xl bg-white p-3 ring-1 ring-line">
              <b className="block truncate text-[15px] font-semibold">{lineName(l)}</b>
              <p className="text-[13px] text-muted">
                Onaylanan {formatQty(p.approved_qty)} · Kalan <b className="text-ink">{formatQty(p.remaining)}</b> {l.unit}
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  value={qty[l.id] ?? ""}
                  onChange={(e) => (bad === l.id && setBad(undefined), setQty((x) => ({ ...x, [l.id]: e.target.value })))}
                  aria-invalid={bad === l.id || undefined}
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
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input resize-none"
          placeholder="Sevkiyat notu (isteğe bağlı)"
        />
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
          <b className="text-ink">{record.hospital}</b> kaydı, ürünleri, görüşme notları ve sevkiyatlarıyla birlikte kalıcı olarak
          silinecek.
        </p>
        <ErrorText error={error} />
        <div className="grid grid-cols-2 gap-2">
          <button className="btn-secondary" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn-danger"
            disabled={pending}
            onClick={() =>
              run(
                () => deleteRecord(record.id),
                () => router.replace("/"),
              )
            }
          >
            <Spinner show={pending} /> Sil
          </button>
        </div>
      </div>
    </Sheet>
  );
}
