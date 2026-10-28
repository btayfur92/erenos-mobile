export type RecordType = "yaklasik_maliyet" | "dogrudan_temin" | "ihale_siparisi" | "dmo_ihalesi" | "genel_siparis";

/** İhale ve DMO ihalesi: tarihli ihale, sonradan girilen fiyatlar, rakip fiyatları, sözleşme/sipariş süresi. */
export const isTenderType = (type: RecordType) => type === "ihale_siparisi" || type === "dmo_ihalesi";

/** Kalem adı; DMO ihalesinde şehriyle ("Eldiven · Ankara"). DMO şehri `region` sütununda tutulur. */
export const lineName = (l: { product_name: string; region?: string | null }) =>
  l.region ? `${l.product_name} · ${l.region}` : l.product_name;

export type RecordStatus =
  | "acik"
  | "ihale_bekliyor"
  | "arama_bekliyor"
  | "arandi"
  | "numune_istendi"
  | "numune_gonderildi"
  | "onaylandi"
  | "reddedildi";

export type ShipmentStatus = "sevk_bekliyor" | "teslim_edildi";

export interface RecordLine {
  id: string;
  record_id: string;
  sort_order: number;
  product_name: string; // ürün kartının adı
  product_id: string | null;
  quantity: number;
  unit: string;
  unit_price: number | null; // ihalede fiyat sonradan girilir
  currency: string;
  approved: boolean | null;
  approved_qty: number | null;
  contract_qty: number | null; // ihale: sözleşmedeki ilk miktar
  region: string | null; // DMO ihalesi: ürünün istendiği şehir (ör. Ankara, İstanbul 1. Bölge)
  ym_price?: number | null; // yaklaşık maliyet: hastanenin belirttiği birim fiyat (kalemin para biriminde)
}

export interface SalesRecord {
  id: string;
  type: RecordType;
  status: RecordStatus;
  record_date: string;
  file_no: string | null;
  hospital: string; // hastane/müşteri kartının adı
  customer_id: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_ext: string | null;
  notes: string | null;
  source_record_id: string | null;
  converted_record_id: string | null;
  result_at: string | null;
  result_note: string | null;
  sample_requested_at: string | null;
  sample_note: string | null;
  sample_sent_at: string | null;
  sample_sent_by: string | null;
  guarantee_paid_at: string | null;
  guarantee_paid_by: string | null;
  prices_entered_at: string | null;
  /** İhale saati ("HH:MM:SS"); ihale dışında null. */
  tender_time: string | null;
  contract_start: string | null;
  contract_end: string | null;
  contract_alarm_sent_at: string | null;
  last_reminded_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  record_lines?: RecordLine[];
}

export interface LineProgress {
  line_id: string;
  record_id: string;
  approved_qty: number;
  in_shipment: number;
  delivered: number;
  remaining: number;
}

export interface SampleItem {
  id: string;
  record_id: string;
  sort_order: number;
  product_name: string;
  quantity: number;
  unit: string;
}

/** İhalede rakip firmanın kalem fiyatı. */
export interface TenderBid {
  id: string;
  record_id: string;
  line_id: string;
  company: string;
  unit_price: number;
  currency: string;
  created_at: string;
}

/** Sözleşmeli ihalede iş artışı / eksiltmesi. */
export interface ContractAdjustment {
  id: string;
  record_id: string;
  line_id: string;
  old_qty: number;
  new_qty: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
}

export interface CallLog {
  id: string;
  record_id: string;
  note: string;
  keep_reminding: boolean;
  created_by: string | null;
  created_at: string;
}

export interface ShipmentItem {
  id: string;
  shipment_id: string;
  line_id: string;
  quantity: number;
  record_lines?: Pick<RecordLine, "product_name" | "unit"> | null;
}

export interface Shipment {
  id: string;
  record_id: string;
  status: ShipmentStatus;
  note: string | null;
  planned_date: string;
  requested_at: string;
  delivered_at: string | null;
  delivered_by: string | null;
  created_by: string | null;
  shipment_items?: ShipmentItem[];
  records?: Pick<SalesRecord, "id" | "hospital" | "file_no" | "record_date"> | null;
}

export type ManualDirection = "gelecek" | "gidecek";
export type ManualStatus = "bekliyor" | "tamamlandi";

/** Elle eklenen sevkiyat: gelecek (tedarikçiden bize) ya da doğrudan temine bağlı olmayan gidecek. */
export interface ManualShipment {
  id: string;
  direction: ManualDirection;
  party: string;
  product_details: string;
  quantity: number;
  unit: string;
  due_date: string;
  note: string | null;
  status: ManualStatus;
  completed_at: string | null;
  completed_by: string | null;
  created_by: string | null;
  created_at: string;
  manual_shipment_deliveries?: ManualDelivery[];
}

