"use client";

import { useState, useTransition } from "react";
import { Loader2, Pencil, Plus, Trash2, Trophy } from "lucide-react";
import { adjustContract, deleteCompetitor, saveCompetitor, setOurPrices, type ActionResult } from "@/app/(app)/actions";
import { Sheet } from "./sheet";
import { formatMoney, formatQty, toTry } from "@/lib/format";
import { CURRENCIES, type LineProgress, type RecordLine, type SalesRecord, type TenderBid } from "@/lib/types";

function parseNum(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

const fmtInput = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));

function useAction() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const run = (fn: () => Promise<ActionResult>, onOk?: () => void) =>
    start(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.error);
      else onOk?.();
    });
  return { pending, error, run, setError };
}

function ErrorText({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>;
}

/** Kalem kalem birim fiyat + döviz girişi. Hatalı alan kırmızı çerçeveyle işaretlenir, yalnızca o temizlenir. */
function PriceRows({
  lines,
  values,
  setValues,
  bad,
  setBad,
  optional,
}: {
  lines: RecordLine[];
  values: Record<string, { price: string; currency: string }>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, { price: string; currency: string }>>>;
  bad?: string;
  setBad: (v?: string) => void;
  optional?: boolean;
}) {
  return (
    <div className="space-y-2">
      {lines.map((l) => {
        const v = values[l.id];
        return (
          <div key={l.id} className="rounded-xl bg-canvas p-3">
            <b className="block truncate text-[14px] font-semibold">{l.product_name}</b>
            <span className="text-[12px] text-muted">
              {formatQty(l.quantity)} {l.unit}
            </span>
            <div className="mt-2 grid grid-cols-[1fr_6.5rem] gap-2">
              <input
                id={`price-${l.id}`}
                value={v.price}
                onChange={(e) => {
                  if (bad === l.id) setBad(undefined);
                  setValues((x) => ({ ...x, [l.id]: { ...v, price: e.target.value } }));
                }}
                aria-invalid={bad === l.id || undefined}
                inputMode="decimal"
                className="input bg-white py-2"
                placeholder={optional ? "Teklif vermedi" : "Birim fiyat"}
                aria-label={`${l.product_name} birim fiyat`}
              />
              <select
                value={v.currency}
                onChange={(e) => setValues((x) => ({ ...x, [l.id]: { ...v, currency: e.target.value } }))}
                className="input bg-white py-2"
                aria-label="Döviz"
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** İhale: verdiğimiz birim fiyatlar (ihaleden önceki son gün girilir). */
export function PricesSheet({
  open,
  onClose,
  record,
  lines,
}: {
  open: boolean;
  onClose: () => void;
  record: SalesRecord;
  lines: RecordLine[];
}) {
  const { pending, error, run, setError } = useAction();
  const [values, setValues] = useState(() =>
    Object.fromEntries(lines.map((l) => [l.id, { price: fmtInput(l.unit_price), currency: l.currency }])),
  );
  const [bad, setBad] = useState<string>();

  function submit() {
    const wrong = lines.find((l) => !(parseNum(values[l.id].price) >= 0));
    if (wrong) {
      setValues((x) => ({ ...x, [wrong.id]: { ...x[wrong.id], price: "" } }));
      setBad(wrong.id);
      document.getElementById(`price-${wrong.id}`)?.focus();
      return setError("Her kalem için birim fiyat girin.");
    }
    run(
      () =>
        setOurPrices(
          record.id,
          lines.map((l) => ({ line_id: l.id, unit_price: parseNum(values[l.id].price), currency: values[l.id].currency })),
        ),
      onClose,
    );
  }

  return (
    <Sheet open={open} onClose={onClose} title={record.prices_entered_at ? "Fiyatlarımızı düzenle" : "Fiyatlarımızı gir"}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          İhalede verdiğimiz birim fiyatları girin. Rakip fiyatları ihaleden sonra bunlarla karşılaştırılır.
        </p>
        <PriceRows lines={lines} values={values} setValues={setValues} bad={bad} setBad={setBad} />
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending} onClick={submit}>
          {pending && <Loader2 size={18} className="animate-spin" />} Kaydet
        </button>
      </div>
    </Sheet>
  );
}

function CompetitorSheet({
  open,
  onClose,
  record,
  lines,
  company,
  bids,
}: {
  open: boolean;
  onClose: () => void;
  record: SalesRecord;
  lines: RecordLine[];
  company?: string; // düzeltilen firma
  bids: TenderBid[];
}) {
  const { pending, error, run, setError } = useAction();
  const [name, setName] = useState(company ?? "");
  const [badName, setBadName] = useState(false);
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      lines.map((l) => {
        const b = company ? bids.find((x) => x.company === company && x.line_id === l.id) : undefined;
        return [l.id, { price: fmtInput(b?.unit_price), currency: b?.currency ?? l.currency }];
      }),
    ),
  );
  const [bad, setBad] = useState<string>();

  function submit() {
    if (!name.trim()) {
      setBadName(true);
      document.getElementById("competitor-name")?.focus();
      return setError("Firma adını girin.");
    }
    const wrong = lines.find((l) => values[l.id].price.trim() && !(parseNum(values[l.id].price) >= 0));
    if (wrong) {
      setValues((x) => ({ ...x, [wrong.id]: { ...x[wrong.id], price: "" } }));
      setBad(wrong.id);
      document.getElementById(`price-${wrong.id}`)?.focus();
      return setError("Birim fiyata geçerli bir sayı girin.");
    }
    const prices = lines.map((l) => ({
      line_id: l.id,
      unit_price: values[l.id].price.trim() ? parseNum(values[l.id].price) : null,
      currency: values[l.id].currency,
    }));
    if (!prices.some((p) => p.unit_price !== null)) return setError("En az bir kalem için fiyat girin.");
    run(() => saveCompetitor(record.id, name, company ?? null, prices), onClose);
  }

  return (
    <Sheet open={open} onClose={onClose} title={company ? "Rakip fiyatını düzenle" : "Rakip fiyatı ekle"}>
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="competitor-name">
            Firma
          </label>
          <input
            id="competitor-name"
            value={name}
            onChange={(e) => (setBadName(false), setName(e.target.value))}
            aria-invalid={badName || undefined}
            className="input"
            placeholder="Rakip firma adı"
          />
        </div>
        <p className="text-sm text-muted">Firmanın açıklanan birim fiyatlarını girin. Teklif vermediği kalemi boş bırakın.</p>
        <PriceRows lines={lines} values={values} setValues={setValues} bad={bad} setBad={setBad} optional />
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending} onClick={submit}>
          {pending && <Loader2 size={18} className="animate-spin" />} Kaydet
        </button>
      </div>
    </Sheet>
  );
}

/** Kalem bazında fiyat karşılaştırması: bizim fiyatımız ve rakipler, ucuzdan pahalıya; bizim sıramız. */
export function TenderComparison({
  record,
  lines,
  bids,
  rates,
}: {
  record: SalesRecord;
  lines: RecordLine[];
  bids: TenderBid[];
  rates: Record<string, number> | null;
}) {
  const [sheet, setSheet] = useState<null | { company?: string }>(null);
  const [confirm, setConfirm] = useState<string>();
  const del = useAction();
  const companies = [...new Set(bids.map((b) => b.company))];

  return (
    <div className="space-y-2">
      {companies.length > 0 &&
        lines.map((l) => {
          const rows = [
            ...(l.unit_price !== null ? [{ company: "Erenos (biz)", us: true, price: Number(l.unit_price), currency: l.currency }] : []),
            ...bids
              .filter((b) => b.line_id === l.id)
              .map((b) => ({ company: b.company, us: false, price: Number(b.unit_price), currency: b.currency })),
          ].sort((a, b) => (toTry(a.price, a.currency, rates) ?? Infinity) - (toTry(b.price, b.currency, rates) ?? Infinity));
          const rank = rows.findIndex((r) => r.us) + 1;
          return (
            <div key={l.id} className="card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <b className="min-w-0 truncate text-[15px] font-semibold">{l.product_name}</b>
                {rank > 0 && (
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${
                      rank === 1 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {rank === 1 && <Trophy size={12} />} {rank}. sıradayız
                  </span>
                )}
              </div>
              <ol className="mt-2 space-y-1">
                {rows.map((r, i) => (
                  <li
                    key={r.company}
                    className={`flex items-baseline justify-between gap-3 rounded-lg px-2 py-1 text-[14px] ${r.us ? "bg-brand-50 font-semibold text-brand-700" : ""}`}
                  >
                    <span className="min-w-0 truncate">
                      {i + 1}. {r.company}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatMoney(r.price, r.currency)}</span>
                  </li>
                ))}
              </ol>
            </div>
          );
        })}

      {companies.length > 0 && (
        <div className="card divide-y divide-line/70">
          {companies.map((c) => (
            <div key={c} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{c}</span>
              {confirm === c ? (
                <>
                  <button className="btn-secondary px-3 py-1.5 text-[13px]" onClick={() => setConfirm(undefined)}>
                    Vazgeç
                  </button>
                  <button
                    className="btn-danger px-3 py-1.5 text-[13px]"
                    disabled={del.pending}
                    onClick={() =>
                      del.run(
                        () => deleteCompetitor(record.id, c),
                        () => setConfirm(undefined),
                      )
                    }
                  >
                    Sil
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setSheet({ company: c })}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
                    aria-label={`${c} fiyatlarını düzenle`}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => setConfirm(c)}
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
                    aria-label={`${c} fiyatlarını sil`}
                  >
                    <Trash2 size={15} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <ErrorText error={del.error} />
      {companies.length === 0 && (
        <p className="card p-4 text-[14px] text-muted">
          İhaleden sonra açıklanan rakip fiyatlarını girin; her kalemde kaçıncı sırada olduğumuz burada görünür.
        </p>
      )}
      {record.status !== "reddedildi" && (
        <button onClick={() => setSheet({})} className="btn w-full border-2 border-dashed border-brand-200 bg-brand-50/50 text-brand-600">
          <Plus size={18} /> Rakip fiyatı ekle
        </button>
      )}
      {sheet && <CompetitorSheet open onClose={() => setSheet(null)} record={record} lines={lines} company={sheet.company} bids={bids} />}
    </div>
  );
}

/** Sözleşmeli ihalede iş artışı / eksiltmesi: sözleşme miktarının en fazla %20 fazlası ya da eksiği. */
export function AdjustSheet({
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
  const contracted = lines.filter((l) => l.approved);
  const [lineId, setLineId] = useState(contracted[0]?.id ?? "");
  const line = contracted.find((l) => l.id === lineId);
  const [qty, setQty] = useState(fmtInput(line?.approved_qty));
  const [note, setNote] = useState("");
  const [bad, setBad] = useState(false);
  const base = Number(line?.contract_qty ?? line?.approved_qty ?? 0);
  const min = Math.round(base * 0.8 * 100) / 100;
  const max = Math.round(base * 1.2 * 100) / 100;
  const used = line ? Number(progress[line.id]?.in_shipment ?? 0) + Number(progress[line.id]?.delivered ?? 0) : 0;

  function submit() {
    if (!line) return;
    const q = parseNum(qty);
    const reject = (msg: string) => (setQty(""), setBad(true), setError(msg));
    if (!(q > 0)) return reject("Yeni miktarı girin.");
    if (q < min || q > max)
      return reject(
        `Sözleşme miktarının en fazla %20 fazlası ya da eksiği girilebilir (${formatQty(min)} – ${formatQty(max)} ${line.unit}).`,
      );
    if (q < used) return reject(`${formatQty(used)} ${line.unit} sevkiyata aktarılmış; miktar bunun altına inemez.`);
    run(() => adjustContract(record.id, line.id, q, note), onClose);
  }

  return (
    <Sheet open={open} onClose={onClose} title="İş artışı / eksiltmesi">
      <div className="space-y-4">
        <div>
          <label className="field-label" htmlFor="adj-line">
            Ürün
          </label>
          <select
            id="adj-line"
            value={lineId}
            onChange={(e) => {
              const l = contracted.find((x) => x.id === e.target.value);
              setLineId(e.target.value);
              setQty(fmtInput(l?.approved_qty));
              setBad(false);
            }}
            className="input"
          >
            {contracted.map((l) => (
              <option key={l.id} value={l.id}>
                {l.product_name}
              </option>
            ))}
          </select>
        </div>
        {line && (
          <p className="rounded-xl bg-canvas p-3 text-[13px] text-muted">
            Sözleşme: <b className="text-ink">{formatQty(base)}</b> {line.unit} · Şu an:{" "}
            <b className="text-ink">{formatQty(line.approved_qty)}</b> {line.unit}
            <br />
            Girilebilecek aralık: {formatQty(min)} – {formatQty(max)} {line.unit}
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            value={qty}
            onChange={(e) => (setBad(false), setQty(e.target.value))}
            aria-invalid={bad || undefined}
            inputMode="decimal"
            className="input flex-1"
            aria-label="Yeni miktar"
          />
          <span className="w-14 text-[14px] text-muted">{line?.unit}</span>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="input resize-none"
          placeholder="Not (isteğe bağlı)"
        />
        <ErrorText error={error} />
        <button className="btn-primary w-full" disabled={pending} onClick={submit}>
          {pending && <Loader2 size={18} className="animate-spin" />} Kaydet
        </button>
      </div>
    </Sheet>
  );
}
