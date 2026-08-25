// gemini.js — Google Gemini AI integration (free tier)
import { supabase } from "./lib/supabase";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// FIX — switched from gemini-3-flash-preview, a PREVIEW model, to
// gemini-3.6-flash, a stable (GA) release. Google's own rate-limits page
// states plainly: "Rate limits are more restricted for experimental and
// preview models" — that's why generation kept failing with a rate-limit
// error even a full day later (a daily quota, not a brief traffic spike).
// gemini-3.6-flash is free-of-charge on the Standard tier and not a
// preview/experimental model, so it gets the normal (much higher) free-tier
// limits. If this ever comes back with a "model not found" error, open
// https://ai.google.dev/gemini-api/docs/pricing and pick whichever current
// Flash-generation model shows "Free of charge" under Standard AND does
// NOT say "Preview" in its name, then swap its exact model id in here.
const PRIMARY_MODEL = "gemini-3.6-flash";
// NEW — a "Flash-Lite" model gets its own separate free-tier quota from the
// regular Flash model (Google tracks quota per model, not shared across a
// project) and Flash-Lite tiers are consistently the most generous on
// requests-per-day. If the primary model is still rate-limited after its
// own retries, one attempt goes to this instead of failing outright — a
// heavy day of testing/use on one model doesn't have to stop everything.
// FIX — this was gemini-2.5-flash-lite, which Google's API itself now
// rejects with a 404 ("no longer available to new users... use
// models/gemini-3.5-flash-lite"). That 404 was then shown to the teacher
// as the error, masking the original rate-limit message entirely. Updated
// to the model Google's own error told us to use.
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

// ─── IndexedDB storage for large PDF files (no size limit issues) ─────────────
const DB_NAME = "sikshya_sathi";
const STORE_NAME = "files";
// NEW — a second store for caching each lesson's last-known-good
// simulation locally. Bumped the DB version to 2 so onupgradeneeded fires
// and creates this store for teachers who already have the DB at
// version 1 from before this feature existed (upgradeneeded still runs
// even on an existing DB, it just skips creating STORE_NAME again since
// it already exists).
const DB_VERSION = 2;
const SIM_STORE_NAME = "sim_cache";

const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      if (!db.objectStoreNames.contains(SIM_STORE_NAME)) db.createObjectStore(SIM_STORE_NAME);
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });

// NEW — caches the last-known-good simulation HTML for a lesson locally,
// so a teacher can still reopen the simulation they already generated if
// Supabase is unreachable mid-class (a real concern at a rural school with
// unreliable connectivity). Best-effort only — a caching failure should
// never block the normal save/view flow, so callers should wrap these in
// try/catch and just skip the cache on error.
export const cacheSimulationLocally = async (lessonId, simulation) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SIM_STORE_NAME, "readwrite");
    tx.objectStore(SIM_STORE_NAME).put(simulation, `lesson::${lessonId}`);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
};

export const getCachedSimulation = async (lessonId) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SIM_STORE_NAME, "readonly");
    const req = tx.objectStore(SIM_STORE_NAME).get(`lesson::${lessonId}`);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
};

// NEW — the IndexedDB key is now per-class ("textbook_pdf::कक्षा ६" etc.)
// instead of one fixed slot, since the textbook changes when the class you
// teach changes year to year, even though the subject stays the same.
const textbookKey = (classLabel) => `textbook_pdf::${classLabel || "default"}`;

// FIX — the textbook used to live ONLY in this browser's IndexedDB, so it
// never followed a teacher who opened the app on a second phone/computer —
// they'd have to re-upload it there from scratch, with no indication why
// the AI suddenly had no textbook to work from. It now saves to Supabase
// Storage (the same "materials" bucket materials already use, under a
// reserved `<teacher>/textbook/<class>.pdf` path — no new bucket or table
// needed, and it reuses the same per-teacher storage policy that already
// protects everything else in that bucket), so it's tied to the account,
// not the device. IndexedDB is kept as a fast local cache and an offline
// fallback, but Supabase is always the source of truth when reachable.
// FIX — this used to run classLabel through encodeURIComponent (e.g.
// "कक्षा ५" → "%E0%A4%95...%A5%AB"), on the assumption that's what makes a
// path segment "URL-safe". It's exactly backwards for a Supabase Storage
// key: the object-key validator accepts ordinary UTF-8 text like "कक्षा ५"
// just fine, but rejects the "%" characters that encodeURIComponent
// introduces — which is what an "Invalid key" error on upload/download
// meant. Devanagari and other non-ASCII text is left as-is here; only
// characters that would actually break a storage path (slashes, percent
// signs, control characters) are swapped for a dash.
// FIX #2 — swapping encodeURIComponent for raw Devanagari (see the comment
// above) assumed Supabase Storage keys accept arbitrary UTF-8 text. If the
// "Invalid key" error persists even with that fix, it means the storage
// backend's key validator is stricter than that and rejects non-ASCII
// bytes outright — no amount of picking-which-characters-to-escape fixes
// that, since the Devanagari itself is what it went. Base64url-encoding
// the whole label sidesteps the question entirely: the result is always
// plain ASCII letters/digits/-/_ , which is valid everywhere, for any
// class label in any script.
const sanitizeForStorageKey = (s) => {
  const str = (s || "default").trim();
  try {
    const b64 = btoa(unescape(encodeURIComponent(str)));
    return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  } catch {
    return "default";
  }
};
const textbookStoragePath = (teacherId, classLabel) => `${teacherId}/textbook/${sanitizeForStorageKey(classLabel)}.pdf`;

const cacheTextbookLocally = async (base64, classLabel) => {
  try {
    const idb = await openDB();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(base64, textbookKey(classLabel));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* local cache is best-effort — Supabase Storage is what matters */ }
};

const loadTextbookFromCache = async (classLabel) => {
  try {
    const idb = await openDB();
    return await new Promise((resolve) => {
      const req = idb.transaction(STORE_NAME).objectStore(STORE_NAME).get(textbookKey(classLabel));
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

export const saveTextbook = async (base64, classLabel = null) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("लगइन गरिएको छैन।");
  const path = textbookStoragePath(user.id, classLabel);
  // Convert base64 -> Blob for the storage upload (base64 is what the rest
  // of the app already works with, since that's what Gemini needs inline).
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const { error } = await supabase.storage.from("materials").upload(path, blob, { contentType: "application/pdf", upsert: true });
  if (error) throw error; // don't silently fall back to device-only storage — the teacher needs to know if sync failed
  await cacheTextbookLocally(base64, classLabel); // best-effort speed/offline cache, not the source of truth
};

export const loadTextbook = async (classLabel = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const path = textbookStoragePath(user.id, classLabel);
      const { data: blob, error } = await supabase.storage.from("materials").download(path);
      if (!error && blob) {
        const base64 = await blobToBase64(blob);
        cacheTextbookLocally(base64, classLabel); // refresh the local cache in the background
        return base64;
      }
    }
  } catch { /* offline or Supabase unreachable — fall through to local cache below */ }
  // Fallback: no network, or nothing uploaded from this account yet but an
  // older device-only copy exists locally.
  return await loadTextbookFromCache(classLabel);
};

export const clearTextbook = async (classLabel = null) => {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.storage.from("materials").remove([textbookStoragePath(user.id, classLabel)]);
  } catch { /* best-effort — still clear the local cache below either way */ }
  try {
    const idb = await openDB();
    await new Promise((resolve) => {
      const tx = idb.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(textbookKey(classLabel));
      tx.oncomplete = resolve;
    });
  } catch { /* nothing to clear locally */ }
};

// ─── Textbook → Gemini "part" cache (the actual speed/quota fix) ────────────
// FIX — every AI call used to embed the ENTIRE textbook PDF as raw base64 in
// the request body (see generateWithMaterials/generateWithPDF below, old
// version). That meant a single question-bank click and a 30-chapter bulk
// lesson-plan run BOTH re-uploaded and re-processed the whole book from
// scratch, every single time — which is what made AI features feel slow and
// burned through the free-tier token quota so fast.
//
// Fix: upload the PDF to Gemini's own Files API ONCE per class, and reuse
// the small file reference (file_uri) it returns for every later call, for
// up to 48 hours (Google's retention window for uploaded files — treated as
// good for 47h here to be safe). Every AI action now sends a tiny reference
// instead of the whole book.
const textbookPartCache = new Map(); // classLabel -> Promise<part|null>, cleared on invalidateTextbookCache

const fileRefStorageKey = (classLabel) => `ss-gemini-fileref::${classLabel || "default"}`;

function readCachedFileRef(classLabel) {
  try {
    const raw = localStorage.getItem(fileRefStorageKey(classLabel));
    if (!raw) return null;
    const ref = JSON.parse(raw);
    if (!ref.uri || !ref.expiresAt || Date.now() > ref.expiresAt) return null;
    return ref.uri;
  } catch { return null; }
}
function writeCachedFileRef(classLabel, uri) {
  try {
    localStorage.setItem(fileRefStorageKey(classLabel), JSON.stringify({ uri, expiresAt: Date.now() + 47 * 60 * 60 * 1000 }));
  } catch { /* best-effort */ }
}
function clearCachedFileRef(classLabel) {
  try { localStorage.removeItem(fileRefStorageKey(classLabel)); } catch { /* nothing to clear */ }
}

async function uploadPdfToGeminiFiles(base64, displayName) {
  const byteChars = atob(base64);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  const blob = new Blob([bytes], { type: "application/pdf" });

  const startRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(blob.size),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  const uploadUrl = startRes.headers.get("X-Goog-Upload-URL");
  if (!uploadUrl) throw new Error("upload-start-failed");

  const finishRes = await fetch(uploadUrl, {
    method: "POST",
    headers: { "X-Goog-Upload-Command": "upload, finalize", "X-Goog-Upload-Offset": "0" },
    body: blob,
  });
  const data = await finishRes.json();
  if (!data.file?.uri) throw new Error("upload-finish-failed");
  return data.file.uri;
}

// Resolves to a Gemini `part` for a class's textbook (or null if none is set
// up). Cached in memory for the tab's lifetime and via localStorage + Gemini's
// own 48h file retention across reloads, so the expensive upload happens once
// per class — not once per AI button press. Safe to call from anywhere;
// concurrent callers share the same in-flight promise instead of triggering
// duplicate uploads.
export function getTextbookPart(classLabel = null) {
  const key = classLabel || "default";
  if (textbookPartCache.has(key)) return textbookPartCache.get(key);

  const promise = (async () => {
    const cachedUri = readCachedFileRef(classLabel);
    if (cachedUri) return { file_data: { mime_type: "application/pdf", file_uri: cachedUri } };

    const base64 = await loadTextbook(classLabel);
    if (!base64) return null;

    try {
      const uri = await uploadPdfToGeminiFiles(base64, `textbook-${key}`);
      writeCachedFileRef(classLabel, uri);
      return { file_data: { mime_type: "application/pdf", file_uri: uri } };
    } catch {
      // Files API upload failed (offline, quota, etc.) — fall back to the
      // old inline method so the feature still works, just slower.
      return { inline_data: { mime_type: "application/pdf", data: base64 } };
    }
  })();

  textbookPartCache.set(key, promise);
  return promise;
}

// Call after uploading a new textbook or clearing one, so the next AI call
// picks up the change instead of reusing a stale cached reference.
export function invalidateTextbookCache(classLabel = null) {
  textbookPartCache.delete(classLabel || "default");
  clearCachedFileRef(classLabel);
}

// ─── File utilities ───────────────────────────────────────────────────────────
export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

export const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// ─── Core Gemini API call (shared by every function below) ───────────────────
// jsonMode=true turns on Gemini's native "response_mime_type: application/json"
// feature — this makes Gemini itself guarantee valid, parseable JSON with no
// markdown fences, no stray sentences, and no unescaped raw newlines inside
// strings. Far more reliable than asking nicely in the prompt and hoping.
// FIX — reliability pass. Two concrete problems reported: the app going
// "slow" and AI features being "unreliable". Root causes here, both silent
// before this fix:
//  1. No timeout — a stalled connection to Gemini just hung forever, with
//     the UI stuck on its loading spinner and no way to know if it was
//     ever coming back. Every call now gives up after 25s with a clear
//     Nepali message instead of hanging indefinitely.
//  2. No retry — the comment above PRIMARY_MODEL already documents this app
//     hitting the free-tier rate limit before. A 429 (rate limited) or 503
//     (temporarily overloaded) response is often transient and succeeds a
//     few seconds later, but the old code surfaced it as a hard failure on
//     the first try every time. It now retries those two specific cases
//     (up to 2 extra attempts, with backoff) before giving up — anything
//     else (bad API key, blocked content, etc.) still fails immediately
//     since retrying wouldn't help.
// FIX — 25s was too tight once materials (uploaded docx/pptx, sent as raw
// extracted text on every call, not cached like the textbook) got added to
// the context: a longer prompt takes the model longer to start answering,
// so real, in-progress responses were being cut off as "timed out" instead
// of given a fair chance to finish. Raised to 45s. Also capped how much
// extracted text from a single material gets sent (see MAX_MATERIAL_CHARS
// below) so an unusually long PPT/DOCX doesn't blow the prompt up in the
// first place.
const RETRYABLE_STATUS = new Set([429, 503]);
const CALL_TIMEOUT_MS = 45000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGeminiOnce(body, model, timeoutMs = CALL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(geminiUrl(model), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(`Gemini ले समयमा जवाफ दिएन (${Math.round(timeoutMs / 1000)} सेकेन्डभित्र) — फेरि प्रयास गर्नुहोस्।`);
    }
    throw new Error("Gemini सर्भरसम्म पुग्न सकिएन (नेटवर्क समस्या): " + e.message);
  } finally {
    clearTimeout(timeout);
  }
}

// FIX — `retries` (number of retries AFTER the first attempt — so the
// original "attempt <= 2" loop is retries=2, its old hardcoded default)
// is now a caller-set option instead of a fixed constant. Reason: a
// stacking-timeout bug traced from teacher reports of generation
// "spinning for minutes then failing". A single simulation-generation
// call already uses a 150s per-attempt timeout (see generateSimulation)
// because that response is genuinely large/slow — but with the old fixed
// 3-attempt retry, one bad call could burn up to 3×150s = 7.5 minutes
// before even reporting an error, and that's BEFORE the outer
// truncation-retry and the self-review pass each had their own chance to
// do the same thing again. Calls that already use a long per-attempt
// timeout now pass a smaller `retries` so the retry budget scales down
// as the per-attempt cost scales up, instead of multiplying both.
async function callGemini(parts, { jsonMode = false, maxOutputTokens = 4096, timeoutMs = CALL_TIMEOUT_MS, retries = 2 } = {}) {
  const generationConfig = { temperature: 0.7, maxOutputTokens };
  if (jsonMode) generationConfig.response_mime_type = "application/json";
  const body = { contents: [{ parts }], generationConfig };

  let res;
  let lastError;
  let usedFallback = false;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      res = await fetchGeminiOnce(body, PRIMARY_MODEL, timeoutMs);
    } catch (e) {
      lastError = e;
      // Network/timeout failures: also worth a retry, same backoff as a
      // rate limit — a dropped connection is often just as transient.
      if (attempt < retries) { await sleep(1000 * (attempt + 1)); continue; }
      throw e;
    }
    if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
      // Gemini's rate-limit/overload responses are usually short-lived —
      // wait a bit longer each retry (1s, then 2s) rather than hammering
      // it again immediately.
      await sleep(1000 * (attempt + 1));
      continue;
    }
    break;
  }
  // NEW — the primary model used up its own retries and is still
  // rate-limited (429): one last attempt on the fallback model, which has
  // its own separate free-tier daily allowance, before giving up entirely.
  // FIX — only swap in the fallback's response when it actually succeeded
  // (2xx). Previously ANY non-429 fallback status (including a 404 from a
  // wrong/deprecated model id) got treated as "good enough to show the
  // user," which is exactly how a bad FALLBACK_MODEL name once masked the
  // real rate-limit error behind a confusing 404. A broken fallback should
  // never hide the original, actionable error.
  if (res && res.status === 429) {
    try {
      const fallbackRes = await fetchGeminiOnce(body, FALLBACK_MODEL, timeoutMs);
      if (fallbackRes.ok) { res = fallbackRes; usedFallback = true; }
    } catch { /* keep the original 429 response/error below */ }
  }
  if (!res) throw lastError || new Error("Gemini सर्भरसम्म पुग्न सकिएन।");

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gemini बाट अनपेक्षित जवाफ (HTTP ${res.status}). API key जाँच गर्नुहोस्।`);
  }

  if (data.error) {
    // FIX — a 429 that survives all retries (and the fallback-model
    // attempt above) used to show the same generic "Gemini API त्रुटि" as
    // every other error, giving no hint that it's a temporary capacity
    // issue rather than something broken. Now says so explicitly, since
    // that's actionable ("try again shortly") in a way a raw error code
    // isn't for a teacher mid-class.
    if (res.status === 429) throw new Error("Gemini अहिले धेरै व्यस्त छ (rate limit) — केही मिनेट पछि फेरि प्रयास गर्नुहोस्। धेरैचोटि यस्तै आउँछ भने, दिनको सीमा सकिएको हुन सक्छ — भोलि फेरि प्रयास गर्नुहोस्।");
    if (res.status === 503) throw new Error("Gemini अहिले अस्थायी रूपमा उपलब्ध छैन — केही सेकेन्ड पछि फेरि प्रयास गर्नुहोस्।");
    throw new Error(`Gemini API त्रुटि (${data.error.code || res.status}): ${data.error.message}`);
  }
  if (data.promptFeedback?.blockReason) throw new Error("Gemini ले यो अनुरोध रोक्यो: " + data.promptFeedback.blockReason);

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    // FIX — tagged `.truncated = true`: this is a content problem (hit the
    // output-token ceiling, safety cutoff mid-write, etc.), not a
    // network/rate-limit failure — a fresh attempt can plausibly produce a
    // clean document. Callers use this tag to decide whether a full retry
    // is actually worth its cost (see generateSimulation below); an
    // exhausted network/timeout error is NOT tagged, since repeating the
    // exact same failed call again rarely helps and only doubles the wait.
    const err = new Error("Gemini ले पूरा जवाफ दिएन (कारण: " + candidate.finishReason + ") — फेरि प्रयास गर्नुहोस्।");
    err.truncated = true;
    throw err;
  }

  return candidate?.content?.parts?.[0]?.text || "";
}

// ─── Plain-text generation (chat, worksheets, flashcards — human prose) ─────
export const generateText = (prompt) => callGemini([{ text: prompt }]);

// toTextbookPart accepts either a resolved part from getTextbookPart()
// (preferred — a cheap file_uri reference) or, for backward compatibility,
// a raw base64 string (wrapped as inline_data, the old slower path).
const toTextbookPart = (textbook) =>
  typeof textbook === "string" ? { inline_data: { mime_type: "application/pdf", data: textbook } } : textbook;

export const generateWithPDF = (prompt, pdfBase64OrPart) => {
  const part = toTextbookPart(pdfBase64OrPart);
  if (!part) return generateText(prompt);
  return callGemini([part, { text: prompt }]);
};

export const generateWithMaterials = (prompt, materialParts = [], textbookBase64OrPart = null) => {
  const parts = [...materialParts];
  const part = toTextbookPart(textbookBase64OrPart);
  if (part) parts.push(part);
  parts.push({ text: prompt });
  return callGemini(parts);
};

// ─── JSON generation (lesson plans, questions, activities, rubrics) ─────────
// Same shapes as above, but with jsonMode on — this is what actually fixes
// the "AI ले डाटा बनाउन सकेन" failures, since Gemini can no longer wrap the
// JSON in prose or leave it malformed.
// FIX — accepts an options object (maxOutputTokens, timeoutMs, ...) so
// callers that need a bigger output budget or longer timeout (e.g. the
// curriculum-grouping prompts below, which can involve a lot of chapters)
// don't have to bypass this helper and call callGemini directly.
export const generateTextJSON = (prompt, options = {}) => callGemini([{ text: prompt }], { jsonMode: true, ...options });

export const generateWithPDFJSON = (prompt, pdfBase64OrPart) => {
  const part = toTextbookPart(pdfBase64OrPart);
  if (!part) return generateTextJSON(prompt);
  return callGemini([part, { text: prompt }], { jsonMode: true });
};

// NEW — same idea as generateWithPDFJSON, but takes whatever mime type the
// uploaded file actually is (PDF or a photo/scan of a calendar — jpg/png).
// Used by the Calendar tab's "पात्रो अपलोड गर्नुहोस्" event extraction.
export const generateWithFileJSON = (prompt, base64, mimeType) =>
  callGemini([{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }], { jsonMode: true });

export const generateWithMaterialsJSON = (prompt, materialParts = [], textbookBase64OrPart = null) => {
  const parts = [...materialParts];
  const part = toTextbookPart(textbookBase64OrPart);
  if (part) parts.push(part);
  parts.push({ text: prompt });
  return callGemini(parts, { jsonMode: true });
};

// NEW — turns Materials-library rows into Gemini `parts`. PDFs/images are
// downloaded from Supabase Storage and inlined; docx/pptx/xlsx use their
// pre-extracted `extracted_text` column (no download needed).
// FIX — an uploaded PPT or lesson-plan doc with no length limit could balloon
// the prompt sent on every single generation call (lesson plan, questions,
// activities, rubric — all four, every time), which was very likely why
// generation was timing out. A few thousand characters is already far more
// context than the AI needs from any one file.
const MAX_MATERIAL_CHARS = 6000;
export const buildMaterialParts = async (materials, downloadFn) => {
  const parts = [];
  for (const m of materials || []) {
    try {
      if (m.file_type === "pdf" || m.file_type === "image") {
        const blob = await downloadFn(m.storage_path);
        const b64 = await blobToBase64(blob);
        const mime = m.file_type === "pdf" ? "application/pdf" : (blob.type || "image/jpeg");
        parts.push({ inline_data: { mime_type: mime, data: b64 } });
      } else if (m.extracted_text) {
        const truncated = m.extracted_text.length > MAX_MATERIAL_CHARS;
        const text = truncated ? m.extracted_text.slice(0, MAX_MATERIAL_CHARS) + "\n[...बाँकी भाग छोटो पारियो...]" : m.extracted_text;
        parts.push({ text: `[फाइल: ${m.name}]\n${text}` });
      }
    } catch (e) {
      console.warn(`Material "${m.name}" skipped (couldn't load):`, e.message);
    }
  }
  return parts;
};

export const parseJSON = (text) => {
  if (!text) return null;
  let clean = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();
  try {
    return JSON.parse(clean);
  } catch {}
  const firstBrace = clean.search(/[[{]/);
  const lastBrace = Math.max(clean.lastIndexOf("}"), clean.lastIndexOf("]"));
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(clean.slice(firstBrace, lastBrace + 1));
    } catch {}
  }
  console.warn("parseJSON: could not parse Gemini response as JSON:", text.slice(0, 300));
  return null;
};

// FIX (revised) — the previous version dropped the textbook entirely the
// moment any material was tagged to a chapter. That over-corrected: a
// teacher's uploaded lesson plan/prastuti rarely covers 100% of what the
// textbook chapter covers, so anything the material left out was silently
// missing instead of falling back to the book. Both are sent together
// again, but with an explicit instruction telling Gemini which one leads —
// tagged materials are the primary, authoritative source (their structure,
// order, and emphasis should be followed), and the textbook is there only
// to fill gaps the materials don't cover, never to override them.
const MATERIALS_PRIORITY_NOTE = `\n\n[स्रोत प्राथमिकता — महत्त्वपूर्ण]: माथि शिक्षकले आफैं यो अध्यायमा ट्याग गर्नुभएको सामग्री (लेसन प्लान/प्रस्तुति/प्रश्नोत्तर/आदि) र पाठ्यपुस्तक दुवै संलग्न छन्। शिक्षकको ट्याग गरिएको सामग्रीलाई नै मुख्य र भरपर्दो स्रोत मानी त्यसैको संरचना, क्रम र जोड पछ्याउनुहोस्। पाठ्यपुस्तक केवल त्यो सामग्रीले नसमेटेको तर अध्यायको लागि आवश्यक विषयवस्तु (जस्तै छुटेको उपशीर्षक वा तथ्य) थप्नकै लागि प्रयोग गर्नुहोस् — सामग्रीमा भएको कुरासँग नबाझी, नबदली।`;

