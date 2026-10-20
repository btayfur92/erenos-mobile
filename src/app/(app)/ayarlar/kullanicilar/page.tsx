import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import type { Profile } from "@/lib/types";
import { UserManager } from "./user-manager";

export const metadata: Metadata = { title: "Kullanıcılar" };

export default async function UsersPage() {
  const { supabase, user } = await requireAdmin();
  const { data: users } = await supabase
    .from("profiles")
    .select("*")
    .order("active", { ascending: false })
    .order("full_name")
    .returns<Profile[]>();

  return (
    <>
      <PageHeader title="Kullanıcılar" subtitle={`${users?.length ?? 0} kullanıcı`} back="/ayarlar" />
      <main className="mx-auto max-w-xl px-4 pt-4">
        <UserManager users={users ?? []} currentUserId={user.id} />
      </main>
    </>
  );
}
