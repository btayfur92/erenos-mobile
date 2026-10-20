"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { saveRecord, type LineInput, type RecordInput } from "@/app/(app)/actions";
import { CURRENCIES, UNITS, type RecordType } from "@/lib/types";
import { formatMoney } from "@/lib/format";

type LineDraft = { key: number; product_name: string; quantity: string; unit: string; unit_price: string; currency: string };

let keySeq = 1;
const emptyLine = (currency = "TRY"): LineDraft => ({
  key: keySeq++,
  product_name: "",
  quantity: "",
  unit: "Adet",
  unit_price: "",
  currency,
});

/** "1.250,50" ve "1250.50" gibi girişleri sayıya çevirir. */
function parseNum(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  const normalized = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  return Number(normalized);
}

export function RecordForm({
  initial,
  lockedType,
}: {
  initial?: Partial<Omit<RecordInput, "lines">> & { lines?: LineInput[] };
  lockedType?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [type, setType] = useState<RecordType>(initial?.type ?? "dogrudan_temin");
  const [lines, setLines] = useState<LineDraft[]>(
    initial?.lines?.length
      ? initial.lines.map((l) => ({
          key: keySeq++,
          product_name: l.product_name,
          quantity: String(l.quantity).replace(".", ","),
          unit: l.unit,
          unit_price: String(l.unit_price).replace(".", ","),
          currency: l.currency,
        }))
      : [emptyLine()],
  );

  const update = (key: number, patch: Partial<LineDraft>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: RecordInput = {
      id: initial?.id,
      type,
      record_date: String(fd.get("record_date")),
      file_no: String(fd.get("file_no") ?? ""),
      hospital: String(fd.get("hospital") ?? ""),
      contact_name: String(fd.get("contact_name") ?? ""),
      contact_phone: String(fd.get("contact_phone") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      lines: lines
        .filter((l) => l.product_name.trim())
        .map((l) => ({
          product_name: l.product_name.trim(),
          quantity: parseNum(l.quantity),
          unit: l.unit,
          unit_price: parseNum(l.unit_price),
          currency: l.currency,
        })),
    };
    if (input.lines.some((l) => Number.isNaN(l.quantity) || Number.isNaN(l.unit_price))) {
      setError("Miktar ve fiyat alanlarına geçerli sayı girin.");
      return;
    }
    setError(undefined);
    start(async () => {
      const res = await saveRecord(input);
      if (!res.ok) return setError(res.error);
      router.replace(`/kayit/${res.id}`);
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!lockedType && (
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
          {(
            [
              ["dogrudan_temin", "Doğrudan Temin"],
              ["yaklasik_maliyet", "Yaklaşık Maliyet"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`rounded-xl py-2.5 text-[14px] font-semibold transition ${
                type === value ? "bg-brand-600 text-white shadow-sm" : "text-muted"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <section className="card space-y-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="record_date">
              {type === "dogrudan_temin" ? "Doğrudan temin tarihi" : "Tarih"}
            </label>
            <input id="record_date" name="record_date" type="date" required defaultValue={initial?.record_date} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="file_no">
              Dosya / ihale no
            </label>
            <input id="file_no" name="file_no" defaultValue={initial?.file_no} className="input" placeholder="2026/123456" />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="hospital">
            Hastane
          </label>
          <input id="hospital" name="hospital" required defaultValue={initial?.hospital} className="input" placeholder="Hastane adı" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="contact_name">
              İlgili kişi <span className="font-normal text-muted/70">(varsa)</span>
            </label>
            <input id="contact_name" name="contact_name" defaultValue={initial?.contact_name} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="contact_phone">
              Telefon <span className="font-normal text-muted/70">(varsa)</span>
            </label>
            <input id="contact_phone" name="contact_phone" type="tel" inputMode="tel" defaultValue={initial?.contact_phone} className="input" />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-semibold">Teklif verilen ürünler</h2>
          <span className="text-xs text-muted">{lines.filter((l) => l.product_name.trim()).length} kalem</span>
        </div>
        <div className="space-y-3">
          {lines.map((l, i) => {
            const q = parseNum(l.quantity);
            const p = parseNum(l.unit_price);
            return (
              <div key={l.key} className="card space-y-3 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-600">Kalem {i + 1}</span>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                      className="-mr-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-accent-50 hover:text-accent-600"
                      aria-label="Kalemi sil"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <input
                  value={l.product_name}
                  onChange={(e) => update(l.key, { product_name: e.target.value })}
                  className="input"
                  placeholder="Ürün adı"
                  aria-label="Ürün adı"
                  required={i === 0}
                />
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={l.quantity}
                    onChange={(e) => update(l.key, { quantity: e.target.value })}
                    className="input"
                    placeholder="Miktar"
                    inputMode="decimal"
                    aria-label="Miktar"
                  />
                  <select value={l.unit} onChange={(e) => update(l.key, { unit: e.target.value })} className="input w-28" aria-label="Birim">
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={l.unit_price}
                    onChange={(e) => update(l.key, { unit_price: e.target.value })}
                    className="input"
                    placeholder="Birim fiyat"
                    inputMode="decimal"
                    aria-label="Birim fiyat"
                  />
                  <select value={l.currency} onChange={(e) => update(l.key, { currency: e.target.value })} className="input w-28" aria-label="Döviz">
                    {CURRENCIES.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </div>
                {q > 0 && p >= 0 && (
                  <p className="text-right text-[13px] text-muted">
                    Tutar: <b className="font-semibold text-ink">{formatMoney(q * p, l.currency)}</b>
                  </p>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={() => setLines((ls) => [...ls, emptyLine(ls.at(-1)?.currency)])}
          className="btn mt-3 w-full border-2 border-dashed border-brand-200 bg-brand-50/50 text-brand-600"
        >
          <Plus size={18} /> Ürün ekle
        </button>
      </section>

      <section className="card p-4">
        <label className="field-label" htmlFor="notes">
          Not <span className="font-normal text-muted/70">(isteğe bağlı)</span>
        </label>
        <textarea id="notes" name="notes" rows={2} defaultValue={initial?.notes} className="input resize-none" />
      </section>

      {error && <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}

      <div className="sticky bottom-24 z-10">
        <button type="submit" className="btn-primary w-full py-4 shadow-float" disabled={pending}>
          {pending && <Loader2 size={18} className="animate-spin" />}
          {initial?.id ? "Değişiklikleri kaydet" : "Kaydet"}
        </button>
      </div>
    </form>
  );
}