// FIX — many Nepali government textbook/guide PDFs are typed in a legacy,
// non-Unicode font (Preeti/Kantipur and similar): the file LOOKS like
// correct Devanagari when opened with that font installed, but the actual
// embedded/selectable text layer inside the PDF is just plain Latin
// letters and punctuation that only that specific font maps visually to
// Devanagari glyphs. When a prompt asks Gemini to return a chapter's text
// "exactly as-is, verbatim", Gemini sometimes copies that raw embedded
// text layer directly instead of visually reading the page images — which
// produces exactly this kind of scattered corruption (stray Latin/other-
// script fragments in otherwise correct Nepali). Two defenses below:
// (1) the extraction prompts no longer ask for byte-exact copying — they
// ask Gemini to visually read and faithfully retype the content, and
// explicitly warn it never to trust/copy any underlying raw text layer;
// (2) looksCorrupted() catches anything that slips through anyway, so a
// bad extraction is never cached (db.saveTextbookChapterText only stores
// what passes this check) — a poisoned cache was the reason corruption
// kept resurfacing in unrelated content and simulations for the same
// chapter over and over, since every later AI call for that chapter reused
// the one cached (possibly corrupted) extraction.
const RAW_TEXT_LAYER_WARNING = `\n\nमहत्त्वपूर्ण — केही पुराना नेपाली PDF (विशेषतः सरकारी पाठ्यपुस्तक/निर्देशिका) Preeti/Kantipur जस्ता पुरानो नन्-युनिकोड फन्टमा टाइप गरिएका हुन्छन्: PDF भित्रको साँचिएको/select हुने raw text तह वास्तवमा सादा अंग्रेजी अक्षर/चिन्हहरू मात्र हो, त्यो फन्ट इन्स्टल भएमा मात्र देवनागरीजस्तो देखिन्छ। त्यसैले PDF को त्यो raw/embedded text तह कहिल्यै सिधै नक्कल/copy नगर्नुहोस् — बरु पृष्ठको तस्बिर/लेआउट आँखाले हेरेझैं गरी बुझी, सोही अर्थ र तथ्य ठ्याक्कै कायम राखी, आफैं सफा र सही युनिकोड देवनागरीमा पुनः टाइप गरेर दिनुहोस्। यदि कतै अंग्रेजी अक्षर, अरबी जस्ता चिन्ह, वा अनौठो/नबुझिने क्यारेक्टर देखा पर्‍यो भने त्यो निश्चित रूपमा गलत हो — त्यसलाई जस्ताको त्यस्तै नराखी, सही देवनागरी शब्दमा सुधारेर मात्र लेख्नुहोस्।`;

// FIX — "फन्ट फ्लेक्सिबल" request: shिक्षकले अपलोड गर्ने Word/PowerPoint/Excel
// फाइलहरू पनि प्रायः पुरानो नन्-युनिकोड नेपाली फन्ट (Preeti, Kantipur, Ganesh,
// Sagarmatha, PCS Nepali जस्ता थुप्रै फन्ट — जुन-जुन भए पनि) मा टाइप गरिएका
// हुन सक्छन्। PDF-को हकमा माथिको RAW_TEXT_LAYER_WARNING ले Gemini लाई पृष्ठको
// तस्बिर हेरेर पुनः टाइप गर्न लगाएर यो समस्या समाधान गर्छ, तर docx/pptx/xlsx/csv
// भने ब्राउजरमै (mammoth/jszip/xlsx-ले) कच्चा text-layer झिकिन्छ — त्यहाँ कुनै
// "पृष्ठको तस्बिर" हुँदैन, फाइल जुनसुकै फन्टमा टाइप भए पनि जे text-layer भेटियो
// त्यही materialParts मा जान्छ (extract.js हेर्नुहोस्)। कुन खास फन्ट हो भनेर
// थाहा नभई एउटा mapping table ले सबै फन्ट पत्ता लगाउन सकिँदैन (र गलत mapping ले
// झन् बिग्रेको/गलत सामग्री दिन सक्छ) — त्यसैले फन्ट-विशेष mapping नबनाई, PDF मा
// जस्तै Gemini लाई नै (जसले धेरै फन्टका यस्ता ढाँचा तालिम डेटामा देखिसकेको छ)
// यस्तो देखिएमा अर्थ पहिचान गरी सफा युनिकोड देवनागरीमा पुनः व्याख्या गर्न भन्छौं
// — फन्ट जुनसुकै भए पनि लागू हुने साझा समाधान।
const MATERIAL_LEGACY_FONT_WARNING = `\n\n[फन्ट सावधानी]: माथि शिक्षकले अपलोड गर्नुभएको Word/PowerPoint/Excel फाइल(हरू)बाट निकालिएको पाठ कुनै पुरानो नन्-युनिकोड नेपाली फन्ट (जस्तै Preeti, Kantipur, Ganesh, Sagarmatha, PCS Nepali, वा यस्तै अरू कुनै — फन्ट जुनसुकै भए पनि) मा मूल फाइल टाइप गरिएको हुनसक्ने हुँदा अनौठो अंग्रेजी अक्षर/चिन्हको मिश्रणजस्तो देखिन सक्छ; त्यो देवनागरीको सट्टा भएको मात्र हो, वास्तविक सामग्री होइन। यस्तो देखिएमा त्यसलाई जस्ताको त्यस्तै प्रयोग नगर्नुहोस् — बरु त्यसले कुन नेपाली शब्द/वाक्य जनाउन खोजेको हो भनी सन्दर्भबाट बुझी सही युनिकोड देवनागरीमा पुनः व्याख्या गरेर मात्र प्रयोग गर्नुहोस्। पूर्ण अर्थ छुट्याउनै नसकिने गरी बिग्रिएको अंश भेटिए त्यो सानो अंश मात्र बेवास्ता गरी बाँकी स्पष्ट सामग्री/पाठ्यपुस्तकबाट काम चलाउनुहोस्।`;

// Heuristic check for the corruption pattern above: legacy-font mojibake
// mixes plain Latin letters (occasionally digits/symbols) directly into
// what should be pure Devanagari prose. A little incidental Latin is
// normal (an English proper noun, a unit like "km"), so this only flags
// text where Latin letters make up an unreasonably large share of all
// letters — well past anything a genuine Nepali passage would contain.
function looksCorrupted(text) {
  if (!text) return false;
  const devanagari = (text.match(/[\u0900-\u097F]/g) || []).length;
  const latinLetters = (text.match(/[A-Za-z]/g) || []).length;
  if (devanagari + latinLetters < 60) return false; // too short to judge reliably
  return latinLetters / (devanagari + latinLetters) > 0.25;
}

// NEW — pulls one chapter's plain text out of the textbook PDF, once. This
// itself costs one full-book read (same token cost as before), but it's
// the ONLY time that cost is paid for a given chapter: App.jsx's
// getMaterialContext caches the result via db.saveTextbookChapterText, so
// every later AI call for that chapter sends this small text instead of
// re-attaching the whole book — the actual token-savings win.
export async function extractChapterText(chapterTitle, classLabel) {
  const part = await getTextbookPart(classLabel);
  if (!part) return null;
  const prompt = `यो नेपाली पाठ्यपुस्तकबाट "${chapterTitle}" नामक अध्याय/पाठ पत्ता लगाउनुहोस् र त्यसको पूरा विषयवस्तु — नछोटाई, संक्षेप नगरी, कुनै तथ्य/वाक्य नछुटाई — सादा पाठको रूपमा मात्र फिर्ता दिनुहोस्। कुनै व्याख्या, शीर्षक, वा फर्म्याटिङ नथप्नुहोस्, केवल अध्यायको वास्तविक विषयवस्तु मात्र दिनुहोस्। यदि यस्तो नामको अध्याय ठ्याक्कै भेटिएन भने अरू केही नलेखी ठ्याक्कै यही शब्द मात्र लेख्नुहोस्: NOT_FOUND${RAW_TEXT_LAYER_WARNING}`;
  let text;
  // FIX — this was maxOutputTokens: 8192. An एकाइ (unit) with several पाठ
  // plus its own trailing अभ्यास section easily runs past that in Devanagari
  // token count, so the extraction silently got cut off mid-unit — almost
  // always losing the exercise block at the very end since it's written
  // last. That produced exactly this symptom: chapter/lesson names line up
  // perfectly, but generateQuestions genuinely can't find an exercise
  // section, because the cached textbookText never contained it in the
  // first place. Matches the 16000 cap already used elsewhere for
  // similarly long single-call generations.
  try { text = await callGemini([part, { text: prompt }], { maxOutputTokens: 16000 }); }
  catch { return null; } // extraction failures fall back silently — the caller re-tries with the whole book for this one call
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed === "NOT_FOUND" || trimmed.length < 40) return null;
  if (looksCorrupted(trimmed)) return null; // never cache a corrupted extraction — caller falls back to the raw PDF for this call instead
  return trimmed;
}

// ─── Internal routers — pick the right call based on what's passed ──────────
// `ctx` can be: null/undefined (plain prompt), a string (legacy — treated as
// pdfBase64), or { pdfBase64, materialParts, textbookText }, built by
// App.jsx's getMaterialContext. textbookText (once-extracted, cached
// chapter text) is preferred over pdfBase64 (the whole-book file
// reference) whenever it's available — same content the AI sees, far fewer
// tokens spent getting it there.
function contextParts(ctx) {
  if (!ctx) return [];
  if (typeof ctx === "string") { const p = toTextbookPart(ctx); return p ? [p] : []; }
  const { pdfBase64 = null, materialParts = [], textbookText = null } = ctx;
  const parts = [...materialParts];
  // Only docx/pptx/xlsx/csv materials go in as plain `text` parts (extract.js
  // pulled their raw text-layer client-side); pdf/image materials go in as
  // `inline_data` and Gemini already reads those visually, font-independent.
  // The warning only needs to apply to the text-layer kind.
  if (materialParts.some((p) => typeof p.text === "string")) parts.push({ text: MATERIAL_LEGACY_FONT_WARNING });
  if (textbookText) parts.push({ text: `[पाठ्यपुस्तकको सान्दर्भिक अंश — यही अध्यायको लागि पहिले नै निकालिएको]\n${textbookText}` });
  else { const p = toTextbookPart(pdfBase64); if (p) parts.push(p); }
  return parts;
}
function hasBothSources(ctx) {
  if (!ctx || typeof ctx === "string") return false;
  const { pdfBase64 = null, materialParts = [], textbookText = null } = ctx;
  return materialParts.length > 0 && !!(pdfBase64 || textbookText);
}
async function runPrompt(prompt, ctx, options = {}) {
  const parts = contextParts(ctx);
  if (!parts.length) return callGemini([{ text: prompt }], options);
  let finalPrompt = prompt + RAW_TEXT_LAYER_WARNING; // any PDF/file is attached here — always warn, not just the two extraction calls
  if (hasBothSources(ctx)) finalPrompt += MATERIALS_PRIORITY_NOTE;
  return callGemini([...parts, { text: finalPrompt }], options);
}
async function runPromptJSON(prompt, ctx) {
  const parts = contextParts(ctx);
  if (!parts.length) return generateTextJSON(prompt);
  let finalPrompt = prompt + RAW_TEXT_LAYER_WARNING;
  if (hasBothSources(ctx)) finalPrompt += MATERIALS_PRIORITY_NOTE;
  return callGemini([...parts, { text: finalPrompt }], { jsonMode: true });
}
// NEW — the one function callers should use when they have a getMaterialContext()
// ctx object (materials + textbook). Older code called generateWithMaterials/
// generateWithPDF directly with pieces of ctx, which bypassed both the
// materials-priority note and (now) the cached-chapter-text token savings.
export const generateFromContext = (prompt, ctx) => runPrompt(prompt, ctx);
export const generateFromContextJSON = (prompt, ctx) => runPromptJSON(prompt, ctx);


// ─── High-level generation helpers ───────────────────────────────────────────
export const generateLessonPlan = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", pathTitle = null) => {
  const focusLine = (pathTitle && pathTitle.trim() && pathTitle.trim() !== chapterTitle.trim())
    ? `यो अध्याय भित्रको यो खास पाठ (Path) का लागि मात्र योजना बनाउनुहोस्: "${pathTitle}"। अध्यायका अरू पाठहरूसँग दोहोरिने सामग्री नराख्नुहोस्।`
    : "";
  const prompt = `तपाईं नेपालको ${classContext}का लागि पाठ योजना बनाउँदै हुनुहुन्छ।
अध्याय (Unit): "${chapterTitle}"
${focusLine}
यो ठ्याक्कै यो JSON संरचनामा मात्र जवाफ दिनुहोस्:
{
  "objectives": ["उद्देश्य १","उद्देश्य २","उद्देश्य ३"],
  "vocabulary": ["शब्द १: छोटो र सरल अर्थ","शब्द २: छोटो र सरल अर्थ","शब्द ३: छोटो र सरल अर्थ","शब्द ४: छोटो र सरल अर्थ","शब्द ५: छोटो र सरल अर्थ","शब्द ६: छोटो र सरल अर्थ","शब्द ७: छोटो र सरल अर्थ","शब्द ८: छोटो र सरल अर्थ","शब्द ९: छोटो र सरल अर्थ","शब्द १०: छोटो र सरल अर्थ"],
  "sequence": ["चरण १","चरण २","चरण ३","चरण ४","चरण ५"],
  "key_questions": ["प्रश्न १?","प्रश्न २?","प्रश्न ३?"],
  "activities": ["क्रियाकलाप १","क्रियाकलाप २"],
  "homework": "गृहकार्य विवरण",
  "notes": "शिक्षकका लागि टिप्पणी",
  "rubric": [{"level":"उत्कृष्ट","desc":"विवरण"},{"level":"राम्रो","desc":"विवरण"},{"level":"सामान्य","desc":"विवरण"},{"level":"सुधार आवश्यक","desc":"विवरण"}]
}
महत्त्वपूर्ण: "vocabulary" मा हरेक शब्दसँग अनिवार्य रूपमा छोटो अर्थ ":" चिन्हले छुट्याएर दिनुहोस् (जस्तै "अनुभूति: महसुस भएको कुरा")। शब्द वा अर्थमा अल्पविराम (,) कहिल्यै नराख्नुहोस्। माथिको उदाहरणमा १० वटा शब्द देखाइए पनि, यो पाठमा जति पनि साँच्चै कठिन/नयाँ शब्दहरू छन् ती सबै समावेश गर्नुहोस् — १० मा सीमित नराख्नुहोस्, र १० भन्दा कम भए पनि कृत्रिम रूपमा नथप्नुहोस्।`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया — Gemini बाट केही फर्केन)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

// NEW — regenerates ONLY the vocabulary list for a lesson (see App.jsx's
// regenerateVocabOnly), separate from the full generateLessonPlan call so
// a teacher can top up hard/new words without touching objectives,
// sequence, questions, activities, or a rubric they may have already
// reviewed/edited. Returns a plain array of "शब्द: अर्थ" strings — same
// format/shape as the "vocabulary" field inside generateLessonPlan's JSON
// above — since the caller merges it directly into the existing
// semicolon-joined vocabulary field by word.
export const generateVocabulary = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", pathTitle = null) => {
  const focusLine = (pathTitle && pathTitle.trim() && pathTitle.trim() !== chapterTitle.trim())
    ? `यो अध्याय भित्रको यो खास पाठ (Path) का लागि मात्र शब्दावली दिनुहोस्: "${pathTitle}"। अध्यायका अरू पाठहरूसँग दोहोरिने शब्द नराख्नुहोस्।`
    : "";
  const prompt = `तपाईं नेपालको ${classContext}का लागि शब्दावली सूची बनाउँदै हुनुहुन्छ।
अध्याय (Unit): "${chapterTitle}"
${focusLine}
यो पाठमा भएका कठिन/नयाँ शब्दहरूको सूची ठ्याक्कै यही JSON array संरचनामा मात्र दिनुहोस्, अरू कुनै व्याख्या वा पाठ नथप्नुहोस्:
["शब्द १: छोटो र सरल अर्थ","शब्द २: छोटो र सरल अर्थ","शब्द ३: छोटो र सरल अर्थ","शब्द ४: छोटो र सरल अर्थ","शब्द ५: छोटो र सरल अर्थ","शब्द ६: छोटो र सरल अर्थ","शब्द ७: छोटो र सरल अर्थ","शब्द ८: छोटो र सरल अर्थ","शब्द ९: छोटो र सरल अर्थ","शब्द १०: छोटो र सरल अर्थ"]
महत्त्वपूर्ण: हरेक शब्दसँग अनिवार्य रूपमा छोटो अर्थ ":" चिन्हले छुट्याएर दिनुहोस् (जस्तै "अनुभूति: महसुस भएको कुरा")। शब्द वा अर्थमा अल्पविराम (,) कहिल्यै नराख्नुहोस्। माथिको उदाहरणमा १० वटा शब्द देखाइए पनि, यो पाठमा जति पनि साँच्चै कठिन/नयाँ शब्दहरू छन् ती सबै समावेश गर्नुहोस् — १० मा सीमित नराख्नुहोस्, र १० भन्दा कम भए पनि कृत्रिम रूपमा नथप्नुहोस्।`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result || !Array.isArray(result)) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया — Gemini बाट केही फर्केन)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

export const generateQuestions = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", pathTitle = null) => {
  const isWholeChapter = !pathTitle || !pathTitle.trim() || pathTitle.trim() === chapterTitle.trim();
  // FIX — root cause of "exercise not found" for a lesson whose exercise
  // genuinely exists in the book: most Nepali textbooks (confirmed by
  // checking an actual उदाहरण — an एकाइ with 4 separate पाठ) print a
  // SEPARATE "अभ्यास" block right after EACH individual पाठ's own content
  // (vocabulary/activities/exercise/project-work, then the next पाठ
  // starts) — NOT one combined block at the very end of the whole एकाइ.
  // The old instruction told Gemini to look "ठ्याक्कै अध्यायको अन्त्यमा"
  // (right at the END OF THE CHAPTER) even when a specific पाठ was asked
  // for. For पाठ १ of a 4-पाठ chapter, that pointed Gemini at the LAST
  // पाठ's own exercise section instead — topically unrelated to पाठ १, so
  // the focusLine's own filtering correctly found nothing relevant and
  // returned [], even though पाठ १'s own exercise was right there, just a
  // couple of pages after its own content (long before the chapter ends).
  // Now: for a specific पाठ, look for the exercise that follows THAT पाठ
  // specifically, not the chapter as a whole.
  const scopeLine = isWholeChapter
    ? `यसमा "${chapterTitle}" नामको अध्याय पत्ता लगाउनुहोस् — त्यो अध्यायको सुरुदेखि अन्त्यसम्म राम्ररी हेर्नुहोस्, र अध्यायको ठ्याक्कै अन्त्यमा छापिएको आफ्नै "अभ्यास" (वा "प्रश्नोत्तर"/"अभ्यास प्रश्नहरू" जस्तो शीर्षक भएको) खण्ड पत्ता लगाउनुहोस्।`
    : `यसमा "${chapterTitle}" नामको अध्याय भित्र "${pathTitle}" नामको खास पाठ (Path/पाठ) पत्ता लगाउनुहोस्। **महत्त्वपूर्ण**: धेरैजसो नेपाली पाठ्यपुस्तकमा एउटै अध्याय (एकाइ) भित्र धेरै पाठ (Path) हुन्छन्, र हरेक पाठको आफ्नै छुट्टै "अभ्यास" (वा "प्रश्नोत्तर") खण्ड सोही पाठको सामग्री (जस्तै शब्द भण्डार/वोकेब्लरी, क्रियाकलाप पछि) सकिएर, अर्को पाठ सुरु हुनुभन्दा ठ्याक्कै अगाडि नै छापिएको हुन्छ — अध्यायको सम्पूर्ण अन्त्यमा (पछिल्लो पाठको पछाडि) पुग्नु पर्दैन। त्यसैले अध्यायको अन्त्यसम्म नपुगी, "${pathTitle}" यही पाठको आफ्नै सामग्री सकिएपछि, ठ्याक्कै त्यसको ठीक पछाडि (अर्को पाठ सुरु हुनुभन्दा अगाडि) आफ्नै "अभ्यास"/"प्रश्नोत्तर" खण्ड छ कि भनेर पत्ता लगाउनुहोस् — यही नै सही ठाउँ हो, चाहे अध्याय अझै धेरै पाठ बाँकी भएर लामो नै किन नहोस्।`;
  const focusLine = isWholeChapter ? "" : `\n\nयो अध्याय भित्र यो खास पाठ (Path) मात्र: "${pathTitle}"। यदि यो अध्याय बहु-पाठ (multiple paths/periods) मा बाँडिएको छ भने, अभ्यास खण्डका प्रश्नहरूमध्ये ठ्याक्कै यही पाठको विषयवस्तुसँग मिल्नेहरू मात्र छान्नुहोस् — अरू पाठसँग सम्बन्धित प्रश्न यहाँ नराख्नुहोस्। यदि प्रश्नहरू कुन उप-विषयसँग हो भन्ने छुट्याउन नमिल्ने खालका (चाहे जुनसुकै उप-विषयमा लागू हुने खालका, समग्र अध्यायकै हुन्) भए ती पनि समावेश गर्न सक्नुहुन्छ।`;
  // NEW — "पाठ अभ्यास समाधान": earlier version generated its own fresh
  // quiz-style questions. That's wrong for this feature — the teacher
  // needs the EXACT exercise questions already printed at the end of this
  // chapter in the textbook (uploaded whole, in Settings → textbook
  // upload), verbatim, with AI supplying only the answer/solution. No
  // invented questions, ever — if the chapter's own exercise section
  // can't be found in the given textbook text, this returns an empty
  // array rather than making something up (caller shows an empty state
  // instead of silently substituting AI-invented questions).
  const prompt = `तपाईंलाई माथि नेपालको ${classContext}को पाठ्यपुस्तकको सान्दर्भिक अंश (वा पूरा पुस्तक) दिइएको छ। ${scopeLine}${focusLine}

अत्यन्तै महत्त्वपूर्ण नियमहरू:
1. त्यो अभ्यास खण्डमा भएका प्रश्नहरू मात्र लिनुहोस् — शब्द, क्रम, संख्या, विकल्प (options) समेत ठ्याक्कै पाठ्यपुस्तकमा जस्तो छ त्यस्तै (verbatim) राख्नुहोस्। कुनै पनि हालतमा आफैं नयाँ प्रश्न नबनाउनुहोस्, नथप्नुहोस्, वा शब्द नबदल्नुहोस्।
2. यदि "${chapterTitle}"${isWholeChapter ? "" : ` को "${pathTitle}"`} अध्याय/पाठ यो दिइएको स्रोतमा नै भेटिएन, वा भेटिए पनि त्यसको छुट्टै अभ्यास खण्ड ठम्याउन सकिएन भने, अरू केही नबनाई ठ्याक्कै खाली array मात्र फर्काउनुहोस्: []
3. हरेक प्रश्नको लागि उत्तर/हल दिनुहोस् — त्यो उत्तर सधैं पहिले यही अध्यायको (माथि दिइएको) मुख्य पाठ्य-सामग्रीबाटै खोजी दिनुहोस्; त्यहाँ प्रस्ट उत्तर भेटिएमा "source":"textbook" राख्नुहोस्। अध्यायको सामग्रीमा साँच्चै उत्तर नभेटिएमा मात्र आफ्नै सामान्य ज्ञानले उत्तर दिनुहोस् र "source":"ai" राख्नुहोस्। कुनै प्रश्नको उत्तर खाली नछोड्नुहोस्।
4. हरेक प्रश्नलाई तलका ६ चाहिँ "type" मध्ये सबैभन्दा मिल्दोमा वर्गीकरण गर्नुहोस् (पाठ्यपुस्तकमा जुन प्रकारका प्रश्न वास्तवमा छन् ती मात्र देखिनेछन् — सबै ६ प्रकार हुनैपर्छ भन्ने छैन, र नक्कली/थप प्रश्न बनाएर संख्या पूरा गर्न पनि पर्दैन):
   - "छोटो उत्तर" (पाठ्यपुस्तकमा "अति छोटो उत्तर" वा उस्तै उपशीर्षक भएका, एक/दुई वाक्यमै सकिने प्रश्नहरू — परिभाषा, नाम, सूची जस्ता)
   - "लामो उत्तर" (पाठ्यपुस्तकमा "लामो उत्तर दिनुहोस्" वा उस्तै उपशीर्षक भएका, बुँदागत/अनुच्छेदमा विस्तृत उत्तर चाहिने प्रश्नहरू)
   - "बहुविकल्पीय" (options सहित — यसमा "text" फिल्डमा प्रश्नको स्टेम/जिज्ञासा-वाक्य मात्र राख्नुहोस्, प्रश्नचिन्ह/कोलनसम्म; त्यसपछि आउने अ./आ./इ./ई. वा क)/ख)/ग)/घ) जस्ता लेटर्ड विकल्पहरू "text" भित्र कहिल्यै नराख्नुहोस् — ती सबै छुट्टै "options" array मा मात्र जानुपर्छ, नत्र विकल्पहरू प्रश्नमा एकपटक अनि तलको छनोट-सूचीमा फेरि गरी दोहोरिन्छन्)
   - "सत्य/असत्य"
   - "रिक्त स्थान" (खाली ठाउँ भर्ने)
   - "मिलान गर्नुहोस्" (जोडा मिलाउने)
   यदि पाठ्यपुस्तकमा छोटो/लामो उत्तरबीच स्पष्ट छुट्याइएको उपशीर्षक छैन भने मात्र, प्रश्नको लम्बाइ/जटिलता हेरी दुई मध्ये उपयुक्त एउटामा राख्नुहोस्।
   **तर यी ६ मात्र होइनन् — पाठ्यपुस्तकको अभ्यास खण्डमा माथिका ६ मा नमिल्ने अर्को किसिमको उपशीर्षक/खण्ड (जस्तै "शब्दार्थ लेख्नुहोस्", "कठिन शब्दको अर्थ लेख्नुहोस्", वा अरू जुनसुकै) भेटिएमा, त्यसलाई माथिका ६ मध्ये कुनैमा जबर्जस्ती नराखी, त्यही उपशीर्षकमा टेकेर आफैं एउटा छोटो, ठ्याक्कै मिल्ने नयाँ "type" नाम (Nepali मा, उपशीर्षककै शब्द वा उस्तै) बनाएर प्रयोग गर्नुहोस्। यस्तो नयाँ type का item मा पनि उही "text"/"answer" संरचना नै प्रयोग गर्नुहोस् (जस्तै शब्दार्थको हकमा "text":"शब्द", "answer":"त्यसको अर्थ")।
5. अभ्यास खण्डमा प्रायः "क", "ख", "ग", "घ"... वा "१", "२", "३"... गरी क्रमांकित उपशीर्षकहरू (जस्तै "सत्य/असत्य लेख्नुहोस्", "तलका प्रश्नहरूको छोटो/लामो उत्तर दिनुहोस्") हुन्छन्, र हरेक उपशीर्षक मुनि धेरै वटा छुट्टाछुट्टै कथन/प्रश्न हुन्छन्। यस्तो हरेक व्यक्तिगत कथन/प्रश्नलाई सधैं आफ्नै छुट्टै array item बनाउनुहोस् — एउटा उपशीर्षक मुनिका सबै (वा धेरै) कथन/प्रश्नलाई कहिल्यै एउटै "text" वा एउटै "answer" फिल्डमा जोडेर/गाँसेर नराख्नुहोस्। जस्तै, ८ वटा सत्य/असत्य कथन भए ८ वटै छुट्टाछुट्टै "सत्य/असत्य" type का item बनाउनुहोस्, हरेकको "answer" ठ्याक्कै एउटै शब्द "सत्य" वा "असत्य" मात्र होस् (कहिल्यै धेरै कथनका उत्तर एकै ठाउँमा जोडेर नराख्नुहोस्)।
6. अभ्यास खण्डभित्रको कुनै पनि उपशीर्षक/खण्ड (माथिका ६ प्रकार होस् वा माथि भनिएझैं नयाँ थपिएको अर्को कुनै प्रकार होस्, जुनसुकै भए पनि) नछुटाउनुहोस्। कुनै उपशीर्षक भेटिएर पनि त्यसका प्रश्नहरू array मा समावेश गर्न बिर्सनु हुँदैन — हरेक उपशीर्षक मुनिका सबै प्रश्न, सुरुदेखि अन्त्यसम्म, समावेश गर्नुहोस्।
7. "सत्य/असत्य" प्रकारका प्रश्नमा, "answer":"असत्य" भएमा मात्र, त्यही कथनलाई सही बनाउने छोटो सुधारिएको वाक्य "correction" फिल्डमा थप्नुहोस् (जस्तै मूल कथनमा भएको गलत शब्द/भाग बदलेर सही तुल्याएको एउटै छोटो वाक्य)। "answer":"सत्य" भएमा "correction" फिल्ड नै नथप्नुहोस् वा खाली राख्नुहोस्।
8. array मा item हरू ठ्याक्कै पाठ्यपुस्तकको अभ्यास खण्डमा जुन क्रममा उपशीर्षक/प्रश्न देखिन्छन् सोही क्रममा राख्नुहोस् (type अनुसार पुनः क्रमबद्ध नगर्नुहोस्) — किनभने यही क्रम पछि प्रिन्ट गर्दा प्रयोग हुन्छ।

ठ्याक्कै तलको आकारको JSON array मात्र फर्काउनुहोस्, अरू कुनै व्याख्या/पाठ नथप्नुहोस्:
[
{"text":"पाठ्यपुस्तकमै जस्तो छोटो प्रश्न, हुबहु","type":"छोटो उत्तर","answer":"उत्तर","source":"textbook"},
{"text":"पाठ्यपुस्तकमै जस्तो विस्तृत प्रश्न, हुबहु","type":"लामो उत्तर","answer":"बुँदागत/विस्तृत उत्तर","source":"textbook"},
{"text":"पाठ्यपुस्तकमै जस्तो प्रश्न, हुबहु","type":"बहुविकल्पीय","options":["क) विकल्प","ख) विकल्प","ग) विकल्प","घ) विकल्प"],"correct_option":0,"answer":"सही विकल्पको पूरा पाठ","source":"textbook"},
{"text":"पाठ्यपुस्तकमै जस्तो एउटै मात्र कथन (धेरै कथन जोडेर होइन), हुबहु","type":"सत्य/असत्य","answer":"सत्य","source":"textbook"},
{"text":"पाठ्यपुस्तकमै जस्तो अर्को छुट्टै कथन, हुबहु","type":"सत्य/असत्य","answer":"असत्य","correction":"सोही कथनलाई सही बनाउने छोटो वाक्य","source":"textbook"},
{"text":"पाठ्यपुस्तकमै जस्तो वाक्य ______ सहित, हुबहु","type":"रिक्त स्थान","answer":"खाली ठाउँमा भर्ने ठ्याक्कै शब्द/वाक्यांश","source":"textbook"},
{"text":"पाठ्यपुस्तकमै जस्तो निर्देशन, हुबहु","type":"मिलान गर्नुहोस्","match_pairs":[{"left":"पद १","right":"सही मिलान १"},{"left":"पद २","right":"सही मिलान २"}],"source":"textbook"}
]
माथिको उदाहरणमा सत्य/असत्यका २ वटा मात्र देखाइए पनि, पाठ्यपुस्तकमा जति कथन छन् ती सबैका लागि त्यत्तिकै छुट्टाछुट्टै item बनाउनुहोस्।
"source" ठ्याक्कै "textbook" वा "ai" मात्र हुनुपर्छ।`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

