"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Uygulamaya (arka plandan) geri dönülünce ekrandaki veriyi arkada tazeler: eski görüntü kalır, yenisi gelince yerine geçer.
 * Kısa süreli geçişlerde (30 sn'den az) gereksiz istek atılmaz.
 */
export function AutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.visibilityState === "hidden") hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 30_000) router.refresh();
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, [router]);
  return null;
}
