export type RecordType = "yaklasik_maliyet" | "dogrudan_temin" | "ihale_siparisi" | "genel_siparis";

export type RecordStatus =
  | "acik"
  | "arama_bekliyor"
  | "arandi"
  | "onaylandi"
  | "reddedildi";

export type ShipmentStatus = "sevk_bekliyor" | "teslim_edildi";

export interface RecordLine {
  id: string;
  record_id: string;
  sort_order: number;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  currency: string;
  approved: boolean | null;
  approved_qty: number | null;
}

export interface SalesRecord {
  id: string;
  type: RecordType;
  status: RecordStatus;
  record_date: string;
  file_no: string | null;
  hospital: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_ext: string | null;
  notes: string | null;
  source_record_id: string | null;
  converted_record_id: string | null;
  result_at: string | null;
  result_note: string | null;
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

export type IncomingStatus = "bekliyor" | "teslim_alindi";

/** Gelecek sevkiyat: tedarikçiden bize gelecek ürünler. */
export interface IncomingShipment {
  id: string;
  supplier: string;
  product_details: string;
  quantity: number | null;
  unit: string | null;
  expected_date: string;
  note: string | null;
  status: IncomingStatus;
  received_at: string | null;
  received_by: string | null;
  created_by: string | null;
  created_at: string;
}

/** Hastane ziyaretinde alınan görüşme notu. */
export interface Meeting {
  id: string;
  meeting_date: string;
  hospital: string;
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
  is_admin: boolean;
  active: boolean;
  created_at: string;
}

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  yaklasik_maliyet: "Yaklaşık Maliyet",
  dogrudan_temin: "Doğrudan Temin",
  ihale_siparisi: "İhale Siparişi",
  genel_siparis: "Genel Sipariş",
};

export const RECORD_TYPE_SHORT: Record<RecordType, string> = {
  yaklasik_maliyet: "YM",
  dogrudan_temin: "DT",
  ihale_siparisi: "İS",
  genel_siparis: "GS",
};

export const STATUS_LABEL: Record<RecordStatus, string> = {
  acik: "Açık",
  arama_bekliyor: "Arama bekliyor",
  arandi: "Arandı, sonuç bekleniyor",
  onaylandi: "Onaylandı",
  reddedildi: "Reddedildi",
};

export const CURRENCIES = ["TRY", "USD", "EUR", "GBP"] as const;
export const UNITS = ["Adet", "Kutu", "Paket", "Koli", "Set", "Litre", "Kg", "Metre"] as const;
