// sw.js — basic offline support for शिक्षा साथी.
//
// There was no service worker at all before this, which is why the app
// couldn't be opened offline despite being set up as an installable PWA —
// nothing was ever cached, so a request with no network just failed outright.
//
// Strategy: stale-while-revalidate for same-origin GET requests only.
//   - First time you open a page/asset online, it gets cached.
//   - Every time after that, the cached copy shows instantly while a fresh
//     copy is fetched in the background to update the cache for next time.
//   - If there's no network at all, the cached copy is served instead of
//     failing.
// Supabase/Gemini API calls (a different origin) are deliberately left
// alone — those need to be live or fail with a clear error, never served
// from a stale cache pretending to be current data.

const CACHE_NAME = "ss-shell-v2";

self.addEventListener("install", (event) => {
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
