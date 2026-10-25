"use client";

import { useState, useTransition } from "react";
import { Loader2, PackageOpen, Plus, Truck } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { createManualShipment, updateManualShipment } from "@/app/(app)/actions";
import { todayIstanbul } from "@/lib/format";
import { UNITS, type ManualDirection, type ManualShipment } from "@/lib/types";

function parseNum(v: string) {
  const s = v.trim().replace(/\s/g, "");
  if (!s) return NaN;
  return Number(s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s);
}

/** Sevkiyat sayfasındaki + Ekle düğmesi: gelecek ya da doğrudan temine bağlı olmayan gidecek sevkiyat ekler. */
export function AddShipment() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary h-10 gap-1.5 px-3 py-0 text-[14px]" aria-label="Sevkiyat ekle">
        <Plus size={18} /> Ekle
      </button>
      <ManualShipmentSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}

/** Elle eklenen sevkiyat formu; item verilirse o kaydı düzenler (tür değişmez). */
export function ManualShipmentSheet({ open, onClose, item }: { open: boolean; onClose: () => void; item?: ManualShipment }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [badQty, setBadQty] = useState(false); // hatalı miktar: kırmızı çerçeve, yalnızca o alan temizlenir
  const initial = () =>
    item
      ? {
          direction: item.direction,
          party: item.party,
          product_details: item.product_details,
          quantity: String(item.quantity).replace(".", ","),
          unit: item.unit ?? "Adet",
          due_date: item.due_date,
          note: item.note ?? "",
        }
      : {
          direction: "gelecek" as ManualDirection,
          party: "",
          product_details: "",
          quantity: "",
          unit: "Adet",
          due_date: todayIstanbul(),
          note: "",
        };
  const [form, setForm] = useState(initial);
  const set =
    (k: Exclude<keyof ReturnType<typeof initial>, "direction">) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));
  const gelecek = form.direction === "gelecek";

  // Her açılışta formu kaydın güncel haliyle (ya da boş) başlat.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(initial());
      setError(undefined);
      setBadQty(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const quantity = parseNum(form.quantity);
    if (!(quantity > 0)) {
      setForm((f) => ({ ...f, quantity: "" }));
      setBadQty(true);
      document.getElementById("ms_qty")?.focus();
      return setError("Miktarı girin (sıfırdan büyük olmalı).");
    }
    start(async () => {
      const input = { ...form, quantity };
      const r = item ? await updateManualShipment(item.id, input) : await createManualShipment(input);
      if (!r.ok) return setError(r.error);
      onClose();
    });
  }

  const title = item ? (gelecek ? "Gelecek sevkiyatı düzenle" : "Gidecek sevkiyatı düzenle") : "Sevkiyat ekle";

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="space-y-4">
        {!item && (
          <div className="grid grid-cols-2 gap-2 pt-1" role="radiogroup" aria-label="Sevkiyat türü">
            {(
              [
                ["gelecek", "Gelecek sevkiyat", "Tedarikçiden bize", <PackageOpen key="i" size={18} />],
                ["gidecek", "Gidecek sevkiyat", "Bizden hastaneye", <Truck key="i" size={18} />],
              ] as const
            ).map(([d, label, hint, ic]) => {
              const on = form.direction === d;
              const tone =
                d === "gelecek" ? "bg-amber-50 text-amber-800 ring-amber-300" : "bg-emerald-50 text-emerald-800 ring-emerald-300";
              return (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setForm((f) => ({ ...f, direction: d }))}
                  className={`rounded-xl p-3 text-left ring-1 ${on ? `${tone} ring-2` : "bg-white text-ink ring-line"}`}
                >
                  <span className="flex items-center gap-1.5 text-[14px] font-semibold">
                    {ic} {label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-muted">{hint}</span>
                </button>
              );
            })}
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="ms_party">
            {gelecek ? "Tedarikçi" : "Hastane / alıcı"}
          </label>
          <input
            id="ms_party"
            value={form.party}
            onChange={set("party")}
            className="input"
            placeholder={gelecek ? "Firma adı" : "Hastane ya da alıcı adı"}
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="ms_details">
            Ürün detayı
          </label>
          <textarea
            id="ms_details"
            value={form.product_details}
            onChange={set("product_details")}
            rows={2}
            className="input resize-none"
            required
          />
        </div>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <div>
            <label className="field-label" htmlFor="ms_qty">
              Miktar
            </label>
            <input
              id="ms_qty"
              value={form.quantity}
              onChange={(e) => (setBadQty(false), set("quantity")(e))}
              inputMode="decimal"
              className="input"
              aria-invalid={badQty || undefined}
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="ms_unit">
              Birim
            </label>
            <select id="ms_unit" value={form.unit} onChange={set("unit")} className="input">
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="ms_date">
            {gelecek ? "Beklenen tarih" : "Sevk tarihi"}
          </label>
          <input id="ms_date" type="date" value={form.due_date} onChange={set("due_date")} className="input" required />
        </div>
        <textarea value={form.note} onChange={set("note")} rows={2} className="input resize-none" placeholder="Not (isteğe bağlı)" />
        {error && <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending && <Loader2 size={18} className="animate-spin" />} Kaydet
        </button>
      </form>
    </Sheet>
  );
}
