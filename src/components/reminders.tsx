"use client";

import { useOptimistic, useState, useTransition } from "react";
import { AlarmClock, Check, CircleCheck, Clock, Loader2, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { Sheet } from "@/components/sheet";
import { deleteReminder, saveReminder, setExtendedHours, setReminderDone } from "@/app/(app)/actions";
import { formatDateTime, todayIstanbul } from "@/lib/format";
import { TIME_ZONE } from "@/lib/config";
import { intervalLabel, REMINDER_INTERVALS, type Profile, type Reminder } from "@/lib/types";

type Person = Pick<Profile, "id" | "full_name" | "username">;
const personName = (p: Person) => p.full_name || p.username;

/** ISO zaman damgasının İstanbul tarih ve saati ("YYYY-MM-DD", "HH:MM"). */
function istanbulParts(ts: string) {
  const d = new Date(ts);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return { date, time };
}

/** Yeni anımsatıcı için varsayılan başlangıç: bir sonraki tam saat (mesai dışındaysa 09:00). */
function defaultStart() {
  const { time } = istanbulParts(new Date().toISOString());
  const next = Number(time.slice(0, 2)) + 1;
  if (next < 9) return { date: todayIstanbul(), time: "09:00" };
  if (next > 18) {
    const tomorrow = new Date(Date.parse(todayIstanbul()) + 86_400_000).toISOString().slice(0, 10);
    return { date: tomorrow, time: "09:00" };
  }
  return { date: todayIstanbul(), time: `${String(next).padStart(2, "0")}:00` };
}

export function ReminderCard({ reminder: r, me, people }: { reminder: Reminder; me: string; people: Person[] }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // İyimser güncelleme: Tamamlandı / Geri al / Sil sunucu yanıtı beklenmeden ekranda görünür, hata olursa geri alınır.
  const [opt, setOpt] = useOptimistic<"" | "done" | "undo" | "gone">("");
  const names = Object.fromEntries(people.map((p) => [p.id, personName(p)]));
  const recipients = (r.reminder_recipients ?? [])
    .map((x) =>
      x.user_id === me && (opt === "done" || opt === "undo") ? { ...x, done_at: opt === "done" ? new Date().toISOString() : null } : x,
    )
    .sort(
      (a, b) => Number(b.user_id === me) - Number(a.user_id === me) || (names[a.user_id] ?? "").localeCompare(names[b.user_id] ?? "", "tr"),
    );
  const mine = recipients.find((x) => x.user_id === me);
  const owner = r.created_by === me;
  const started = Date.parse(r.starts_at) <= Date.now();
  const doneCount = recipients.filter((x) => x.done_at).length;
  const firstDone = recipients
    .map((x) => x.done_at)
    .filter((d): d is string => !!d)
    .sort()[0]; // ilk tamamlayan yeşil görünür

  const act = (next: "done" | "undo" | "gone", fn: () => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      setError(undefined);
      setOpt(next);
      const res = await fn();
      if (!res.ok) setError(res.error);
    });

  if (opt === "gone") return null;

  return (
    <div className={`card p-4 ${mine && !mine.done_at && started ? "ring-2 ring-brand-200" : ""}`}>
      <div className="flex items-start gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${mine?.done_at ? "bg-emerald-50 text-emerald-600" : "bg-brand-50 text-brand-600"}`}
        >
          {mine?.done_at ? <CircleCheck size={20} /> : <AlarmClock size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold leading-snug">{r.title}</b>
          <p className="mt-0.5 flex items-center gap-1 text-[12px] text-muted">
            <Clock size={13} /> {started ? "" : "Başlangıç "}
            {formatDateTime(r.starts_at)} · {intervalLabel(r.interval_minutes)}
          </p>
        </div>
        {owner && (
          <div className="-mr-1 -mt-1 flex">
            <button
              onClick={() => setEditing(true)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
              aria-label="Anımsatıcıyı düzenle"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-canvas"
              aria-label="Anımsatıcıyı sil"
            >
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      {r.detail && <p className="mt-3 whitespace-pre-line rounded-xl bg-canvas px-3 py-2.5 text-[14px] leading-relaxed">{r.detail}</p>}

      <div className="mt-3 space-y-1.5">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-muted">
          <Users size={13} /> {doneCount}/{recipients.length} kişi tamamladı
        </p>
        {recipients.map((x) => (
          // İlk tamamlayan yeşil, sonrakiler siyah görünür.
          <div key={x.user_id} className="flex items-center justify-between gap-2 text-[13px]">
            <span
              className={`truncate ${x.done_at && x.done_at === firstDone ? "font-medium text-emerald-700" : x.done_at ? "text-ink" : "text-ink/80"}`}
            >
              {x.user_id === me ? "Siz" : (names[x.user_id] ?? "—")}
            </span>
            {x.done_at ? (
              <span className={`flex shrink-0 items-center gap-1 font-medium ${x.done_at === firstDone ? "text-emerald-700" : "text-ink"}`}>
                <Check size={14} /> Tamamlandı · {formatDateTime(x.done_at)}
              </span>
            ) : (
              <span className="shrink-0 text-muted">Bekliyor</span>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 text-[12px] text-muted">
        Oluşturan: {r.created_by ? (r.created_by === me ? "Siz" : (names[r.created_by] ?? "—")) : "—"}
      </p>

      {error && <p className="mt-3 rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}
      {confirmDelete ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-accent-50 p-3">
          <span className="text-[13px] font-medium text-accent-700">Anımsatıcı herkesten silinsin mi?</span>
          <div className="flex gap-2">
            <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-3 py-1.5 text-[13px]">
              Vazgeç
            </button>
            <button
              onClick={() => act("gone", () => deleteReminder(r.id))}
              disabled={pending}
              className="btn-danger px-3 py-1.5 text-[13px]"
            >
              Sil
            </button>
          </div>
        </div>
      ) : mine ? (
        mine.done_at ? (
          <button onClick={() => act("undo", () => setReminderDone(r.id, false))} disabled={pending} className="btn-secondary mt-3 w-full">
            <RotateCcw size={17} /> Geri al
          </button>
        ) : (
          <button onClick={() => act("done", () => setReminderDone(r.id, true))} disabled={pending} className="btn-primary mt-3 w-full">
            <CircleCheck size={18} /> Tamamlandı
          </button>
        )
      ) : null}
      {editing && <ReminderSheet reminder={r} me={me} people={people} onClose={() => setEditing(false)} />}
    </div>
  );
}

/** Başlıktaki "Ekle" düğmesi. */
export function ReminderEditor({ me, people }: { me: string; people: Person[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-primary h-10 gap-1.5 px-3 py-0 text-[14px]">
        <Plus size={18} /> Ekle
      </button>
      {open && <ReminderSheet me={me} people={people} onClose={() => setOpen(false)} />}
    </>
  );
}

function ReminderSheet({ reminder, me, people, onClose }: { reminder?: Reminder; me: string; people: Person[]; onClose: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [bad, setBad] = useState<string>();
  const initialStart = reminder ? istanbulParts(reminder.starts_at) : defaultStart();
  const [form, setForm] = useState({
    title: reminder?.title ?? "",
    detail: reminder?.detail ?? "",
    start_date: initialStart.date,
    start_time: initialStart.time,
    interval_minutes: reminder?.interval_minutes ?? 120,
  });
  const [users, setUsers] = useState<string[]>(reminder ? (reminder.reminder_recipients ?? []).map((x) => x.user_id) : [me]);
  const ordered = [...people].sort((a, b) => Number(b.id === me) - Number(a.id === me) || personName(a).localeCompare(personName(b), "tr"));
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setBad(undefined);
    setForm((f) => ({ ...f, [k]: k === "interval_minutes" ? Number(e.target.value) : e.target.value }));
  };
  const toggle = (id: string) => setUsers((u) => (u.includes(id) ? u.filter((x) => x !== id) : [...u, id]));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const invalid = (field: string, msg: string) => {
      setBad(field);
      setError(msg);
      document.getElementById(field)?.focus();
    };
    if (!form.title.trim()) return invalid("rm_title", "Başlık girin.");
    if (!users.length) return invalid("rm_people", "Bildirim gidecek en az bir kişi seçin.");
    if (!form.start_date) return invalid("rm_date", "Başlangıç tarihini seçin.");
    if (!form.start_time) return invalid("rm_time", "Başlangıç saatini seçin.");
    start(async () => {
      const r = await saveReminder({ ...form, users, id: reminder?.id });
      if (!r.ok) return setError(r.error);
      onClose();
    });
  }

  return (
    <Sheet open onClose={onClose} title={reminder ? "Anımsatıcıyı düzenle" : "Yeni anımsatıcı"}>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="field-label" htmlFor="rm_title">
            Başlık
          </label>
          <input
            id="rm_title"
            value={form.title}
            onChange={set("title")}
            className="input"
            placeholder="ör. Ankara Şehir teminat mektubunu al"
            aria-invalid={bad === "rm_title" || undefined}
          />
        </div>
        <div>
          <label className="field-label" htmlFor="rm_detail">
            Detay <span className="font-normal text-muted">(varsa)</span>
          </label>
          <textarea id="rm_detail" value={form.detail} onChange={set("detail")} rows={3} className="input resize-none" />
        </div>
        <div>
          <p className="field-label" id="rm_people_label">
            Kimlere hatırlatılsın?
          </p>
          <div
            id="rm_people"
            tabIndex={-1}
            role="group"
            aria-labelledby="rm_people_label"
            className={`divide-y divide-line overflow-hidden rounded-xl ring-1 ${bad === "rm_people" ? "ring-accent-500" : "ring-line"}`}
          >
            {ordered.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-3 bg-white px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={users.includes(p.id)}
                  onChange={() => (setBad(undefined), toggle(p.id))}
                  className="h-5 w-5 accent-brand-600"
                />
                <span className="text-[15px]">{p.id === me ? `${personName(p)} (siz)` : personName(p)}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="rm_date">
              Başlangıç günü
            </label>
            <input
              id="rm_date"
              type="date"
              value={form.start_date}
              onChange={set("start_date")}
              className="input"
              aria-invalid={bad === "rm_date" || undefined}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="rm_time">
              Saati
            </label>
            <input
              id="rm_time"
              type="time"
              step={300}
              value={form.start_time}
              onChange={set("start_time")}
              className="input"
              aria-invalid={bad === "rm_time" || undefined}
            />
          </div>
        </div>
        <div>
          <label className="field-label" htmlFor="rm_interval">
            Ne sıklıkla?
          </label>
          <select id="rm_interval" value={form.interval_minutes} onChange={set("interval_minutes")} className="input">
            {REMINDER_INTERVALS.map((i) => (
              <option key={i.minutes} value={i.minutes}>
                {i.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[12px] text-muted">
            Bildirimler mesai saatlerinde gelir (ayarından mesai dışını açan kişiye 08:00–22:00). Her kişi “Tamamlandı” deyince onun
            bildirimleri durur.
          </p>
        </div>
        {error && <p className="rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}
        <button className="btn-primary w-full" disabled={pending}>
          {pending && <Loader2 size={18} className="animate-spin" />} Kaydet
        </button>
      </form>
    </Sheet>
  );
}

/** Ayarlar: anımsatıcıları mesai dışında da al. */
export function ExtendedHoursToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <div className="p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
          <AlarmClock size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-semibold">Anımsatıcıları mesai dışında da al</b>
          <span className="text-[13px] text-muted">
            {on ? "Açık: her gün 08:00–22:00 arasında gelir." : "Kapalı: hafta içi 09:00–18:00 arasında gelir."}
          </span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={on}
          disabled={pending}
          onChange={(e) => {
            const next = e.target.checked;
            setOn(next);
            start(async () => {
              const r = await setExtendedHours(next);
              if (!r.ok) {
                setOn(!next);
                setError(r.error);
              }
            });
          }}
          className="peer sr-only"
          aria-label="Anımsatıcıları mesai dışında da al"
        />
        <span
          aria-hidden
          className={`mt-2 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:ring-2 peer-focus-visible:ring-brand-300 ${on ? "bg-brand-600" : "bg-line"}`}
        >
          <span className={`h-5 w-5 rounded-full bg-white shadow transition ${on ? "translate-x-5" : ""}`} />
        </span>
      </label>
      {error && <p className="mt-3 rounded-xl bg-accent-50 px-3.5 py-2.5 text-sm font-medium text-accent-700">{error}</p>}
    </div>
  );
}
