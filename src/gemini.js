// gemini.js — Google Gemini AI integration (free tier)
import { supabase } from "./lib/supabase";
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
// FIX — switched from gemini-2.5-flash, which hit its free-tier rate limit
// (confirmed in Google AI Studio's Rate Limit page), to gemini-3-flash-preview,
// a current-generation model that's still free-tier. If this ever comes back
// with a "model not found" error, open Google AI Studio → Rate Limit → find
// whichever Flash-tier model shows a green checkmark (free) and swap its
// exact name in here.
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_API_KEY}`;

// ─── IndexedDB storage for large PDF files (no size limit issues) ─────────────
const DB_NAME = "sikshya_sathi";
const STORE_NAME = "files";

const openDB = () =>
  new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });

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
const textbookStoragePath = (teacherId, classLabel) => `${teacherId}/textbook/${encodeURIComponent(classLabel || "default")}.pdf`;

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
//  2. No retry — the comment above GEMINI_URL already documents this app
//     hitting the free-tier rate limit before. A 429 (rate limited) or 503
//     (temporarily overloaded) response is often transient and succeeds a
//     few seconds later, but the old code surfaced it as a hard failure on
//     the first try every time. It now retries those two specific cases
//     (up to 2 extra attempts, with backoff) before giving up — anything
//     else (bad API key, blocked content, etc.) still fails immediately
//     since retrying wouldn't help.
const RETRYABLE_STATUS = new Set([429, 503]);
const CALL_TIMEOUT_MS = 25000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGeminiOnce(body, timeoutMs = CALL_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(GEMINI_URL, {
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

async function callGemini(parts, { jsonMode = false, maxOutputTokens = 4096, timeoutMs = CALL_TIMEOUT_MS } = {}) {
  const generationConfig = { temperature: 0.7, maxOutputTokens };
  if (jsonMode) generationConfig.response_mime_type = "application/json";
  const body = { contents: [{ parts }], generationConfig };

  let res;
  let lastError;
  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      res = await fetchGeminiOnce(body, timeoutMs);
    } catch (e) {
      lastError = e;
      // Network/timeout failures: also worth a retry, same backoff as a
      // rate limit — a dropped connection is often just as transient.
      if (attempt < 2) { await sleep(1000 * (attempt + 1)); continue; }
      throw e;
    }
    if (RETRYABLE_STATUS.has(res.status) && attempt < 2) {
      // Gemini's rate-limit/overload responses are usually short-lived —
      // wait a bit longer each retry (1s, then 2s) rather than hammering
      // it again immediately.
      await sleep(1000 * (attempt + 1));
      continue;
    }
    break;
  }
  if (!res) throw lastError || new Error("Gemini सर्भरसम्म पुग्न सकिएन।");

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gemini बाट अनपेक्षित जवाफ (HTTP ${res.status}). API key जाँच गर्नुहोस्।`);
  }

  if (data.error) {
    // FIX — a 429 that survives all retries used to show the same generic
    // "Gemini API त्रुटि" as every other error, giving no hint that it's a
    // temporary capacity issue rather than something broken. Now says so
    // explicitly, since that's actionable ("try again shortly") in a way
    // a raw error code isn't for a teacher mid-class.
    if (res.status === 429) throw new Error("Gemini अहिले धेरै व्यस्त छ (rate limit) — केही सेकेन्ड पछि फेरि प्रयास गर्नुहोस्।");
    if (res.status === 503) throw new Error("Gemini अहिले अस्थायी रूपमा उपलब्ध छैन — केही सेकेन्ड पछि फेरि प्रयास गर्नुहोस्।");
    throw new Error(`Gemini API त्रुटि (${data.error.code || res.status}): ${data.error.message}`);
  }
  if (data.promptFeedback?.blockReason) throw new Error("Gemini ले यो अनुरोध रोक्यो: " + data.promptFeedback.blockReason);

  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error("Gemini ले पूरा जवाफ दिएन (कारण: " + candidate.finishReason + ") — फेरि प्रयास गर्नुहोस्।");
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
export const generateTextJSON = (prompt) => callGemini([{ text: prompt }], { jsonMode: true });

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
        parts.push({ text: `[फाइल: ${m.name}]\n${m.extracted_text}` });
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

