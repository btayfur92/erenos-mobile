"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { saveRecord, type LineInput, type RecordInput } from "@/app/(app)/actions";
import { CURRENCIES, UNITS, type RecordType } from "@/lib/types";
import { formatMoney } from "@/lib/format";
import { normalizePhone, PHONE_ERROR, phoneHint } from "@/lib/phone";

type LineDraft = { key: number; id?: string; product_name: string; quantity: string; unit: string; unit_price: string; currency: string };

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
  // Hatalı alan: kırmızı çerçeveyle işaretlenip temizlenir, diğer girilenler yerinde kalır.
  const [bad, setBad] = useState<string>();
  const invalid = (k: string) => (bad === k ? { "aria-invalid": true as const } : {});
  const touched = (k: string) => {
    if (bad === k) setBad(undefined);
  };
  const [type, setType] = useState<RecordType>(initial?.type ?? "dogrudan_temin");
  const [phoneMsg, setPhoneMsg] = useState("");
  const gs = type === "genel_siparis";
  const tender = type === "ihale_siparisi"; // ihalede fiyat bu formda girilmez
  const [lines, setLines] = useState<LineDraft[]>(
    initial?.lines?.length
      ? initial.lines.map((l) => ({
          key: keySeq++,
          id: l.id,
          product_name: l.product_name,
          quantity: String(l.quantity).replace(".", ","),
          unit: l.unit,
          unit_price: l.unit_price === null ? "" : String(l.unit_price).replace(".", ","),
          currency: l.currency,
        }))
      : [emptyLine()],
  );

  const update = (key: number, patch: Partial<LineDraft>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const input: RecordInput = {
      id: initial?.id,
      type,
      record_date: String(fd.get("record_date")),
      tender_time: tender ? String(fd.get("tender_time") ?? "") : undefined,
      file_no: String(fd.get("file_no") ?? ""),
      hospital: String(fd.get("hospital") ?? ""),
      contact_name: String(fd.get("contact_name") ?? ""),
      contact_phone: String(fd.get("contact_phone") ?? ""),
      contact_ext: String(fd.get("contact_ext") ?? ""),
      notes: String(fd.get("notes") ?? ""),
      lines: lines
        .filter((l) => l.product_name.trim())
        .map((l) => ({
          id: l.id,
          product_name: l.product_name.trim(),
          quantity: parseNum(l.quantity),
          unit: l.unit,
          unit_price: tender ? null : parseNum(l.unit_price),
          currency: l.currency,
        })),
    };
    if (input.contact_phone.trim() && !normalizePhone(input.contact_phone)) {
      const el = document.getElementById("contact_phone") as HTMLInputElement | null;
      if (el) {
        el.value = "";
        el.focus();
      }
      setPhoneMsg("");
      setBad("phone");
      setError(PHONE_ERROR);
      return;
    }
    const wrong = lines.find((l) => l.product_name.trim() && (!(parseNum(l.quantity) > 0) || (!tender && !(parseNum(l.unit_price) >= 0))));
    if (wrong) {
      const field = parseNum(wrong.quantity) > 0 ? "p" : "q";
      update(wrong.key, field === "q" ? { quantity: "" } : { unit_price: "" });
      setBad(`${field}-${wrong.key}`);
      document.getElementById(`${field}-${wrong.key}`)?.focus();
      setError(field === "q" ? "Miktar sıfırdan büyük bir sayı olmalı." : "Birim fiyata geçerli bir sayı girin.");
      return;
    }
    setBad(undefined);
    setError(undefined);
    start(async () => {
      const res = await saveRecord(input);
      if (!res.ok) return setError(res.error);
      // Yeni kayıttan sonra listeye dön: doğrudan temin ve genel satış Gündem'e, yaklaşık maliyet kendi sekmesine düşer.
      if (initial?.id) router.replace(`/kayit/${res.id}`);
      else router.replace(type === "yaklasik_maliyet" ? "/?f=ym" : tender ? "/?f=ihale" : "/");
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      {!lockedType && (
        <div className="grid grid-cols-4 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
          {(
            [
              ["dogrudan_temin", "Doğrudan Temin"],
              ["ihale_siparisi", "İhale"],
              ["genel_siparis", "Genel Satış"],
              ["yaklasik_maliyet", "Yaklaşık Maliyet"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setType(value)}
              className={`rounded-xl px-1 py-2.5 text-[13px] font-semibold leading-tight transition ${
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
              {type === "dogrudan_temin" ? "Doğrudan temin tarihi" : tender ? "İhale tarihi" : gs ? "Sipariş tarihi" : "Tarih"}
            </label>
            <input id="record_date" name="record_date" type="date" required defaultValue={initial?.record_date} className="input" />
          </div>
          {tender && (
            <div>
              <label className="field-label" htmlFor="tender_time">
                İhale saati
              </label>
              <input
                id="tender_time"
                name="tender_time"
                type="time"
                step={300}
                defaultValue={initial?.tender_time?.slice(0, 5) ?? ""}
                className="input"
              />
              <p className="mt-1 text-[12px] text-muted">Boş bırakılırsa 09:00</p>
            </div>
          )}
          <div className={tender ? "col-span-2" : undefined}>
            <label className="field-label" htmlFor="file_no">
              {tender ? "İhale no" : "Dosya / ihale no"}
            </label>
            <input id="file_no" name="file_no" defaultValue={initial?.file_no} className="input" placeholder="2026/123456" />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="hospital">
            {gs ? "Müşteri adı" : "Hastane"}
          </label>
          <input
            id="hospital"
            name="hospital"
            required
            defaultValue={initial?.hospital}
            className="input"
            placeholder={gs ? "Müşteri adı" : "Hastane adı"}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="contact_name">
            İlgili kişi <span className="font-normal text-muted/70">(varsa)</span>
          </label>
          <input id="contact_name" name="contact_name" defaultValue={initial?.contact_name} className="input" />
        </div>
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div>
            <label className="field-label" htmlFor="contact_phone">
              Telefon <span className="font-normal text-muted/70">(varsa)</span>
            </label>
            <input
              id="contact_phone"
              name="contact_phone"
              type="tel"
              inputMode="tel"
              defaultValue={initial?.contact_phone}
              placeholder="05xx veya 0312 …"
              autoComplete="off"
              maxLength={20}
              onChange={(e) => (touched("phone"), setPhoneMsg(phoneHint(e.target.value, false)))}
              {...invalid("phone")}
              onBlur={(e) => {
                const p = normalizePhone(e.target.value);
                if (p) e.target.value = p;
                setPhoneMsg(phoneHint(e.target.value, true));
              }}
              className="input"
            />
            {phoneMsg && <p className="mt-1 text-[12px] font-medium text-accent-600">{phoneMsg}</p>}
          </div>
          <div>
            <label className="field-label" htmlFor="contact_ext">
              Dahili
            </label>
            <input
              id="contact_ext"
              name="contact_ext"
              inputMode="numeric"
              maxLength={6}
              defaultValue={initial?.contact_ext}
              placeholder="Varsa"
              onChange={(e) => (e.target.value = e.target.value.replace(/\D/g, ""))}
              className="input"
            />
          </div>
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-[15px] font-semibold">
            {gs ? "Sipariş geçilen ürünler" : tender ? "İhale ürünleri" : "Teklif verilen ürünler"}
          </h2>
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
                    id={`q-${l.key}`}
                    {...invalid(`q-${l.key}`)}
                    value={l.quantity}
                    onChange={(e) => (touched(`q-${l.key}`), update(l.key, { quantity: e.target.value }))}
                    className="input"
                    placeholder="Miktar"
                    inputMode="decimal"
                    aria-label="Miktar"
                  />
                  <select
                    value={l.unit}
                    onChange={(e) => update(l.key, { unit: e.target.value })}
                    className="input w-28"
                    aria-label="Birim"
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                </div>
                {!tender && (
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <input
                      id={`p-${l.key}`}
                      {...invalid(`p-${l.key}`)}
                      value={l.unit_price}
                      onChange={(e) => (touched(`p-${l.key}`), update(l.key, { unit_price: e.target.value }))}
                      className="input"
                      placeholder="Birim fiyat"
                      inputMode="decimal"
                      aria-label="Birim fiyat"
                    />
                    <select
                      value={l.currency}
                      onChange={(e) => update(l.key, { currency: e.target.value })}
                      className="input w-28"
                      aria-label="Döviz"
                    >
                      {CURRENCIES.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                )}
                {!tender && q > 0 && p >= 0 && (
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
        {tender && (
          <p className="mt-2 px-1 text-[12px] text-muted">
            Fiyatlar burada girilmez; ihaleden önce kaydın sayfasındaki <b>Fiyatlarımızı gir</b> ile girilir.
          </p>
        )}
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
