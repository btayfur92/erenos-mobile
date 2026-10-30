/** Ana sayfadaki satış sekmeleri (üstteki kaydırmalı düğmeler ve soldan açılan menü aynı listeyi kullanır). */
export const FILTERS = [
  { key: "gundem", label: "Gündemdekiler" },
  { key: "ihale", label: "Hastane İhalesi" },
  { key: "dt", label: "Doğrudan Temin" },
  { key: "dmo", label: "DMO İhalesi" },
  { key: "gs", label: "Genel Satış" },
  { key: "ym", label: "Yaklaşık Maliyet" },
  { key: "arama", label: "Arama bekleyen" },
  { key: "red", label: "Reddedilen" },
] as const;

export type FilterKey = (typeof FILTERS)[number]["key"];
