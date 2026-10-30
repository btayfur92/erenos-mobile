"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Alttan açılan panel (mobilde doğal his). */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  // body'ye taşınır: başlıktaki "Ekle" gibi düğmelerden açılınca, başlığın bulanık arka planı (backdrop-filter)
  // fixed konumu başlığa bağlayıp paneli ekranın üstüne kaydırıyordu (iPhone'da kullanılamıyordu).
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Kapat" />
      <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-canvas"
            aria-label="Kapat"
          >
            <X size={20} />
          </button>
        </div>
        {/* Alt boşluk: ekranın altına (ve iPhone'un alt çizgisine) yapışmasın. */}
        <div className="overflow-y-auto px-5 pb-[max(1.75rem,calc(env(safe-area-inset-bottom)+1rem))]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
