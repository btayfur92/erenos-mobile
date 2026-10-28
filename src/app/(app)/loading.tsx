import Image from "next/image";
import mark from "../../../public/mark.png";

/** Sayfa geçişlerinde dokunur dokunmaz görünen iskelet; sunucudan veri gelince yerini sayfaya bırakır. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-white/85 backdrop-blur-xl pt-safe">
        <div className="mx-auto flex h-14 max-w-xl items-center gap-3 px-4">
          <Image src={mark} alt="" className="h-7 w-auto" priority />
          <div className="h-4 w-32 animate-pulse rounded-md bg-line" />
        </div>
      </header>
      <main className="mx-auto max-w-xl space-y-3 px-4 pt-4">
        <span className="sr-only">Yükleniyor…</span>
        <div className="h-12 animate-pulse rounded-2xl bg-white ring-1 ring-line" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card space-y-3 p-4">
            <div className="h-3.5 w-24 animate-pulse rounded bg-line" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-line" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-line/70" />
          </div>
        ))}
      </main>
    </div>
  );
}
