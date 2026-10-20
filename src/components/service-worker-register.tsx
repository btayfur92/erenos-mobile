"use client";

import { useEffect } from "react";
import { BASE_PATH, withBase } from "@/lib/config";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(withBase("/sw.js"), { scope: BASE_PATH }).catch((err) => {
      console.error("Service worker kaydedilemedi", err);
    });
  }, []);
  return null;
}
