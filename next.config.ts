import type { NextConfig } from "next";

// Alt yol (varsayılan kök: erenosmobile.bulenttayfur.com); "/" ya da boş değer kök demektir (Vercel boş değişken kabul etmeyebilir). Sondaki "/" silinir.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  experimental: {
    // Açılmış ve önceden yüklenmiş sayfalar 60 sn boyunca telefondaki önbellekten anında açılır.
    // Kendi yaptığımız her işlem (revalidatePath) önbelleği temizler; başkalarının değişiklikleri en geç 60 sn'de
    // ya da uygulamaya geri dönülünce (AutoRefresh) görünür.
    staleTimes: { dynamic: 60, static: 60 },
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: basePath || "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
