import type { Metadata } from "next";
import { NotebookPen, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MeetingCard, MeetingEditor } from "@/components/meetings";
import type { Meeting, Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Görüşmeler" };

/** Hastane ziyaret notları. Herkes görür; en yeni tarih en üstte. */
export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { supabase } = await requireUser();
  const term = q.trim().replace(/[%,()]/g, " ");

  let query = supabase
    .from("meetings")
    .select("*")
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (term) query = query.or(`hospital.ilike.%${term}%,department.ilike.%${term}%,note.ilike.%${term}%`);

  const [{ data: meetings }, { data: profiles }] = await Promise.all([
    query.returns<Meeting[]>(),
    supabase.from("profiles").select("id, full_name, username").returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));

  return (
    <>
      <PageHeader title="Görüşmeler" subtitle="Hastane ziyaret notları" action={<MeetingEditor />} />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <form className="relative" action="">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Hastane, servis veya not ara"
            className="input pl-10"
            type="search"
            enterKeyHint="search"
          />
        </form>
        <div className="mt-4 space-y-3">
          {meetings?.length ? (
            meetings.map((m) => <MeetingCard key={m.id} meeting={m} names={names} />)
          ) : (
            <EmptyState
              icon={<NotebookPen size={26} />}
              title={term ? "Sonuç bulunamadı" : "Henüz görüşme notu yok"}
              text={term ? "Farklı bir arama deneyin." : "Hastane ziyaretlerinden sonra notunuzu sağ üstteki “Not ekle” ile girin."}
            />
          )}
        </div>
      </main>
    </>
  );
}
