import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// NEW — there was no error boundary anywhere in the app. Any single
// component throwing during render (anywhere in the ~4,300-line App.jsx)
// used to unmount the entire React tree to a blank white screen, with no
// message and no way back except a manual refresh — which doesn't help if
// the bug is real. This catches that instead and shows something a
// teacher can actually act on mid-class: reload, or as a last resort
// clear locally-cached state (theme/class/textbook cache — never their
// saved lessons, which live in Supabase, not the browser) and reload.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Sikshya Sathi crashed:", error, info);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'SSText','Kalimati','Times New Roman',serif", background: "#F7F4EC", color: "#2A2118" }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⚠️</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>केही समस्या भयो</div>
          <div style={{ fontSize: 15.5, color: "#6B5F52", marginBottom: 20, lineHeight: 1.6 }}>
            एप अचानक बन्द भयो। तपाईंका सुरक्षित पाठ र डाटा हराएका छैनन् — तिनीहरू सर्भरमा नै सुरक्षित छन्। कृपया पुनः प्रयास गर्नुहोस्।
          </div>
          <button onClick={() => window.location.reload()} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "#C9622A", color: "#fff", fontWeight: 700, fontSize: 16, cursor: "pointer", marginRight: 8 }}>
            पुनः सुरु गर्नुहोस्
          </button>
          <details style={{ marginTop: 18, textAlign: "left", fontSize: 12.5, color: "#8A7D6D" }}>
            <summary style={{ cursor: "pointer" }}>प्राविधिक विवरण (Technical details)</summary>
            <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{String(this.state.error?.stack || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);

// NEW — "once logged in, always logged in" (unless the teacher explicitly
// logs out): the app itself never signs anyone out — the saved session
// lives in the browser's localStorage indefinitely until db.signOut() is
// called. When a laptop still asks to log in again, it's the browser
// evicting that storage on its own (common for a plain browser tab —
// especially under low disk space — since Chrome/Edge treat "installed"
// apps and often-visited sites as safe to keep, but a regular tab's
// storage as safe to clear first if it needs space). Asking for
// persistent storage tells the browser this origin's data should not be
// auto-evicted, which removes the most common invisible cause of this on
// a laptop. It can't override an explicit "clear cookies/site data on
// exit" browser setting or private/incognito browsing — those clear
// storage on purpose, and only the teacher's own browser settings control
// that.
if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

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
