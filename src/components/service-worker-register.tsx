"use client";

import { useEffect } from "react";
import { APP_SCOPE, withBase } from "@/lib/config";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBase("/sw.js"), { scope: APP_SCOPE }).catch((err) => {
      console.error("Service worker kaydedilemedi", err);
    });
  }, []);
  return null;
}