// NEW — pulls one chapter's plain text out of the textbook PDF, once. This
// itself costs one full-book read (same token cost as before), but it's
// the ONLY time that cost is paid for a given chapter: App.jsx's
// getMaterialContext caches the result via db.saveTextbookChapterText, so
// every later AI call for that chapter sends this small text instead of
// re-attaching the whole book — the actual token-savings win.
export async function extractChapterText(chapterTitle, classLabel) {
  const part = await getTextbookPart(classLabel);
  if (!part) return null;
  const prompt = `यो नेपाली पाठ्यपुस्तकबाट "${chapterTitle}" नामक अध्याय/पाठ पत्ता लगाउनुहोस् र त्यसको पूरा पाठ — जस्ताको त्यस्तै, नछोटाई, संक्षेप नगरी — सादा पाठको रूपमा मात्र फिर्ता दिनुहोस्। कुनै व्याख्या, शीर्षक, वा फर्म्याटिङ नथप्नुहोस्, केवल अध्यायको वास्तविक पाठ मात्र दिनुहोस्। यदि यस्तो नामको अध्याय ठ्याक्कै भेटिएन भने अरू केही नलेखी ठ्याक्कै यही शब्द मात्र लेख्नुहोस्: NOT_FOUND`;
  let text;
  try { text = await callGemini([part, { text: prompt }], { maxOutputTokens: 8192 }); }
  catch { return null; } // extraction failures fall back silently — the caller re-tries with the whole book for this one call
  const trimmed = (text || "").trim();
  if (!trimmed || trimmed === "NOT_FOUND" || trimmed.length < 40) return null;
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
  return callGemini([...parts, { text: hasBothSources(ctx) ? prompt + MATERIALS_PRIORITY_NOTE : prompt }], options);
}
async function runPromptJSON(prompt, ctx) {
  const parts = contextParts(ctx);
  if (!parts.length) return generateTextJSON(prompt);
  return callGemini([...parts, { text: hasBothSources(ctx) ? prompt + MATERIALS_PRIORITY_NOTE : prompt }], { jsonMode: true });
}
// NEW — the one function callers should use when they have a getMaterialContext()
// ctx object (materials + textbook). Older code called generateWithMaterials/
// generateWithPDF directly with pieces of ctx, which bypassed both the
// materials-priority note and (now) the cached-chapter-text token savings.
export const generateFromContext = (prompt, ctx) => runPrompt(prompt, ctx);
export const generateFromContextJSON = (prompt, ctx) => runPromptJSON(prompt, ctx);


// ─── High-level generation helpers ───────────────────────────────────────────
export const generateLessonPlan = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const prompt = `तपाईं नेपालको ${classContext}का लागि पाठ योजना बनाउँदै हुनुहुन्छ।
अध्याय: "${chapterTitle}"
यो ठ्याक्कै यो JSON संरचनामा मात्र जवाफ दिनुहोस्:
{
  "objectives": ["उद्देश्य १","उद्देश्य २","उद्देश्य ३"],
  "vocabulary": ["शब्द १: छोटो र सरल अर्थ","शब्द २: छोटो र सरल अर्थ","शब्द ३: छोटो र सरल अर्थ","शब्द ४: छोटो र सरल अर्थ","शब्द ५: छोटो र सरल अर्थ"],
  "sequence": ["चरण १","चरण २","चरण ३","चरण ४","चरण ५"],
  "key_questions": ["प्रश्न १?","प्रश्न २?","प्रश्न ३?"],
  "activities": ["क्रियाकलाप १","क्रियाकलाप २"],
  "homework": "गृहकार्य विवरण",
  "notes": "शिक्षकका लागि टिप्पणी",
  "rubric": [{"level":"उत्कृष्ट","desc":"विवरण"},{"level":"राम्रो","desc":"विवरण"},{"level":"सहयोग आवश्यक","desc":"विवरण"}]
}
महत्त्वपूर्ण: "vocabulary" मा हरेक शब्दसँग अनिवार्य रूपमा छोटो अर्थ ":" चिन्हले छुट्याएर दिनुहोस् (जस्तै "अनुभूति: महसुस भएको कुरा")। शब्द वा अर्थमा अल्पविराम (,) कहिल्यै नराख्नुहोस्।`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया — Gemini बाट केही फर्केन)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

export const generateQuestions = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const prompt = `नेपालको ${classContext} "${chapterTitle}" अध्यायका लागि १० विभिन्न प्रकारका प्रश्नहरू भएको JSON array मात्र:
[{"text":"प्रश्न?","type":"छोटो उत्तर","difficulty":"सजिलो","bloom":"सम्झना","answer":"उत्तर"},
{"text":"प्रश्न?","type":"बहुविकल्पीय","difficulty":"मध्यम","bloom":"बुझाई","options":["क) विकल्प","ख) विकल्प","ग) विकल्प","घ) विकल्प"],"correct_option":0,"answer":"उत्तर"}]`;
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

