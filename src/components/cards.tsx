"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, Loader2, Package, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { deleteCustomer, deleteProduct, saveCustomer, saveProduct } from "@/app/(app)/actions";
import { cardKey, PROVINCES, UNITS, type Customer, type Product } from "@/lib/types";
import { normalizePhone, PHONE_ERROR, phoneHint } from "@/lib/phone";

const ERROR_CLS = "rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700";

/** Hızlı ekleme panelini formun dışına (body'ye) taşır: açık formun içinde iç içe form oluşmaz, girilenler yerinde kalır. */
function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}

const customerSub = (c: Customer) => [[c.district, c.city].filter(Boolean).join(" / "), c.contact_name].filter(Boolean).join(" · ");

// ---------------------------------------------------------------------------
// Kart panelleri (ekle / düzenle)
// ---------------------------------------------------------------------------

export function CustomerSheet({
  initial,
  name = "",
  onSaved,
  onClose,
}: {
  initial?: Customer;
  name?: string;
  onSaved: (c: Customer) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [phoneMsg, setPhoneMsg] = useState("");
  const [f, setF] = useState({
    name: initial?.name ?? name,
    city: initial?.city ?? "",
    district: initial?.district ?? "",
    contact_name: initial?.contact_name ?? "",
    contact_phone: initial?.contact_phone ?? "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));

  function save() {
    if (!f.name.trim()) return setError("Hastane / müşteri adı gerekli.");
    if (f.contact_phone.trim() && !normalizePhone(f.contact_phone)) return setError(PHONE_ERROR);
    setError(undefined);
    start(async () => {
      const r = await saveCustomer({ ...f, id: initial?.id });
      if (!r.ok) return setError(r.error);
      onSaved(r.card);
      router.refresh();
    });
  }

  return (
    <Portal>
      <Sheet open onClose={onClose} title={initial ? "Kartı düzenle" : "Yeni hastane / müşteri kartı"}>
        <div className="space-y-5" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}>
          <div>
            <label className="field-label" htmlFor="cc-name">
              Hastane / müşteri adı
            </label>
            <input
              id="cc-name"
              value={f.name}
              onChange={set("name")}
              className="input"
              placeholder="ör. Ankara Şehir Hastanesi"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="cc-city">
                İl <span className="font-normal text-muted/70">(varsa)</span>
              </label>
              <input id="cc-city" value={f.city} onChange={set("city")} className="input" list="cc-provinces" placeholder="İl" />
              <datalist id="cc-provinces">
                {PROVINCES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="field-label" htmlFor="cc-district">
                İlçe <span className="font-normal text-muted/70">(varsa)</span>
              </label>
              <input id="cc-district" value={f.district} onChange={set("district")} className="input" placeholder="İlçe" />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="cc-contact">
              İlgili kişi <span className="font-normal text-muted/70">(varsa)</span>
            </label>
            <input id="cc-contact" value={f.contact_name} onChange={set("contact_name")} className="input" />
          </div>
          <div>
            <label className="field-label" htmlFor="cc-phone">
              İletişim numarası <span className="font-normal text-muted/70">(varsa)</span>
            </label>
            <input
              id="cc-phone"
              type="tel"
              inputMode="tel"
              maxLength={20}
              autoComplete="off"
              value={f.contact_phone}
              onChange={(e) => (set("contact_phone")(e), setPhoneMsg(phoneHint(e.target.value, false)))}
              onBlur={(e) => {
                const p = normalizePhone(e.target.value);
                if (p) setF((x) => ({ ...x, contact_phone: p }));
                setPhoneMsg(phoneHint(e.target.value, true));
              }}
              className="input"
              placeholder="05xx veya 0312 …"
            />
            {phoneMsg && <p className="mt-1 text-[12px] font-medium text-accent-600">{phoneMsg}</p>}
          </div>
          {error && <p className={ERROR_CLS}>{error}</p>}
          <button type="button" onClick={save} className="btn-primary w-full" disabled={pending}>
            {pending && <Loader2 size={18} className="animate-spin" />} {initial ? "Kaydet" : "Kartı kaydet"}
          </button>
        </div>
      </Sheet>
    </Portal>
  );
}

export function ProductSheet({
  initial,
  name = "",
  onSaved,
  onClose,
}: {
  initial?: Product;
  name?: string;
  onSaved: (p: Product) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [f, setF] = useState({ name: initial?.name ?? name, unit: initial?.unit ?? "Adet" });

  function save() {
    if (!f.name.trim()) return setError("Ürün adı gerekli.");
    setError(undefined);
    start(async () => {
      const r = await saveProduct({ ...f, id: initial?.id });
      if (!r.ok) return setError(r.error);
      onSaved(r.card);
      router.refresh();
    });
  }

  return (
    <Portal>
      <Sheet open onClose={onClose} title={initial ? "Ürün kartını düzenle" : "Yeni ürün kartı"}>
        <div className="space-y-5" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), save())}>
          <div>
            <label className="field-label" htmlFor="pc-name">
              Ürün adı
            </label>
            <input
              id="pc-name"
              value={f.name}
              onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))}
              className="input"
              placeholder="ör. Nitril Eldiven (M)"
              autoFocus
            />
          </div>
          <div>
            <label className="field-label" htmlFor="pc-unit">
              Birim
            </label>
            <select id="pc-unit" value={f.unit} onChange={(e) => setF((x) => ({ ...x, unit: e.target.value }))} className="input">
              {UNITS.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-muted">Ürün seçilince kalemin birimi bu olur, kalemde değiştirilebilir.</p>
          </div>
          {error && <p className={ERROR_CLS}>{error}</p>}
          <button type="button" onClick={save} className="btn-primary w-full" disabled={pending}>
            {pending && <Loader2 size={18} className="animate-spin" />} {initial ? "Kaydet" : "Kartı kaydet"}
          </button>
        </div>
      </Sheet>
    </Portal>
  );
}

