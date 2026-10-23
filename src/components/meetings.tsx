"use client";

import { useState, useTransition } from "react";
import { Building2, Loader2, Pencil, Plus } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { saveMeeting } from "@/app/(app)/actions";
import { formatDate, formatDateTime, todayIstanbul } from "@/lib/format";
import type { Meeting } from "@/lib/types";

export function MeetingCard({ meeting: m, names }: { meeting: Meeting; names: Record<string, string> }) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <Building2 size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <b className="block truncate text-[15px] font-semibold">{m.hospital}</b>
          <p className="text-[12px] text-muted">
            <b className="font-semibold text-ink/80">{formatDate(m.meeting_date)}</b> · {m.department}
          </p>
        </div>
        <button
          onClick={() => setEditing(true)}
          className="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
          aria-label="Görüşme notunu düzenle"
        >
          <Pencil size={15} />
        </button>
      </div>
      <p className="mt-3 whitespace-pre-line rounded-xl bg-canvas px-3 py-2.5 text-[14px] leading-relaxed">{m.note}</p>
      <p className="mt-2 text-[12px] text-muted">
        {m.created_by && names[m.created_by] ? names[m.created_by] : "—"}
        {m.updated_at
          ? ` · düzenlendi ${formatDateTime(m.updated_at)}${m.updated_by && names[m.updated_by] ? ` (${names[m.updated_by]})` : ""}`
          : ""}
      </p>
      {editing && <MeetingSheet meeting={m} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Başlıktaki "Not ekle" düğmesi. */
export function MeetingEditor() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary h-10 gap-1.5 px-3 py-0 text-[14px]">
        <Plus size={18} /> Not ekle
      </button>
      {open && <MeetingSheet onClose={() => setOpen(false)} />}
    </>
  );
}

function MeetingSheet({ meeting, onClose }: { meeting?: Meeting; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [form, setForm] = useState({
    meeting_date: meeting?.meeting_date ?? todayIstanbul(),
    hospital: meeting?.hospital ?? "",
    department: meeting?.department ?? "",
    note: meeting?.note ?? "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const r = await saveMeeting({ ...form, id: meeting?.id });
      if (!r.ok) return setError(r.error);
      onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={meeting ? "Görüşme notunu düzenle" : "Yeni görüşme notu"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="m_date">
            Tarih
          </label>
          <input id="m_date" type="date" value={form.meeting_date} onChange={set("meeting_date")} className="input" required />
        </div>
        <div>
          <label className="field-label" htmlFor="m_hospital">
            Hastane
          </label>
          <input id="m_hospital" value={form.hospital} onChange={set("hospital")} className="input" placeholder="Hastane adı" required />
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
      </form>
    </Sheet>
  );
}