export const generateActivities = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", pathTitle = null) => {
  const focus = (pathTitle && pathTitle.trim() && pathTitle.trim() !== chapterTitle.trim()) ? ` "${pathTitle}" पाठ (अध्याय: "${chapterTitle}")` : ` "${chapterTitle}"`;
  const prompt = `नेपाल ${classContext}${focus} का लागि ५ कक्षागत क्रियाकलाप भएको JSON array मात्र:
[{"title":"नाम","type":"game","duration":"१५ मिनेट","competency":"क्षमता","description":"विवरण"}]
प्रकार: game, roleplay, project, map, debate, presentation`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

// NEW — the lesson plan's own "activities" field (see generateLessonPlan
// above) only ever produces 2, because its example in the prompt shows 2
// and the model follows that as a count hint, not just a format sample.
// Rather than change that (touching the shared plan prompt would also
// reshuffle objectives/vocabulary/sequence counts, which aren't broken),
// this is a separate, additive call: given the activities a lesson
// already has, ask for a handful more in the SAME flat-string shape
// lesson.activities is stored in — one line per activity, no title/type/
// duration object like generateActivities above returns — and explicitly
// tell it what already exists so it adds genuinely different ones instead
// of near-duplicates of what's already on screen.
export const generateMoreActivities = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", pathTitle = null, existing = []) => {
  const focus = (pathTitle && pathTitle.trim() && pathTitle.trim() !== chapterTitle.trim()) ? ` "${pathTitle}" पाठ (अध्याय: "${chapterTitle}")` : ` "${chapterTitle}"`;
  const existingLine = existing.length ? `\nयी क्रियाकलाप पहिल्यै छन्, यिनीहरूसँग नमिल्ने/नदोहोरिने थप क्रियाकलाप मात्र दिनुहोस्:\n${existing.map((a) => `- ${a}`).join("\n")}` : "";
  const prompt = `नेपाल ${classContext}${focus} का लागि ३ थप कक्षागत क्रियाकलाप भएको JSON array मात्र, हरेक एउटा छोटो वाक्यमा (जस्तै लेसन योजनाको "activities" सूचीमा जस्तो, कुनै अतिरिक्त field नराखी):
["क्रियाकलाप विवरण १","क्रियाकलाप विवरण २","क्रियाकलाप विवरण ३"]${existingLine}`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

// NEW — a broad pool of distinct interactive mechanics a simulation can be
// built around. Previously the prompt just listed a few as suggestions and
// let Gemini pick — in practice that meant it kept defaulting to whichever
// one it found easiest, so repeated generations for the same lesson often
// came out the same. pickNextSimulationType() now makes the choice in code
// instead, so hitting "generate" repeatedly actually cycles through
// different formats rather than hoping for variety.
// NEW — each type now also carries a `mechanic` tag: "drag" (item-to-target
// dragging, where a click-select-then-click-place fallback genuinely helps),
// "tap" (single-tap/click interactions only — a "drag fallback" instruction
// here just confuses Gemini into bolting on unnecessary drag code), "type"
// (keyboard text entry), or "slider" (one continuous drag control, not a
// multi-item drag-to-target game). generateSimulation() below reads this to
// give a mechanic-specific interaction instruction instead of one universal
// rule — previously EVERY type was told "also add a click-select-then-
// click-place fallback alongside drag", which is why tap-only, slider-only,
// and typing-only formats all still came out looking like the same
// drag/click pattern.
export const SIMULATION_TYPES = [
  { id: "dragdrop", label: "ड्र्याग-ड्रप मिलाउने खेल", mechanic: "drag", instruction: "एउटा ड्र्याग-एन्ड-ड्रप मिलाउने खेल बनाउनुहोस् — साना वस्तु/शब्द/तस्विर (कार्ड) तानेर सही ठाउँ, जोडी, वा समूहमा राख्नुपर्ने।" },
  { id: "labeling", label: "लेबल गर्ने चित्र/नक्सा", mechanic: "drag", instruction: "एउटा लेबल गर्नुपर्ने चित्र वा नक्सा बनाउनुहोस् — इनलाइन SVG/CSS ले कोड गरिएको एउटा दृश्य (नक्सा, चित्र, वा रेखाचित्र) मा विद्यार्थीले सही नाम/लेबल ट्याप वा तानेर सही ठाउँमा राख्नुपर्ने।" },
  { id: "ordering", label: "क्रम मिलाउने खेल", mechanic: "drag", instruction: "एउटा क्रम मिलाउने (sequencing/timeline) खेल बनाउनुहोस् — घटना, चरण, वा तथ्यहरूलाई सही क्रममा तानेर वा ट्याप गरेर मिलाउनुपर्ने।" },
  { id: "sorting", label: "वर्गीकरण खेल", mechanic: "drag", instruction: "एउटा वर्गीकरण (sorting/categorizing) खेल बनाउनुहोस् — विभिन्न वस्तु/तथ्य/उदाहरणहरूलाई सही समूह वा बाकसमा तानेर वा ट्याप गरेर छुट्याउनुपर्ने।" },
  { id: "scenario", label: "निर्णय सिमुलेसन", mechanic: "tap", instruction: "एउटा दृश्य-आधारित निर्णय सिमुलेसन बनाउनुहोस् — विद्यार्थीले एउटा परिस्थिति देखेर विकल्पमध्ये छनोट गर्ने, र प्रत्येक छनोटले फरक-फरक नतिजा/अर्को चरण देखाउने (branching)।" },
  { id: "memory", label: "जोडा मिलाउने कार्ड खेल", mechanic: "tap", instruction: "एउटा कार्ड पल्टाउने सम्झना/जोडा मिलाउने खेल (memory/flip-card matching) बनाउनुहोस् — कार्डहरू पल्टाएर सम्बन्धित जोडा (जस्तै शब्द र अर्थ, वा चित्र र नाम) फेला पार्नुपर्ने। यो ढाँचा फ्ल्याट/बोरिङ नराखी विशेष रूपमा जीवन्त बनाउनुहोस्:\n- हरेक कार्डको नपल्टिएको पछाडिको पाटो सादा \"कार्ड #N\" जस्तो एकरङी फ्ल्याट टेक्स्ट-मात्र कहिल्यै नराख्नुहोस् — बरु आकर्षक ग्रेडियन्ट ब्याकग्राउन्डमाथि ठूलो 🎴/❓ इमोजी वा दोहोरिने साधारण ज्यामितीय ढाँचा राख्नुहोस्; सबै नपल्टिएका कार्ड एउटै शैलीमा उस्तै देखिनुपर्छ, तर सपाट/उदास होइन।\n- कार्ड पल्टाउँदा वास्तविक 3D-फ्लिप एनिमेसन देखियोस् (कन्टेनरमा perspective राखी transform: rotateY(...) र transition: transform .45s cubic-bezier(.4,.2,.2,1) जस्तै प्रयोग गर्नुहोस्) — तत्काल स्विच/जम्प होइन, घुमेर देखिनुपर्छ।\n- एकैचोटि बढीमा २ वटा कार्ड मात्र पल्टिन मिल्ने बनाउनुहोस् (मानक मेमोरी-गेम नियम)। जोडी नमिलेमा छोटो (~0.8-1 सेकेन्ड) पर्खेर दुवै आफैं फर्केर बन्द हुनुपर्छ; जोडी मिलेमा ती दुई कार्ड सोही ठाउँमा हल्का हरियो ग्लो/✓ चिन्हसहित लक भई बस्नुपर्छ (फेरि पल्टाउन नमिल्ने)।\n- स्क्रिनको एउटा कुनामा खेल सुरु भएदेखि हरेक सेकेन्ड बढ्दै जाने ⏱️ ००:०० जस्तो समय-सूचक देखाउनुहोस् (केवल गति/हौसलाका लागि, अंकमा असर पार्दैन)।\n- लगातार पहिलो प्रयासमै सही जोडी भेट्टाउँदै गएमा (जस्तै लगातार ३+) त्यो जोडीको ग्लो अझ बलियो हुने वा छोटो \"राम्रो!\" जस्तो सानो पपअप देखाई निरन्तर सफलताको महसुस दिनुहोस्।\n- कार्डको अगाडिको पाटो (पल्टिएपछि देखिने) मा वास्तविक सामग्री (शब्द/चित्र/इमोजी + लेबल) माथिको नियम ४क/४ग अनुसार नै ठूलो, स्पष्ट, राम्रो कन्ट्रास्टमा देखाउनुहोस्।" },
  { id: "hotspot", label: "नक्सा/दृश्य अन्वेषण", mechanic: "tap", instruction: "एउटा हटस्पट-अन्वेषण सिमुलेसन बनाउनुहोस् — इनलाइन SVG/CSS वा ठूला इमोजीले बनाएको एउटा नक्सा वा दृश्यमा विभिन्न ठाउँहरूमा ट्याप गर्दा त्यस ठाउँसँग सम्बन्धित जानकारी/तथ्य देखिने। हरेक ट्याप गर्न मिल्ने ठाउँ इमोजी वा स्पष्ट नेपाली लेबलले चिनिनुपर्छ, अमूर्त खाली आकार मात्र नहोस्।" },
  { id: "fillblank", label: "रिक्त स्थान भर्ने खेल", mechanic: "drag", instruction: "एउटा रिक्त-स्थान भर्ने खेल बनाउनुहोस् — वाक्य/अनुच्छेदमा छुटेका ठाउँमा सही शब्द तानेर वा ट्याप गरेर भर्नुपर्ने (शब्द बैंकबाट छान्ने)।" },
  { id: "buildsim", label: "निर्माण/जोड्ने सिमुलेसन", mechanic: "tap", instruction: "एउटा चरणबद्ध निर्माण/जोड्ने सिमुलेसन बनाउनुहोस् — विद्यार्थीले सही क्रममा भाग/तत्वहरू ट्याप/क्लिक गरेर थप्दै कुनै संरचना, प्रक्रिया, वा दृश्य पूरा गर्नुपर्ने।" },
  { id: "resource", label: "स्रोत व्यवस्थापन सिमुलेसन", mechanic: "slider", instruction: "एउटा स्रोत-व्यवस्थापन सिमुलेसन बनाउनुहोस् — विद्यार्थीले स्लाइडर/बटन/छनोटहरू प्रयोग गरी स्रोत वा निर्णय बाँड्ने, र त्यसको नतिजा/असर तुरुन्तै दृश्य रूपमा देखिने।" },
  { id: "process", label: "प्रक्रिया सिमुलेसन", mechanic: "tap", instruction: "एउटा प्रक्रिया-सिमुलेसन बनाउनुहोस् — कुनै प्राकृतिक वा सामाजिक प्रक्रियाका चरणहरूमा ट्याप गर्दै अगाडि बढ्दा हरेक चरणमा दृश्य परिवर्तन र छोटो व्याख्या देखिने।" },
  { id: "puzzle", label: "टुक्रा जोड्ने पजल", mechanic: "drag", instruction: "एउटा टुक्रा जोड्ने (jigsaw-जस्तो) पजल बनाउनुहोस् — इनलाइन SVG/CSS ले बनाइएको चित्र/नक्सालाई टुक्राहरूमा छुट्याई विद्यार्थीले तानेर सही ठाउँमा जोड्नुपर्ने।" },
  { id: "wordsearch", label: "शब्द खोज्ने पजल", mechanic: "tap", instruction: "एउटा अक्षर-ग्रिड शब्द खोज्ने खेल बनाउनुहोस् — पाठसँग सम्बन्धित शब्दहरू ग्रिडभित्र लुकाइएको हुनुपर्छ, विद्यार्थीले एउटा सुरुको अक्षर र त्यसपछि अन्तिम अक्षर क्रमैसँग ट्याप गरी बीचका अक्षरहरू आफैं उज्यालो हुँदै शब्द फेला पार्नुपर्ने (ड्र्याग होइन, दुई-ट्याप छनोट)।" },
  // REMOVED — "crossword" (the sole "type"-mechanic candidate) required
  // typing Devanagari letters into a grid one at a time, which is
  // impractical for Class 5 students and was surfacing repeatedly because
  // it was the ONLY option whenever the round-robin below landed on the
  // "type" mechanic. Left out of the pool entirely rather than left in
  // for a case (English-subject content) this app doesn't have.
  { id: "beforeafter", label: "पहिले-पछि तुलना स्लाइडर", mechanic: "slider", instruction: "एउटा पहिले/पछि तुलना स्लाइडर बनाउनुहोस् — इनलाइन SVG/CSS ले बनाइएका दुई दृश्य (परिवर्तन हुनुअघि र पछि) बीच एउटा तान्न मिल्ने स्लाइडरले छुट्याउने, र फरकहरू लेबल गरिएको हुनुपर्ने।" },
  { id: "maze", label: "मार्ग/भूलभुलैया खेल", mechanic: "tap", instruction: "एउटा भूलभुलैया/मार्ग-खोज्ने खेल बनाउनुहोस् — विद्यार्थीले दिशा-बटन (माथि/तल/देब्रे/दायाँ) थिचेर वा अर्को उपलब्ध खानामा ट्याप गरेर एउटा पात्र वा बिन्दुलाई सही मार्गबाट लक्ष्यसम्म लैजानुपर्ने, बाटोमा पाठसँग सम्बन्धित चेकपोइन्ट/तथ्यहरू राख्न सकिन्छ।" },
  { id: "connectpath", label: "जोड्ने रेखा (कनेक्ट) खेल", mechanic: "tap", instruction: "एउटा कनेक्ट-द-डट जस्तो जोड्ने खेल बनाउनुहोस् — पहिले एउटा वस्तुमा ट्याप गरी छान्ने अनि सम्बन्धित जोडीमा ट्याप गर्दा रेखा जोडिने (दुई-ट्याप छनोट), सही जोडीमा मात्र रेखा बस्ने।" },
  { id: "votesim", label: "मतदान/निर्णय सिमुलेसन", mechanic: "tap", instruction: "एउटा मतदान/सामूहिक निर्णय सिमुलेसन बनाउनुहोस् — विद्यार्थीले कुनै नागरिक/सामाजिक परिस्थितिमा विकल्पहरूमध्ये मत हाल्ने, र नतिजा/तालिका तुरुन्तै अपडेट भई छोटो व्याख्यासहित देखिने।" },
  { id: "dialogue", label: "संवाद-आधारित भूमिका खेल", mechanic: "tap", instruction: "एउटा संवाद-आधारित भूमिका खेल बनाउनुहोस् — कुनै पात्रसँगको कुराकानीमा विद्यार्थीले आफ्नो जवाफ/कार्य छनोट गर्दै जाने, र प्रत्येक छनोटले फरक-फरक संवाद वा नतिजामा लैजाने।" },
  { id: "mapcolor", label: "नक्सा रङ्ग भर्ने खेल", mechanic: "tap", instruction: "एउटा नक्सा/क्षेत्र रङ्ग भर्ने खेल बनाउनुहोस् — इनलाइन SVG ले बाँडिएको नक्सा/क्षेत्रमा ट्याप गर्दा सही श्रेणी अनुसार रङ्ग भरिने, गलत भए फरक संकेत देखिने।" },
  { id: "timelinescrub", label: "घुमाउने समयरेखा", mechanic: "slider", instruction: "एउटा तान्न मिल्ने समयरेखा (timeline slider) बनाउनुहोस् — स्लाइडर तानेर विभिन्न युग/घटनाहरूमा सर्दा दृश्य र छोटो तथ्य/विवरण परिवर्तन हुनुपर्ने।" },
  { id: "bargraph", label: "तान्ने बार-ग्राफ खेल", mechanic: "drag", instruction: "एउटा तान्न मिल्ने बार-ग्राफ खेल बनाउनुहोस् — दिइएको डाटा/तथ्यसँग मिलाउन विद्यार्थीले बारका उचाइहरू तानेर मिलाउनुपर्ने, सही भएमा तुरुन्तै संकेत देखिने।" },
  { id: "spotdifference", label: "फरक पत्ता लगाउने खेल", mechanic: "tap", instruction: "एउटा फरक पत्ता लगाउने खेल बनाउनुहोस् — इनलाइन SVG/CSS वा ठूला इमोजीले बनाइएका उस्तै-उस्तै देखिने दुई दृश्यमा भएका केही फरकहरू विद्यार्थीले ट्याप गरेर फेला पार्नुपर्ने। हरेक वस्तु (झ्याल, ढोका, तार, पैसा, वस्तु आदि) इमोजी वा स्पष्ट लेबलसहितको आकृति भएर नै देखिनुपर्छ — खाली रङ्गीन आयत/वर्गाकारले वस्तु जनाउनु हुँदैन, नत्र विद्यार्थीले के फरक हो भन्ने चिन्नै सक्दैनन्।" },
  { id: "barter", label: "साट्ने/व्यापार सिमुलेसन", mechanic: "drag", instruction: "एउटा साट्ने/व्यापार सिमुलेसन बनाउनुहोस् — विद्यार्थीले वस्तुहरू तानेर साटासाट तालिकामा राख्ने, र त्यो साटासाट उचित/अनुचित हो भनी तुरुन्तै प्रतिक्रिया पाउने।" },
  { id: "familytree", label: "संरचना/रेखाचित्र जोड्ने खेल", mechanic: "drag", instruction: "एउटा संरचना/रेखाचित्र (जस्तै परिवार वा संगठन) जोड्ने खेल बनाउनुहोस् — नाम/भूमिका लेबलहरू तानेर रेखाचित्रको सही स्थानमा राख्नुपर्ने।" },
  { id: "compassdir", label: "दिशा पत्ता लगाउने खेल", mechanic: "slider", instruction: "एउटा दिशा/कम्पास पत्ता लगाउने खेल बनाउनुहोस् — इनलाइन SVG ले बनाइएको नक्सा/दृश्य हेरी विद्यार्थीले कम्पासको सुई तानेर घुमाई सही दिशामा मिलाउनुपर्ने।" },
  { id: "balancescale", label: "ब्यालेन्स स्केल तुलना खेल", mechanic: "drag", instruction: "एउटा ब्यालेन्स-स्केल तुलना खेल बनाउनुहोस् — वस्तु/तौल तानेर स्केलका दुई पल्लामा राख्दा नतिजा (कुन बढी/कम, वा सन्तुलन मिल्यो कि मिलेन) तुरुन्तै दृश्य रूपमा देखिने।" },
  { id: "seasoncycle", label: "ऋतु/चक्र सिमुलेसन", mechanic: "tap", instruction: "एउटा चक्र-सिमुलेसन बनाउनुहोस् (जस्तै ऋतु, जल-चक्र, वा खेती-चक्र) — ट्याप गर्दै चक्रका चरणहरूमा अगाडि बढ्दा दृश्य परिवर्तन हुँदै हरेक चरणमा छोटो तथ्य देखिने।" },
];