export const generateActivities = async (chapterTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const prompt = `नेपाल ${classContext} "${chapterTitle}" का लागि ५ कक्षागत क्रियाकलाप भएको JSON array मात्र:
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

// NEW — generates one complete, self-contained interactive simulation/game
// for a lesson (a click-and-drag matching game, a labeled-diagram
// simulation, a scenario-based decision game, etc. — Gemini picks whatever
// suits the topic best). Returned as a single HTML string with everything
// inline (CSS + JS, no external files/CDNs, since it has to run offline in
// a sandboxed iframe on a phone in a classroom with no reliable internet).
// Deliberately NOT JSON mode — the payload itself IS the artifact, so
// asking for raw HTML text and stripping any ```html fence around it is
// both simpler and less likely to truncate/escape badly than smuggling a
// large HTML document inside a JSON string field.
export const generateSimulation = async (chapterTitle, lessonTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const prompt = `तपाईं नेपालको ${classContext}का लागि एउटा इन्टरएक्टिभ (अन्तरक्रियात्मक) सिमुलेसन/खेल बनाउँदै हुनुहुन्छ, जुन विद्यार्थीहरूले मोबाइल वा ट्याब्लेटको स्क्रिनमा छोई/तानी खेल्न सक्छन्।

अध्याय: "${chapterTitle}"
पाठ: "${lessonTitle || chapterTitle}"

यो विषयका लागि सबैभन्दा उपयुक्त प्रकार आफैं छान्नुहोस् — जस्तै: मिलाउने खेल (drag-and-drop matching), लेबल गर्ने नक्सा/चित्र, समयसीमा (timeline) क्रम मिलाउने, दृश्य-आधारित निर्णय सिमुलेसन, वर्गीकरण खेल (sorting/categorizing), वा छोटो क्विज-सिमुलेसन। खेल विषयवस्तुसँग प्रत्यक्ष सान्दर्भिक हुनुपर्छ, सामान्य वा फितलो होइन।

कडा आवश्यकताहरू — ठ्याक्कै पालना गर्नुहोस्:
1. जवाफ ठ्याक्कै एउटा पूर्ण, स्वतन्त्र (self-contained) HTML कागजात मात्र दिनुहोस् — <!DOCTYPE html> बाट सुरु गरी </html> मा सकिने। कुनै व्याख्या, कुनै markdown कोड-फेन्स (\`\`\`), कुनै अगाडि/पछाडिको वाक्य नथप्नुहोस्।
2. सबै CSS <style> ट्यागभित्र र सबै JavaScript <script> ट्यागभित्र, उही फाइलमा नै राख्नुहोस्। कुनै बाह्य फाइल, फन्ट, CDN, वा इन्टरनेट लिङ्क प्रयोग नगर्नुहोस् (अफलाइन चल्नुपर्छ)।
3. सबै पाठ/लेबल/निर्देशन नेपाली भाषामा, कक्षा ५ का विद्यार्थीले सजिलै बुझ्ने सरल शब्दमा लेख्नुहोस्।
4. डिजाइन आकर्षक र रमाइलो बनाउनुहोस्: उज्ज्वल रङहरू, गोलाकार कुनाहरू, नरम छायाँ (shadow), सहज एनिमेसन/ट्रान्जिसन, इमोजी वा CSS/SVG आकृतिहरूद्वारा दृश्य तत्व। फिका, बोरिङ, प्लेन टेक्स्ट देखिने पेज नबनाउनुहोस् — रङ्गीन र चलायमान महसुस हुनुपर्छ।
5. इन्टरएक्टिभ बनाउनुहोस्: क्लिक/ट्याप/ड्र्याग जस्ता वास्तविक अन्तरक्रिया चाहिन्छ, केवल स्क्रोल गरेर पढ्ने स्थिर पृष्ठ पर्याप्त छैन।
6. तत्काल प्रतिक्रिया दिनुहोस्: सही/गलत छनोटमा रंग/एनिमेसन/छोटो सन्देशद्वारा तुरुन्तै प्रतिक्रिया देखाउनुहोस्, र अन्त्यमा स्कोर वा सारांश देखाउनुहोस्।
7. एउटा "फेरि खेल्नुहोस्" (restart) बटन राख्नुहोस् जसले पूरै अवस्था रिसेट गरोस्।
8. मोबाइल स्क्रिनमा राम्रोसँग मिल्ने गरी उत्तरदायी (responsive) बनाउनुहोस् — प्रयोगकर्ताले जुम/स्क्रोल गरिरहनु नपरोस्।
9. viewport meta ट्याग राख्नुहोस्: <meta name="viewport" content="width=device-width, initial-scale=1">

अब मास्टियोक्त JSON/व्याख्या नराखी, सिधै HTML कागजात मात्र सुरु गर्नुहोस्।`;
  const raw = await runPrompt(prompt, ctx, { maxOutputTokens: 8192, timeoutMs: 55000 });
  let html = (raw || "").trim();
  // Strip a ```html ... ``` fence if Gemini wrapped it despite instructions.
  html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const docStart = html.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (docStart > 0) html = html.slice(docStart);
  if (!html || docStart === -1) {
    const preview = html ? html.slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सिमुलेसन बनाउन सकेन। जवाफको सुरुवात: " + preview);
  }
  return html;
};

// NEW — used by AssessmentBuilder for the rubric JSON. Same JSON-mode
// reliability as the functions above.
export const generateRubric = async (prompt, ctx = null) => {
  const text = await runPromptJSON(prompt, ctx);
  return parseJSON(text);
};

export const chatWithAI = async (userMessage, lessonContext, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन") => {
  const prompt = `तपाईं नेपालको ${classContext}का शिक्षकको AI सहायक हुनुहुन्छ। नेपालीमा उत्तर दिनुहोस्।

पाठ सन्दर्भ:
${lessonContext}

शिक्षकको प्रश्न: ${userMessage}`;
  return runPrompt(prompt, ctx);
};
