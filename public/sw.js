// sw.js — offline app-shell cache, network-first.
//
// IMPORTANT: earlier versions of this file were cache-first, meaning once a
// phone had the app cached, it kept showing that exact snapshot forever —
// new deploys never appeared, no matter how many times the site was
// redeployed, until someone manually cleared site data. That was the cause
// of a real deployed-but-still-looks-old bug. This version always tries the
// network first (so a new deploy shows up on the very next load while
// online) and only falls back to the cache when there's no connection.
const CACHE_NAME = "shiksha-sathi-v2";
const APP_SHELL = ["/", "/index.html", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  // Never cache API calls (Supabase, Gemini) — those must always be live.
  if (request.url.includes("supabase.co") || request.url.includes("generativelanguage.googleapis.com")) {
    return;
  }
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, resClone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
