/* Erenos Medikal service worker: push bildirimleri ve çevrimdışı sayfa */
const SCOPE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const CACHE = "erenos-v1";
const OFFLINE_URL = SCOPE + "/offline.html";
const PRECACHE = [OFFLINE_URL, SCOPE + "/logo.png", SCOPE + "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Sayfalar her zaman ağdan gelir (veriler güncel kalsın); ağ yoksa çevrimdışı sayfası.
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return;
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_URL)));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Erenos Medikal", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "Erenos Medikal";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "",
      icon: SCOPE + "/icons/icon-192.png",
      badge: SCOPE + "/icons/badge-96.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || SCOPE + "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || SCOPE + "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes(SCOPE) && "focus" in w) {
          w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
