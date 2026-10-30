"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft } from "lucide-react";

// Uygulama içinde kaç sayfa gezildi (tam yeniden yüklemede sıfırlanır). 1'den fazlaysa tarayıcı geçmişindeki
// önceki sayfa bu uygulamanın sayfasıdır ve geri dönülebilir.
let visits = 0;

/** Sayfa değişimlerini sayar (layout'ta bir kez). */
export function NavTracker() {
  const pathname = usePathname();
  const params = useSearchParams();
  useEffect(() => {
    visits++;
  }, [pathname, params]);
  return null;
}

export const canGoBack = () => visits > 1;

/**
 * Geri: gelinen sayfaya tarayıcı geçmişiyle dönülür (sayfa telefondaki önbellekten, kaldığı sekme ve kaydırma
 * konumuyla anında gelir). Uygulama doğrudan bu sayfada açıldıysa varsayılan üst sayfaya gidilir.
 */
export function BackButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (canGoBack()) router.back();
        else router.push(href);
      }}
      className="-ml-2 grid h-10 w-10 place-items-center rounded-xl text-ink hover:bg-canvas"
      aria-label="Geri"
    >
      <ChevronLeft size={24} />
    </a>
  );
}
