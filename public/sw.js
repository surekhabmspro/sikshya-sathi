// sw.js — offline support for शिक्षा साथी.
//
// FIX — the previous version only cached things opportunistically, as they
// happened to be requested while browsing online (stale-while-revalidate on
// every fetch). It never explicitly saved the app shell (index.html, the JS/
// CSS bundle, manifest, icons) the moment the service worker was installed.
// That meant a teacher had to open the app online TWICE before offline
// access actually worked: once for the service worker itself to install,
// and a second time for its fetch handler to happen to see (and cache) the
// shell's own files. One visit — which is the realistic case — left the
// cache empty and the app unable to open at all with no connection.
//
// Fix: explicitly fetch and cache the whole app shell during "install", so
// it's ready offline after a single online visit. PRECACHE_URLS is filled
// in at build time (see vite.config.js) with the exact hashed JS/CSS files
// this deploy produced, plus the shell's static files.
//
// Supabase/Gemini API calls (a different origin) are still deliberately
// left alone — those need to be live or fail with a clear error, never
// served from a stale cache pretending to be current data.

const CACHE_NAME = "ss-shell-__BUILD_ID__";
const PRECACHE_URLS = __PRECACHE_URLS__;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch((err) => console.warn("शिक्षा साथी: अफलाइनका लागि सामग्री सेभ गर्न सकिएन:", err))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // don't touch Supabase/Gemini calls

  // FIX — app opens/refreshes/deep-links (navigation requests) used to be
  // handled by the same match-else-network logic as every other asset,
  // which only serves a cached copy for the EXACT URL requested. Offline,
  // that meant opening the app fell straight through to the network (which
  // fails) instead of falling back to the cached shell. Navigations now
  // always try the network first (so you get the latest version online),
  // and fall back to the precached shell the moment that fails.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => caches.open(CACHE_NAME).then((cache) => cache.match("/")))
    );
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => null);

      // Offline (or slow): serve the cached copy immediately if we have one.
      // Online with nothing cached yet: wait for the network.
      if (cached) {
        network; // still refreshes the cache in the background
        return cached;
      }
      const fresh = await network;
      return fresh || new Response("तपाईं अफलाइन हुनुहुन्छ र यो पहिलो पटक लोड भइरहेको छ।", { status: 503 });
    })
  );
});
