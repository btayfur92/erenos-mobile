import { TIME_ZONE } from "./config";

export const WORK_START_HOUR = 9;
export const WORK_END_HOUR = 18;
export const REMINDER_INTERVAL_MS = 2 * 60 * 60 * 1000;
/** Sözleşmesi son ayında olan ihaleler için günlük bildirim saati (İstanbul). */
export const CONTRACT_ALARM_HOUR = 14;

/** İstanbul'da şu anki saat (0–23). */
export function istanbulHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", hourCycle: "h23" }).format(now));
}

/** Hafta içi 09:00–18:00 (İstanbul) arasında mı? */
export function isWorkingTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const weekday = get("weekday");
  if (weekday === "Sat" || weekday === "Sun") return false;
  const minutes = Number(get("hour")) * 60 + Number(get("minute"));
  return minutes >= WORK_START_HOUR * 60 && minutes <= WORK_END_HOUR * 60;
}

/** Anımsatıcılarda "mesai dışında da al" açıkken: her gün 08:00–22:00 (İstanbul). */
export const EXTENDED_START_HOUR = 8;
export const EXTENDED_END_HOUR = 22;
export function isExtendedTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const minutes = get("hour") * 60 + get("minute");
  return minutes >= EXTENDED_START_HOUR * 60 && minutes <= EXTENDED_END_HOUR * 60;
}
