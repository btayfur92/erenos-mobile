import Link from "next/link";
import type { Metadata } from "next";
import { AlarmClock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ReminderCard, ReminderEditor } from "@/components/reminders";
import type { Profile, Reminder } from "@/lib/types";

export const metadata: Metadata = { title: "Anımsatıcılar" };

/**
 * Kişiye özel anımsatıcılar. Herkes yalnızca oluşturduğu ve kendisine eklenenleri görür.
 * Aktif: kişinin tamamlamadığı ya da oluşturduğu ve henüz herkesin tamamlamadığı anımsatıcılar.
 */
export default async function RemindersPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
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
  const list = (reminders ?? []).filter((r) => isActive(r) !== done);
  // Tamamlananlarda en son oluşturulan üstte.
  if (done) list.sort((a, b) => b.created_at.localeCompare(a.created_at));

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
        <div className="mt-5 space-y-3">
          {list.length ? (
            list.map((r) => <ReminderCard key={r.id} reminder={r} me={user.id} people={people ?? []} />)
          ) : (
            <EmptyState
              icon={<AlarmClock size={26} />}
              title={done ? "Tamamlanan anımsatıcı yok" : "Aktif anımsatıcı yok"}
              text={
                done
                  ? "Tamamladığınız anımsatıcılar burada görünür."
                  : "Kendinize veya ekip arkadaşlarınıza hatırlatma kurmak için sağ üstteki “Ekle”ye dokunun."
              }
            />
          )}
        </div>
      </main>
    </>
  );
}
