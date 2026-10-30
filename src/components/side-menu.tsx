"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  AlarmClock,
  Calculator,
  ChartColumn,
  FileCheck2,
  Gavel,
  Landmark,
  Menu,
  NotebookPen,
  PhoneCall,
  Settings,
  ShoppingCart,
  Sparkles,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { FILTERS, type FilterKey } from "@/lib/nav";
import logo from "../../public/logo.png";

const FILTER_ICON: Record<FilterKey, typeof Menu> = {
  gundem: Sparkles,
  ihale: Gavel,
  dt: FileCheck2,
  dmo: Landmark,
  gs: ShoppingCart,
  ym: Calculator,
  arama: PhoneCall,
  red: XCircle,
};

const PAGES = [
  { href: "/sevkiyat", label: "Sevkiyat", icon: Truck },
  { href: "/gorusmeler", label: "Görüşmeler", icon: NotebookPen },
  { href: "/animsaticilar", label: "Anımsatıcılar", icon: AlarmClock },
  { href: "/raporlar", label: "Raporlar", icon: ChartColumn },
  { href: "/ayarlar", label: "Ayarlar", icon: Settings },
] as const;

/** Başlığın solundaki menü düğmesi ve soldan açılan menü: satış sekmeleri ve diğer sayfalar tek yerde. */
export function SideMenu() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const pathname = usePathname();
  const params = useSearchParams();
  const f = pathname === "/" ? (params.get("f") ?? "gundem") : null;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item = (active: boolean) =>
    `flex items-center gap-3 rounded-xl px-3 py-2 text-[15px] font-medium transition ${
      active ? "bg-brand-50 text-brand-700" : "text-ink/85 active:bg-canvas"
    }`;
  const close = () => setOpen(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="-ml-2 grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-canvas"
        aria-label="Menüyü aç"
        aria-expanded={open}
      >
        <Menu size={23} />
      </button>
      {mounted &&
        createPortal(
          <div className={`fixed inset-0 z-50 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
            <button
              tabIndex={open ? 0 : -1}
              onClick={close}
              aria-label="Menüyü kapat"
              className={`absolute inset-0 bg-ink/40 backdrop-blur-[2px] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
            />
            <nav
              role="dialog"
              aria-modal="true"
              aria-label="Menü"
              className={`absolute inset-y-0 left-0 flex w-[82%] max-w-[320px] flex-col bg-white shadow-2xl transition-transform duration-200 ease-out pt-safe ${
                open ? "translate-x-0" : "-translate-x-full"
              }`}
            >
              <div className="flex items-center justify-between px-5 pb-3 pt-4">
                <Image src={logo} alt="Erenos Medikal" className="h-9 w-auto" />
                <button
                  tabIndex={open ? 0 : -1}
                  onClick={close}
                  className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-canvas"
                  aria-label="Menüyü kapat"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))]">
                <p className="px-3 pb-1 pt-2 text-[12px] font-bold uppercase tracking-wider text-muted">Satış</p>
                {FILTERS.map(({ key, label }) => {
                  const Icon = FILTER_ICON[key];
                  return (
                    <Link
                      key={key}
                      href={key === "gundem" ? "/" : `/?f=${key}`}
                      tabIndex={open ? 0 : -1}
                      onClick={close}
                      aria-current={f === key ? "page" : undefined}
                      className={item(f === key)}
                    >
                      <Icon size={19} className={f === key ? "text-brand-600" : "text-muted"} /> {label}
                    </Link>
                  );
                })}
                <p className="mt-3 border-t border-line/70 px-3 pb-1 pt-4 text-[12px] font-bold uppercase tracking-wider text-muted">
                  Diğer
                </p>
                {PAGES.map(({ href, label, icon: Icon }) => {
                  const active = pathname.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      tabIndex={open ? 0 : -1}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={item(active)}
                    >
                      <Icon size={19} className={active ? "text-brand-600" : "text-muted"} /> {label}
                    </Link>
                  );
                })}
              </div>
            </nav>
          </div>,
          document.body,
        )}
    </>
  );
}
