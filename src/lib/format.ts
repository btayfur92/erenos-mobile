import { TIME_ZONE } from "./config";

const CURRENCY_SYMBOL: Record<string, string> = { TRY: "₺", USD: "$", EUR: "€", GBP: "£" };

export function formatQty(n: number | string | null | undefined) {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(Number(n ?? 0));
}

export function formatMoney(n: number | string, currency: string) {
  const v = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(
    Number(n),
  );
  return `${v} ${CURRENCY_SYMBOL[currency] ?? currency}`;
}

/** "2026-10-20" gibi tarih alanları için (saat dilimi kaydırması olmadan). */
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

/** Kalemlerin toplamını para birimine göre gruplar. */
export function totalsByCurrency(lines: { quantity: number; unit_price: number; currency: string }[]) {
  const totals = new Map<string, number>();
  for (const l of lines) totals.set(l.currency, (totals.get(l.currency) ?? 0) + Number(l.quantity) * Number(l.unit_price));
  return [...totals.entries()].map(([currency, total]) => formatMoney(total, currency)).join(" + ");
}
