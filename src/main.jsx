import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register the service worker so the app can be installed and opens offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((reg) => {
      // Self-healing for future deploys: if a new service worker takes
      // over (i.e. a new version was just deployed), reload once so the
      // new app shell is actually shown instead of a stale cached one.
      let refreshed = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (refreshed) return;
        refreshed = true;
        window.location.reload();
      });
      // Ask the browser to check for a new sw.js right away, and again
      // periodically, instead of waiting for its own occasional checks.
      reg.update();
      setInterval(() => reg.update(), 60 * 60 * 1000);
    }).catch((err) => {
      console.warn("Service worker registration failed:", err);
    });
  });
}
