"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { createIncoming } from "@/app/(app)/actions";
import { todayIstanbul } from "@/lib/format";
import { UNITS } from "@/lib/types";

function parseNum(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

/** Sevkiyat sayfasındaki + düğmesi: tedarikçiden gelecek bir sevkiyat ekler. */
export function AddIncoming() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const empty = { supplier: "", product_details: "", quantity: "", unit: "Adet", expected_date: todayIstanbul(), note: "" };
  const [form, setForm] = useState(empty);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => {
    setOpen(false);
    setError(undefined);
    setForm(empty);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const quantity = form.quantity.trim() ? parseNum(form.quantity) : null;
    if (quantity !== null && !(quantity > 0)) return setError("Miktar sıfırdan büyük olmalı ya da boş bırakılmalı.");
    start(async () => {
      const r = await createIncoming({ ...form, quantity });
      if (!r.ok) return setError(r.error);
      close();
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary h-10 gap-1.5 px-3 py-0 text-[14px]" aria-label="Gelecek sevkiyat ekle">
        <Plus size={18} /> Gelecek
      </button>
      <Sheet open={open} onClose={close} title="Gelecek sevkiyat">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="field-label" htmlFor="in_supplier">
              Tedarikçi
            </label>
            <input id="in_supplier" value={form.supplier} onChange={set("supplier")} className="input" placeholder="Firma adı" required />
          </div>
          <div>
            <label className="field-label" htmlFor="in_details">
              Ürün detayı
            </label>
            <textarea
              id="in_details"
              value={form.product_details}
              onChange={set("product_details")}
              rows={2}
              className="input resize-none"
              required
            />
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div>
              <label className="field-label" htmlFor="in_qty">
                Miktar <span className="font-normal text-muted/70">(netse)</span>
              </label>
              <input id="in_qty" value={form.quantity} onChange={set("quantity")} inputMode="decimal" className="input" />
            </div>
            <div>
              <label className="field-label" htmlFor="in_unit">
                Birim
              </label>
              <select id="in_unit" value={form.unit} onChange={set("unit")} className="input">
                {UNITS.map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="in_date">
              Beklenen tarih
            </label>
            <input id="in_date" type="date" value={form.expected_date} onChange={set("expected_date")} className="input" required />
          </div>
          <textarea value={form.note} onChange={set("note")} rows={2} className="input resize-none" placeholder="Not (isteğe bağlı)" />
          {error && <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}
          <button className="btn-primary w-full" disabled={pending}>
            {pending && <Loader2 size={18} className="animate-spin" />} Kaydet
          </button>
        </form>
      </Sheet>
    </>
  );
}
