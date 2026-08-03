import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NEW — auto-versions the service worker's cache name on every build, so
// CACHE_NAME in sw.js never has to be bumped by hand again. Without this,
// any deploy that forgets to touch sw.js keeps serving whatever got cached
// last time, because the stale-while-revalidate strategy always serves the
// existing cache first and only refreshes it in the background for next
// time (this is what caused the "deployed but don't see changes" issue).
//
// FIX — this plugin now also fills in a second placeholder,
// "__PRECACHE_URLS__", with the real list of files this build produced
// (the shell's static files, plus every hashed JS/CSS bundle Vite just
// built). sw.js uses that list to explicitly cache the whole app shell the
// moment it's installed, instead of only picking things up opportunistically
// as they happen to be requested — which used to mean the app needed to be
// opened online TWICE before it could open offline at all.
function swCacheVersionPlugin() {
  const buildIdToken = "__BUILD_ID__";
  const precacheToken = "__PRECACHE_URLS__";
  const stamp = () => `build-${Date.now()}`;

  // Files that exist regardless of build output — always safe to precache.
  const shellUrls = [
    "/",
    "/manifest.json",
    "/icons/icon-192.png",
    "/icons/icon-512.png",
    "/icons/icon-maskable-192.png",
    "/icons/icon-maskable-512.png",
  ];

  const applyStamp = (contents, precacheUrls) =>
    contents
      .replace(buildIdToken, stamp())
      .replace(precacheToken, JSON.stringify(precacheUrls));

  let outDir = "dist";

  return {
    name: "sw-cache-version",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    // Dev server (`npm run dev`) — rewrite /sw.js on the fly so dev behaves
    // the same way prod does, even though nothing is written to disk here.
    // There's no stable hashed bundle in dev mode (Vite serves modules
    // individually), so just precache the static shell entries.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/sw.js") {
          const swPath = path.resolve(__dirname, "public/sw.js");
          res.setHeader("Content-Type", "application/javascript");
          res.end(applyStamp(fs.readFileSync(swPath, "utf-8"), shellUrls));
          return;
        }
        next();
      });
    },
    // Production build (`npm run build`) — Vite has already copied
    // public/sw.js into the output directory verbatim by the time
    // closeBundle runs, so patch that copy in place before it gets
    // deployed.
    closeBundle() {
      const swPath = path.resolve(__dirname, outDir, "sw.js");
      if (!fs.existsSync(swPath)) return;
      const assetsDir = path.resolve(__dirname, outDir, "assets");
      let assetUrls = [];
      if (fs.existsSync(assetsDir)) {
        assetUrls = fs.readdirSync(assetsDir)
          .filter((f) => /\.(js|css)$/.test(f))
          .map((f) => `/assets/${f}`);
      }
      fs.writeFileSync(swPath, applyStamp(fs.readFileSync(swPath, "utf-8"), [...shellUrls, ...assetUrls]));
    },
  };
}

export default defineConfig({
  plugins: [react(), swCacheVersionPlugin()],
});
