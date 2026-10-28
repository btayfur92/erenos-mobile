import type { NextConfig } from "next";

// Alt yol (varsayılan kök: erenosmobile.bulenttayfur.com); "/" ya da boş değer kök demektir (Vercel boş değişken kabul etmeyebilir). Sondaki "/" silinir.
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  basePath,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
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