// Mechanic-specific interaction instruction, injected once per generation
// instead of the old always-on "add a click-fallback next to drag" rule.
// Only the "drag" mechanic actually needs the fallback/pointer-capture
// guidance; "tap", "type" and "slider" formats get their own precise,
// narrower instruction so Gemini doesn't bolt on drag machinery they don't
// need (which is what was producing the same drag/click pattern every time).
const MECHANIC_INSTRUCTIONS = {
  drag: `यो ढाँचाको मुख्य अन्तरक्रिया वस्तु तानेर (drag) सही ठाउँमा राख्नु हो। साथसाथै "पहिले एउटा वस्तुमा क्लिक/ट्याप गरेर छान्ने, अनि लक्ष्यमा क्लिक/ट्याप गरेर राख्ने" (click-select-then-click-place) विकल्प पनि अनिवार्य रूपमा दिनुहोस् — किनकि शिक्षकले माउसले सटीक ड्र्याग गर्नुभन्दा दुई क्लिक गर्नु बढी भरपर्दो हुन्छ। तान्न मिल्ने हरेक तत्वमा mousedown/mousemove/mouseup को सट्टा Pointer Events (pointerdown, pointermove, pointerup, pointercancel) प्रयोग गर्नुहोस् र element.setPointerCapture(event.pointerId) पनि कल गर्नुहोस्; CSS मा touch-action: none; र user-select: none; राख्नुहोस्।`,
  tap: `यो ढाँचाको मुख्य अन्तरक्रिया सिधै क्लिक/ट्याप गर्नु मात्र हो — यसमा कुनै ड्र्याग-ड्रप, स्लाइडर, वा टाइप-गर्ने संयन्त्र नथप्नुहोस्; ड्र्याग/pointer-capture/click-fallback जस्ता कुरा यहाँ आवश्यक छैनन्, केवल onClick ह्यान्डलर भए पुग्छ। हरेक क्लिक गर्न मिल्ने तत्व स्पष्ट रूपमा क्लिक-मिल्ने देखिनुपर्छ (कर्सर पोइन्टर, होभर/एक्टिभ प्रतिक्रिया)।`,
  type: `यो ढाँचाको मुख्य अन्तरक्रिया किबोर्डबाट टाइप गर्नु हो — <input> वा contenteditable खाना प्रयोग गरी विद्यार्थीले अक्षर/शब्द टाइप गर्ने। ड्र्याग वा स्लाइडर यहाँ नथप्नुहोस्; टाइप गरेपछि स्वतः वा "जाँच्नुहोस्" बटनबाट सही/गलत जाँचिनुपर्छ।`,
  slider: `यो ढाँचाको मुख्य अन्तरक्रिया एउटा मात्र निरन्तर तान्न मिल्ने नियन्त्रण (<input type="range"> वा एउटै custom drag-handle) हो, धेरै वस्तु एक-अर्कोमा तान्ने खेल होइन। यसमा multi-item ड्र्याग-ड्रप वा click-select-then-click-place नथप्नुहोस् — स्लाइडर/ह्यान्डल एउटै ठाउँमा राखी तान्दा/सार्दा मान/दृश्य परिवर्तन हुनेगरी बनाउनुहोस्, र किबोर्ड एरो-कीले पनि सार्न मिल्ने बनाउनुहोस्।`,
};

// FIX — variety was still landing on drag/click ~9 times out of 10 despite
// this function already avoiding exact repeats. The real cause: of the 28
// types above, 23 are tagged mechanic "drag" or "tap" and only 5 are
// "type"/"slider" — a uniform random pick across all 28 types lands on
// drag/tap ~82% of the time purely by the pool's shape, regardless of
// repeat-avoidance. This also barely helped across DIFFERENT lessons at
// all: usedTypeIds only ever contains this same lesson's own past
// simulations, so a teacher generating one simulation per lesson (the
// common case) got a fresh uniform-over-28 draw every single time — still
// ~82% drag/tap on every lesson. Fixed by picking the MECHANIC first,
// rotating round-robin across all four (drag/tap/type/slider) so each gets
// equal turns regardless of how many concrete game types fall under it,
// THEN picking a not-yet-used type within that mechanic.
const SIMULATION_MECHANICS = ["drag", "tap", "slider"];
export function pickNextSimulationType(usedTypeIds = []) {
  const usedTypes = SIMULATION_TYPES.filter((t) => usedTypeIds.includes(t.id));
  const mechanicCounts = Object.fromEntries(SIMULATION_MECHANICS.map((m) => [m, usedTypes.filter((t) => t.mechanic === m).length]));
  const minCount = Math.min(...SIMULATION_MECHANICS.map((m) => mechanicCounts[m]));
  const leastUsedMechanics = SIMULATION_MECHANICS.filter((m) => mechanicCounts[m] === minCount);
  const chosenMechanic = leastUsedMechanics[Math.floor(Math.random() * leastUsedMechanics.length)];
  const candidatesInMechanic = SIMULATION_TYPES.filter((t) => t.mechanic === chosenMechanic);
  const unusedInMechanic = candidatesInMechanic.filter((t) => !usedTypeIds.includes(t.id));
  const pool = unusedInMechanic.length ? unusedInMechanic : candidatesInMechanic.filter((t) => t.id !== usedTypeIds[usedTypeIds.length - 1]);
  const list = pool.length ? pool : candidatesInMechanic;
  return list[Math.floor(Math.random() * list.length)];
}

// NEW — generates one complete, self-contained interactive simulation/game
// for a lesson, built around whichever `simulationType` is passed in (see
// pickNextSimulationType above — the caller decides the mechanic, this
// function just builds it). Returned as a single HTML string with
// everything inline (CSS + JS, no external files/CDNs, since it has to
// run offline in a sandboxed iframe on a phone in a classroom with no
// reliable internet).
// Deliberately NOT JSON mode — the payload itself IS the artifact, so
// asking for raw HTML text and stripping any ```html fence around it is
// both simpler and less likely to truncate/escape badly than smuggling a
// large HTML document inside a JSON string field.
// Cleans a raw Gemini text response into a validated HTML document string,
// or throws if it isn't usable. Shared by both the initial generation and
// the self-review pass below (both ask Gemini for one full HTML document).
// NEW — also rejects a response that doesn't reach a closing </html>: that
// almost always means the generation got cut off mid-document (hit the
// token limit, or some other truncation) rather than a genuine "Gemini
// refused" case, which the caller can now catch and retry automatically
// instead of surfacing a broken half-page to the teacher.
function extractHtmlDoc(raw) {
  let html = (raw || "").trim();
  html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const docStart = html.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (docStart > 0) html = html.slice(docStart);
  if (!html || docStart === -1) {
    // FIX — tagged `.truncated = true` (see callGemini's finishReason
    // check above for why this tag exists): an empty/unusable response is
    // a content problem a fresh attempt can fix, not a network failure.
    const err = new Error("Gemini ले सिमुलेसन बनाउन सकेन। जवाफको सुरुवात: " + (html ? html.slice(0, 300) : "(खाली प्रतिक्रिया)"));
    err.truncated = true;
    throw err;
  }
  if (!/<\/html>\s*$/i.test(html)) {
    const err = new Error("Gemini को जवाफ अधुरो/कटिएको देखियो (</html> भेटिएन)।");
    err.truncated = true;
    throw err;
  }
  return html;
}

