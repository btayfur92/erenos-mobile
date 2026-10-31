import type { Metadata } from "next";
import Link from "next/link";
import { Lock, NotebookPen, Search } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { MeetingCard, MeetingEditor } from "@/components/meetings";
import type { Meeting, Profile } from "@/lib/types";
import { fetchCards } from "@/lib/queries";

export const metadata: Metadata = { title: "Görüşmeler" };

/**
 * Hastane ziyaret notları; en yeni tarih en üstte. Normal görüşmeleri herkes görür.
 * Özel görüşmeler (?v=ozel) yalnızca adminlere açık; veritabanı izinleri de (RLS) yalnızca adminlere gösterir.
 */
export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ q?: string; v?: string }> }) {
  const { q = "", v } = await searchParams;
  const { supabase, user, profile } = await requireUser();
  const isAdmin = profile.is_admin;
  const ozel = isAdmin && v === "ozel";
  const term = q.trim().replace(/[%,()]/g, " ");

  let query = supabase
    .from("meetings")
    .select("*")
    .eq("private", ozel)
    .order("meeting_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(300);
  if (term) query = query.or(`hospital.ilike.%${term}%,department.ilike.%${term}%,note.ilike.%${term}%`);

  const [{ data: meetings }, { data: profiles }, { customers }] = await Promise.all([
    query.returns<Meeting[]>(),
    supabase.from("profiles").select("id, full_name, username").returns<Pick<Profile, "id" | "full_name" | "username">[]>(),
    fetchCards(supabase),
  ]);
  const names = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name || p.username]));

  return (
    <>
      <PageHeader
        title="Görüşmeler"
        subtitle={ozel ? "Özel görüşmeler" : "Ziyaret notları"}
        action={<MeetingEditor customers={customers} canPrivate={isAdmin} defaultPrivate={ozel} />}
      />
      <main className="mx-auto max-w-xl px-4 pt-4">
        {isAdmin && (
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-2xl bg-white p-1 ring-1 ring-line">
            <Link
              href={q ? `/gorusmeler?q=${encodeURIComponent(q)}` : "/gorusmeler"}
              prefetch
              className={`rounded-xl py-2.5 text-center text-[14px] font-semibold ${!ozel ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
            >
              Görüşmeler
            </Link>
            <Link
              href={`/gorusmeler?v=ozel${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              prefetch
              className={`flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[14px] font-semibold ${ozel ? "bg-brand-600 text-white shadow-sm" : "text-muted"}`}
            >
              <Lock size={15} /> Özel görüşmeler
            </Link>
          </div>
        )}
        <form className="relative" action="">
          {ozel && <input type="hidden" name="v" value="ozel" />}
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
            meetings.map((m) => (
              <MeetingCard
                key={m.id}
                meeting={m}
                names={names}
                customers={customers}
                mine={m.created_by === user.id}
                canPrivate={isAdmin}
              />
            ))
          ) : (
            <EmptyState
              icon={<NotebookPen size={26} />}
              title={term ? "Sonuç bulunamadı" : ozel ? "Henüz özel görüşme yok" : "Henüz görüşme notu yok"}
              text={
                term
                  ? "Farklı bir arama deneyin."
                  : ozel
                    ? "Yalnızca adminlerin göreceği notları “Not ekle”de “Özel görüşme”yi seçerek girin."
                    : "Hastane ziyaretlerinden sonra notunuzu sağ üstteki “Not ekle” ile girin."
              }
            />
          )}
        </div>
      </main>
    </>
  );
}
