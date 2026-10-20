import type { MetadataRoute } from "next";
import { BASE_PATH } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: BASE_PATH,
    name: "Erenos Medikal",
    short_name: "Erenos",
    description: "Erenos Medikal satış ve sevkiyat takibi",
    start_url: BASE_PATH,
    scope: BASE_PATH,
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    lang: "tr",
    icons: [
      { src: `${BASE_PATH}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `${BASE_PATH}/icons/maskable-192.png`, sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: `${BASE_PATH}/icons/maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