// SAFETY NETS applied to any HTML doc before it's shown to a teacher —
// shared by both the initial generation and the self-review pass, since
// the review pass rewrites the whole document and could in principle
// reintroduce either issue.
function applySimulationSafetyNets(html) {
  // Despite the prompt's instructions, Gemini occasionally still emits an
  // <img src="..."> pointing at a file that doesn't exist (nothing is
  // hosting it — this runs fully offline in a sandboxed iframe). Rather
  // than let students see a broken-image icon, strip any such tags
  // outright; the surrounding text/layout still works, it just loses that
  // one (non-functional) picture.
  html = html.replace(/<img\b[^>]*>/gi, "");
  // NEW — guaranteed backstop for the "no pre-ticked answer" rule (see the
  // giant prompt's rule about checked/selected/correct-indicators below).
  // The prompt asks Gemini never to render an option as checked/selected
  // or "correct"-colored on first load, but that's still just an
  // instruction — this strips any literal checked/selected boolean
  // attribute Gemini emits in the raw markup regardless of whether it
  // followed the prompt, so a pre-ticked answer can never reach a
  // student's screen even on a generation that ignored the rule. Requires
  // whitespace immediately before the attribute name so it never touches
  // something like data-checked="...".
  html = html.replace(/\s+(checked|selected)(\s*=\s*(["']).*?\3)?(?=[\s/>])/gi, "");
  // Rule 5 ("स्क्रिनभित्रै अटाउने नियम") is the single most detailed
  // instruction in this prompt, but it's still just an instruction —
  // Gemini sometimes only partially follows it. Force the outer page to
  // be non-scrolling with a hardening stylesheet injected LAST (right
  // before </head>) with !important, so it wins over anything Gemini
  // wrote. This only touches html/body — it never overrides a more
  // specific inner selector like ".game-area{overflow-y:auto}" that a
  // simulation may legitimately use for a scrollable content area.
  // NEW — also adds an emoji-capable font fallback on body. These
  // simulations lean heavily on emoji to label concrete objects (rule 12
  // in the prompt), but Gemini's own font-family choice is usually just a
  // Devanagari/Latin web-safe stack — on older school lab PCs (common
  // Windows builds with no color-emoji font installed) that renders emoji
  // as a blank box or ".notdef" tofu glyph instead of the picture. Listing
  // the common color-emoji font families as fallbacks on body (not
  // !important — so any more specific font-family Gemini set on a
  // particular element still wins for that element) means the OS picks
  // whichever one it actually has instead of falling through to nothing.
  // FIX — "फन्ट फ्लेक्सिबल" request narrowed the other way too: text anywhere
  // in the app (or a print/PDF) must be ONLY Kalimati (Devanagari) or Times
  // New Roman (Latin), no other typeface. This simulation iframe used to
  // fall back to 'Noto Sans Devanagari'/'Segoe UI' for its actual text —
  // replaced with the same 'Kalimati'/'Times New Roman' pair the rest of the
  // app uses. The color-emoji names stay: those cover emoji glyphs (a
  // separate Unicode range no text font — Kalimati or Times New Roman —
  // draws at all), not body text, so keeping them doesn't reintroduce an
  // extra text font.
  const scrollHardening = `<style>html,body{margin:0!important;padding:0!important;overflow:hidden!important;width:100vw!important;height:100vh!important;box-sizing:border-box!important}body{font-family:'Kalimati','Times New Roman','Noto Color Emoji','Segoe UI Emoji','Apple Color Emoji','Noto Emoji',serif}</style>`;
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, scrollHardening + "</head>") : scrollHardening + html;
  // NEW — reusable motion/depth utility classes (ss-bounce/ss-pulse-idle/
  // ss-glass — see rule 13क in the generation prompt) PLUS the mascot's
  // idle/reaction keyframes. Defined here (guaranteed present) rather than
  // relying on Gemini to write its own keyframes, so a generation that
  // just adds the class name gets working motion regardless of whether it
  // authored any animation CSS itself.
  const motionStyles = `<style>.ss-bounce{transition:transform .3s cubic-bezier(.34,1.56,.64,1)!important}.ss-bounce:hover,.ss-bounce:active{transform:scale(1.06)}@keyframes ssPulseIdle{0%,100%{transform:scale(1)}50%{transform:scale(1.035)}}.ss-pulse-idle{animation:ssPulseIdle 2.6s ease-in-out infinite}.ss-glass{background:linear-gradient(145deg, rgba(255,255,255,0.35), rgba(255,255,255,0.08));backdrop-filter:blur(2px);box-shadow:0 6px 16px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.4)}#ssMascotWrap{position:fixed;left:10px;bottom:10px;width:60px;height:60px;pointer-events:none;z-index:2147483000;filter:drop-shadow(0 3px 6px rgba(0,0,0,.3));animation:ssMascotIdle 2.4s ease-in-out infinite}#ssMascotWrap.ss-m-correct{animation:ssMascotCorrect .6s ease!important}#ssMascotWrap.ss-m-wrong{animation:ssMascotWrong .5s ease!important}#ssMascotWrap.ss-m-cheer{animation:ssMascotCheer 1.4s ease!important}@keyframes ssMascotIdle{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-6px) rotate(-3deg)}}@keyframes ssMascotCorrect{0%{transform:scale(1)}30%{transform:scale(1.25) translateY(-16px)}60%{transform:scale(.95) translateY(2px)}100%{transform:scale(1)}}@keyframes ssMascotWrong{0%,100%{transform:translateX(0) rotate(0)}20%{transform:translateX(-6px) rotate(-8deg)}40%{transform:translateX(6px) rotate(8deg)}60%{transform:translateX(-4px) rotate(-5deg)}80%{transform:translateX(4px) rotate(5deg)}}@keyframes ssMascotCheer{0%{transform:scale(1) rotate(0)}20%{transform:scale(1.3) rotate(-8deg)}40%{transform:scale(1.2) rotate(8deg)}60%{transform:scale(1.3) rotate(-6deg)}80%{transform:scale(1.15) rotate(4deg)}100%{transform:scale(1) rotate(0)}}@media (max-width:480px){#ssMascotWrap{width:44px;height:44px}}</style>`;
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, motionStyles + "</head>") : motionStyles + html;
  // NEW — the mascot itself: a small always-present, pointer-events:none
  // (so it can NEVER block a click, even sitting in a corner) SVG buddy
  // that idle-bounces on its own and reacts via window.mascotReact(state)
  // — 'correct' | 'wrong' | 'cheer'. Wired automatically into the sound
  // functions below, so it reacts in sync with sound with zero extra
  // effort from Gemini (it only needs to keep calling the sound functions
  // it was already required to call).
  const mascotHtml = `<div id="ssMascotWrap"><svg viewBox="0 0 100 100" width="60" height="60"><ellipse cx="50" cy="58" rx="34" ry="30" fill="#8B5CF6" stroke="#2E1F55" stroke-width="4"/><circle cx="36" cy="52" r="8" fill="#fff" stroke="#2E1F55" stroke-width="2.5"/><circle cx="64" cy="52" r="8" fill="#fff" stroke="#2E1F55" stroke-width="2.5"/><circle cx="37" cy="53" r="3.2" fill="#1C1006"/><circle cx="65" cy="53" r="3.2" fill="#1C1006"/><path d="M40 68 Q50 76 60 68" stroke="#2E1F55" stroke-width="3.5" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="60" rx="7" ry="12" fill="#8B5CF6" stroke="#2E1F55" stroke-width="3" transform="rotate(-20 20 60)"/><ellipse cx="80" cy="60" rx="7" ry="12" fill="#8B5CF6" stroke="#2E1F55" stroke-width="3" transform="rotate(20 80 60)"/></svg></div>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, mascotHtml + "</body>") : html + mascotHtml;
  const mascotScript = `<script>(function(){function el(){return document.getElementById('ssMascotWrap');}window.mascotReact=function(state){try{var e=el();if(!e)return;e.classList.remove('ss-m-correct','ss-m-wrong','ss-m-cheer');void e.offsetWidth;var cls=state==='correct'?'ss-m-correct':state==='wrong'?'ss-m-wrong':state==='cheer'?'ss-m-cheer':null;if(cls)e.classList.add(cls);var dur=state==='cheer'?1450:state==='correct'?650:550;setTimeout(function(){var e2=el();if(e2)e2.classList.remove('ss-m-correct','ss-m-wrong','ss-m-cheer');},dur);}catch(err){}};})();</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, mascotScript + "</body>") : html + mascotScript;
  // NEW — guaranteed backstop for Devanagari-numeral consistency. Scores,
  // counters, and progress indicators ("३/१०") are built by Gemini's own
  // JS at runtime, so nothing in the static HTML can be regex-fixed ahead
  // of time — this instead injects a small script that walks every text
  // node on load AND on every later DOM change (MutationObserver, since
  // scores/counters update live as the class plays) and swaps any ASCII
  // 0-9 digit it finds for its Devanagari equivalent. Runs regardless of
  // whether Gemini's own generated code used ASCII digits anywhere, so
  // "०-९ only" holds even on a generation that didn't follow the prompt.
  const devanagariScript = `<script>(function(){var d={'0':'०','1':'१','2':'२','3':'३','4':'४','5':'५','6':'६','7':'७','8':'८','9':'९'};function conv(s){return s.replace(/[0-9]/g,function(c){return d[c];});}function skip(n){return n&&n.tagName&&(n.tagName==='SCRIPT'||n.tagName==='STYLE');}function walk(n){if(n.nodeType===3){if(!skip(n.parentNode)&&/[0-9]/.test(n.nodeValue))n.nodeValue=conv(n.nodeValue);}else if(n.nodeType===1&&!skip(n)){for(var i=0;i<n.childNodes.length;i++)walk(n.childNodes[i]);}}function run(){try{walk(document.body);}catch(e){}}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();try{new MutationObserver(function(muts){muts.forEach(function(m){if(m.type==='characterData'){var n=m.target;if(!skip(n.parentNode)&&/[0-9]/.test(n.nodeValue))n.nodeValue=conv(n.nodeValue);}else if(m.type==='childList'){m.addedNodes.forEach(walk);}});}).observe(document.body,{childList:true,subtree:true,characterData:true});}catch(e){}})();</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, devanagariScript + "</body>") : html + devanagariScript;
  // NEW — window.playCorrectSound()/window.playWrongSound()/
  // window.playCelebrationSound()/window.playClickSound(), always defined
  // regardless of whether Gemini's generated JS calls them. Web Audio API
  // tones (softer/rounder now — see below) plus the browser's built-in
  // SpeechSynthesis for an actual spoken word layered on top, no external
  // file/CDN (has to run fully offline; SpeechSynthesis is a browser API,
  // not a network fetch, so this still works with no internet). The
  // generation prompt tells Gemini to call these from its own
  // correct/wrong/completion handlers; defining them here means a
  // generation that forgets simply gets no sound instead of a crashing
  // "... is not a function" error.
  // - playWrongSound: a soft two-note descending "hmm-hm" (triangle wave,
  //   quiet) instead of the earlier harsh sawtooth buzzer, plus a calm,
  //   supportive spoken line — slower rate, slightly lower pitch, so it
  //   never sounds harsh or discouraging.
  // - playCorrectSound: a warm 3-note ascending chime (triangle + a
  //   quiet sine layer underneath for roundness) plus an energetic
  //   spoken word — one of a few short phrases picked at random (so it
  //   doesn't get repetitive), spoken faster and higher-pitched than the
  //   old flat "सही!"/"गलत।" pair, with the pitch nudging up slightly on
  //   a longer correct-answer streak for extra excitement.
  // - playCelebrationSound: layered short bandpass-filtered noise bursts
  //   approximate applause, a few pitch-swept "whoop" tones layered in,
  //   and a spoken "बधाई छ, सबै सही!" right at the start — meant to be
  //   triggered at the exact same moment as the end-of-game confetti/
  //   color-burst celebration (see rule 10 below).
  // - playClickSound: a soft, short neutral tap/pop for lighter UI
  //   feedback (selecting a card, starting a drag, etc.) — kept quiet,
  //   no spoken word (would be too much noise for every small tap).
  // NEW — speak() below tries to find an actual Nepali (or failing that,
  // Hindi, whose phonemes are close enough to read Devanagari sanely)
  // voice via speechSynthesis.getVoices(); if the device has neither
  // installed, it just falls back to whatever default voice the browser
  // has, which is still a real human-sounding TTS voice, not a beep.
  // Wrapped in try/catch and a `window.speechSynthesis` existence check
  // since not every embedded/sandboxed browser exposes it — failure here
  // is silent and non-fatal, same as every other sound call.
  // NEW — mascot reactions (window.mascotReact, see above) are wired
  // directly into these calls, and playCelebrationSound now also fires a
  // brief full-screen radial pulse timed to the clap bursts — so both the
  // mascot and a sound-reactive visual flash come for free the moment
  // Gemini calls the sound function it was already required to call, no
  // extra instruction-compliance needed for either.
  const soundScript = `<script>(function(){var Ctx=window.AudioContext||window.webkitAudioContext;var ctx=null;function getCtx(){if(!ctx&&Ctx)ctx=new Ctx();return ctx;}function tone(freq,start,dur,type,vol){var c=getCtx();if(!c)return;var o=c.createOscillator();var g=c.createGain();o.type=type;o.frequency.value=freq;g.gain.value=vol;o.connect(g);g.connect(c.destination);var t=c.currentTime+start;o.start(t);g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);o.stop(t+dur+0.02);}function noiseBurst(start,dur,lo,hi,vol){var c=getCtx();if(!c)return;var n=Math.max(1,Math.floor(c.sampleRate*dur));var buf=c.createBuffer(1,n,c.sampleRate);var d=buf.getChannelData(0);for(var i=0;i<n;i++)d[i]=Math.random()*2-1;var src=c.createBufferSource();src.buffer=buf;var bp=c.createBiquadFilter();bp.type='bandpass';bp.frequency.value=(lo+hi)/2;bp.Q.value=1.2;var g=c.createGain();src.connect(bp);bp.connect(g);g.connect(c.destination);var t=c.currentTime+start;g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(0.001,t+dur);src.start(t);src.stop(t+dur+0.02);}function speak(text,delay,opts){try{console.log('[SS-DEBUG][iframe] speak() called, text=',text,'delay=',delay,'opts=',opts);}catch(e){}try{setTimeout(function(){try{console.log('[SS-DEBUG][iframe] posting __ssSpeak to parent now');window.parent.postMessage({__ssSpeak:true,text:text,opts:opts||{}},'*');console.log('[SS-DEBUG][iframe] postMessage call completed (no throw)');}catch(e){console.log('[SS-DEBUG][iframe] postMessage threw:',e);}},delay||0);}catch(e){console.log('[SS-DEBUG][iframe] speak() outer catch:',e);}}var ssCorrectPhrases=['सही!','एकदम सही!','साबास!','उत्कृष्ट!','मिल्यो!'];var ssCorrectStreak=0;window.playCorrectSound=function(){ssCorrectStreak++;try{tone(523,0,0.13,'triangle',0.17);tone(523,0,0.13,'sine',0.09);tone(659,0.1,0.13,'triangle',0.17);tone(659,0.1,0.13,'sine',0.09);tone(784,0.2,0.26,'triangle',0.19);tone(784,0.2,0.26,'sine',0.1);}catch(e){}var phrase=ssCorrectPhrases[Math.floor(Math.random()*ssCorrectPhrases.length)];var pitchBoost=Math.min(1.55,1.25+ssCorrectStreak*0.04);speak(phrase,280,{rate:1.18,pitch:pitchBoost,volume:0.95});try{if(window.mascotReact)window.mascotReact('correct');}catch(e){}};window.playWrongSound=function(){ssCorrectStreak=0;try{tone(260,0,0.16,'triangle',0.13);tone(196,0.15,0.22,'triangle',0.11);}catch(e){}speak('गलत, फेरि प्रयास गर्नुहोस्।',350,{rate:0.88,pitch:0.95,volume:0.78});try{if(window.mascotReact)window.mascotReact('wrong');}catch(e){}};window.playClickSound=function(){try{tone(440,0,0.05,'sine',0.08);}catch(e){}};window.playCelebrationSound=function(){try{var c=getCtx();if(!c)return;for(var i=0;i<16;i++)noiseBurst(Math.random()*1.5,0.05+Math.random()*0.04,1200,3000,0.18+Math.random()*0.12);for(var j=0;j<4;j++){(function(j){var t0=0.1+j*0.25+Math.random()*0.15;var o=c.createOscillator();var g=c.createGain();o.type='sine';var base=300+Math.random()*150;o.frequency.setValueAtTime(base,c.currentTime+t0);o.frequency.exponentialRampToValueAtTime(base*2.2,c.currentTime+t0+0.35);o.frequency.exponentialRampToValueAtTime(base*1.4,c.currentTime+t0+0.6);g.gain.setValueAtTime(0.001,c.currentTime+t0);g.gain.linearRampToValueAtTime(0.13,c.currentTime+t0+0.08);g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+t0+0.7);o.connect(g);g.connect(c.destination);o.start(c.currentTime+t0);o.stop(c.currentTime+t0+0.75);})(j);}}catch(e){}var cheerPhrases=['बधाई छ, सबै सही!','साबास, सबै पूरा भयो!','धेरै राम्रो, सबै सही!'];speak(cheerPhrases[Math.floor(Math.random()*cheerPhrases.length)],100,{rate:1.15,pitch:1.35,volume:1});try{var ov=document.createElement('div');ov.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483001;background:radial-gradient(circle, rgba(255,255,255,0.35), rgba(255,255,255,0) 70%);opacity:0;transition:opacity .12s ease;';document.body.appendChild(ov);var pulses=[0,150,300,460,620,800,980,1150,1350];pulses.forEach(function(t,i){setTimeout(function(){ov.style.opacity=i%2===0?'0.9':'0';},t);});setTimeout(function(){ov.remove();},1700);}catch(e){}try{var confettiHost=document.createElement('div');confettiHost.style.cssText='position:fixed;inset:0;pointer-events:none;z-index:2147483002;overflow:hidden;';document.body.appendChild(confettiHost);if(!document.getElementById('ss-confetti-style')){var st=document.createElement('style');st.id='ss-confetti-style';st.textContent='@keyframes ssConfettiFall{0%{transform:translateY(-10vh) translateX(0) rotate(0deg);opacity:1;}100%{transform:translateY(110vh) translateX(var(--ssDrift,0px)) rotate(var(--ssSpin,360deg));opacity:0.95;}}';document.head.appendChild(st);}var ssColors=['#ff5e5e','#ffb84d','#ffe14d','#7ee787','#4dd0e1','#6ea8ff','#c58cff','#ff7ec8'];var ssPieceCount=70;for(var k=0;k<ssPieceCount;k++){(function(k){var p=document.createElement('div');var isCircle=Math.random()<0.4;var size=6+Math.random()*8;var color=ssColors[Math.floor(Math.random()*ssColors.length)];p.style.cssText='position:absolute;top:-5vh;left:'+(Math.random()*100)+'vw;width:'+size+'px;height:'+(isCircle?size:size*1.6)+'px;background:'+color+';opacity:0.95;'+(isCircle?'border-radius:50%;':'border-radius:2px;');var drift=(Math.random()*220-110)+'px';var spin=(Math.random()*720-360)+'deg';p.style.setProperty('--ssDrift',drift);p.style.setProperty('--ssSpin',spin);var dur=(1.6+Math.random()*1.4);var delay=Math.random()*0.5;p.style.animation='ssConfettiFall '+dur+'s cubic-bezier(.25,.46,.45,.94) '+delay+'s forwards';confettiHost.appendChild(p);})(k);}setTimeout(function(){confettiHost.remove();},3400);}catch(e){}try{if(window.mascotReact)window.mascotReact('cheer');}catch(e){}};})();</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, soundScript + "</body>") : html + soundScript;
  // NEW — generic engagement layer: a combo bar + streak badge (top-right,
  // fed by wrapping the already-defined playCorrectSound/playWrongSound
  // above), a subtle screen-shake on wrong, an idle-nudge hint bubble if
  // the class hasn't clicked/dragged anything in ~8s, and a small
  // always-visible color legend (🟢 ठीक / 🔴 बेठीक). All of this is
  // injected generically here — not left to the per-generation prompt —
  // because it only needs the sound-function hooks and generic DOM/click
  // listeners already guaranteed to exist, so it works identically
  // regardless of how any individual generation structured its markup.
  const engagementStyles = `<style>#ssComboWrap{position:fixed;top:10px;right:10px;display:flex;flex-direction:column;align-items:flex-end;gap:4px;z-index:2147483000;pointer-events:none}#ssComboBar{width:120px;height:8px;border-radius:999px;background:rgba(0,0,0,0.12);overflow:hidden}#ssComboFill{height:100%;width:0%;background:linear-gradient(90deg,#22C55E,#84CC16);transition:width .35s ease}#ssStreakBadge{display:none;align-items:center;gap:4px;background:#F59E0B;color:#fff;font-weight:700;font-size:13px;padding:2px 9px;border-radius:999px;box-shadow:0 2px 6px rgba(0,0,0,.25)}#ssLegend{position:fixed;bottom:52px;right:10px;display:flex;gap:10px;align-items:center;background:rgba(255,255,255,0.88);padding:5px 11px;border-radius:999px;box-shadow:0 2px 8px rgba(0,0,0,.15);font-size:13px;font-weight:600;z-index:2147483000;pointer-events:none;color:#1C1006}#ssIdleHint{position:fixed;left:50%;bottom:76px;transform:translateX(-50%) translateY(10px);background:rgba(28,16,6,0.85);color:#fff;font-size:14px;font-weight:600;padding:8px 16px;border-radius:999px;opacity:0;transition:opacity .35s ease, transform .35s ease;z-index:2147483000;pointer-events:none;white-space:nowrap}#ssIdleHint.ss-show{opacity:1;transform:translateX(-50%) translateY(0)}@keyframes ssShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}body.ss-shake{animation:ssShake .35s ease}@media (max-width:480px){#ssComboBar{width:80px}#ssLegend{font-size:11px;padding:4px 8px}}</style>`;
  html = /<\/head>/i.test(html) ? html.replace(/<\/head>/i, engagementStyles + "</head>") : engagementStyles + html;
  const engagementHtml = `<div id="ssComboWrap"><div id="ssStreakBadge">🔥 <span id="ssStreakCount">0</span></div><div id="ssComboBar"><div id="ssComboFill"></div></div></div><div id="ssLegend"><span>🟢 ठीक</span><span>🔴 बेठीक</span></div><div id="ssIdleHint">👆 अर्को चरण जारी राख्नुहोस्</div>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, engagementHtml + "</body>") : html + engagementHtml;
  const engagementScript = `<script>(function(){var streak=0,maxCombo=8;function updateCombo(){try{var fill=document.getElementById('ssComboFill');if(fill)fill.style.width=Math.min(100,(streak/maxCombo)*100)+'%';var badge=document.getElementById('ssStreakBadge');var cnt=document.getElementById('ssStreakCount');if(badge&&cnt){if(streak>=3){badge.style.display='flex';cnt.textContent=streak;}else{badge.style.display='none';}}}catch(e){}}var origCorrect=window.playCorrectSound;window.playCorrectSound=function(){streak++;updateCombo();try{if(origCorrect)origCorrect();}catch(e){}};var origWrong=window.playWrongSound;window.playWrongSound=function(){streak=0;updateCombo();try{document.body.classList.remove('ss-shake');void document.body.offsetWidth;document.body.classList.add('ss-shake');}catch(e){}try{if(origWrong)origWrong();}catch(e){}};var lastAct=Date.now(),hintCooldown=0;function hideHint(){try{var h=document.getElementById('ssIdleHint');if(h)h.classList.remove('ss-show');}catch(e){}}function showHint(){try{var h=document.getElementById('ssIdleHint');if(h){h.classList.add('ss-show');setTimeout(hideHint,3000);}}catch(e){}}function markAct(){lastAct=Date.now();hideHint();}['click','touchstart','pointerdown','keydown'].forEach(function(ev){document.addEventListener(ev,markAct,{passive:true});});setInterval(function(){var idle=Date.now()-lastAct;if(idle>=8000&&Date.now()-hintCooldown>=8000){showHint();hintCooldown=Date.now();}},1000);})();</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, engagementScript + "</body>") : html + engagementScript;
  // NEW — reports a genuine JS crash back to the parent app via
  // postMessage, so the caller can run a one-shot self-test (load in a
  // hidden iframe, wait briefly, retry once if this fires) before ever
  // showing a broken generation to a teacher. postMessage works even
  // though the iframe is sandbox="allow-scripts" only (no
  // allow-same-origin) — it doesn't require same-origin access.
  const errorReportScript = `<script>window.onerror=function(msg){try{parent.postMessage({ssSimError:String(msg)},'*');}catch(e){}};</script>`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, errorReportScript + "</body>") : html + errorReportScript;
  return html;
}

// NEW — self-review pass. Sends the already-generated HTML back to Gemini
// once more with a condensed checklist covering the issues that have
// actually shown up in practice (duplicate instruction bars, pre-checked
// "correct" options, low-contrast bars, ambiguous items, missing progress
// indicator, etc.) and asks it to return a fixed full document. A single
// one-shot generation follows the (very long) main prompt well most of the
// time, but not always — this catches what slips through instead of
// relying purely on first-pass compliance. If this call fails for any
// reason (timeout, rate limit, malformed output), the caller keeps the
// original html — a working-but-imperfect simulation beats no simulation.
// FIX — `fast` option: छिटो/fast mode used to skip this whole review pass
// (see generateSimulation's skipReview param), which is exactly why fast
// mode was the one reported to sometimes produce blank/empty cards and
// meaningless, content-unrelated puzzles — this 13-point checklist is
// the ONLY thing that ever catches those specific failures; the
// deterministic string-based safety nets in applySimulationSafetyNets
// can strip a stray <img> or a pre-checked box, but they can't judge
// whether a card is blank or a puzzle item is nonsense — that needs
// another look from the model. So fast mode no longer skips review
// entirely; instead it runs this SAME call with a short, targeted
// checklist (only the two failure modes actually reported) and a much
// smaller time/retry budget, so it stays meaningfully faster than the
// full 13-point pass while still catching the failures that matter most.
async function reviewAndFixSimulation(html, type, chapterTitle, lessonTitle, { fast = false } = {}) {
  const prompt = fast ? `तपाईंले तलको एउटा इन्टरएक्टिभ सिमुलेसन/खेलको पूरा HTML पहिल्यै बनाइसक्नुभएको छ (अध्याय: "${chapterTitle}", पाठ: "${lessonTitle || chapterTitle}", ढाँचा: ${type.label})। यो छिटो जाँच हो — केवल तलका दुई समस्या मात्र खोजी सुधार्नुहोस्, अरू केही नबदल्नुहोस्:
1. कुनै पनि कार्ड/वस्तु खाली देखिन्छ कि (इमोजी/आइकन र नेपाली लेबल कुनै पनि नभएको, वा टेक्स्ट/सामग्री पूरै हराएको) — भेटिएमा त्यसमा उपयुक्त इमोजी र स्पष्ट लेबल थप्नुहोस्।
2. कुनै वस्तु/जोडी/प्रश्न अर्थहीन, अस्पष्ट, वा पाठ्यसामग्रीसँग सम्बन्धित नभएको छ कि (जस्तै दुई कोठामा उत्तिकै मिल्ने वस्तु, वा वास्तविक तथ्यमा आधारित नभएको काल्पनिक वस्तु) — भेटिएमा त्यसलाई पाठ्यसामग्रीको वास्तविक तथ्यमा आधारित स्पष्ट, निर्विवाद वस्तुले प्रतिस्थापन गर्नुहोस्।

माथिका दुई समस्यामध्ये कुनै नभेटिएमा, दिइएको HTML लाई जस्ताको त्यस्तै फिर्ता दिनुहोस्। जवाफमा कुनै व्याख्या, markdown फेन्स, वा अगाडि/पछाडिको वाक्य नथप्नुहोस् — ठ्याक्कै <!DOCTYPE html> बाट सुरु भएर </html> मा सकिने एउटै पूर्ण दस्तावेज मात्र दिनुहोस्।

जाँच गर्नुपर्ने HTML:
${html}` : `तपाईंले तलको एउटा इन्टरएक्टिभ सिमुलेसन/खेलको पूरा HTML पहिल्यै बनाइसक्नुभएको छ (अध्याय: "${chapterTitle}", पाठ: "${lessonTitle || chapterTitle}", ढाँचा: ${type.label})। अब एक जना कडा समीक्षकको रूपमा तलका जाँच-सूचीका हरेक बुँदा विरुद्ध जाँच्नुहोस्:

1. निर्देशन/शीर्षक-पाठ ठ्याक्कै एकै ठाउँमा (माथि) मात्र छ, तल वा अरू कतै दोहोरिएको छैन।
2. माथिको निर्देशन-पट्टी र तलको नियन्त्रण-पट्टी (भए) दुवै सामान्य flex-column को normal-flow भाग हुन् — कतै position:fixed/absolute/sticky छैन, र कुनै पट्टीले अर्को सामग्री ढाकेको छैन।
3. कुनै पनि विकल्प/कार्ड/checkbox/radio पेज खुल्नासाथ checked/selected वा "सही"-सूचक रङ/✓ चिन्हसहित देखिँदैन — सबै विकल्प सुरुमा तटस्थ छन्, विद्यार्थीले छानेपछि मात्र सही/गलत देखिन्छ।
4. सही/गलतको प्रतिक्रियामा रङसँगै ✅/❌ जस्तो चिन्ह र छोटो शब्द पनि छ (रङ मात्रमा भर परेको छैन)।
5. हरेक शीर्षक/पट्टीको ब्याकग्राउन्ड र पाठ/आइकनको रङबीच स्पष्ट उच्च कन्ट्रास्ट छ (सेतोमाथि सेतो/फिकामाथि फिका कतै छैन)।
6. वस्तु संख्या ८ देखि १४ भित्र छ, र हरेक वस्तुको सही उत्तर ठ्याक्कै एउटै र निर्विवाद छ (दुई कोठा/श्रेणीमा उत्तिकै मिल्ने अस्पष्ट वस्तु छैन)।
7. सुरुमा एउटा हल भइसकेको "उदाहरण" वस्तु देखाइएको छ।
8. हरेक गलत जवाफमा तुरुन्तै (पहिलो प्रयासमै) छोटो एक-वाक्य कारण देखिन्छ, र लगातार २ पटक गलत भएमा सही उत्तर आफैं छुट्टै देखिने व्यवस्था छ।
9. कति बाँकी छ भन्ने प्रगति-सूचक (जस्तै "३/१०") कतै देखिन्छ।
10. हरेक वास्तविक वस्तु इमोजी वा स्पष्ट नेपाली लेबलसहित चिनिन्छ — खाली अमूर्त आयत/वृत्त छैन।
11. कुनै <img> ट्याग छैन, कुनै तत्व स्क्रिनबाट बाहिर/काटिएको/ओभरल्याप भएको छैन, "फेरि खेल्नुहोस्" बटन सधैं देखिने ठाउँमा छ।
12. वस्तु/कार्डको डाटा-सूची पहिलो लोड र प्रत्येक "फेरि खेल्नुहोस्" मा Fisher-Yates शफल भएर मात्र UI मा देखिन्छ — प्रत्येक "फेरि खेल्नुहोस्" पछि क्रम फेरिन्छ, हरेक पटक ठ्याक्कै उही क्रम देखिँदैन।
13. सही छान्दा window.playCorrectSound(), गलत छान्दा window.playWrongSound() कल गरिएको छ, र अन्त्यको उत्सव-एनिमेसन देखा पर्दा window.playCelebrationSound() पनि कल गरिएको छ (यी फंक्सन पहिल्यै परिभाषित छन्, केवल कल मात्र गर्ने हो)।

यदि माथिका सबै बुँदा पहिल्यै ठीक छन् भने, दिइएको HTML लाई जस्ताको त्यस्तै फिर्ता दिनुहोस्। कुनै बुँदामा समस्या भेटिएमा त्यो/ती मात्र सुधारेर बाँकी सबै जस्ताको त्यस्तै राखी पूरा HTML फर्काउनुहोस्। जवाफमा कुनै व्याख्या, markdown फेन्स, वा अगाडि/पछाडिको वाक्य नथप्नुहोस् — ठ्याक्कै <!DOCTYPE html> बाट सुरु भएर </html> मा सकिने एउटै पूर्ण दस्तावेज मात्र दिनुहोस्।

समीक्षा गर्नुपर्ने HTML:
${html}`;
  // FIX — reduced timeout (was 150000) and retries (was the callGemini
  // default of 2, i.e. up to 3 attempts): this call's failure is already
  // non-fatal (the caller keeps the original html either way), so it
  // should never be allowed to burn as much of the teacher's wait as the
  // main generation call. The fast-mode prompt above is also much
  // shorter/narrower, so it needs less time regardless.
  const raw = await callGemini([{ text: prompt }], { maxOutputTokens: 16000, timeoutMs: fast ? 60000 : 90000, retries: 1 });
  const reviewed = extractHtmlDoc(raw);
  return applySimulationSafetyNets(reviewed);
}

export const generateSimulation = async (chapterTitle, lessonTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", simulationType = null, skipReview = false) => {
  const type = simulationType || pickNextSimulationType();
  const prompt = `तपाईं नेपालको ${classContext}का लागि एउटा इन्टरएक्टिभ (अन्तरक्रियात्मक) सिमुलेसन/खेल बनाउँदै हुनुहुन्छ।


महत्त्वपूर्ण सन्दर्भ — यसले पूरा डिजाइनलाई असर गर्छ: यो विद्यार्थीको आफ्नै मोबाइलमा होइन। शिक्षकले ल्यापटपमा माउस/ट्र्याकप्याडबाट चलाउनुहुन्छ, र प्रोजेक्टरबाट कक्षाकोठाको पर्खालमा ठूलो गरी देखाइन्छ — सम्पूर्ण कक्षाले टाढाबाट हेर्छन्, र शिक्षकले नै क्लिक/ड्र्याग गर्नुहुन्छ (वा विद्यार्थी पालैपालो अगाडि आएर चलाउँछन्)। त्यसैले:
- यो एउटा फराकिलो (landscape) ल्यापटप/प्रोजेक्टर स्क्रिनका लागि हो, साँघुरो फोन स्क्रिनका लागि होइन। कम्तिमा 1280×720 देखि 1920×1080 सम्मको landscape रिजोल्युसनमा राम्रोसँग मिल्नुपर्छ।
- टाढाबाट पढ्न सकिने गरी ठूलो फन्ट-साइज राख्नुहोस्: मुख्य पाठ कम्तिमा 22px, शीर्षक कम्तिमा 34px, महत्त्वपूर्ण लेबल/संख्या कम्तिमा 26px। सानो/पातलो फन्ट प्रोजेक्टरबाट पछाडिको सिटबाट देखिँदैन।
- मुख्य अन्तरक्रिया माउस क्लिक र ड्र्याग हो, औंलाको टच होइन (यद्यपि टच काम गरे नराम्रो हुँदैन)।

अध्याय: "${chapterTitle}"
पाठ: "${lessonTitle || chapterTitle}"

अनिवार्य ढाँचा: ${type.instruction}
यो विषयवस्तुसँग प्रत्यक्ष सान्दर्भिक बनाउनुहोस् — सामान्य वा फितलो होइन, ठ्याक्कै यही अध्यायका तथ्य/अवधारणाहरूमा आधारित। माथि दिइएको पाठ्यसामग्री/सन्दर्भबाट वास्तविक तथ्य, नाम, स्थान, र उदाहरणहरू निकालेर प्रयोग गर्नुहोस् — काल्पनिक वा सामान्य उदाहरण नबनाउनुहोस्।
यदि पाठको विषय अमूर्त छ (जस्तै अधिकार, कर्तव्य, मूल्य-मान्यता, भावना, नियम, सुशासन) र सीधै चित्रमा देखाउन गाह्रो छ भने, त्यसलाई कुनै खाली प्रतीकात्मक आकार (जस्तै अस्पष्ट त्रिकोण/वृत्त वा चिन्ह) ले नजनाई, एउटा चिनिने साधारण दृश्य/घटनाको रूपमा देखाउनुहोस् — जस्तै "शिक्षा पाउने अधिकार" जनाउन "किताब बोकेर स्कुल जाँदै गरेको बच्चा 🧑‍🎓📖" को दृश्य र छेउमा सोझो लेबल राख्नुहोस्। विद्यार्थीले अमूर्त प्रतीक हेरेर अर्थ अड्कल्न सक्दैनन्, तर आफूले दैनिक देखेजस्तो परिचित दृश्य/कार्य हेरेर तुरुन्तै बुझ्छन् — हरेक अमूर्त अवधारणालाई यसरी नै कुनै न कुनै ठोस, परिचित दृश्यमा बदलेर मात्र प्रयोग गर्नुहोस्।
महत्त्वपूर्ण: साधारण "प्रश्न सोध्ने र विकल्पमध्ये एउटा क्लिक गर्ने" बहुविकल्पीय प्रश्नोत्तर (MCQ quiz) कहिल्यै नबनाउनुहोस् — माथि तोकिएको ढाँचामै बनाउनुहोस्, अर्को ढाँचामा होइन।

सामग्रीको स्तर — यो सबैभन्दा महत्त्वपूर्ण नियम हो:
- कम्तिमा ८ देखि बढीमा १४ वटासम्म फरक-फरक अन्तरक्रियात्मक वस्तु/जोडी/चरण/राउन्ड हुनुपर्छ (जस्तै: ८+ जोडा मिलाउने कार्ड, ८+ लेबल गर्नुपर्ने ठाउँ, ८+ क्रम मिलाउने वस्तु, ८+ वर्गीकरण गर्नुपर्ने वस्तु, आदि — ढाँचा जे भए पनि सोही अनुसार गन्ती लागू हुन्छ)। ३-४ वटा मात्र भएको सिमुलेसन अस्वीकार्य छ — यो धेरै पातलो र छिट्टै सकिने हुन्छ। १४ भन्दा बढी कहिल्यै नथप्नुहोस् — यति धेरै भयो भने एउटै कक्षा-अवधिमा सक्न गाह्रो हुन्छ र शिक्षकको समय व्यवस्थापन बिग्रन्छ। तर पाठमा साँच्चै ८ वटा भन्दा कम मात्र फरक-फरक तथ्य/वस्तु भएमा गन्ती पुर्‍याउन झूटो/नबनेको/दोहोरिने तथ्य नथप्नुहोस् — यस्तो अवस्थामा जति साँचो तथ्य छन् त्यति मात्र राख्नुहोस्, संख्या भन्दा शुद्धता महत्त्वपूर्ण हो।
- यति धेरै वस्तु राख्दा पनि स्क्रिनमा नअटाई ओभरफ्लो हुनु/लुक्नु हुँदैन — तलको "स्क्रिनभित्रै अटाउने नियम" अनिवार्य रूपमा पालना गर्नुहोस्। धेरै वस्तु भएमा एकैचोटि सबै नदेखाई ग्रिड/राउन्डमा विभाजन गर्न सक्नुहुन्छ (जस्तै "राउन्ड १ / ८", अर्को बटनले अर्को समूह देखाउने), तर कुनै पनि वस्तु स्क्रिनबाट बाहिर गई नदेखिने वा काटिने हुनु हुँदैन।
- हरेक वस्तु/तथ्य माथिको पाठ्यसामग्रीबाट सिकिएको वास्तविक जानकारीमा आधारित हुनुपर्छ, दोहोरिनु हुँदैन।
- सुरुमा छोटो (१-२ वाक्य) स्पष्ट निर्देशन देखाउनुहोस् ताकि कक्षाले के गर्ने हो तुरुन्तै बुझोस्। यो निर्देशन एक पटक देखाएर हराउनु हुँदैन — सधैं सानो रूपमा (जस्तै माथिको पट्टीमा) देखिइरहनुपर्छ, ताकि बीचमा हेर्नेले पनि के गर्ने हो थाहा पाओस्।
- **एउटै सिमुलेसनमा एउटै मात्र स्पष्ट मेकानिज्म राख्नुहोस्** (जस्तै सिर्फ तान्ने-मिलाउने, वा सिर्फ ट्याप गर्ने) — एकैचोटि धेरै फरक-फरक किसिमका अन्तरक्रिया (जस्तै तान्ने + टाइप गर्ने + स्लाइडर सबै मिसाएर) नराख्नुहोस्, यसले कक्षा ५ का विद्यार्थीलाई अलमल्याउँछ। एउटै सरल नियम पटक-पटक दोहोरिनुपर्छ, फरक-फरक नियम थुप्रै पटक होइन।
- सबै वस्तु/जोडी/सही-उत्तरहरू एउटै JavaScript डाटा-सूची (array/object) मा पहिल्यै परिभाषित गर्नुहोस् (जस्तै [{item:"...", correctCategory:"..."}, ...]), र त्यही डाटाबाटै UI (कार्ड/लेबल) र सही/गलत जाँच्ने लजिक दुवै बनाउनुहोस् — यसो नगरे UI मा देखिने कुरा र भित्री जाँच बेमेल भई सही राखे पनि "गलत" भन्ने वा उल्टो हुन सक्छ। हरेक वस्तुको सही जवाफ पाठ्यसामग्रीसँग तथ्यगत रूपमा मिल्नुपर्छ, अड्कल वा अस्पष्ट हुनु हुँदैन।
- **तर सोही डाटाभित्रको correct/answer/correctCategory जस्तो फिल्ड कहिल्यै पहिलो पटक पेज लोड हुँदा UI मा नदेखाउनुहोस्** — त्यो फिल्ड केवल विद्यार्थीले छानिसकेपछि (क्लिक/ड्र्याग/सबमिट गरेपछि) जाँच्नका लागि मात्र प्रयोग गर्ने हो, सुरुवाती रेन्डरमा होइन। बहुविकल्पीय/छनोट जस्ता ढाँचामा कुनै पनि विकल्पको checkbox/radio input मा सुरुमै checked=true नराख्नुहोस्, र कुनै पनि विकल्प/कार्डलाई सुरुमै "सही"-सूचक रङ, ✓ चिन्ह, वा हल्का हाइलाइट क्लास (जस्तै class="correct") नदिनुहोस् — सबै विकल्प सुरुमा ठ्याक्कै उस्तै, तटस्थ (neutral) देखिनुपर्छ, कुन सही हो भन्ने कुनै दृश्य सङ्केत नहुनु नै अनिवार्य हो। "सही" भन्ने रङ/चिन्ह/checked विद्यार्थीले आफैं छानेपछि मात्र, onClick/onChange ह्यान्डलरभित्रैबाट थपिनुपर्छ।

कडा आवश्यकताहरू — ठ्याक्कै पालना गर्नुहोस्:
1. जवाफ ठ्याक्कै एउटा पूर्ण, स्वतन्त्र (self-contained) HTML कागजात मात्र दिनुहोस् — <!DOCTYPE html> बाट सुरु गरी </html> मा सकिने। कुनै व्याख्या, कुनै markdown कोड-फेन्स (\`\`\`), कुनै अगाडि/पछाडिको वाक्य नथप्नुहोस्।
2. सबै CSS <style> ट्यागभित्र र सबै JavaScript <script> ट्यागभित्र, उही फाइलमा नै राख्नुहोस्। कुनै बाह्य फाइल, फन्ट, CDN, वा इन्टरनेट लिङ्क प्रयोग नगर्नुहोस् (अफलाइन चल्नुपर्छ)।
3. सबै पाठ/लेबल/निर्देशन नेपाली भाषामा, कक्षा ५ का विद्यार्थीले सजिलै बुझ्ने सरल शब्दमा लेख्नुहोस्।
3क. **भाषा जति "सरल" भने पनि पुग्दैन — यो नियम बेवास्ता गर्दा नै सिमुलेसन "हेर्दा राम्रो तर बुझिनसक्ने" हुन्छ, जुन कक्षा ५ का विद्यार्थी अलमलिनुको सबैभन्दा ठूलो कारण हो:**
   - सुरुको निर्देशन बढीमा एक-दुई छोटो वाक्यमा राख्नुहोस्, हरेक वाक्य १२-१५ शब्दभन्दा लामो नहोस्, र त्यसमा एउटै स्पष्ट क्रिया-शब्द होस् (जस्तै "तान्नुहोस्", "छान्नुहोस्", "थिच्नुहोस्") — "कृपया उपयुक्त वस्तुलाई सम्बन्धित कोठामा वर्गीकृत गर्नुहोस्" जस्ता लामो, संस्कृतनिष्ठ वा जटिल वाक्य कहिल्यै नलेख्नुहोस्।
   - लेसनको शब्दावलीमा नभएको गाह्रो/संस्कृतनिष्ठ शब्द निर्देशन वा लेबलमा प्रयोग गर्नुपरे, त्यसको सट्टा दैनिक बोलचालको सजिलो शब्द छान्नुहोस् (जस्तै "वर्गीकरण गर्नुहोस्" भन्दा "कुन समूहमा पर्छ छान्नुहोस्", "उपयुक्त" भन्दा "मिल्ने")।
   - एउटै वाक्यमा दुई वा बढी सर्त/चरण नथुपार्नुहोस् (जस्तै "पहिले यो छान्नुहोस्, त्यो ठीक भए मात्र अर्को गर्नुहोस्" खालको जटिल वाक्य) — एउटा वाक्यले एउटै मात्र काम भन्नुपर्छ।
3ख. **हरेक वस्तुको सही उत्तर ठ्याक्कै एउटै र निर्विवाद हुनुपर्छ — दुई ठाउँमा उत्तिकै मिल्ने वा तर्क गर्न सकिने वस्तु कहिल्यै नराख्नुहोस्:** वर्गीकरण/मिलाउने/लेबल गर्ने खेलमा कुनै पनि वस्तु एकभन्दा बढी कोठा/श्रेणीमा उस्तै ठीक हुने खालको नबनाउनुहोस् (जस्तै "गाई"लाई "घरपालुवा जनावर" र "दूध दिने जनावर" दुवै कोठा भएको खेलमा राख्दा कुनमा राख्ने भन्ने द्विविधा पर्छ) — यस्तो जोखिम देखिएमा कोठाका नाम अझ स्पष्ट/फरक बनाएर वा वस्तु नै बदलेर द्विविधा पूर्ण रूपमा हटाउनुहोस्। हरेक वस्तुको सही ठाउँ माथिको पाठ्यसामग्रीको तथ्यबाटै प्रत्यक्ष पुष्टि हुनुपर्छ, अड्कल वा आफ्नै विवेकमा भर पर्ने खालको नहोस्।
3ग. **मेकानिज्म नै नबुझी अलमलिनु रोक्न, खेल साँच्चै सुरु हुनुअघि एउटा "उदाहरण" देखाउनुहोस्:** पहिलो वस्तु/जोडी पहिल्यै सही ठाउँमा राखिएको/हल भइसकेको देखाई त्यसमा सानो "उदाहरण" ट्याग वा ✅ चिन्ह राख्नुहोस् — यसले "ठीक भएपछि कस्तो देखिन्छ" भनेर एक नजरमै बुझाउँछ। यो उदाहरण-वस्तुलाई बाँकी सक्रिय (क्लिक/तान्न मिल्ने) वस्तुबाट स्पष्ट देखिने गरी छुट्याइराख्नुहोस् (जस्तै हल्का हरियो घेरा), फेरि नछुनुपर्ने गरी।
3घ. **गलत छनोटमा फर्कने सन्देश कहिल्यै "गलत!" मात्र नहोस् — किन गलत हो भन्ने एक-वाक्यको सजिलो कारण/सङ्केत पनि थप्नुहोस्** (जस्तै खाली "गलत!" भन्नुको सट्टा "गलत! सोच्नुहोस् — यो त पानीमा बस्ने जनावर हो")। सही भएमा पनि छोटो पुष्टिकारक तथ्य थप्न सकिन्छ (जस्तै "सही! सगरमाथा नेपालकै सबैभन्दा अग्लो हिमाल हो।") ताकि खेल खेल्दा-खेल्दै विद्यार्थीले नयाँ कुरा पनि सिकून्, होइन कि सही/गलत मात्र थाहा पाऊन्।
4. डिजाइन आकर्षक र रमाइलो बनाउनुहोस्: उज्ज्वल रङहरू (राम्रो कन्ट्रास्टसहित, टाढाबाट छुट्याउन सकिने), गोलाकार कुनाहरू, नरम छायाँ (shadow), सहज एनिमेसन/ट्रान्जिसन, इमोजी वा CSS/SVG आकृतिहरूद्वारा दृश्य तत्व। फिका, बोरिङ, प्लेन टेक्स्ट देखिने पेज नबनाउनुहोस् — रङ्गीन र चलायमान महसुस हुनुपर्छ।
4क-०. **सही/गलतको संकेत कहिल्यै रङ (हरियो/रातो) मात्रैमा भर पर्ने नबनाउनुहोस्** — कक्षाका केही विद्यार्थीले रातो-हरियो राम्ररी छुट्याउन नसक्न सक्छन्। हरेक सही/गलत प्रतिक्रियामा रङसँगै ठूलो चिन्ह पनि अनिवार्य राख्नुहोस् (सही भए ✅ वा ✓, गलत भए ❌ वा ✗), र सँगसँगै छोटो शब्दमा पनि (जस्तै "सही!" / "गलत!") लेख्नुहोस् — रङ, चिन्ह, र शब्द तीनै वटाले मिलेर संकेत दिनुपर्छ, रङ एक्लैले होइन।
4क-१. **ब्याकग्राउन्ड र पाठ/आइकनको रङ जोडी छान्दा आफैं अड्कल नगरी, यी परीक्षण गरिएका उच्च-कन्ट्रास्ट जोडीहरूमध्ये मात्र छान्नुहोस्** (ब्याकग्राउन्ड → त्यसमाथिको पाठ/आइकन रङ): #1a2744 → #ffffff, #2d1b0e → #ffffff, #1b3a2b → #ffffff, #4a1420 → #ffffff, #ffffff → #1a1a1a, #fff8e7 → #2d1b0e, #e8f5e9 → #1b3a2b, #fce4ec → #4a1420, #e3f2fd → #1a2744। कार्ड/टाइलका पेस्टल ब्याकग्राउन्डका लागि माथिका हल्का जोडी (#fff8e7, #e8f5e9, #fce4ec, #e3f2fd) र तिनको तोकिएको गाढा पाठ-रङ प्रयोग गर्नुहोस्; शीर्षक/निर्देशन-पट्टी जस्ता गाढा पट्टीका लागि माथिका गाढा ब्याकग्राउन्ड (#1a2744, #2d1b0e, #1b3a2b, #4a1420) सँग सेतो पाठ प्रयोग गर्नुहोस्। यी जोडी बाहेक आफैं नयाँ मध्यम-टोन संयोजन नबनाउनुहोस् — यसैले बारम्बार भइरहेको कम-कन्ट्रास्ट (सेतोमाथि सेतो/फिकामाथि फिका) समस्या रोक्छ।
4क. **वस्तु स्पष्ट रूपमा चिनिनैपर्छ — यो नियम बेवास्ता गर्दा नै सिमुलेसन बुझ्नै नसकिने हुन्छ:** जब कुनै वास्तविक वस्तु/दृश्य (जस्तै खुला झ्याल, खुला ढोका, बिग्रेको तार, टेबलमा छोडिएको पैसा/गहना, मानिस, घर, रुख, फलफूल, नक्सा, झन्डा आदि) देखाउनुपर्छ, त्यसलाई कहिल्यै लेबल/इमोजी बिनाको खाली रङ्गीन आयत, वर्गाकार, वा साधारण रेखाले मात्र नबनाउनुहोस् — विद्यार्थीले त्यस्तो अमूर्त आकृति हेरेर त्यो के हो भन्ने अनुमानै लगाउन सक्दैनन्।
   - हरेक त्यस्तो वस्तुका लागि ठूलो, स्पष्ट इमोजी (जस्तै 🪟 खुला झ्याल, 🚪 ढोका, 🔌/⚡ तार, 💰/💵 पैसा, 💍 गहना, 👤 मानिस, 🏠 घर) लाई प्राथमिक दृश्य पहिचानका रूपमा प्रयोग गर्नुहोस् — इमोजीको फन्ट-साइज कम्तिमा 44-60px राख्नुहोस् ताकि प्रोजेक्टरबाट पनि तुरुन्तै चिनिन्छ।
   - इमोजीले नपुगेको वा थप स्पष्टता चाहिने ठाउँमा मात्र इनलाइन SVG/CSS आकृति बनाउनुहोस्, तर त्यस्तो हरेक आकृतिमुनि/छेउमा छोटो, स्पष्ट नेपाली लेबल (जस्तै "खुला झ्याल", "बिग्रेको तार") अनिवार्य रूपमा राख्नुहोस् — आकृति मात्रले नबुझे पनि लेबलले स्पष्ट पारोस्।
   - "फरक पत्ता लगाउने" वा "नक्सा/दृश्य अन्वेषण" जस्ता ढाँचामा जहाँ विद्यार्थीले दृश्य आफैं हेरेर चिन्नुपर्छ, त्यहाँ यो नियम झन् बढी कडाइका साथ पालना गर्नुहोस् — प्रत्येक वस्तु के हो भनेर एक नजरमै (इमोजी वा लेबलबाट) थाहा हुनैपर्छ, नत्र खेल नै असम्भव बन्छ।
4ख. **"सुपर-ग्राफिक्स" स्तर — हरेक दृश्य तत्व कक्षा ५ का विद्यार्थीले टाढाबाट, एक नजरमै, बालसुलभ कार्टुन जस्तो सुन्दर देख्नुपर्छ, न कि इन्जिनियरिङ डायग्राम जस्तो:**
   - **इमोजी नै पहिलो छनोट हो** — मान्छे, घर, रुख, पशु-पक्षी, खाना, सूर्य/बादल, झन्डा, वाहन, पैसा, गहना, उपकरण जस्ता सामान्य वस्तुका लागि सधैं ठूलो इमोजी (कम्तिमा 48-64px) प्रयोग गर्नुहोस् — यसले पातलो/अस्पष्ट SVG रेखाचित्रभन्दा धेरै छिटो र स्पष्ट रूपमा चिनिन्छ।
   - **इमोजीमा नभएको विशेष वस्तु (जस्तै नेपालको नक्सा, कुनै खास झन्डा/चिन्ह, विशेष संरचना) SVG मा आफैं बनाउनुपर्दा, एउटै अमूर्त आकार (एउटा मात्र वर्गाकार/वृत्त/रेखा) ले नबनाई, धेरै साना आकारहरू जोडेर चिनिने सिल्हुएट बनाउनुहोस्** — जस्तै घर = त्रिकोण छानो + आयत भित्ता + सानो आयत ढोका + साना वर्गाकार झ्याल; रुख = खैरो आयत बोक्रा + हरियो वृत्त/अण्डाकार पात; पहाड = हरियो/खैरो त्रिकोणमाथि सेतो हिउँको सानो त्रिकोण टुप्पो। यसरी 3-6 वटा साना आकार मिलाएर मात्र वस्तु "चिनिने" बन्छ, एउटा मात्र आकारले होइन।
   - **बोल्ड, गाढा आउटलाइन राख्नुहोस्** — हरेक SVG आकारमा stroke="#2a2a2a" (वा गाढा रङ) जस्तो कम्तिमा 2-3px को स्पष्ट किनारा राख्नुहोस्, ताकि आकार पृष्ठभूमिबाट छुट्टै देखियोस् (पातलो/किनारा-नभएको फिका आकार टाढाबाट देखिँदैन)।
   - **रेखा/तार/धर्का जस्ता साना विवरण कहिल्यै पातलो वा पृष्ठभूमिसँग मिल्दो रङमा नराख्नुहोस्** — stroke-width कम्तिमा 4-5px राख्नुहोस् र पृष्ठभूमिसँग प्रस्ट कन्ट्रास्ट हुने चहकिलो रङ (जस्तै रातो, सुन्तला) प्रयोग गर्नुहोस्, अन्यथा त्यो तत्व टाढाबाट नदेखिएर विद्यार्थीले छुटाउँछन् — स्क्रिनसटमा देखिएको फिका खैरो/जोगिएको तार यसैको उदाहरण हो, यस्तो कहिल्यै नबनाउनुहोस्।
   - **गहिराइका लागि हल्का ग्रेडियन्ट र नरम छायाँ (drop-shadow/box-shadow) प्रयोग गर्नुहोस्**, तर एउटै सिमुलेसनभित्र सबै वस्तुमा एउटै शैली/स्ट्रोक-चौडाइ/कुना-गोलाइ दोहोर्याउनुहोस् — यसो नगरे वस्तुहरू एक-अर्कासँग नमिल्ने बेमेल क्लिपआर्ट जस्तो देखिन्छ।
   - उदाहरणका लागि, एउटा राम्रोसँग बनेको घर यस्तो देखिन्छ (यही शैली अनुसरण गर्नुहोस्):
     \`<svg viewBox="0 0 120 110" width="100" height="90"><polygon points="60,10 10,50 110,50" fill="#c0392b" stroke="#2a2a2a" stroke-width="3"/><rect x="20" y="50" width="80" height="50" fill="#f5deb3" stroke="#2a2a2a" stroke-width="3"/><rect x="50" y="70" width="20" height="30" fill="#6b4226" stroke="#2a2a2a" stroke-width="2"/><rect x="28" y="60" width="16" height="16" fill="#a3d5ff" stroke="#2a2a2a" stroke-width="2"/><rect x="76" y="60" width="16" height="16" fill="#a3d5ff" stroke="#2a2a2a" stroke-width="2"/></svg>\`
     — यसरी हरेक भाग (छानो, भित्ता, ढोका, झ्याल) छुट्टाछुट्टै आकार भएर, बोल्ड आउटलाइनसहित, मिलेर एउटा तुरुन्तै चिनिने घर बन्छ। यही तहको स्पष्टता र सुन्दरता हरेक वस्तुमा लागू गर्नुहोस्।
   - **यो नियम कुनै एक विषय (जस्तै सुरक्षा/नागरिक शिक्षा) मा मात्र सीमित छैन — पाठ जुनसुकै अध्याय/विषयको भए पनि (भूगोल, इतिहास, कृषि, विज्ञान, अर्थशास्त्र, संस्कृति, जनसंख्या, यातायात, आदि) सम्बन्धित वस्तुका लागि उही तहको ठूलो इमोजी वा बहु-आकार SVG प्रयोग गर्नुहोस्, कहिल्यै खाली आयत/वृत्तले जनाउनु हुँदैन। तलका उदाहरण जुन-जुन पाठसँग मिल्छ त्यही प्रयोग गर्नुहोस्, र नमिलेको वस्तुका लागि पनि यसै तहको स्पष्ट इमोजी/लेबल आफैं छान्नुहोस्:**
     - भूगोल/प्राकृतिक बनावट: पहाड/हिमाल → 🏔️/⛰️, नदी → 🌊 वा तल दिइएको जिग-ज्याग-रेखा जस्तै नीलो लहरिने SVG, जंगल/रुख → 🌳/🌲, समुद्र/ताल → 🌊, मरुभूमि → 🏜️।
     - मौसम/ऋतु: घाम → ☀️, बादल/वर्षा → ☁️/🌧️, हिउँ → ❄️, हावा → 🌬️।
     - कृषि/ग्रामीण जीवन: किसान → 🧑‍🌾, हल/जोत्ने → 🚜 वा साना-साना आकार जोडेर बनाइएको हलो (काठको दस्ता + धातुको फाली), धान/बाली → 🌾, तरकारी/फलफूल → 🥕/🍎, गाई/भैंसी/बाख्रा → 🐄/🐃/🐐।
     - मानिस/पेशा: शिक्षक → 🧑‍🏫, विद्यार्थी → 🧑‍🎓, डाक्टर/स्वास्थ्यकर्मी → 🩺/👩‍⚕️, प्रहरी → 👮, व्यापारी/पसले → 🧑‍💼, कामदार → 👷।
     - यातायात: बस → 🚌, साइकल → 🚲, हवाइजहाज → ✈️, डुङ्गा → 🛶, रेल → 🚆।
     - भवन/संरचना: घर → माथिको घरको उदाहरण, विद्यालय → 🏫, अस्पताल → 🏥, मन्दिर/धार्मिक स्थल → 🛕, बजार/पसल → 🏪, सरकारी कार्यालय → 🏛️।
     - सामान/उपकरण: किताब/कापी → 📖/📓, कलम → ✏️, घडी → ⏰, पैसा/मुद्रा → 💵/🪙, झन्डा → 🇳🇵 वा नेपालको नक्सा जस्तो SVG आकार, मतपेटिका → 🗳️।
     - सुरक्षा/नागरिक शिक्षा (यी पाठमा मात्र): ताला/ताला नलगाएको ढोका → 🔒/🔓, साँचो → 🔑, ग्यास सिलिन्डर → 🛢️ सँगै "ग्यास सिलिन्डर" लेबल, आगो/ज्वाला → 🔥, अग्निशामक यन्त्र → 🧯, बिग्रेको/ननिश्चित तार → तल दिइएको जिग-ज्याग SVG, खुला भ्याल/ट्याप → 🚰, धूवाँ/खतराको संकेत → 🚨, एम्बुलेन्स → 🚑, असुरक्षित पैसा/गहना → 💰/💍 माथि खुला बाकसको SVG।
     - माथिका कुनै पनि श्रेणीमा नपरेको वस्तुका लागि पनि यही तर्क लागू गर्नुहोस्: पहिले उपयुक्त इमोजी खोज्नुहोस् (48-64px ठूलो), नभेटे मात्र 3-6 वटा साना आकार जोडेर SVG सिल्हुएट बनाउनुहोस् (जस्तै घरको उदाहरणमा जस्तै), र सधैं छेउमा छोटो नेपाली लेबल राख्नुहोस्।
   - तार/जिग-ज्याग रेखाको उदाहरण (बिग्रेको तार वा नदी दुवैमा प्रयोग गर्न मिल्ने ढाँचा): \`<svg viewBox="0 0 100 40" width="80" height="32"><polyline points="5,20 20,8 35,32 50,8 65,32 80,8 95,20" fill="none" stroke="#e74c3c" stroke-width="5" stroke-linecap="round"/></svg>\` — बिग्रेको तारका लागि रातो/सुन्तला रङ, नदीका लागि नीलो रङ र बाक्लो लहर प्रयोग गर्नुहोस्; यस्तै जिग-ज्याग आकारले नै दुवै वस्तु तुरुन्तै चिनिन्छ, सीधा पातलो रेखाले होइन।
   - खुला/ताला नभएको ढोकाको उदाहरण: \`<svg viewBox="0 0 60 90" width="50" height="75"><rect x="5" y="5" width="50" height="80" fill="#a9744f" stroke="#2a2a2a" stroke-width="3" transform="skewX(-8)"/><circle cx="42" cy="48" r="4" fill="#f1c40f" stroke="#2a2a2a" stroke-width="1.5"/></svg>\` सँगै छेउमा 🔓 इमोजी र "ताला नलगाएको ढोका" लेबल थप्नुहोस् — ढोका छेकिएको/छड्के (skewed) देखाउँदा नै "खुला" भन्ने तुरुन्तै बुझिन्छ, बन्द ढोकाजस्तै सीधा आयतले मात्र बुझिँदैन।
   - पहाड/हिमालको उदाहरण (भूगोल पाठका लागि, इमोजीले नपुगेमा): \`<svg viewBox="0 0 120 70" width="100" height="58"><polygon points="10,65 45,15 80,65" fill="#8d6e4f" stroke="#2a2a2a" stroke-width="3"/><polygon points="45,15 35,32 55,32" fill="#ffffff" stroke="#2a2a2a" stroke-width="2"/><polygon points="55,65 90,25 118,65" fill="#a9866b" stroke="#2a2a2a" stroke-width="3"/><polygon points="90,25 82,38 98,38" fill="#ffffff" stroke="#2a2a2a" stroke-width="2"/></svg>\` — दुई खैरो त्रिकोण (पहाड) र त्यसमाथि सेतो सानो त्रिकोण (हिउँको टुप्पो) जोडेर बनेको, एउटै अमूर्त त्रिकोणले होइन।
4ग. **हरेक अन्तरक्रियात्मक कार्ड/टाइल एउटै स्थिर, बालसुलभ बनावटमा हुनुपर्छ — Duolingo/किड्स-एपजस्तो, टेक्निकल तालिका जस्तो होइन:**
   - हरेक कार्ड/टाइल कम्तिमा 90×90px को गोलाकार-कुना (border-radius: 14-20px) कन्टेनर हुनुपर्छ, जसमा दुई तह पक्का हुनैपर्छ: (१) माथि ठूलो इमोजी/SVG आइकन (कम्तिमा 48-64px), (२) मुनि छोटो, बोल्ड नेपाली लेबल (कम्तिमा 16-18px, राम्रो कन्ट्रास्ट)। आइकन कहिल्यै लेबल बिना एक्लै नछोड्नुहोस् — दुवै सधैं सँगै।
   - हरेक कार्डको ब्याकग्राउन्ड हल्का तर छुट्टै चिनिने रङ (जस्तै पेस्टल पहेंलो, निलो, हरियो, गुलाबी) राख्नुहोस् ताकि आइकन सेतो/धूमिल पृष्ठभूमिमा नहराई छुट्टै टल्कोस्।
   - सम्बन्धित/एउटै श्रेणीका वस्तुहरूलाई एउटै रङको कार्ड-ब्याकग्राउन्ड दिनुहोस् (जस्तै सबै "पशु" कार्ड हल्का हरियो, सबै "उपकरण" कार्ड हल्का निलो) — यसले विद्यार्थीलाई रङ हेरेरै समूह चिन्ने एउटा अतिरिक्त (तर मुख्य होइन) सुराग दिन्छ।
   - एउटै सिमुलेसनभित्रका सबै कार्ड ठ्याक्कै उस्तै साइज, गोलाइ, बोर्डर र छायाँ-शैलीमा राख्नुहोस् — कुनै कार्ड ठूलो कुनै सानो, कुनै गोलो कुनै कुनादार नहोस्, नत्र स्क्रिन अस्तव्यस्त र भरपर्दो नभएको देखिन्छ।
   - **हरेक क्लिक/ड्र्याग गर्न मिल्ने कार्ड/टाइल/बटनमा माउस/कर्सर छेउमा आउनेबित्तिकै हल्का प्रतिक्रिया देखिनुपर्छ** (जस्तै हल्का scale-up र छायाँ गहिरिने — CSS class="ss-bounce" यो फाइलमा पहिल्यै परिभाषित छ, कार्ड/टाइलको class मा थप्नुहोस्, थप CSS लेख्नु पर्दैन) — यसले शिक्षक/विद्यार्थीलाई कुन-कुन वस्तु क्लिक/ड्र्याग गर्न मिल्छ भनी छुनुअघि नै टिपोट हुन्छ।
   - **यी सामान्य ग्राफिक्स-गल्ती कहिल्यै नदोहोर्याउनुहोस् (कक्षा ५ का विद्यार्थीले सबैभन्दा बढी अलमलिने कारण यिनै हुन्):** लेबल/इमोजी बिनाको खाली रङ्गीन आयत/वर्गाकार/वृत्त; 24px भन्दा साना वा धमिलो/फिका रङका आइकन; एउटै सिमुलेसनमा फरक-फरक साइज/शैलीका कार्ड मिसिएको; ब्याकग्राउन्डसँग कम कन्ट्रास्ट भएको आइकन-ब्याकग्राउन्ड जोडी (जस्तै सेतोमाथि सेतो, हल्कामाथि हल्का); धेरै साना विवरण भएको जटिल SVG जुन टाढाबाट धमिलो/एउटै धब्बा जस्तो देखिन्छ — यी मध्ये कुनै पनि देखिएमा सिमुलेसन विद्यार्थीले बुझ्नै नसक्ने हुन्छ।
5. **स्क्रिनभित्रै अटाउने नियम — यो सबैभन्दा बढी बिग्रने भाग हो, ध्यान दिनुहोस्:**
   - सबैभन्दा बाहिरी कन्टेनरमा * { box-sizing: border-box; } राख्नुहोस्, र html, body मा margin:0; padding:0; overflow:hidden; width:100vw; height:100vh; राख्नुहोस् ताकि पूरा पेज ब्राउजर विन्डोभित्रै ठ्याक्कै अटाओस्, बाहिर पोखिएर नदेखियोस्।
   - मुख्य लेआउटमा absolute/fixed पिक्सेल-आधारित पोजिसनिङ (जस्तै left: 850px) प्रयोग नगर्नुहोस् — त्यसले सानो/ठूलो स्क्रिनमा तत्व बाहिर गएर हराउन सक्छ। बरु Flexbox वा CSS Grid प्रयोग गर्नुहोस् (display:flex/grid, flex-wrap:wrap, gap, justify-content, align-items) जुन उपलब्ध ठाउँ अनुसार आफैं मिलेर बस्छ।
   - फन्ट-साइज, ग्याप, प्याडिङ जस्ता नाप clamp() वा vw/vh जस्ता सापेक्षिक एकाइहरूमा राख्नुहोस् (जस्तै font-size: clamp(18px, 2.2vw, 30px)) ताकि विभिन्न प्रोजेक्टर रिजोल्युसनमा पनि स्वतः मिलोस्।
   - यदि सामग्री लामो भई एउटै स्क्रिनमा नअट्ने भयो भने, त्यो एउटा छुट्टै भित्री क्षेत्र (जस्तै .game-area { max-height: 78vh; overflow-y: auto; }) मा मात्र स्क्रोल हुनुपर्छ, पूरा पेज होइन — र शीर्षक/निर्देशन/स्कोर जस्ता महत्त्वपूर्ण भाग सधैं देखिइरहनुपर्छ (स्क्रोल गर्दा हराउनु हुँदैन)।
   - कुनै पनि तत्व अर्को तत्वमाथि ओभरल्याप भएर लुक्नु हुँदैन, र कुनै पनि पाठ/बटन काटिएर वा आधा मात्र देखिएर रहनु हुँदैन।
   - **माथिको स्थिर/sticky निर्देशन-पट्टीले तलको सामग्री (कार्ड/वस्तुहरू) लाई कहिल्यै ढाकेर/ओभरल्याप गरेर लुकाउनु हुँदैन** — यो धेरै पटक भेटिने गल्ती हो, ध्यान दिनुहोस्। सम्पूर्ण पेजको सबैभन्दा बाहिरी कन्टेनरलाई "display:flex; flex-direction:column; height:100vh;" बनाउनुहोस्, अनि निर्देशन-पट्टी/शीर्षक/स्कोरलाई यसैको पहिलो सामान्य (normal document flow) flex-child राख्नुहोस् — "position:fixed" वा "position:absolute" कहिल्यै नराख्नुहोस् (त्यसले पछाडिको सामग्रीमाथि तैरिएर ढाक्छ)। सामग्री/कार्ड-ग्रिड भएको भाग यो निर्देशन-पट्टीपछि आउने दोस्रो flex-child बनाउनुहोस् जसमा "flex:1; min-height:0; overflow-y:auto;" राख्नुहोस् — यसरी निर्देशन-पट्टीले आफ्नो वास्तविक उचाइ जति ठाउँ ओगट्छ र बाँकी ठाउँमा मात्र सामग्री बस्छ, माथिको पंक्ति कहिल्यै ढाकिँदैन/लुक्दैन।
   - **निर्देशन/शीर्षक-पट्टी सिर्फ एकै ठाउँमा, माथि मात्र, एक पटक मात्र राख्नुहोस्** — त्यही निर्देशन/शीर्षकको पाठ (वा हुबहु मिल्दोजुल्दो अर्को प्रति) तलपट्टि (नियन्त्रण/बटन-पट्टीमा वा अरू कतै) दोहोर्याएर नराख्नुहोस्। नियन्त्रण-बटनको पट्टी (रिस्टार्ट/अघिल्लो/अर्को बटन भएको, नियम ९ हेर्नुहोस्) माथिकै निर्देशन-पट्टीको एउटा छुट्टै, फरक तल्लो flex-child हुनुपर्छ (माथिकै पट्टीको नक्कल वा दोस्रो प्रति होइन), र त्यो पनि यसै flex-column को सामान्य (normal-flow) तेस्रो/अन्तिम flex-child बनाउनुहोस् — कहिल्यै "position:fixed; bottom:0" वा "position:sticky" प्रयोग नगर्नुहोस्, किनकि त्यसले तल्लो पट्टी सामग्री-क्षेत्रमाथि तैरिएर अन्तिम पङ्क्तिका कार्ड/वस्तुलाई छोपिदिन्छ। बरु flex-column संरचनाले नै तल्लो पट्टीलाई आफ्नो ठाउँ स्वतः दिन्छ (त्यो अन्तिम स्थिर height को flex-child भएकाले), बीचको सामग्री-क्षेत्र (flex:1; overflow-y:auto) ले बाँकी ठाउँ मिलाउँछ।
   - **कुनै पनि शीर्षक/निर्देशन/स्कोर-पट्टीको ब्याकग्राउन्ड र त्यसमाथिको पाठ/आइकनको रङ स्पष्ट रूपमा फरक (उच्च कन्ट्रास्ट) हुनैपर्छ** — फिका/सेतोमाथि सेतो, वा हल्का रङमाथि हल्का पाठ कहिल्यै नराख्नुहोस् (यस्तो भए पाठ/आइकन पूर्णतः अदृश्य हुन्छ)। सुरक्षित विकल्पका रूपमा गाढा रङ (जस्तै #1a2744, #2d1b0e, वा अध्यायसँग मिल्ने कुनै गाढा रङ) को ब्याकग्राउन्डमा सेतो (#ffffff) पाठ, वा एकदमै हल्का ब्याकग्राउन्डमा गाढा (#1a1a1a जस्तो) पाठ प्रयोग गर्नुहोस् — दुवैतिर मध्यम-टोनका मिल्दाजुल्दा रङ कहिल्यै नराख्नुहोस्।
   - **वस्तुहरू कहिल्यै एउटै लामो ठाडो (vertical) स्तम्भमा नथाप्नुहोस्** (जस्तै १२ वटा कार्ड एकपछि अर्को तल-तल थुपार्नु) — त्यसले पेज धेरै लामो बनाई तल स्क्रोल नगरी बाँकी भाग (विशेष गरी लक्ष्य/कोठाहरू) देखिँदैन। बरु multi-column grid प्रयोग गर्नुहोस् (जस्तै display:grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); वा 3-4 स्तम्भको flex-wrap) ताकि धेरै वस्तु पनि थोरै उचाइमा फैलिएर अटून्।
   - **स्रोत-वस्तु र लक्ष्य/कोठा दुवै एकैचोटि, सँगै देखिनुपर्छ** — जुन ढाँचामा वस्तुहरू कुनै समूह/कोठा/लक्ष्यमा तान्ने वा राख्ने हो (जस्तै मिलाउने, वर्गीकरण, लेबल गर्ने, नक्सा रङ्ग भर्ने, संरचना जोड्ने), त्यहाँ स्रोत-वस्तुहरू र तिनका लक्ष्य/कोठा/श्रेणीहरू पहिलो नजरमै एउटै स्क्रिनमा देखिनुपर्छ — लक्ष्यहरू तल धेरै टाढा राखेर विद्यार्थीले पहिले स्क्रोल गरेर मात्र भेट्टाउनुपर्ने बनाउनु हुँदैन। यसका लागि स्क्रिनलाई दुई भागमा छुट्याउनुहोस् (जस्तै माथि/तल दुई पट्टी, वा देब्रे-दायाँ दुई स्तम्भ): एक भागमा सानो-सानो स्रोत-कार्डको ग्रिड, अर्को भागमा स्पष्ट लेबल भएका लक्ष्य/कोठाहरू। दुवै भाग सँगै नअटे भने वस्तु संख्या कम गरेर राउन्डमा बाँड्नुहोस् (माथि नै भनिएझैं), तर हरेक राउन्डमा त्यो राउन्डका स्रोत र लक्ष्य दुवै सँगै देखिनैपर्छ।
   - **हरेक लक्ष्य/कोठा/श्रेणीमा स्पष्ट, छोटो नेपाली नाम/शीर्षक लेखिएकै हुनुपर्छ** — खाली वा लेबल नभएको कोठा कहिल्यै नराख्नुहोस्।
6. **इनपुट/अन्तरक्रिया भरपर्दो बनाउनुहोस्:**
   - ${MECHANIC_INSTRUCTIONS[type.mechanic] || MECHANIC_INSTRUCTIONS.tap}
   - सबै बटन/कार्ड/लक्ष्य-क्षेत्र माउसले सजिलै क्लिक गर्न मिल्ने ठूलो साइजमा राख्नुहोस् (कम्तिमा ~56×56px)।
7. इन्टरएक्टिभ बनाउनुहोस्: क्लिक/ड्र्याग जस्ता वास्तविक अन्तरक्रिया चाहिन्छ, केवल स्क्रोल गरेर पढ्ने स्थिर पृष्ठ पर्याप्त छैन।
8. **प्रतिक्रिया/सन्देश लामो समयसम्म देखिनुपर्छ — छिट्टै हराउनु हुँदैन:** सही/गलत छनोटमा रंग/एनिमेसनसँगै छोटो सन्देश देखाउनुहोस्, र त्यो सन्देश कम्तिमा ३.५–४ सेकेन्डसम्म स्क्रिनमा रहनुपर्छ (setTimeout मा कम्तिमा 3500ms राख्नुहोस्) — शिक्षकले कक्षालाई भन्दै/व्याख्या गर्दै गर्दा सन्देश एकै छिनमा हराउनु हुँदैन। अन्त्यमा स्कोर वा सारांश देखाउनुहोस् — यो सारांश पनि स्क्रिनभित्रै अटाउनुपर्छ, नयाँ ठूलो ब्लक थपेर पेज नफैलाउनुहोस्, र सारांश आफैं हराउनु हुँदैन (शिक्षकले फेरि खेल्नुहोस् नथिचेसम्म देखिइरहनुपर्छ)।
8क. **हरेक गलत जवाफमा तुरुन्तै (पहिलो प्रयासदेखि नै, दोस्रो/तेस्रो प्रयासको प्रतीक्षा नगरी) रंग/❌ चिन्हसँगै एक-वाक्य छोटो कारण पनि देखाउनुहोस्** (जस्तै "गलत — यो हिमाल होइन, यो त तराई हो"), केवल "गलत!" भनेर मात्र नछोड्नुहोस्। **साथै कक्षा एउटै वस्तुमा अल्झिएर नरोकियोस् — एउटै वस्तु/प्रश्नमा लगातार २ पटक गलत भएपछि, तेस्रो पटक कोसिस गर्नुअघि नै सही उत्तर छुट्टै/ठूलो गरी आफैं देखाइदिनुहोस्** (जस्तै "सही उत्तर हो: हिमाल — किनभने यो सधैं हिउँले ढाकिएको हुन्छ"), अनि विद्यार्थीलाई त्यो देखेर अगाडि बढ्न दिनुहोस्। यसो नगरे कक्षा एउटै ठाउँमा अल्झिएर बाँकी खेल कहिल्यै नसकिने हुन्छ, जुन कक्षाकोठाको सीमित समयमा ठूलो समस्या हो।
8ख. **कति वस्तु/राउन्ड बाँकी छ भन्ने सधैं देखिनुपर्छ** — माथिको निर्देशन-पट्टी वा नियन्त्रण-पट्टीमै सानो प्रगति-सूचक राख्नुहोस् (जस्तै "३/१०" वा प्रगति-पट्टी), जुन हरेक वस्तु पूरा हुँदा स्वतः अपडेट होस् — यसले शिक्षक र कक्षा दुवैलाई अरू कति बाँकी छ भनी थाहा दिन्छ र समय मिलाउन सजिलो बनाउँछ।
8ग. **पहिलो वस्तु सही/गलत जे भए पनि एक पटक जवाफ दिइसकेपछि, माथिको सुरुको लामो निर्देशन-वाक्य छोटो/संक्षिप्त बनाउनुहोस्** (जस्तै "तान्नुहोस् र मिलाउनुहोस्" जस्तो १-३ शब्दको छोटो रिमाइन्डरमा झार्नुहोस्, वा सानो फन्टमा साना बनाउनुहोस्) — कक्षाले नियम बुझिसकेपछि त्यही लामो वाक्यले अनावश्यक ठाउँ ओगट्नु हुँदैन, त्यो ठाउँ कार्ड/सामग्रीका लागि नै फुकाइदिनुहोस्। यो परिवर्तन JS ले पहिलो क्लिक/जवाफपछि सोही निर्देशन-एलिमेन्टको पाठ/शैली बदलेर गर्न सकिन्छ (नयाँ एलिमेन्ट थपेर होइन, भइरहेकै एलिमेन्ट अपडेट गरेर)।
9. **नियन्त्रण बटनहरू सधैं देखिने ठाउँमा राख्नुहोस् (माथिको flex-column संरचनाकै एउटा सामान्य तल्लो flex-child पट्टीको रूपमा — नियम ५ हेर्नुहोस्), स्क्रोल गर्दा वा राउन्ड बदल्दा पनि हराउनु हुँदैन। यो पट्टी कहिल्यै "position:fixed/sticky" नबनाइ सामान्य दस्तावेज-प्रवाह (normal flow) मै राख्नुहोस्, र यसमा माथिको निर्देशन/शीर्षक-पाठ फेरि नदोहोर्याउनुहोस् — बटन/नियन्त्रण मात्र राख्नुहोस्। **महत्त्वपूर्ण: स्क्रिनको फ्याक्कै तल्लो-देब्रे कुनामा (bottom-left, करिब 70×70px) पहिल्यैबाट एउटा सानो एनिमेटेड साथी-पात्र (mascot) स्थिर (position:fixed) रूपमा राखिएको हुन्छ (नियम १३क मा उल्लेख) — यो नियन्त्रण-पट्टी वा यसका कुनै बटन (जस्तै "फेरि खेल्नुहोस्") त्यो ठ्याक्कै तल्लो-देब्रे कुनामा नअडोस् भनी त्यो ठाउँ खाली छोडी (जस्तै नियन्त्रण-पट्टीमा padding-left वा marginदिएर, वा बटनहरू बीच/दायाँतिर मिलाएर) मात्र राख्नुहोस्, अन्यथा साथी-पात्रले बटन छोप्नेछ।** **त्यस्तै, स्क्रिनको ठ्याक्कै तल्लो-दायाँ कुनामा (bottom-right, करिब 150×40px) पनि पहिल्यैबाट यस एप्लिकेसनको आफ्नै जुम नियन्त्रण-पट्टी (A-/प्रतिशत/A+, प्रोजेक्टर-दूरीका लागि) स्थिर रूपमा माथि तैरिरहेको हुन्छ (यो तपाईंले लेख्ने HTML भन्दा बाहिर, प्यारेन्ट एपले थप्ने हो, तर दृश्यमा ठ्याक्कै त्यही कुनामा देखिन्छ) — त्यसैले "फेरि खेल्नुहोस्" बटन वा नियन्त्रण-पट्टीको कुनै पनि भाग ठ्याक्कै तल्लो-दायाँ कुनामा नअडोस् भनी त्यो ठाउँ पनि खाली छोड्नुहोस् (बटन/नियन्त्रण-पट्टीलाई बीचमा वा देब्रेतिर मिलाएर, वा दायाँ padding/margin दिएर), नत्रता जुम-नियन्त्रणले बटन छोप्नेछ।**

   - एउटा "फेरि खेल्नुहोस्" (restart) बटन राख्नुहोस् जसले पूरै अवस्था (सबै वस्तु, स्कोर, प्रगति) पूर्ण रूपमा सुरुको स्थितिमा फर्काओस् — यो बटन जुनसुकै बेला, अड्किएको अवस्थामा पनि, तुरुन्तै देख्न र थिच्न मिल्ने ठाउँमा (जस्तै कुनामा स्थिर रूपमा) राख्नुहोस्, कतै तल गएर/लुकेर बस्नु हुँदैन।
   - **"फेरि खेल्नुहोस्" थिच्दा वस्तु/कार्डहरूको क्रम पहिलेकै जस्तो ठ्याक्कै उही देखिनु हुँदैन** — डाटा-सूची (array) लाई हरेक पटक (पहिलो लोड हुँदा र प्रत्येक "फेरि खेल्नुहोस्" थिच्दा दुवैमा) Fisher-Yates जस्तो शफल-फंक्सनले क्रम फेरेर मात्र UI मा देखाउनुहोस्, ताकि दोहोर्याएर खेल्दा पनि उही क्रम नदेखियोस् र हरेक पटक अलि फरक महसुस होस्। (सही उत्तर/जोडी भने डाटासँगै जोडिएको रहन्छ, क्रम फेरेर मात्र होइन।)
   - **सही/गलत भएको बेला आवाज पनि बजाउनुहोस्** — यो फाइलमा window.playCorrectSound() र window.playWrongSound() भन्ने दुई फंक्सन पहिल्यै उपलब्ध छन् (थप्नु पर्दैन, तपाईंले परिभाषित गर्नै पर्दैन) — विद्यार्थीले सही छान्दा window.playCorrectSound(), गलत छान्दा window.playWrongSound() कल गर्नुहोस्। साथै, वस्तु छनोट/ड्र्याग सुरु जस्ता सानो कार्यमा पनि उपयुक्त भए window.playClickSound() (यो पनि पहिल्यै परिभाषित छ) प्रयोग गरी हल्का प्रतिक्रिया-आवाज थप्न सकिन्छ — तर यो अनिवार्य होइन, सही/गलत आवाजभन्दा बढी हावी नहोस्।
   - यदि सामग्री धेरै भई राउन्ड/समूहमा बाँडिएको छ भने, "← अघिल्लो" र "अर्को →" जस्ता स्पष्ट नेभिगेसन बटन राख्नुहोस् ताकि शिक्षकले आफ्नै गतिमा, कक्षालाई व्याख्या गर्दै, एक-एक वस्तु/राउन्ड अगाडि बढाउन सक्नुहुन्छ — सबै कुरा एकैचोटि नआओस्, शिक्षकको नियन्त्रणमा होस्।
10. **पूरा सिमुलेसन सफलतापूर्वक सकिँदा (सबै वस्तु/राउन्ड पूरा भएपछि) एउटा छोटो, ठूलो, रमाइलो उत्सव-एनिमेसन देखाउनुहोस्** — जस्तै रंगीन कन्फेटी/तारा CSS एनिमेसनले स्क्रिन भरिने, "सबै सही!" वा "बधाई छ!" जस्तो ठूलो पाठसहित। **यो एनिमेसन देखा पर्ने ठ्याक्कै त्यही क्षणमा window.playCelebrationSound() पनि कल गर्नुहोस्** (यो फंक्सन पहिल्यै परिभाषित छ — ताली बजाउने र बालबालिका उल्लासमा आएको आवाज मिलेर बज्छ, थप्नु/परिभाषित गर्नु पर्दैन, कल मात्र गर्नुहोस्)। यो एनिमेसन/सन्देश पनि कम्तिमा ३.५ सेकेन्ड रहनुपर्छ र त्यसपछि मात्र सामान्य सारांश देखिनुपर्छ। यो CSS/JS ले नै बनाउनुहोस् (कुनै बाह्य लाइब्रेरी/CDN चाहिँदैन), र यसले स्क्रिनको अरू भाग ढाकेर स्थायी रूपमा नरहोस् — केही सेकेन्डपछि सामान्य सारांशमा फर्किनुपर्छ।
11. viewport meta ट्याग राख्नुहोस्: <meta name="viewport" content="width=device-width, initial-scale=1">
12. कहिल्यै <img>, background-image, वा कुनै पनि src/url() मार्फत बाहिरी फाइल/तस्विर नल्याउनुहोस् — यस्तो कुनै फाइल इन्टरनेटमा वा डिभाइसमा अवस्थित हुँदैन, त्यसैले त्यो सधैं टुटेको/खाली देखिन्छ। "यो चित्र हेर्नुहोस्" जस्तो कुनै पनि कार्य दिनुभएमा, त्यो चित्र/नक्सा/वस्तु अनिवार्य रूपमा ठूलो इमोजी वा इनलाइन SVG (<svg>...</svg>, सीधै HTML भित्र लेखिएको, स्पष्ट नेपाली लेबलसहित) प्रयोग गरेरै आफैं कोड गरेर देखाउनुहोस् (माथिको नियम ४क हेर्नुहोस्) — लेबल/इमोजी नभएको खाली आकार कहिल्यै प्रयोग नगर्नुहोस्।
13. कुनै पनि तस्विर/नक्सा/चित्र देखिनु आवश्यक भएको सिमुलेसन बनाउनुभएमा, त्यो चित्र पूर्ण रूपमा देखिन्छ र त्यसको कन्टेनरभित्रै भरिन्छ भनी सुनिश्चित गर्नुहोस् — कुनै अधुरो, कटिएको, वा नदेखिने तत्व नराख्नुहोस्।
13क. **थप जीवन्तता र दृश्य-गुणस्तर (सिफारिस गरिएको):**
   - यो फाइलमा पहिल्यै उपलब्ध (परिभाषित गर्नु नपर्ने) CSS सहायक क्लासहरू प्रयोग गर्न सक्नुहुन्छ: कार्ड/बटनमा स्प्रिङ-बाउन्स होभर/क्लिक इफेक्टका लागि class="ss-bounce" थप्नुहोस्; अझै नछानिएका कार्ड/वस्तुमा सानो सास फेर्ने जस्तो चलिरहने एनिमेसनका लागि class="ss-pulse-idle" थप्नुहोस् (छानिएपछि यो क्लास हटाइदिनुहोस्); कार्ड/प्यानललाई हल्का ग्लास/डेप्थ लुक दिन class="ss-glass" थप्नुहोस्। यी सबै वैकल्पिक हुन् — प्रयोग नगरे पनि सिमुलेसन चल्छ, तर प्रयोग गर्दा स्क्रिन बढी जीवन्त देखिन्छ।
   - एउटा सानो, मित्रवत साथी-पात्र (mascot) पेजको एउटा कुनामा पहिल्यै देखिन्छ र आफैं सास फेरे जस्तो बिस्तारै चलिरहन्छ — यो पनि पहिल्यै बनाइसकिएको छ, तपाईंले केही थप्नु पर्दैन। सही/गलत/उत्सव-आवाज बज्दा (माथि नियम ९ र १० मा तोकिएका window.playCorrectSound/playWrongSound/playCelebrationSound कल गर्दा) यो साथी-पात्र आफैं उफ्रन्छ/खुसी हुन्छ/निराश हुन्छ — यो पनि स्वचालित हो। चाहनुभयो भने थप विशेष क्षणमा (जस्तै राउन्ड सकिँदा) window.mascotReact('correct') / window.mascotReact('wrong') / window.mascotReact('cheer') सिधै कल गरेर पनि प्रतिक्रिया देखाउन सकिन्छ, तर अनिवार्य होइन।
   - ड्र्याग-एन्ड-ड्रप ढाँचामा, वस्तु ड्र्याग गर्दा वा छोड्दा हल्का ओभरसुट+स्प्रिङ-ब्याक इफेक्ट (transition: transform .3s cubic-bezier(.34,1.56,.64,1) जस्तै) थप्नाले वस्तुहरू "जिउँदो" महसुस हुन्छन्।
   - भूगोल/नक्सा/दृश्य-सम्बन्धी विषयमा, सम्भव भए एकल समतल इमोजी/आइकनको सट्टा तह-तह (layered) इनलाइन SVG दृश्य (जस्तै पछाडि पहाड/डाँडा, अगाडि मुख्य वस्तु) बनाउनाले दृश्य गहिराइ थपिन्छ — तर यसले screen-fit/स्पष्टताका नियम (माथि नियम ४क/१४) कहिल्यै भङ्ग नगरोस्।
   - बहु-राउन्ड ढाँचामा, एक राउन्डबाट अर्कोमा जाँदा सामग्री एकैचोटि बदलिनुको सट्टा छोटो (०.३-०.४ सेकेन्ड) स्लाइड/फेड ट्रान्जिसन राख्नाले खेल एउटै क्रमको भाग जस्तो महसुस हुन्छ।
14. कोड लेखिसकेपछि आफैं जाँच्नुहोस् (यी सबै "हो" नभएसम्म अन्तिम जवाफ नदिनुहोस्): के html/body मा overflow:hidden र width/height 100vw/100vh छ? के लेआउट पूर्णतः flex/grid मा आधारित छ, hardcoded absolute left/top होइन? के कुनै तत्व अर्कोमाथि ओभरल्याप वा काटिएको छैन? **के माथिको निर्देशन/शीर्षक-पट्टी सामान्य flex-column लेआउटको एउटा normal-flow भाग हो (position:fixed/absolute होइन), र त्यसले तलको कार्ड/सामग्रीलाई कुनै हालतमा ढाकेको/ओभरल्याप गरेको छैन? के हरेक पट्टी/हेडरको ब्याकग्राउन्ड-रङ र पाठ/आइकनको रङबीच स्पष्ट उच्च कन्ट्रास्ट छ (सेतोमाथि सेतो वा फिकामाथि फिका कतै छैन)?** के 1280×720 जत्रो landscape स्क्रिनमा जुम/स्क्रोल नगरी सबै देखिन्छ? के फन्ट-साइज प्रोजेक्टरबाट टाढैबाट पढ्न सकिने ठूलो छ? ${type.mechanic === "drag" ? "के हरेक तानिने तत्वमा pointer events र touch-action: none छ?" : "के यो ढाँचामा अनावश्यक ड्र्याग/स्लाइडर/टाइप संयन्त्र नथपिकन तोकिएको मेकानिज्म (" + type.mechanic + ") मात्र प्रयोग भएको छ?"} के कम्तिमा ८ वटा वस्तु/चरण छन्? के कुनै <img> ट्याग छैन? के स्रोत-वस्तुहरू एउटै लामो ठाडो स्तम्भमा छैनन् (multi-column grid प्रयोग भएको छ)? के लक्ष्य/कोठा/श्रेणी भएको ढाँचा हो भने ती लक्ष्यहरू सबै स्रोत-वस्तुसँगै, स्क्रोल नगरी, सुरुमै देखिन्छन्, र हरेकमा स्पष्ट लेबल छ? के प्रतिक्रिया/सन्देश कम्तिमा ३५००ms सम्म रहन्छ? के "फेरि खेल्नुहोस्" बटन सधैं स्थिर/देखिने ठाउँमा छ? के अन्त्यमा उत्सव-एनिमेसन छ? के वास्तविक वस्तु जनाउने हरेक आकृतिमा ठूलो इमोजी र/वा स्पष्ट नेपाली लेबल छ, कुनै पनि खाली/लेबल-नभएको अमूर्त आयत-वर्गाकार वस्तु पहिचानका रूपमा प्रयोग भएको छैन? **के हरेक SVG-निर्मित वस्तु धेरै साना आकार जोडेर बनेको चिनिने सिल्हुएट हो (एउटै अमूर्त आकार होइन)? के हरेक आकारमा बोल्ड गाढा आउटलाइन (2-3px+) छ? के तार/रेखा जस्ता साना विवरणको stroke-width कम्तिमा 4-5px र पृष्ठभूमिसँग प्रस्ट कन्ट्रास्ट भएको चहकिलो रङ छ?** **के हरेक कार्ड/टाइल एउटै साइज (कम्तिमा 90×90px), गोलाइ र छायाँ-शैलीमा छ? के हरेकमा 48-64px को ठूलो आइकन र त्यसमुनि छोटो बोल्ड लेबल दुवै छन्? के हरेक कार्डको ब्याकग्राउन्ड हल्का तर छुट्टै चिनिने रङको छ (सेतोमाथि सेतो होइन)? के 24px भन्दा साना, धमिलो, वा फिका आइकन कतै छैनन्?** **के सुरुको निर्देशन १५ शब्दभित्रको छोटो वाक्य हो, एउटै स्पष्ट क्रिया-शब्दसहित, संस्कृतनिष्ठ/जटिल शब्द नभएको? के हरेक वस्तुको सही उत्तर ठ्याक्कै एउटै र निर्विवाद छ — दुई कोठा/श्रेणीमा उत्तिकै मिल्ने अस्पष्ट वस्तु कतै छैन? के खेल सुरु हुनुअघि एउटा हल भइसकेको "उदाहरण" वस्तु देखाइएको छ? के गलत भएमा देखिने सन्देशमा "गलत!" मात्र नभई किन गलत भन्ने छोटो कारण/सङ्केत पहिलो प्रयासदेखि नै छ? के कुनै अमूर्त अवधारणा (अधिकार/कर्तव्य/मूल्य-मान्यता जस्ता) लाई खाली प्रतीकात्मक आकारले नभई चिनिने ठोस दृश्य/घटनाले देखाइएको छ? **के पेज पहिलो पटक खुल्दा कुनै पनि विकल्प/कार्ड/checkbox/radio पहिल्यैबाट checked/selected वा "सही"-सूचक रङ/✓ चिन्हसहित देखिँदैन (सबै विकल्प सुरुमा ठ्याक्कै तटस्थ र उस्तै छन्)? के "सही" भन्ने कुनै पनि दृश्य सङ्केत विद्यार्थीले आफैं क्लिक/छनोट गरेपछि मात्र देखिन्छ, कोडमा राखिएको correct/answer डाटाले सुरुवाती रेन्डरलाई असर गरेको छैन? **के निर्देशन/शीर्षक-पाठ पेजमा ठ्याक्कै एकै ठाउँमा (माथि) मात्र छ, तल नियन्त्रण-पट्टी वा अरू कतै त्यही पाठ दोहोरिएको छैन? के तल्लो नियन्त्रण-बटन पट्टी "position:fixed/sticky" नभई flex-column कै सामान्य अन्तिम flex-child हो, र त्यसले अन्तिम पङ्क्तिका कार्ड/वस्तु कतै छोपेको/ढाकेको छैन? **के तल्लो नियन्त्रण-पट्टी वा यसको कुनै बटन ठ्याक्कै स्क्रिनको तल्लो-देब्रे कुनामा (bottom-left ~70×70px) अडेको छैन, जहाँ पहिल्यैबाट स्थिर साथी-पात्र (mascot) राखिएको हुन्छ? के त्यही नियन्त्रण-पट्टी वा "फेरि खेल्नुहोस्" बटन स्क्रिनको तल्लो-दायाँ कुनामा (bottom-right ~150×40px) पनि अडेको छैन, जहाँ प्यारेन्ट एपको जुम नियन्त्रण-पट्टी (A-/प्रतिशत/A+) स्थिर रूपमा माथि तैरिरहेको हुन्छ?** **के सही/गलतको प्रतिक्रियामा रङसँगै ✅/❌ जस्तो चिन्ह र छोटो शब्द पनि छ (रङ मात्रमा भर परेको छैन)? के सबै ब्याकग्राउन्ड/पाठ रङ-जोडी माथि तोकिएको परीक्षण-गरिएको सूचीबाटै हो? के "बाँकी कति छ" भन्ने प्रगति-सूचक (जस्तै ३/१०) कतै देखिन्छ? के लगातार २ पटक गलत भएमा सही उत्तर र कारण आफैं देखाउने व्यवस्था छ? के कुल वस्तु संख्या ८ देखि १४ भित्र छ?**

अब माथिको JSON/व्याख्या नराखी, सिधै HTML कागजात मात्र सुरु गर्नुहोस्।`;
  // FIX — this call asks for a large (16000-token), highly-detailed,
  // self-contained HTML/CSS/JS game, which routinely takes longer to
  // finish than the app's normal 45s call timeout — that's what was
  // producing "Gemini ले समयमा जवाफ दिएन (75 सेकेन्डभित्र)" even when
  // Gemini was working fine, just still generating. Raised to 150s
  // (2.5 min) specifically for this one call, so a genuinely slow — but
  // successful — generation gets a fair chance instead of being cut off.
  // `retries: 1` (1 retry, so 2 attempts total instead of callGemini's
  // default 3) — see the FIX comment on callGemini's `retries` option:
  // at a 150s-per-attempt cost, 3 attempts (450s / 7.5min) before even
  // surfacing an error was the single biggest piece of the reported
  // "spins for minutes then fails" bug.
  // FIX — the automatic retry-the-whole-thing-again loop below used to
  // fire on ANY failure, including a network/rate-limit error that had
  // ALREADY exhausted callGemini's own internal retries. Retrying an
  // already-exhausted transient failure by starting a second full
  // 150s-budget generation from scratch almost never helps (the same
  // thing that just failed 2 times in a row is unlikely to succeed a
  // 3rd time moments later) and was the largest single contributor to
  // multi-minute waits before a failure was ever shown. Now it only
  // retries when the failure is specifically tagged `.truncated` (a
  // cut-off/incomplete document — see callGemini and extractHtmlDoc) —
  // a genuine content problem that a fresh attempt can plausibly fix.
  // Any other error (rate limit, timeout, network) surfaces immediately
  // instead of silently doubling the wait for a retry that was very
  // unlikely to succeed.
  let html;
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await runPrompt(prompt, ctx, { maxOutputTokens: 16000, timeoutMs: 150000, retries: 1 });
      html = extractHtmlDoc(raw);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      if (!e.truncated) break;
    }
  }
  if (lastErr) throw lastErr;
  html = applySimulationSafetyNets(html);

  // NEW — self-review pass (see reviewAndFixSimulation above). Failure
  // here is non-fatal: keep the already-valid, already-cleaned html.
  // FIX — छिटो/fast mode (skipReview=true) used to skip this pass
  // entirely to save time, but that's exactly what let blank cards and
  // meaningless/off-topic puzzle items through uncaught — the 13-point
  // checklist review is the only step that judges content quality rather
  // than markup structure. Fast mode now still runs this pass, just the
  // short, targeted `fast` variant (2 specific checks, ~60s budget, no
  // retry) instead of the full 13-point audit (~90s budget) — still
  // meaningfully faster than full mode, but no longer skipping content
  // checking altogether.
  try {
    html = await reviewAndFixSimulation(html, type, chapterTitle, lessonTitle, { fast: skipReview });
  } catch { /* keep the original, already-safety-netted html */ }

  return { html, type };
};

