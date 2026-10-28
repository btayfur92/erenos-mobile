import Link from "next/link";
import type { Metadata } from "next";
import { AlarmClock, CalendarClock, CalendarDays, TriangleAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ReminderCard, ReminderEditor } from "@/components/reminders";
import { todayIstanbul } from "@/lib/format";
import { TIME_ZONE } from "@/lib/config";
import type { Profile, Reminder } from "@/lib/types";

export const metadata: Metadata = { title: "Anımsatıcılar" };

/**
 * Kişiye özel anımsatıcılar. Herkes yalnızca oluşturduğu ve kendisine eklenenleri görür.
 * Aktif: kişinin tamamlamadığı ya da oluşturduğu ve henüz herkesin tamamlamadığı anımsatıcılar. Başlangıç gününe göre
 * Geciken (önceki günlerde başlamış), Bugün ve Yaklaşan (sonraki günler) olarak ayrılır.
 */
const SUBS = [
  { key: "geciken", label: "Geciken", icon: TriangleAlert, active: "bg-accent-50 text-accent-700", badge: "bg-accent-600 text-white" },
  { key: "bugun", label: "Bugün", icon: CalendarClock, active: "bg-brand-50 text-brand-700", badge: "bg-brand-600 text-white" },
  { key: "yaklasan", label: "Yaklaşan", icon: CalendarDays, active: "bg-emerald-50 text-emerald-700", badge: "bg-emerald-600 text-white" },
] as const;
type Sub = (typeof SUBS)[number]["key"];

const istanbulDate = (ts: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ts));

export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ t?: string; g?: string }> }) {
  const { t, g } = await searchParams;
  const done = t === "tamam";
  const { supabase, user } = await requireUser();
  const [{ data: reminders }, { data: people }] = await Promise.all([
    supabase.from("reminders").select("*, reminder_recipients(*)").order("starts_at", { ascending: true }).limit(300).returns<Reminder[]>(),
    supabase
      .from("profiles")
      .select("id, full_name, username")
      .eq("active", true)
      .returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
  ]);

  const isActive = (r: Reminder) => {
    const rs = r.reminder_recipients ?? [];
    const mine = rs.find((x) => x.user_id === user.id);
    if (mine) return !mine.done_at;
    return rs.some((x) => !x.done_at);
  };
  const today = todayIstanbul();
  const subOf = (r: Reminder): Sub => {
    const d = istanbulDate(r.starts_at);
    return d < today ? "geciken" : d === today ? "bugun" : "yaklasan";
  };
  const sub: Sub = SUBS.some((x) => x.key === g) ? (g as Sub) : "bugun";
  const active = (reminders ?? []).filter(isActive);
  const counts = Object.fromEntries(SUBS.map((x) => [x.key, active.filter((r) => subOf(r) === x.key).length])) as Record<Sub, number>;
  // Aktifte en eski başlangıç üstte; tamamlananlarda en son oluşturulan üstte.
  const list = done
    ? (reminders ?? []).filter((r) => !isActive(r)).sort((a, b) => b.created_at.localeCompare(a.created_at))
    : active.filter((r) => subOf(r) === sub);
  const emptyText: Record<Sub, string> = {
    geciken: "Önceki günlerden kalan anımsatıcı yok.",
    bugun: "Bugün başlayan anımsatıcı yok. Kendinize veya ekip arkadaşlarınıza hatırlatma kurmak için sağ üstteki “Ekle”ye dokunun.",
    yaklasan: "İleri tarihli anımsatıcı yok.",
  };

  return (
    <>
      <PageHeader
        title="Anımsatıcılar"
        subtitle="Size ve ekiplerinize hatırlatmalar"
        back="/"
        action={<ReminderEditor me={user.id} people={people ?? []} />}
      />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
          <Link
            href="/animsaticilar"
            className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${!done ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
          >
            Aktif
          </Link>
          <Link
            href="/animsaticilar?t=tamam"
            className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${done ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
          >
            Tamamlanan
          </Link>
        </div>
        {!done && (
          <div className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
            {SUBS.map((x) => (
              <Link
                key={x.key}
                href={`/animsaticilar?g=${x.key}`}
                aria-current={sub === x.key ? "page" : undefined}
                className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[14px] font-semibold ${sub === x.key ? x.active : "text-muted"}`}
              >
                <x.icon size={16} /> {x.label}
                {!!counts[x.key] && (
                  <span className={`grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] font-bold ${x.badge}`}>
                    {counts[x.key]}
                  </span>
                )}
              </Link>
            ))}
          </div>
        )}
        <div className="mt-5 space-y-3">
          {list.length ? (
            list.map((r) => <ReminderCard key={r.id} reminder={r} me={user.id} people={people ?? []} />)
          ) : (
            <EmptyState
              icon={<AlarmClock size={26} />}
              title={done ? "Tamamlanan anımsatıcı yok" : `${SUBS.find((x) => x.key === sub)!.label} anımsatıcı yok`}
              text={done ? "Tamamladığınız anımsatıcılar burada görünür." : emptyText[sub]}
            />
          )}
        </div>
      </main>
    </>
  );
}
