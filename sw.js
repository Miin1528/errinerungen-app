"use strict";
/* Service Worker: Offline-Cache, System-Benachrichtigungen (Android),
   Aktions-Buttons in Benachrichtigungen, Web-Push vom optionalen Server */

const CACHE = "erinnerungen-v6";
const ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/storage.js",
  "./js/learning.js",
  "./js/notify.js",
  "./js/ui.js",
  "./js/kalender.js",
  "./js/app.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

/* Offline-first mit Aktualisierung im Hintergrund */
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;
  e.respondWith((async () => {
    const cached = await caches.match(e.request, { ignoreSearch: true });
    const netz = fetch(e.request).then(res => {
      if (res && res.ok) {
        const kopie = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, kopie));
      }
      return res;
    }).catch(() => cached);
    return cached || netz;
  })());
});

/* Web-Push vom optionalen Push-Server (App darf geschlossen sein) */
self.addEventListener("push", e => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  e.waitUntil(self.registration.showNotification(data.title || "⏰ Erinnerung", {
    body: data.body || "",
    tag: data.id || "push",
    renotify: true,
    icon: "icons/icon-192.png",
    badge: "icons/icon-192.png",
    vibrate: [200, 100, 200],
    data: { id: data.id },
    actions: [
      { action: "done", title: "✓ Erledigt" },
      { action: "snooze", title: "⏳ +2 Std." }
    ]
  }));
});

/* Tippen auf die Benachrichtigung bzw. ihre Buttons */
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const id = e.notification.data && e.notification.data.id;
  const action = e.action || "open";
  e.waitUntil((async () => {
    const fenster = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (fenster.length) {
      const client = fenster[0];
      await client.focus();
      client.postMessage({ typ: "benachrichtigung", action: action, id: id });
    } else {
      const ziel = action === "open"
        ? "./index.html"
        : "./index.html?na=" + action + "&id=" + encodeURIComponent(id || "");
      await self.clients.openWindow(ziel);
    }
  })());
});