// NEW — 2-3 short discussion questions a teacher can ask the class right
// after a simulation ends, to turn the game into a talking point instead
// of just a score. Kept as its own small JSON call (same pattern as
// generateMoreActivities above) rather than folded into the big HTML
// generation — mixing a large freeform HTML document and a JSON array in
// one response is exactly the "large HTML document inside a JSON string"
// fragility generateSimulation's own comment above already avoids.
export const generateDiscussionTips = async (chapterTitle, lessonTitle, type, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const focus = lessonTitle && lessonTitle.trim() && lessonTitle.trim() !== chapterTitle.trim() ? `"${lessonTitle}" पाठ (अध्याय: "${chapterTitle}")` : `"${chapterTitle}"`;
  const prompt = `नेपाल ${classContext}का लागि ${focus} बारे "${type || "इन्टरएक्टिभ सिमुलेसन"}" खेल्नु सकिएपछि शिक्षकले कक्षालाई सोध्न मिल्ने २-३ वटा छोटो छलफल-प्रश्न भएको JSON array मात्र दिनुहोस् — हरेक प्रश्न एक वाक्यमा, कक्षा ५ का विद्यार्थीले सजिलै बुझ्ने सरल भाषामा, खेलमा भर्खर सिकेको कुरालाई वास्तविक जीवन/अनुभवसँग जोड्ने खालको होस्:
["प्रश्न १","प्रश्न २","प्रश्न ३"]`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  return Array.isArray(result) ? result.slice(0, 3) : [];
};

