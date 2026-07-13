// sw.js — minimal offline cache so the app opens even with a weak/no connection.
// It does NOT cache AI responses or your Supabase data (those need network) —
// only the app shell (HTML/JS/CSS/icons) so the app itself always loads.

const CACHE_NAME = "shiksha-sathi-v1";
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Never cache API calls (Supabase, Gemini) — those must always be live.
  if (request.url.includes("supabase.co") || request.url.includes("generativelanguage.googleapis.com")) {
    return;
  }
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((res) => {
          if (res.ok && request.method === "GET") {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
          }
          return res;
        })
        .catch(() => cached);
    })
  );
});
