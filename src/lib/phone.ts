/**
 * Türkiye telefon numaraları: cep (5xx), sabit hat (2xx, 3xx, 4xx alan kodları), 0850 ve 444'lü numaralar.
 * Girilen numara her zaman "0xxx xxx xx xx" biçiminde saklanır ki arama düğmesi doğrudan arayabilsin.
 */
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (/^444\d{4}$/.test(d)) return `444 ${d.slice(3, 5)} ${d.slice(5)}`;
  if (d.startsWith("0090")) d = d.slice(4);
  else if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  else if (d.startsWith("0")) d = d.slice(1);
  if (!/^(?:[2-5]\d{2}|850)\d{7}$/.test(d)) return null;
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
}

export const PHONE_ERROR = "Telefon numarası geçersiz. Cep (05xx xxx xx xx) veya sabit hat (0312 xxx xx xx) olarak alan koduyla girin.";

/** Arama bağlantısı. Dahili tuşlanmaz; yalnızca kayıtlı cep veya sabit numara aranır. */
export function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

/** Yazarken uyarı: fazla hane hemen, eksik veya hatalı numara alandan çıkınca (final) gösterilir. */
export function phoneHint(value: string, final: boolean): string {
  if (!value.trim() || normalizePhone(value)) return "";
  let d = value.replace(/\D/g, "");
  if (d.startsWith("0090")) d = "0" + d.slice(4);
  else if (d.startsWith("90")) d = "0" + d.slice(2);
  else if (!d.startsWith("0") && !d.startsWith("444")) d = "0" + d;
  const want = d.startsWith("444") ? 7 : 11;
  if (d.length > want) return `Fazla hane girildi: numara ${want} hane olmalı, şu an ${d.length}.`;
  if (!final) return "";
  return d.length < want ? `Eksik hane: numara ${want} hane olmalı, şu an ${d.length}.` : "Geçerli bir cep veya sabit hat numarası girin.";
}
