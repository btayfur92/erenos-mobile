import Link from "next/link";
import type { Metadata } from "next";
import { Building2, ChevronRight, LogOut, Package, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { logout } from "@/app/login/actions";
import { PageHeader } from "@/components/page-header";
import { PushToggle } from "@/components/push-toggle";
import { ExtendedHoursToggle } from "@/components/reminders";

export const metadata: Metadata = { title: "Ayarlar" };

export default async function SettingsPage() {
  const { profile } = await requireUser();
  const initials = (profile.full_name || profile.username)
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase("tr-TR");

  return (
    <>
      <PageHeader title="Ayarlar" subtitle={profile.full_name || profile.username} />
      <main className="mx-auto max-w-xl space-y-4 px-4 pt-4">
        <div className="card flex items-center gap-4 p-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-lg font-semibold text-white">
            {initials}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold">{profile.full_name || profile.username}</p>
            <p className="text-[13px] text-muted">
              @{profile.username}
              {profile.is_admin ? " · Yönetici" : ""}
            </p>
          </div>
        </div>

        <div className="card divide-y divide-line/70">
          {(
            [
              ["/ayarlar/hastaneler", Building2, "Hastaneler / Müşteriler", "Hastane ve müşteri kartları"],
              ["/ayarlar/urunler", Package, "Ürünler", "Ürün kartları"],
              ...(profile.is_admin
                ? ([["/ayarlar/kullanicilar", Users, "Kullanıcılar", "Kullanıcı ekle, şifre belirle, pasife al"]] as const)
                : []),
            ] as const
          ).map(([href, Icon, title, text]) => (
            <Link key={href} href={href} className="flex items-center gap-3 p-4">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-600">
                <Icon size={20} />
              </span>
              <span className="flex-1">
                <b className="block text-[15px] font-semibold">{title}</b>
                <span className="text-[13px] text-muted">{text}</span>
              </span>
              <ChevronRight size={18} className="text-muted/60" />
            </Link>
          ))}
        </div>

        <div className="card">
          <PushToggle />
        </div>

        <div className="card">
          <ExtendedHoursToggle initial={profile.extended_hours} />
        </div>

        <form action={logout}>
          <button className="btn w-full bg-white text-accent-600 ring-1 ring-line">
            <LogOut size={18} /> Çıkış yap
          </button>
        </form>
        <p className="pt-2 text-center text-[12px] text-muted">Erenos Medikal · v1.0</p>
      </main>
    </>
  );
}