// NEW — used by AssessmentBuilder for the rubric JSON. Same JSON-mode
// reliability as the functions above.
export const generateRubric = async (prompt, ctx = null) => {
  const text = await runPromptJSON(prompt, ctx);
  return parseJSON(text);
};

// ─── CURRICULUM TEMPLATES — Teacher's Guide → merged grouping → Plan Group draft → per-chapter Yojana ─
// NEW (round 2 of the format-template upgrade). Nothing about the Guide's
// or the format's structure is hardcoded here — both are read fresh from
// whatever the teacher uploaded, every time.

// Pulls just ONE class's section out of a Teacher's Guide that covers many
// classes, as plain text — same "extract once, reuse" idea as
// extractChapterText. guidePart is a Gemini `part` (inline_data or
// file_data) built from the uploaded guide file (pdf/docx/image).
// FIX — this used to assume ONE guide file held every class's guidance
// together, and its job was to fish out just classLabel's section (see the
// old prompt in git history) — matching how the app worked until the user
// confirmed they'll now upload a separate, single-class guide file per
// class instead (teacher_guides.class_label already scopes which file this
// is). A single-class file usually won't even mention "कक्षा ६" by name
// anywhere in it, so the old "find and extract just this class's part, else
// return NOT_FOUND" prompt would now misfire and discard a perfectly good,
// already-correct-class guide. This just reads the whole file as-is instead
// — no class-isolation step needed since the DB scoping already guarantees
// the right file was picked before this function ever runs.
export async function extractGuideClassSection(guidePart, classLabel) {
  if (!guidePart) return null;
  const prompt = `यो "${classLabel}" को लागि छुट्टै तयार पारिएको शिक्षक निर्देशिका (Teacher's Guide) हो। यसको पूरा विषयवस्तु — नछोटाई, कुनै तथ्य/वाक्य नछुटाई — सादा पाठको रूपमा फिर्ता दिनुहोस्। कुनै व्याख्या वा फर्म्याटिङ नथप्नुहोस्।${RAW_TEXT_LAYER_WARNING}`;
  // FIX — was maxOutputTokens: 8192, which silently caps how much of a
  // long Teacher's Guide can come back out of this extraction step, before
  // the grouping/official-lesson/draft prompts below even see it. Raised
  // to match the other big single-document extractions in this file.
  let text;
  try { text = await callGemini([guidePart, { text: prompt }], { maxOutputTokens: 16000, timeoutMs: 90000 }); }
  catch { return null; }
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed.length < 40) return null;
  if (looksCorrupted(trimmed)) return null; // never let a corrupted extraction feed every downstream Guide-based prompt (grouping, official lessons, etc.)
  return trimmed;
}

