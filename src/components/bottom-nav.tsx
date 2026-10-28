"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, NotebookPen, Plus, Settings, Truck } from "lucide-react";

const tabs = [
  { href: "/", label: "Ana Sayfa", icon: Home },
  { href: "/sevkiyat", label: "Sevkiyat", icon: Truck },
  null,
  { href: "/gorusmeler", label: "Görüşmeler", icon: NotebookPen },
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
] as const;

/** canAdd: yeni satış kaydı açabilir (sevkiyat kullanıcısında + yok). */
export function BottomNav({ pendingShipments, canAdd }: { pendingShipments: number; canAdd: boolean }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" || pathname.startsWith("/kayit") : pathname.startsWith(href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/80 bg-white/90 backdrop-blur-xl pb-safe">
      <div className="mx-auto grid max-w-xl grid-cols-5 items-end px-2">
        {tabs.map((tab, i) =>
          tab === null ? (
            <div key={i} className="flex justify-center">
              {canAdd && (
                <Link
                  href="/yeni"
                  aria-label="Yeni kayıt"
                  className="-mt-6 grid h-14 w-14 place-items-center rounded-2xl bg-brand-600 text-white shadow-float transition active:scale-95"
                >
                  <Plus size={26} strokeWidth={2.4} />
                </Link>
              )}
            </div>
          ) : (
            <Link
              key={tab.href}
              href={tab.href}
              className={`relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition ${
                isActive(tab.href) ? "text-brand-600" : "text-muted"
              }`}
            >
              <span className="relative">
                <tab.icon size={22} strokeWidth={isActive(tab.href) ? 2.3 : 1.8} />
                {tab.href === "/sevkiyat" && pendingShipments > 0 && (
                  <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-accent-600 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                    {pendingShipments > 99 ? "99+" : pendingShipments}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