/** Elle eklenen sevkiyatta parça teslim. */
export interface ManualDelivery {
  id: string;
  shipment_id: string;
  quantity: number;
  delivered_by: string | null;
  delivered_at: string;
}

/** Hastane ziyaretinde alınan görüşme notu. */
/** Hastane / müşteri kartı. Yalnızca ad zorunlu. */
export interface Customer {
  id: string;
  name: string;
  city: string | null;
  district: string | null;
  contact_name: string | null;
  contact_phone: string | null;
}

/** Ürün kartı; kalemde seçilince birimi gelir. */
export interface Product {
  id: string;
  name: string;
  unit: string;
}

/** Kart adlarını Türkçe büyük/küçük harf farkı gözetmeden karşılaştırmak için. */
export const cardKey = (name: string) => name.trim().toLocaleLowerCase("tr-TR");

export interface Meeting {
  id: string;
  meeting_date: string;
  hospital: string;
  customer_id: string | null;
  department: string;
  note: string;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string | null;
}

export interface Profile {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  is_admin: boolean; // role === "admin"
  active: boolean;
  /** Anımsatıcıları her gün 08:00–22:00 arasında al (kapalıyken hafta içi mesai saatleri). */
  extended_hours: boolean;
  created_at: string;
}

/**
 * Kullanıcı tipleri: admin her şey + kullanıcı/şifre yönetimi; yönetici kullanıcı yönetimi hariç her şey;
 * satış gidecek sevkiyatta teslim edildi işaretleyemez (gelecekte teslim alındı der); sevkiyat yalnızca teslim işaretler, elle sevkiyat ve görüşme ekler.
 */
export type UserRole = "admin" | "yonetici" | "satis" | "sevkiyat";
export const USER_ROLES: { value: UserRole; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Her şey; kullanıcı açar, şifre değiştirir" },
  { value: "yonetici", label: "Yönetici", hint: "Kullanıcı yönetimi hariç her şey" },
  { value: "satis", label: "Satış", hint: "Gidecekte teslim edildi diyemez; gelecekte teslim alındı der" },
  { value: "sevkiyat", label: "Sevkiyat", hint: "Teslim işaretler, sevkiyat ve görüşme ekler; kayıt açamaz" },
];
export const ROLE_LABEL = Object.fromEntries(USER_ROLES.map((r) => [r.value, r.label])) as Record<UserRole, string>;
/** Satış kayıtlarını açıp değiştirebilir, sevkiyata aktarabilir. */
export const canSell = (role: UserRole) => role !== "sevkiyat";
/** Gidecek sevkiyatta teslim edildi işaretleyebilir (gelecekte teslim alındıyı herkes işaretler). */
export const canDeliver = (role: UserRole) => role !== "satis";

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  yaklasik_maliyet: "Yaklaşık Maliyet",
  dogrudan_temin: "Doğrudan Temin",
  ihale_siparisi: "Hastane İhalesi",
  dmo_ihalesi: "DMO İhalesi",
  genel_siparis: "Genel Satış",
};

export const RECORD_TYPE_SHORT: Record<RecordType, string> = {
  yaklasik_maliyet: "YM",
  dogrudan_temin: "DT",
  ihale_siparisi: "İS",
  dmo_ihalesi: "DMO",
  genel_siparis: "GS",
};

