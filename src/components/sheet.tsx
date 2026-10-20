"use client";

import { useEffect } from "react";
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

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
      <button className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} aria-label="Kapat" />
      <div className="relative flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button onClick={onClose} className="-mr-2 grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-canvas" aria-label="Kapat">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-6 pb-safe">{children}</div>
      </div>
    </div>
  );
}
