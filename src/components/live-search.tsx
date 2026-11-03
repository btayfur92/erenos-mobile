"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

/** Arama kutusu: yazdıkça (kısa bir beklemeyle) sonuçları günceller; Enter da çalışır. */
export function LiveSearch({ defaultValue, placeholder }: { defaultValue?: string; placeholder: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function go(input: HTMLInputElement) {
    const form = input.form;
    const params = new URLSearchParams();
    if (form) {
      new FormData(form).forEach((v, k) => {
        const s = String(v).trim();
        if (s) params.set(k, s);
      });
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <input
      name="q"
      defaultValue={defaultValue}
      placeholder={placeholder}
      className="input pl-10"
      type="search"
      enterKeyHint="search"
      autoComplete="off"
      onChange={(e) => {
        const el = e.currentTarget;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => go(el), 300);
      }}
    />
  );
}
