import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Statik dosyalar, ikonlar, manifest ve service worker hariç her şey
    "/((?!_next/static|_next/image|icons/|sw.js|manifest.webmanifest|logo.png|mark.png|icon.png|offline.html).*)",
  ],
};
