"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ArrowRight, Building2, Clock, FileText, Gavel, Loader2, Lock, NotebookPen, Package, Pencil, Phone, Plus, Trash2 } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { deleteMeeting, saveMeeting } from "@/app/(app)/actions";
import { formatDate, formatDateTime, formatDateWithDay, todayIstanbul } from "@/lib/format";
import { RECORD_TYPE_LABEL, isTenderType, lineName, tenderTime, type Customer, type Meeting, type MeetingRecord } from "@/lib/types";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { CustomerPicker, hasCard, withCard } from "@/components/cards";

/** Notun bağlı olduğu kayıt: tür + durum, ihale/dosya no, ilk iki ürün, ihale (ya da kayıt) tarihi. */
function RecordSummary({ record: r, arrow = false }: { record: MeetingRecord; arrow?: boolean }) {
  const names = [...(r.record_lines ?? [])].sort((a, b) => a.sort_order - b.sort_order).map(lineName);
  const more = names.length - 2;
  const tender = isTenderType(r.type);
  return (
    <>
      <span className="flex items-center gap-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold text-brand-700">
          <FileText size={14} className="shrink-0" /> {RECORD_TYPE_LABEL[r.type]}
        </span>
        <span className="min-w-0 flex-1">
          <StatusBadge status={r.status} label={statusLabel(r)} />
        </span>
        {arrow && <ArrowRight size={15} className="shrink-0 text-brand-700" />}
      </span>
      {r.file_no && (
        <span className="mt-1 block truncate text-[12px] text-muted">
          {tender ? "İhale no: " : "Dosya no: "}
          {r.file_no}
        </span>
      )}
      {names.length > 0 && (
        <span className="mt-1.5 flex items-start gap-1.5 text-[12px] text-ink/80">
          <Package size={13} className="mt-0.5 shrink-0 text-muted" />
          <span className="min-w-0">
            {names.slice(0, 2).join(", ")}
            {more > 0 && <b className="font-semibold"> +{more} kalem</b>}
          </span>
        </span>
      )}
      <span className="mt-1 flex items-center gap-1.5 text-[12px] text-ink/80">
        {tender ? <Gavel size={13} className="shrink-0 text-muted" /> : <Clock size={13} className="shrink-0 text-muted" />}
        {tender
          ? `${r.type === "dmo_ihalesi" ? "DMO" : "İhale"}: ${formatDate(r.record_date)} · ${tenderTime(r.tender_time)}`
          : `Tarih: ${formatDate(r.record_date)}`}
      </span>
    </>
  );
}

/**
 * mine: notu giren kişi bu kullanıcı; düzenleme ve silme yalnızca ona açık. canPrivate: admin (özel görüşme seçebilir).
 * inRecord: kaydın kendi sayfasında gösteriliyor (kayıt bağlantısı gizlenir).
 */
