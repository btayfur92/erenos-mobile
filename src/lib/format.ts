import { TIME_ZONE } from "./config";

const CURRENCY_SYMBOL: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€", GBP: "£" };

export function formatQty(n: number | string | null | undefined) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

export function formatMoney(n: number | string, currency: string) {
  const v = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number(n));
  return `${v} ${CURRENCY_SYMBOL[currency] ?? currency}`;
}

/** "2026-10-20" gibi tarih alanları için (saat dilimi kaydırması olmadan). */
/** "24 Ekim 2026 Cumartesi" */
export function formatDateWithDay(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("tr-TR", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${formatDate(date)} ${weekday}`;
}

export function formatDate(date: string) {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("tr-TR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function formatDateTime(ts: string) {
  return new Intl.DateTimeFormat("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  }).format(new Date(ts));
}

/** İstanbul saatine göre bugünün tarihi (YYYY-MM-DD). */
export function todayIstanbul() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

/** Telefonu dahili ile birlikte yazar: "0312 552 60 00 · Dahili 123". */
export function formatPhone(phone: string, ext?: string | null) {
  return ext ? `${phone} · Dahili ${ext}` : phone;
}

/** Kalemlerin toplamını para birimine göre gruplar. */
export function totalsByCurrency(lines: { quantity: number; unit_price: number | null; currency: string }[]) {
  const totals = new Map<string, number>();
  for (const l of lines) totals.set(l.currency, (totals.get(l.currency) ?? 0) + Number(l.quantity) * Number(l.unit_price));
  return [...totals.entries()].map(([currency, total]) => formatMoney(total, currency)).join(" + ");
}

/**
 * Kalemlerin tek bir toplamı. Tek para birimi varsa o birimde, birden fazla varsa
 * kurla TL'ye çevrilmiş yaklaşık toplam (≈) gösterilir. Kur yoksa birimlere göre ayrı yazılır.
 */
export function singleTotal(
  lines: { quantity: number; unit_price: number | null; currency: string }[],
  rates: Record<string, number> | null,
) {
  // İhalede fiyatlar ihaleden önce girilir; o zamana kadar tutar yoktur.
  if (lines.some((l) => l.unit_price === null)) return "Fiyat girilmedi";
  const currencies = new Set(lines.map((l) => l.currency));
  if (currencies.size <= 1 || !rates || [...currencies].some((c) => !rates[c])) return totalsByCurrency(lines);
  const tl = lines.reduce((sum, l) => sum + Number(l.quantity) * Number(l.unit_price) * rates[l.currency], 0);
  return `≈ ${formatMoney(Math.round(tl * 100) / 100, "TRY")}`;
}

/** Fiyatı TL'ye çevirir (kur yoksa null). Rakip fiyatlarını sıralamak için. */
export function toTry(price: number, currency: string, rates: Record<string, number> | null) {
  if (currency === "TRY") return Number(price);
  const r = rates?.[currency];
  return r ? Number(price) * r : null;
}
