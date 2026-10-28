import type { MetadataRoute } from "next";
import { APP_SCOPE, BASE_PATH } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: APP_SCOPE,
    name: "Erenos Medikal",
    short_name: "Erenos",
    description: "Erenos Medikal satış ve sevkiyat takibi",
    start_url: APP_SCOPE,
    scope: APP_SCOPE,
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
