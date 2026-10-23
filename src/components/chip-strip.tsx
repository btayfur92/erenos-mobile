"use client";

import { useLayoutEffect, useRef } from "react";

/** Yatay kaydırılan sekme şeridi. Sayfa yenilendiğinde seçili sekmeyi görünür tutar, şerit başa dönmez. */
export function ChipStrip({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const strip = ref.current;
    const active = strip?.querySelector<HTMLElement>("[aria-current=page]");
    if (!strip || !active) return;
    const pad = 16;
    const left = active.offsetLeft - strip.offsetLeft;
    if (left - pad < strip.scrollLeft) strip.scrollLeft = left - pad;
    else if (left + active.offsetWidth + pad > strip.scrollLeft + strip.clientWidth)
      strip.scrollLeft = left + active.offsetWidth + pad - strip.clientWidth;
  });

  return (
    <div ref={ref} className="-mx-4 mt-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
      {children}
    </div>
  );
}