export const STATUS_LABEL: Record<RecordStatus, string> = {
  acik: "Açık",
  ihale_bekliyor: "İhale süreci",
  arama_bekliyor: "Arama bekliyor",
  arandi: "Arandı, sonuç bekleniyor",
  numune_istendi: "Numune istendi",
  numune_gonderildi: "Numune gönderildi, sonuç bekleniyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

export const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
export const UNITS = ["Adet", "Kutu", "Paket", "Koli", "Set", "Litre", "Kg", "Metre"] as const;

/** Onaylanan (DT / Genel Satış) kayıtta onaylı tüm kalemler teslim edildi mi? */
export function isFullyDelivered(record: SalesRecord, progress: Map<string, LineProgress>) {
  if (record.status !== "onaylandi" || record.type === "yaklasik_maliyet") return false;
  const approved = (record.record_lines ?? []).filter((l) => l.approved);
  return (
    approved.length > 0 &&
    approved.every((l) => Number(progress.get(l.id)?.remaining ?? 1) <= 0 && Number(progress.get(l.id)?.in_shipment ?? 1) <= 0)
  );
}

/** İhale tarihine kalan gün (İstanbul bugününe göre; geçmişse negatif). */
export function daysUntil(date: string, today: string) {
  return Math.round((Date.parse(date.slice(0, 10)) - Date.parse(today)) / 86_400_000);
}

/** Bitiş alarmının başladığı gün sayısı: ihale sözleşmesinde son ay, DMO teslim süresinde son 7 gün. */
export const alarmDays = (type: RecordType) => (type === "dmo_ihalesi" ? 7 : 30);

/** Sözleşmeli ihale son ayına ya da siparişli DMO teslim süresinin son 7 gününe girdi mi? */
export function inLastMonth(record: Pick<SalesRecord, "type" | "status" | "contract_end">, today: string) {
  return (
    isTenderType(record.type) &&
    record.status === "onaylandi" &&
    !!record.contract_end &&
    daysUntil(record.contract_end, today) <= alarmDays(record.type)
  );
}

/** DMO şehir önerileri (serbest yazı da girilebilir). */
export const DMO_CITIES = [
  "Adana",
  "Adıyaman",
  "Afyonkarahisar",
  "Ağrı",
  "Aksaray",
  "Amasya",
  "Ankara",
  "Antalya",
  "Ardahan",
  "Artvin",
  "Aydın",
  "Balıkesir",
  "Bartın",
  "Batman",
  "Bayburt",
  "Bilecik",
  "Bingöl",
  "Bitlis",
  "Bolu",
  "Burdur",
  "Bursa",
  "Çanakkale",
  "Çankırı",
  "Çorum",
  "Denizli",
  "Diyarbakır",
  "Düzce",
  "Edirne",
  "Elazığ",
  "Erzincan",
  "Erzurum",
  "Eskişehir",
  "Gaziantep",
  "Giresun",
  "Gümüşhane",
  "Hakkari",
  "Hatay",
  "Iğdır",
  "Isparta",
  "İstanbul 1. Bölge",
  "İstanbul 2. Bölge",
  "İstanbul 3. Bölge",
  "İstanbul 4. Bölge",
  "İstanbul 5. Bölge",
  "İstanbul 6. Bölge",
  "İzmir",
  "Kahramanmaraş",
  "Karabük",
  "Karaman",
  "Kars",
  "Kastamonu",
  "Kayseri",
  "Kırıkkale",
  "Kırklareli",
  "Kırşehir",
  "Kilis",
  "Kocaeli",
  "Konya",
  "Kütahya",
  "Malatya",
  "Manisa",
  "Mardin",
  "Mersin",
  "Muğla",
  "Muş",
  "Nevşehir",
  "Niğde",
  "Ordu",
  "Osmaniye",
  "Rize",
  "Sakarya",
  "Samsun",
  "Siirt",
  "Sinop",
  "Sivas",
  "Şanlıurfa",
  "Şırnak",
  "Tekirdağ",
  "Tokat",
  "Trabzon",
  "Tunceli",
  "Uşak",
  "Van",
  "Yalova",
  "Yozgat",
  "Zonguldak",
];

/** İhale saati "HH:MM" (girilmemişse 09:00). */
export function tenderTime(time: string | null | undefined) {
  return (time || "09:00").slice(0, 5);
}

/** İhale anı (Türkiye saati UTC+3, yaz saati uygulaması yok). */
export function tenderAt(date: string, time: string | null | undefined) {
  return Date.parse(`${date.slice(0, 10)}T${tenderTime(time)}:00+03:00`);
}

/** "İhaleye 3 gün kaldı" / "İhale yarın 10:30" / "İhale bugün 10:30" / "İhale yapıldı" */
export function tenderCountdown(date: string, today: string, time?: string | null, now = Date.now()) {
  const d = daysUntil(date, today);
  if (d > 1) return `İhaleye ${d} gün kaldı`;
  if (d === 1) return `İhale yarın ${tenderTime(time)}`;
  return d === 0 && now < tenderAt(date, time) ? `İhale bugün ${tenderTime(time)}` : "İhale yapıldı";
}

// ---------------------------------------------------------------------------
// Anımsatıcılar
// ---------------------------------------------------------------------------

export interface ReminderRecipient {
  reminder_id: string;
  user_id: string;
  done_at: string | null;
  last_sent_at: string | null;
}

export interface Reminder {
  id: string;
  title: string;
  detail: string | null;
  starts_at: string;
  interval_minutes: number;
  created_by: string | null;
  created_at: string;
  updated_at: string | null;
  reminder_recipients?: ReminderRecipient[];
}

export const REMINDER_INTERVALS: { minutes: number; label: string }[] = [
  { minutes: 30, label: "30 dakikada bir" },
  { minutes: 60, label: "1 saatte bir" },
  { minutes: 120, label: "2 saatte bir" },
  { minutes: 180, label: "3 saatte bir" },
  { minutes: 240, label: "4 saatte bir" },
  { minutes: 1440, label: "Günde bir" },
  { minutes: 10080, label: "Haftada bir" },
];

export const intervalLabel = (minutes: number) => REMINDER_INTERVALS.find((i) => i.minutes === minutes)?.label ?? `${minutes} dakikada bir`;

/** Hastane / müşteri kartındaki il önerileri (81 il, Türkçe alfabetik). */
export const PROVINCES = [...DMO_CITIES.filter((c) => !c.startsWith("İstanbul ")), "İstanbul"].sort((a, b) => a.localeCompare(b, "tr"));