export function MeetingCard({
  meeting: m,
  names,
  customers,
  mine,
  canPrivate,
  inRecord = false,
}: {
  meeting: Meeting;
  names: Record<string, string>;
  customers: Customer[];
  mine: boolean;
  canPrivate: boolean;
  inRecord?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Building2 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          {m.kind === "arama" && (
            <span className="mb-0.5 inline-flex items-center gap-1 rounded-md bg-brand-50 px-1.5 py-px text-[11px] font-semibold text-brand-700">
              <Phone size={11} /> Arama notu
            </span>
          )}
          {m.private && (
            <span className="mb-0.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-1.5 py-px text-[11px] font-semibold text-amber-700">
              <Lock size={11} /> Özel görüşme
            </span>
          )}
          <b className="block truncate text-[15px] font-semibold">{m.hospital}</b>
          <p className="text-[12px] font-semibold text-ink/80">{formatDateWithDay(m.meeting_date)}</p>
          <p className="text-[12px] text-muted">{m.department}</p>
        </div>
        {mine && m.kind !== "arama" && (
          <button
            onClick={() => setEditing(true)}
            className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
            aria-label="Görüşme notunu düzenle"
          >
            <Pencil size={15} />
          </button>
        )}
      </div>
      <p className="mt-3 whitespace-pre-line rounded-xl bg-canvas px-3 py-2.5 text-[14px] leading-relaxed">{m.note}</p>
      {m.record && !inRecord && (
        <Link href={`/kayit/${m.record.id}`} prefetch={false} className="mt-2 block rounded-xl bg-brand-50 px-3 py-2.5">
          <RecordSummary record={m.record} arrow />
        </Link>
      )}
      <p className="mt-2 text-[12px] text-muted">
        {m.created_by && names[m.created_by] ? names[m.created_by] : "—"}
        {m.updated_at
          ? ` · düzenlendi ${formatDateTime(m.updated_at)}${m.updated_by && names[m.updated_by] ? ` (${names[m.updated_by]})` : ""}`
          : ""}
      </p>
      {editing && (
        <MeetingSheet meeting={m} record={m.record} customers={customers} canPrivate={canPrivate} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

/** Başlıktaki "Not ekle" düğmesi. canPrivate: admin özel görüşme seçebilir; defaultPrivate: Özel görüşmeler sekmesinden açıldı. */
export function MeetingEditor({
  customers,
  canPrivate = false,
  defaultPrivate = false,
}: {
  customers: Customer[];
  canPrivate?: boolean;
  defaultPrivate?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary h-10 gap-1.5 px-3 py-0 text-[14px]">
        <Plus size={18} /> Not ekle
      </button>
      {open && (
        <MeetingSheet customers={customers} canPrivate={canPrivate} defaultPrivate={defaultPrivate} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

/** Satış kaydının sayfasındaki "Görüşme notu ekle": hastane kayıttan gelir, not kayda bağlanır. Her kullanıcı tipine açık. */
export function RecordMeetingButton({
  record,
  hospital,
  customers,
  canPrivate,
}: {
  record: MeetingRecord;
  hospital: string;
  customers: Customer[];
  canPrivate: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-secondary w-full">
        <NotebookPen size={17} /> Görüşme notu ekle
      </button>
      {open && (
        <MeetingSheet record={record} hospital={hospital} customers={customers} canPrivate={canPrivate} onClose={() => setOpen(false)} />
      )}
    </>
  );
}

function MeetingSheet({
  meeting,
  record,
  hospital,
  customers: initialCustomers,
  canPrivate,
  defaultPrivate = false,
  onClose,
}: {
  meeting?: Meeting;
  /** Not bir kayda bağlıysa (ya da kayıt sayfasından ekleniyorsa) o kayıt. */
  record?: MeetingRecord | null;
  /** Kayıt sayfasından eklenirken önceden seçili hastane. */
  hospital?: string;
  customers: Customer[];
  canPrivate: boolean;
  defaultPrivate?: boolean;
  onClose: () => void;
}) {
  const [isPrivate, setIsPrivate] = useState(meeting?.private ?? defaultPrivate);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [customers, setCustomers] = useState(initialCustomers);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({
    meeting_date: meeting?.meeting_date ?? todayIstanbul(),
    hospital: meeting?.hospital ?? hospital ?? "",
    department: meeting?.department ?? "",
    note: meeting?.note ?? "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!hasCard(customers, form.hospital))
      return setError(
        form.hospital.trim()
          ? `“${form.hospital.trim()}” için kart yok. Listeden seçin ya da “yeni kart aç” ile ekleyin.`
          : "Hastane seçin.",
      );
    start(async () => {
      const r = await saveMeeting({ ...form, id: meeting?.id, private: canPrivate && isPrivate, record_id: meeting ? undefined : record?.id });
      if (!r.ok) return setError(r.error);
      onClose();
      router.refresh();
    });
  }

  function remove() {
    if (!meeting) return;
    start(async () => {
      const r = await deleteMeeting(meeting.id);
      if (!r.ok) return setError(r.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Sheet open onClose={onClose} title={meeting ? "Görüşme notunu düzenle" : "Yeni görüşme notu"}>
      <form onSubmit={submit} className="space-y-4">
        {canPrivate && (
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-canvas p-1" role="radiogroup" aria-label="Görüşme türü">
            {(
              [
                [false, "Normal görüşme"],
                [true, "Özel görüşme"],
              ] as const
            ).map(([val, label]) => (
              <button
                key={label}
                type="button"
                role="radio"
                aria-checked={isPrivate === val}
                onClick={() => setIsPrivate(val)}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold ${
                  isPrivate === val ? "bg-white text-brand-700 shadow-sm ring-1 ring-line" : "text-muted"
                }`}
              >
                {val && <Lock size={14} />} {label}
              </button>
            ))}
          </div>
        )}
        <p className={`text-[13px] text-muted ${canPrivate ? "-mt-2" : ""}`}>
          {canPrivate && isPrivate
            ? "Özel görüşmeyi yalnızca adminler görür."
            : (meeting ? meeting.record_id : record)
              ? "Bu notu herkes görür."
              : "Bu notu yalnızca adminler ve yöneticiler görür."}
        </p>
        <div>
          <label className="field-label" htmlFor="m_date">
            Tarih
          </label>
          <input id="m_date" type="date" value={form.meeting_date} onChange={set("meeting_date")} className="input" required />
        </div>
        {record && (
          <div className="rounded-xl bg-brand-50 px-3 py-2.5">
            <RecordSummary record={record} />
          </div>
        )}
        <div>
          <label className="field-label" htmlFor="m_hospital">
            Hastane
          </label>
          <CustomerPicker
            id="m_hospital"
            value={form.hospital}
            customers={customers}
            placeholder="Hastane seçin"
            onCreated={(c) => setCustomers((cs) => withCard(cs, c))}
            onChange={(name) => setForm((f) => ({ ...f, hospital: name }))}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="m_department">
            Servis
          </label>
          <input
            id="m_department"
            value={form.department}
            onChange={set("department")}
            className="input"
            placeholder="ör. Ameliyathane, Satın alma"
            required
          />
        </div>
        <div>
          <label className="field-label" htmlFor="m_note">
            Görüşme notu
          </label>
          <textarea id="m_note" value={form.note} onChange={set("note")} rows={5} className="input resize-none" required />
        </div>
        {error && <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending && <Loader2 size={18} className="animate-spin" />} {meeting ? "Kaydet" : "Notu kaydet"}
        </button>
        {meeting &&
          (confirmDelete ? (
            <div className="grid grid-cols-2 gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfirmDelete(false)}>
                Vazgeç
              </button>
              <button type="button" className="btn-danger" disabled={pending} onClick={remove}>
                <Trash2 size={17} /> Evet, sil
              </button>
            </div>
          ) : (
            <button type="button" className="btn-secondary w-full text-accent-700" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={17} /> Notu sil
            </button>
          ))}
      </form>
    </Sheet>
  );
}
