// public/sw.js
// ─────────────────────────────────────────────────────────────────────────────
// Vestream service worker — PWA basics + web push receiver.
//
// Scope: the site root. Served from /sw.js, registered by layout.tsx.
//
// Responsibilities (keep small — grow deliberately):
//   1. Receive `push` events and show native OS notifications
//   2. Handle clicks on those notifications — focus an existing tab if the
//      user already has Vestream open, otherwise open a new one
//
// Intentionally NOT doing any offline caching here. Adding caching later is
// safe and local; keeping the first version minimal avoids a class of stale-
// asset bugs on deploy.
// ─────────────────────────────────────────────────────────────────────────────

/* eslint-disable no-restricted-globals */

self.addEventListener("install", (event) => {
  // Activate immediately on first install so users get push without a reload
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Take control of any already-open clients
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = { title: "Vestream", body: "", url: "/", icon: "/icons/icon-192.png", data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (_) {
    // Non-JSON push — fall back to text
    try { payload.body = event.data ? event.data.text() : ""; } catch (_) { /* noop */ }
  }

  const options = {
    body:       payload.body,
    icon:       payload.icon || "/icons/icon-192.png",
    badge:      "/icons/icon-192.png",
    data:       { url: payload.url || "/", ...(payload.data || {}) },
    tag:        payload.data && payload.data.tag ? String(payload.data.tag) : undefined,
    renotify:   true,
    vibrate:    [120, 60, 120],
  };

  event.waitUntil(self.registration.showNotification(payload.title || "Vestream", options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    // If a tab is already on our origin, focus + navigate it
    for (const client of all) {
      try {
        const url = new URL(client.url);
        const here = new URL(self.registration.scope);
        if (url.origin === here.origin && "focus" in client) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target);
          return;
        }
      } catch (_) { /* ignore bad URLs */ }
    }
    // Otherwise open fresh
    if (self.clients.openWindow) await self.clients.openWindow(target);
  })());
});
