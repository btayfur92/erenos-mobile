import type { Metadata, Viewport } from "next";
import { withBase } from "@/lib/config";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Erenos Medikal", template: "%s · Erenos Medikal" },
  description: "Erenos Medikal satış ve sevkiyat takibi",
  applicationName: "Erenos Medikal",
  appleWebApp: { capable: true, title: "Erenos", statusBarStyle: "default" },
  icons: {
    apple: withBase("/icons/apple-touch-icon.png"),
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body className="min-h-dvh font-sans antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