// Given one class's isolated Guide text + that class's list of chapter
// titles, asks which chapters the Guide treats as a merged group (shared
// learning outcome → one Lesson Plan) vs standalone. Returns an array of
// groups: [{ chapter_titles: [...], reason }] — every input chapter appears
// in exactly one group (a standalone chapter is just a group of one).
export async function detectChapterGrouping(guideClassText, chapterTitles = []) {
  if (!guideClassText || !chapterTitles.length) {
    return chapterTitles.map((t) => ({ chapter_titles: [t], reason: null }));
  }
  const prompt = `तलको शिक्षक निर्देशिकाको अंश हेरी, यी अध्यायहरूमध्ये कुन-कुनलाई निर्देशिकाले एउटै/समान सिकाइ उपलब्धि (learning outcome) अन्तर्गत गाभेर एउटै पाठ योजना बनाउन सुझाव दिन्छ, र कुन-कुन अलग-अलग नै हुन् पत्ता लगाउनुहोस्।

अध्यायहरू: ${JSON.stringify(chapterTitles)}

निर्देशिकाको अंश:
${guideClassText}

ठ्याक्कै यो JSON संरचनामा मात्र जवाफ दिनुहोस् — दिइएको हरेक अध्याय ठ्याक्कै एउटा समूहमा मात्र पर्नुपर्छ (एक्लै भए पनि एउटा समूह मानिन्छ):
[{"chapter_titles":["अध्याय १"],"reason":null},{"chapter_titles":["अध्याय २","अध्याय ३"],"reason":"दुवैको सिकाइ उपलब्धि समान भएकाले निर्देशिकाले गाभेको"}]`;
  // FIX — this used to slice guideClassText to its first 12,000 characters
  // before it ever reached this prompt. If a class's guide section runs
  // longer than that (or the relevant chapter's part falls later in the
  // document), the model never saw it and defaulted to "no grouping info"
  // — collapsing everything into one lumped assumption downstream. Now
  // sends the full (already single-class, already-extracted) guide text.
  const text = await generateTextJSON(prompt, { maxOutputTokens: 8192, timeoutMs: 90000 });
  const result = parseJSON(text);
  if (!Array.isArray(result) || !result.length) {
    // Fall back to "every chapter standalone" rather than fail the whole draft.
    return chapterTitles.map((t) => ({ chapter_titles: [t], reason: null }));
  }
  return result;
}

// Given one class's isolated Guide text, decides how many OFFICIAL
// (school-submission) lesson plans this chapter/group breaks into and what
// each one covers — this is NOT the same count as the textbook's classroom
// lessons. The guidance document can merge several classroom lessons that
// share one सिकाइ उपलब्धि into a single official lesson plan (e.g. 5
// classroom lessons → 4 official plans), so this always asks the guide,
// never assumes 1:1 with classroom lessons. classroomLessonTitles is passed
// only as reference context for the AI, never as the thing being counted.
// Without a guide there is no basis to merge anything, so it falls back to
// one official lesson per classroom lesson (or one for the whole chapter if
// there are no classroom lessons either).
export async function detectOfficialLessons(guideClassText, groupChapterTitles = [], classroomLessonTitles = []) {
  const fallback = () => classroomLessonTitles.length
    ? classroomLessonTitles.map((t) => ({ official_title: t, reason: null, source_lesson_titles: [t] }))
    : [{ official_title: groupChapterTitles[0] || "", reason: null, source_lesson_titles: [] }];
  if (!guideClassText) return fallback();
  const chaptersLine = groupChapterTitles.map((t) => `"${t}"`).join(", ");
  const classroomLine = classroomLessonTitles.length
    ? `\n\nकक्षाकोठामा पढाइने पाठ्यपुस्तकका पाठहरू (सन्दर्भका लागि मात्र — आधिकारिक पाठ योजनाको संख्या यससँग बराबर हुनैपर्छ भन्ने छैन):\n${classroomLessonTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";
  const prompt = `तलको शिक्षक निर्देशिका/विद्यार्थी मूल्याङ्कन मार्गदर्शनको अंश हेरी, "${chaptersLine}" अन्तर्गत विद्यालय बुझाउनका लागि आधिकारिक पाठ योजना कति वटा बन्नुपर्छ र हरेकको दायरा के हो पत्ता लगाउनुहोस्। मार्गदर्शनले साझा सिकाइ उपलब्धि भएका पाठ्यपुस्तकका पाठहरूलाई गाभेर एउटै आधिकारिक पाठ योजना बनाउन सक्छ — यो गणना पाठ्यपुस्तकको पाठ संख्यासँग फरक हुन सक्छ, बराबर हुनैपर्छ भन्ने छैन।
${classroomLine}

निर्देशिकाको अंश:
${guideClassText}

ठ्याक्कै यो JSON array मात्र जवाफ दिनुहोस्:
[{"official_title":"आधिकारिक पाठको नाम","source_lesson_titles":["सम्बन्धित पाठ्यपुस्तक पाठ १","पाठ २"],"reason":"किन गाभियो/अलग राखियो भन्ने छोटो कारण, वा null"}]`;
  // FIX — same 12,000-character truncation bug as detectChapterGrouping
  // above; removed so the full guide section is considered.
  const text = await generateTextJSON(prompt, { maxOutputTokens: 8192, timeoutMs: 90000 });
  const result = parseJSON(text);
  if (!Array.isArray(result) || !result.length) return fallback();
  return result;
}

// Drafts a full Lesson Plan + Rubric (5E model) for EVERY official lesson
// unit (see detectOfficialLessons above) — not one shared plan for the
// whole chapter, and not necessarily one per classroom lesson either.
// officialTitles: string[], in the order the plans should come back. Returns
// an array the same length and order, one full plan-group shape per entry.
export const draftPlanGroupLessons = async (groupChapterTitles, officialTitles, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", guideClassText = null) => {
  const isMerged = groupChapterTitles.length > 1;
  const chaptersLine = groupChapterTitles.map((t) => `"${t}"`).join(", ");
  const mergedNote = isMerged
    ? `यी ${groupChapterTitles.length} वटा अध्यायहरूको सिकाइ उपलब्धि समान भएकाले शिक्षक निर्देशिकाले एउटै समूहमा राखेको छ, तर तलका हरेक आधिकारिक पाठको लागि छुट्टाछुट्टै योजना/रुब्रिक्स नै चाहिन्छ — कुनै दुईलाई एउटै बनाउनु हुँदैन।`
    : "";
  // FIX — was guideClassText.slice(0, 10000); combined with the two
  // upstream truncations above, this was the main reason a chapter's real
  // guide content (further down the document) never reached the actual
  // drafting prompt, so the AI had nothing distinguishing to work from.
  const guideBlock = guideClassText ? `\n\nशिक्षक निर्देशिकाको मार्गदर्शन (यसैलाई मुख्य आधार बनाउनुहोस्):\n${guideClassText}` : "";
  const lessonsLine = officialTitles.map((t, i) => `${i + 1}. "${t}"`).join("\n");
  const prompt = `तपाईं नेपालको ${classContext}का लागि विद्यालयमा बुझाउनका लागि पाठ योजना र मूल्याङ्कन रुब्रिक्स तयार गर्दै हुनुहुन्छ, 5E मोडेल (Engage, Explore, Explain, Elaborate, Evaluate) मा।
अध्याय: ${chaptersLine}
${mergedNote}
यी आधिकारिक पाठ योजनाहरू बनाउनुहोस् (क्रमैसँग, हरेकको लागि छुट्टै योजना चाहिन्छ):
${lessonsLine}
${guideBlock}

ठ्याक्कै यो JSON array मात्र जवाफ दिनुहोस् — माथिको सूचीमा जति वटा छन् ठ्याक्कै त्यति वटा वस्तु, त्यही क्रममा:
[{
  "lesson_title": "पाठको नाम (माथिको सूचीबाट ठ्याक्कै उस्तै)",
  "major_learning_outcomes": ["उपलब्धि १","उपलब्धि २"],
  "materials_required": ["सामग्री १","सामग्री २"],
  "engage": "कक्षा प्रवेशको लागि छोटो, ठोस गतिविधि विवरण (प्रश्न/तस्बिर/उदाहरणबाट सुरु)",
  "explore": "विद्यार्थीले आफैं छलफल/खोजी गर्ने गतिविधि विवरण",
  "explain": "शिक्षकले वा विद्यार्थीले प्रस्तुत/स्पष्ट पार्ने गतिविधि विवरण",
  "elaborate": "थप विस्तार/लागू गर्ने गतिविधि विवरण",
  "evaluate": "मूल्याङ्कनका लागि प्रश्न/कार्य विवरण",
  "rubric": [{"criteria":"मूल्याङ्कनको क्षेत्र","levels":[{"level":"उत्कृष्ट","desc":"विवरण"},{"level":"राम्रो","desc":"विवरण"},{"level":"सामान्य","desc":"विवरण"},{"level":"सुधार आवश्यक","desc":"विवरण"}]}]
}]
महत्त्वपूर्ण: हरेकको सामग्री सोहीसँग मात्र सान्दर्भिक र फरक-फरक हुनुपर्छ — दुई वटाको जवाफ उस्तै/दोहोरिनु हुँदैन। rubric मा कम्तीमा ३ वटा फरक-फरक मूल्याङ्कन क्षेत्र (जस्तै विषयवस्तु बुझाइ, सहभागिता, प्रस्तुति) समावेश गर्नुहोस्।`;
  // FIX — 8192 output tokens was tight once several official lessons each
  // need their own full plan+rubric in one JSON array; raised the budget
  // and timeout together (same pattern as the other big drafting calls in
  // this file) so a multi-lesson group doesn't get cut off mid-JSON.
  const text = await runPrompt(prompt, ctx, { jsonMode: true, maxOutputTokens: 16000, timeoutMs: 120000 });
  const result = parseJSON(text);
  if (!Array.isArray(result) || !result.length) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

// Given an APPROVED Plan Group (possibly merged, covering several
// chapters) and one specific chapter inside it, generates that chapter's
// own day-wise Yojana — deciding itself how to split the group's shared
// Engage/Explore/Explain/Elaborate/Evaluate content and activities across
// its chapters, so each chapter still gets its own classroom-ready
// sequence even though the underlying plan is shared.
export const draftYojanaForChapter = async (chapterTitle, planGroup, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const siblingChapters = (planGroup.chapter_ids_titles || []).filter((t) => t !== chapterTitle);
  const groupIsMerged = siblingChapters.length > 0;
  const splitNote = groupIsMerged
    ? `यो साझा पाठ योजना ${siblingChapters.length + 1} वटा अध्यायहरू (${[chapterTitle, ...siblingChapters].join(", ")}) ले मिलेर प्रयोग गर्छन्। यहाँ केवल "${chapterTitle}" का लागि मात्र उपयुक्त हुने भाग/गतिविधिहरू छानी, यस अध्यायको आफ्नै दिनगत (day-wise) कक्षा अनुक्रम बनाउनुहोस् — अरू अध्यायसँग दोहोरिने नराखी, समूहको योजनालाई तर्कसंगत रूपमा बाँडेर।`
    : "";
  const prompt = `तपाईं ${classContext}को "${chapterTitle}" अध्यायको लागि कक्षा-कोठामा पढाउने दिनगत योजना (Yojana) बनाउँदै हुनुहुन्छ, स्वीकृत पाठ योजनाबाट।
${splitNote}

स्वीकृत साझा पाठ योजना:
Engage: ${planGroup.engage || ""}
Explore: ${planGroup.explore || ""}
Explain: ${planGroup.explain || ""}
Elaborate: ${planGroup.elaborate || ""}
Evaluate: ${planGroup.evaluate || ""}

ठ्याक्कै यो JSON संरचनामा मात्र जवाफ दिनुहोस्:
[{"period":1,"title":"चरणको नाम","stage":"Engage","description":"यस अवधिमा कक्षामा गर्ने कुरा"}]
"stage" मा Engage/Explore/Explain/Elaborate/Evaluate मध्ये एउटा राख्नुहोस्। जति period चाहिन्छ त्यति राख्नुहोस् (सामान्यतया २-४)।`;
  const text = await runPrompt(prompt, ctx, { jsonMode: true });
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

export const chatWithAI = async (userMessage, lessonContext, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const prompt = `तपाईं नेपालको ${classContext}का शिक्षकको AI सहायक हुनुहुन्छ। नेपालीमा उत्तर दिनुहोस्।

पाठ सन्दर्भ:
${lessonContext}

शिक्षकको प्रश्न: ${userMessage}`;
  return runPrompt(prompt, ctx);
};
