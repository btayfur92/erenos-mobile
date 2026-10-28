"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Package, Search } from "lucide-react";
import { cardKey } from "@/lib/types";

/** Rapor için hastane/müşteri ya da ürün seçimi: yazdıkça süzülür, dokununca raporu açar. */
export function ReportPicker({ kind, cards }: { kind: "musteri" | "urun"; cards: { id: string; name: string; sub?: string }[] }) {
  const [q, setQ] = useState("");
  const term = cardKey(q);
  const list = term ? cards.filter((c) => cardKey(`${c.name} ${c.sub ?? ""}`).includes(term)) : cards;
  const Icon = kind === "musteri" ? Building2 : Package;
  return (
    <>
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={kind === "musteri" ? "Hastane / müşteri ara" : "Ürün ara"}
          className="input pl-10"
          type="search"
          autoFocus
        />
      </div>
      <div className="card mt-3 divide-y divide-line/70">
        {list.slice(0, 100).map((c) => (
          <Link key={c.id} href={`/raporlar?t=${kind}&id=${c.id}`} className="flex items-center gap-3 px-4 py-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <b className="block truncate text-[15px] font-semibold">{c.name}</b>
              {c.sub && <span className="block truncate text-[12px] text-muted">{c.sub}</span>}
            </span>
            <ChevronRight size={18} className="text-muted/60" />
          </Link>
        ))}
        {!list.length && (
          <p className="px-4 py-8 text-center text-[14px] text-muted">
            {term ? "Sonuç bulunamadı." : "Henüz kart yok. Kartlar Ayarlar'dan ya da kayıt girerken eklenir."}
          </p>
        )}
      </div>
    </>
  );
}