// ---------------------------------------------------------------------------
// Seçmeli alan: yazdıkça kartlar süzülür; kartı yoksa "ekle" ile form bırakılmadan kart açılır.
// ---------------------------------------------------------------------------

type Option = { id: string; name: string; sub?: string };

function CardPicker({
  id,
  value,
  onChange,
  options,
  placeholder,
  addLabel,
  onAdd,
  invalid,
  disabled,
}: {
  id?: string;
  value: string;
  onChange: (name: string, picked?: Option) => void;
  options: Option[];
  placeholder: string;
  addLabel: string;
  onAdd: (name: string) => void;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const term = cardKey(value);
  const exact = options.find((o) => cardKey(o.name) === term);
  const shown = useMemo(
    () => (term ? options.filter((o) => cardKey(o.name).includes(term) || cardKey(o.sub ?? "").includes(term)) : options).slice(0, 8),
    [options, term],
  );

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => (onChange(e.target.value), setOpen(true))}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter" && open && shown[0] && !exact) {
            e.preventDefault();
            onChange(shown[0].name, shown[0]);
            setOpen(false);
          }
        }}
        className="input pr-9"
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-controls={listId}
        aria-expanded={open}
        aria-invalid={invalid || undefined}
        disabled={disabled}
      />
      {exact && (
        <Check
          size={17}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-emerald-600"
          aria-label="Karttan seçildi"
        />
      )}
      {open && !disabled && (
        <div
          id={listId}
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl bg-white py-1 shadow-float ring-1 ring-line"
        >
          {shown.map((o) => (
            <button
              key={o.id}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (onChange(o.name, o), setOpen(false))}
              className={`flex w-full flex-col px-3.5 py-2 text-left hover:bg-canvas ${exact?.id === o.id ? "bg-brand-50" : ""}`}
            >
              <span className="text-[14px] font-medium">{o.name}</span>
              {o.sub && <span className="text-[12px] text-muted">{o.sub}</span>}
            </button>
          ))}
          {!shown.length && !value.trim() && <p className="px-3.5 py-2 text-[13px] text-muted">Henüz kart yok.</p>}
          {!exact && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (setOpen(false), onAdd(value.trim()))}
              className="flex w-full items-center gap-2 border-t border-line/70 px-3.5 py-2.5 text-left text-[14px] font-semibold text-brand-600 hover:bg-brand-50"
            >
              <Plus size={16} /> {value.trim() ? `“${value.trim()}” için yeni kart aç` : addLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Hastane / müşteri seçimi. Kart seçilince ilgili kişi ve telefonu (boşsa) forma gelir. */
export function CustomerPicker({
  id,
  value,
  onChange,
  customers,
  onCreated,
  placeholder = "Hastane / müşteri seçin",
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (name: string, card?: Customer) => void;
  customers: Customer[];
  onCreated: (c: Customer) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const options = useMemo(() => customers.map((c) => ({ id: c.id, name: c.name, sub: customerSub(c) || undefined })), [customers]);
  return (
    <>
      <CardPicker
        id={id}
        value={value}
        onChange={(n, o) => onChange(n, o && customers.find((c) => c.id === o.id))}
        options={options}
        placeholder={placeholder}
        addLabel="Yeni hastane / müşteri kartı aç"
        onAdd={setAdding}
        invalid={invalid}
      />
      {adding !== null && (
        <CustomerSheet
          name={adding}
          onClose={() => setAdding(null)}
          onSaved={(c) => {
            setAdding(null);
            onCreated(c);
            onChange(c.name, c);
          }}
        />
      )}
    </>
  );
}

/** Kalemde ürün seçimi. Kart seçilince birimi kaleme gelir. */
export function ProductPicker({
  id,
  value,
  onChange,
  products,
  onCreated,
  invalid,
}: {
  id?: string;
  value: string;
  onChange: (name: string, card?: Product) => void;
  products: Product[];
  onCreated: (p: Product) => void;
  invalid?: boolean;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const options = useMemo(() => products.map((p) => ({ id: p.id, name: p.name })), [products]);
  return (
    <>
      <CardPicker
        id={id}
        value={value}
        onChange={(n, o) => onChange(n, o && products.find((p) => p.id === o.id))}
        options={options}
        placeholder="Ürün seçin"
        addLabel="Yeni ürün kartı aç"
        onAdd={setAdding}
        invalid={invalid}
      />
      {adding !== null && (
        <ProductSheet
          name={adding}
          onClose={() => setAdding(null)}
          onSaved={(p) => {
            setAdding(null);
            onCreated(p);
            onChange(p.name, p);
          }}
        />
      )}
    </>
  );
}

/** Formda eklenen kartı listeye Türkçe alfabetik sırayla katar. */
export function withCard<T extends { id: string; name: string }>(list: T[], card: T) {
  return [...list.filter((x) => x.id !== card.id), card].sort((a, b) => a.name.localeCompare(b.name, "tr"));
}

export const hasCard = (list: { name: string }[], name: string) => list.some((x) => cardKey(x.name) === cardKey(name));

// ---------------------------------------------------------------------------
// Ayarlar: kart listeleri
// ---------------------------------------------------------------------------

export function CardManager(
  props:
    | { kind: "customer"; cards: Customer[]; usage: Record<string, number> }
    | { kind: "product"; cards: Product[]; usage: Record<string, number> },
) {
  const customer = props.kind === "customer";
  const [cards, setCards] = useState<(Customer | Product)[]>(props.cards);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Customer | Product | "new" | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const term = cardKey(q);
  const list = term ? cards.filter((c) => cardKey([c.name, customer ? customerSub(c as Customer) : ""].join(" ")).includes(term)) : cards;
  const Icon = customer ? Building2 : Package;

  function remove(id: string) {
    setError(undefined);
    start(async () => {
      const r = customer ? await deleteCustomer(id) : await deleteProduct(id);
      setConfirm(null);
      if (!r.ok) return setError(r.error);
      setCards((cs) => cs.filter((c) => c.id !== id));
    });
  }
  const saved = (c: Customer | Product) => {
    setEditing(null);
    setCards((cs) => withCard(cs, c));
  };

  return (
    <>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={customer ? "Hastane / müşteri ara" : "Ürün ara"}
            className="input pl-10"
            type="search"
          />
        </div>
        <button onClick={() => setEditing("new")} className="btn-primary shrink-0 gap-1.5 px-3.5">
          <Plus size={18} /> Ekle
        </button>
      </div>
      <p className="mt-2 px-1 text-[12px] text-muted">
        {cards.length} kart. {customer ? "Satış kayıtlarında ve görüşmelerde" : "Satış kayıtlarının kalemlerinde"} bu kartlardan seçilir.
      </p>
      {error && <p className={`mt-3 ${ERROR_CLS}`}>{error}</p>}
      <div className="card mt-3 divide-y divide-line/70">
        {list.map((c) => {
          const n = props.usage[c.id] ?? 0;
          const sub = customer ? customerSub(c as Customer) : (c as Product).unit;
          return (
            <div key={c.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <b className="block truncate text-[15px] font-semibold">{c.name}</b>
                <p className="truncate text-[12px] text-muted">
                  {[sub, n ? `${n} kayıt` : "Kayıtta kullanılmadı"].filter(Boolean).join(" · ")}
                </p>
              </div>
              {confirm === c.id ? (
                <>
                  <button onClick={() => setConfirm(null)} className="btn-secondary px-3 py-1.5 text-[13px]">
                    Vazgeç
                  </button>
                  <button onClick={() => remove(c.id)} disabled={pending} className="btn-danger px-3 py-1.5 text-[13px]">
                    Sil
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => setEditing(c)}
                    className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas"
                    aria-label={`${c.name} kartını düzenle`}
                  >
                    <Pencil size={16} />
                  </button>
                  {!n && (
                    <button
                      onClick={() => (setError(undefined), setConfirm(c.id))}
                      className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-canvas"
                      aria-label={`${c.name} kartını sil`}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </>
              )}
            </div>
          );
        })}
        {!list.length && <p className="px-4 py-8 text-center text-[14px] text-muted">{term ? "Sonuç bulunamadı." : "Henüz kart yok."}</p>}
      </div>
      {editing !== null &&
        (customer ? (
          <CustomerSheet
            initial={editing === "new" ? undefined : (editing as Customer)}
            name={editing === "new" ? q.trim() : ""}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
        ) : (
          <ProductSheet
            initial={editing === "new" ? undefined : (editing as Product)}
            name={editing === "new" ? q.trim() : ""}
            onClose={() => setEditing(null)}
            onSaved={saved}
          />
        ))}
    </>
  );
}
