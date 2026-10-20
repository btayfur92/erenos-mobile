"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2, Share } from "lucide-react";
import { withBase } from "@/lib/config";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function PushToggle() {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string>();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(undefined);
    try {
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Bildirim anahtarı (VAPID) tanımlı değil.");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
      const res = await fetch(withBase("/api/push/subscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Abonelik kaydedilemedi.");
      setState("on");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(withBase("/api/push/subscribe"), {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(undefined);
    const res = await fetch(withBase("/api/push/test"), { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok && data.sent ? "Deneme bildirimi gönderildi." : "Bildirim gönderilemedi. Sunucu ayarlarını kontrol edin.");
    setBusy(false);
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-3 p-4 text-muted">
        <Loader2 size={18} className="animate-spin" /> Kontrol ediliyor…
      </div>
    );
  }

  if (state === "ios-install") {
    return (
      <div className="space-y-2 p-4 text-[14px]">
        <p className="flex items-center gap-2 font-semibold">
          <Bell size={18} className="text-brand-600" /> Önce uygulamayı ana ekrana ekleyin
        </p>
        <p className="text-muted">
          iPhone&apos;da bildirim alabilmek için Safari&apos;de alttaki <Share size={14} className="inline -mt-1" /> <b>Paylaş</b> düğmesine,
          ardından <b>Ana Ekrana Ekle</b>&apos;ye dokunun. Uygulamayı ana ekrandaki ikondan açıp bu sayfaya dönün.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-xl ${state === "on" ? "bg-emerald-50 text-emerald-600" : "bg-canvas text-muted"}`}>
          {state === "on" ? <BellRing size={20} /> : <BellOff size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">Bildirimler</p>
          <p className="text-[13px] text-muted">
            {state === "on" && "Bu cihaz bildirim alıyor."}
            {state === "off" && "Bu cihazda bildirimler kapalı."}
            {state === "denied" && "Bildirim izni reddedilmiş. Cihaz ayarlarından izin verin."}
            {state === "unsupported" && "Bu tarayıcı bildirimleri desteklemiyor."}
          </p>
        </div>
      </div>
      {state === "off" && (
        <button onClick={enable} disabled={busy} className="btn-primary w-full">
          {busy && <Loader2 size={18} className="animate-spin" />} Bildirimleri aç
        </button>
      )}
      {state === "on" && (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={test} disabled={busy} className="btn-secondary">
            Deneme gönder
          </button>
          <button onClick={disable} disabled={busy} className="btn-ghost">
            Kapat
          </button>
        </div>
      )}
      {msg && <p className="text-[13px] text-muted">{msg}</p>}
    </div>
  );
}
