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

// NEW — a broad pool of distinct interactive mechanics a simulation can be
// built around. Previously the prompt just listed a few as suggestions and
// let Gemini pick — in practice that meant it kept defaulting to whichever
// one it found easiest, so repeated generations for the same lesson often
// came out the same. pickNextSimulationType() now makes the choice in code
// instead, so hitting "generate" repeatedly actually cycles through
// different formats rather than hoping for variety.
export const SIMULATION_TYPES = [
  { id: "dragdrop", label: "ड्र्याग-ड्रप मिलाउने खेल", instruction: "एउटा ड्र्याग-एन्ड-ड्रप मिलाउने खेल बनाउनुहोस् — साना वस्तु/शब्द/तस्विर (कार्ड) तानेर सही ठाउँ, जोडी, वा समूहमा राख्नुपर्ने।" },
  { id: "labeling", label: "लेबल गर्ने चित्र/नक्सा", instruction: "एउटा लेबल गर्नुपर्ने चित्र वा नक्सा बनाउनुहोस् — इनलाइन SVG/CSS ले कोड गरिएको एउटा दृश्य (नक्सा, चित्र, वा रेखाचित्र) मा विद्यार्थीले सही नाम/लेबल ट्याप वा तानेर सही ठाउँमा राख्नुपर्ने।" },
  { id: "ordering", label: "क्रम मिलाउने खेल", instruction: "एउटा क्रम मिलाउने (sequencing/timeline) खेल बनाउनुहोस् — घटना, चरण, वा तथ्यहरूलाई सही क्रममा तानेर वा ट्याप गरेर मिलाउनुपर्ने।" },
  { id: "sorting", label: "वर्गीकरण खेल", instruction: "एउटा वर्गीकरण (sorting/categorizing) खेल बनाउनुहोस् — विभिन्न वस्तु/तथ्य/उदाहरणहरूलाई सही समूह वा बाकसमा तानेर वा ट्याप गरेर छुट्याउनुपर्ने।" },
  { id: "scenario", label: "निर्णय सिमुलेसन", instruction: "एउटा दृश्य-आधारित निर्णय सिमुलेसन बनाउनुहोस् — विद्यार्थीले एउटा परिस्थिति देखेर विकल्पमध्ये छनोट गर्ने, र प्रत्येक छनोटले फरक-फरक नतिजा/अर्को चरण देखाउने (branching)।" },
  { id: "memory", label: "जोडा मिलाउने कार्ड खेल", instruction: "एउटा कार्ड पल्टाउने सम्झना/जोडा मिलाउने खेल (memory/flip-card matching) बनाउनुहोस् — कार्डहरू पल्टाएर सम्बन्धित जोडा (जस्तै शब्द र अर्थ, वा चित्र र नाम) फेला पार्नुपर्ने।" },
  { id: "hotspot", label: "नक्सा/दृश्य अन्वेषण", instruction: "एउटा हटस्पट-अन्वेषण सिमुलेसन बनाउनुहोस् — इनलाइन SVG/CSS ले बनाएको एउटा नक्सा वा दृश्यमा विभिन्न ठाउँहरूमा ट्याप गर्दा त्यस ठाउँसँग सम्बन्धित जानकारी/तथ्य देखिने।" },
  { id: "fillblank", label: "रिक्त स्थान भर्ने खेल", instruction: "एउटा रिक्त-स्थान भर्ने खेल बनाउनुहोस् — वाक्य/अनुच्छेदमा छुटेका ठाउँमा सही शब्द तानेर वा ट्याप गरेर भर्नुपर्ने (शब्द बैंकबाट छान्ने)।" },
  { id: "buildsim", label: "निर्माण/जोड्ने सिमुलेसन", instruction: "एउटा चरणबद्ध निर्माण/जोड्ने सिमुलेसन बनाउनुहोस् — विद्यार्थीले सही क्रममा भाग/तत्वहरू थपेर वा ट्याप गरेर कुनै संरचना, प्रक्रिया, वा दृश्य पूरा गर्नुपर्ने।" },
  { id: "resource", label: "स्रोत व्यवस्थापन सिमुलेसन", instruction: "एउटा स्रोत-व्यवस्थापन सिमुलेसन बनाउनुहोस् — विद्यार्थीले स्लाइडर/बटन/छनोटहरू प्रयोग गरी स्रोत वा निर्णय बाँड्ने, र त्यसको नतिजा/असर तुरुन्तै दृश्य रूपमा देखिने।" },
  { id: "process", label: "प्रक्रिया सिमुलेसन", instruction: "एउटा प्रक्रिया-सिमुलेसन बनाउनुहोस् — कुनै प्राकृतिक वा सामाजिक प्रक्रियाका चरणहरूमा ट्याप गर्दै अगाडि बढ्दा हरेक चरणमा दृश्य परिवर्तन र छोटो व्याख्या देखिने।" },
  { id: "puzzle", label: "टुक्रा जोड्ने पजल", instruction: "एउटा टुक्रा जोड्ने (jigsaw-जस्तो) पजल बनाउनुहोस् — इनलाइन SVG/CSS ले बनाइएको चित्र/नक्सालाई टुक्राहरूमा छुट्याई विद्यार्थीले तानेर सही ठाउँमा जोड्नुपर्ने।" },
  { id: "wordsearch", label: "शब्द खोज्ने पजल", instruction: "एउटा अक्षर-ग्रिड शब्द खोज्ने खेल बनाउनुहोस् — पाठसँग सम्बन्धित शब्दहरू ग्रिडभित्र लुकाइएको हुनुपर्छ, विद्यार्थीले अक्षरहरू ट्याप/तानेर शब्द फेला पार्नुपर्ने।" },
  { id: "crossword", label: "क्रसवर्ड पजल", instruction: "एउटा साधारण क्रसवर्ड (वाक्रम शब्द) पजल बनाउनुहोस् — पाठका शब्दावलीमा आधारित सङ्केत (clue) हेरेर ग्रिडका खानाहरूमा अक्षर ट्याइप/ट्याप गरी शब्द भर्नुपर्ने।" },
  { id: "beforeafter", label: "पहिले-पछि तुलना स्लाइडर", instruction: "एउटा पहिले/पछि तुलना स्लाइडर बनाउनुहोस् — इनलाइन SVG/CSS ले बनाइएका दुई दृश्य (परिवर्तन हुनुअघि र पछि) बीच एउटा तान्न मिल्ने स्लाइडरले छुट्याउने, र फरकहरू लेबल गरिएको हुनुपर्ने।" },
  { id: "maze", label: "मार्ग/भूलभुलैया खेल", instruction: "एउटा भूलभुलैया/मार्ग-खोज्ने खेल बनाउनुहोस् — विद्यार्थीले बटन/ट्याप/ड्र्यागद्वारा एउटा पात्र वा बिन्दुलाई सही मार्गबाट लक्ष्यसम्म लैजानुपर्ने, बाटोमा पाठसँग सम्बन्धित चेकपोइन्ट/तथ्यहरू राख्न सकिन्छ।" },
  { id: "connectpath", label: "जोड्ने रेखा (कनेक्ट) खेल", instruction: "एउटा कनेक्ट-द-डट जस्तो जोड्ने खेल बनाउनुहोस् — सम्बन्धित दुई वस्तु/स्थान/तथ्यहरूबीच तानेर वा ट्याप गरेर रेखा जोड्नुपर्ने, सही जोडीमा मात्र रेखा मिल्ने।" },
  { id: "votesim", label: "मतदान/निर्णय सिमुलेसन", instruction: "एउटा मतदान/सामूहिक निर्णय सिमुलेसन बनाउनुहोस् — विद्यार्थीले कुनै नागरिक/सामाजिक परिस्थितिमा विकल्पहरूमध्ये मत हाल्ने, र नतिजा/तालिका तुरुन्तै अपडेट भई छोटो व्याख्यासहित देखिने।" },
  { id: "dialogue", label: "संवाद-आधारित भूमिका खेल", instruction: "एउटा संवाद-आधारित भूमिका खेल बनाउनुहोस् — कुनै पात्रसँगको कुराकानीमा विद्यार्थीले आफ्नो जवाफ/कार्य छनोट गर्दै जाने, र प्रत्येक छनोटले फरक-फरक संवाद वा नतिजामा लैजाने।" },
  { id: "mapcolor", label: "नक्सा रङ्ग भर्ने खेल", instruction: "एउटा नक्सा/क्षेत्र रङ्ग भर्ने खेल बनाउनुहोस् — इनलाइन SVG ले बाँडिएको नक्सा/क्षेत्रमा ट्याप गर्दा सही श्रेणी अनुसार रङ्ग भरिने, गलत भए फरक संकेत देखिने।" },
  { id: "timelinescrub", label: "घुमाउने समयरेखा", instruction: "एउटा तान्न मिल्ने समयरेखा (timeline slider) बनाउनुहोस् — स्लाइडर तानेर विभिन्न युग/घटनाहरूमा सर्दा दृश्य र छोटो तथ्य/विवरण परिवर्तन हुनुपर्ने।" },
  { id: "bargraph", label: "तान्ने बार-ग्राफ खेल", instruction: "एउटा तान्न मिल्ने बार-ग्राफ खेल बनाउनुहोस् — दिइएको डाटा/तथ्यसँग मिलाउन विद्यार्थीले बारका उचाइहरू तानेर मिलाउनुपर्ने, सही भएमा तुरुन्तै संकेत देखिने।" },
  { id: "spotdifference", label: "फरक पत्ता लगाउने खेल", instruction: "एउटा फरक पत्ता लगाउने खेल बनाउनुहोस् — इनलाइन SVG/CSS ले बनाइएका उस्तै-उस्तै देखिने दुई दृश्यमा भएका केही फरकहरू विद्यार्थीले ट्याप गरेर फेला पार्नुपर्ने।" },
  { id: "barter", label: "साट्ने/व्यापार सिमुलेसन", instruction: "एउटा साट्ने/व्यापार सिमुलेसन बनाउनुहोस् — विद्यार्थीले वस्तुहरू तानेर साटासाट तालिकामा राख्ने, र त्यो साटासाट उचित/अनुचित हो भनी तुरुन्तै प्रतिक्रिया पाउने।" },
  { id: "familytree", label: "संरचना/रेखाचित्र जोड्ने खेल", instruction: "एउटा संरचना/रेखाचित्र (जस्तै परिवार वा संगठन) जोड्ने खेल बनाउनुहोस् — नाम/भूमिका लेबलहरू तानेर रेखाचित्रको सही स्थानमा राख्नुपर्ने।" },
  { id: "compassdir", label: "दिशा पत्ता लगाउने खेल", instruction: "एउटा दिशा/कम्पास पत्ता लगाउने खेल बनाउनुहोस् — इनलाइन SVG ले बनाइएको नक्सा/दृश्य हेरी विद्यार्थीले कम्पास घुमाएर वा ट्याप गरेर सही दिशा छान्नुपर्ने।" },
  { id: "balancescale", label: "ब्यालेन्स स्केल तुलना खेल", instruction: "एउटा ब्यालेन्स-स्केल तुलना खेल बनाउनुहोस् — वस्तु/तौल तानेर स्केलका दुई पल्लामा राख्दा नतिजा (कुन बढी/कम, वा सन्तुलन मिल्यो कि मिलेन) तुरुन्तै दृश्य रूपमा देखिने।" },
  { id: "seasoncycle", label: "ऋतु/चक्र सिमुलेसन", instruction: "एउटा चक्र-सिमुलेसन बनाउनुहोस् (जस्तै ऋतु, जल-चक्र, वा खेती-चक्र) — ट्याप गर्दै चक्रका चरणहरूमा अगाडि बढ्दा दृश्य परिवर्तन हुँदै हरेक चरणमा छोटो तथ्य देखिने।" },
];

// Picks a type not yet used for this lesson (in this sitting); once every
// type has been tried, it just avoids repeating the immediately-previous
// one rather than locking up.
export function pickNextSimulationType(usedTypeIds = []) {
  const unused = SIMULATION_TYPES.filter((t) => !usedTypeIds.includes(t.id));
  const pool = unused.length ? unused : SIMULATION_TYPES.filter((t) => t.id !== usedTypeIds[usedTypeIds.length - 1]);
  const list = pool.length ? pool : SIMULATION_TYPES;
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
export const generateSimulation = async (chapterTitle, lessonTitle, ctx = null, classContext = "कक्षा ५ सामाजिक अध्ययन", simulationType = null) => {
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
महत्त्वपूर्ण: साधारण "प्रश्न सोध्ने र विकल्पमध्ये एउटा क्लिक गर्ने" बहुविकल्पीय प्रश्नोत्तर (MCQ quiz) कहिल्यै नबनाउनुहोस् — माथि तोकिएको ढाँचामै बनाउनुहोस्, अर्को ढाँचामा होइन।

सामग्रीको स्तर — यो सबैभन्दा महत्त्वपूर्ण नियम हो:
- कम्तिमा ८-१२ वटा फरक-फरक अन्तरक्रियात्मक वस्तु/जोडी/चरण/राउन्ड हुनुपर्छ (जस्तै: ८+ जोडा मिलाउने कार्ड, ८+ लेबल गर्नुपर्ने ठाउँ, ८+ क्रम मिलाउने वस्तु, ८+ वर्गीकरण गर्नुपर्ने वस्तु, आदि — ढाँचा जे भए पनि सोही अनुसार गन्ती लागू हुन्छ)। ३-४ वटा मात्र भएको सिमुलेसन अस्वीकार्य छ — यो धेरै पातलो र छिट्टै सकिने हुन्छ।
- यति धेरै वस्तु राख्दा पनि स्क्रिनमा नअटाई ओभरफ्लो हुनु/लुक्नु हुँदैन — तलको "स्क्रिनभित्रै अटाउने नियम" अनिवार्य रूपमा पालना गर्नुहोस्। धेरै वस्तु भएमा एकैचोटि सबै नदेखाई ग्रिड/राउन्डमा विभाजन गर्न सक्नुहुन्छ (जस्तै "राउन्ड १ / ८", अर्को बटनले अर्को समूह देखाउने), तर कुनै पनि वस्तु स्क्रिनबाट बाहिर गई नदेखिने वा काटिने हुनु हुँदैन।
- हरेक वस्तु/तथ्य माथिको पाठ्यसामग्रीबाट सिकिएको वास्तविक जानकारीमा आधारित हुनुपर्छ, दोहोरिनु हुँदैन।
- सुरुमा छोटो (१-२ वाक्य) स्पष्ट निर्देशन देखाउनुहोस् ताकि कक्षाले के गर्ने हो तुरुन्तै बुझोस्।
- सबै वस्तु/जोडी/सही-उत्तरहरू एउटै JavaScript डाटा-सूची (array/object) मा पहिल्यै परिभाषित गर्नुहोस् (जस्तै [{item:"...", correctCategory:"..."}, ...]), र त्यही डाटाबाटै UI (कार्ड/लेबल) र सही/गलत जाँच्ने लजिक दुवै बनाउनुहोस् — यसो नगरे UI मा देखिने कुरा र भित्री जाँच बेमेल भई सही राखे पनि "गलत" भन्ने वा उल्टो हुन सक्छ। हरेक वस्तुको सही जवाफ पाठ्यसामग्रीसँग तथ्यगत रूपमा मिल्नुपर्छ, अड्कल वा अस्पष्ट हुनु हुँदैन।

कडा आवश्यकताहरू — ठ्याक्कै पालना गर्नुहोस्:
1. जवाफ ठ्याक्कै एउटा पूर्ण, स्वतन्त्र (self-contained) HTML कागजात मात्र दिनुहोस् — <!DOCTYPE html> बाट सुरु गरी </html> मा सकिने। कुनै व्याख्या, कुनै markdown कोड-फेन्स (\`\`\`), कुनै अगाडि/पछाडिको वाक्य नथप्नुहोस्।
2. सबै CSS <style> ट्यागभित्र र सबै JavaScript <script> ट्यागभित्र, उही फाइलमा नै राख्नुहोस्। कुनै बाह्य फाइल, फन्ट, CDN, वा इन्टरनेट लिङ्क प्रयोग नगर्नुहोस् (अफलाइन चल्नुपर्छ)।
3. सबै पाठ/लेबल/निर्देशन नेपाली भाषामा, कक्षा ५ का विद्यार्थीले सजिलै बुझ्ने सरल शब्दमा लेख्नुहोस्।
4. डिजाइन आकर्षक र रमाइलो बनाउनुहोस्: उज्ज्वल रङहरू (राम्रो कन्ट्रास्टसहित, टाढाबाट छुट्याउन सकिने), गोलाकार कुनाहरू, नरम छायाँ (shadow), सहज एनिमेसन/ट्रान्जिसन, इमोजी वा CSS/SVG आकृतिहरूद्वारा दृश्य तत्व। फिका, बोरिङ, प्लेन टेक्स्ट देखिने पेज नबनाउनुहोस् — रङ्गीन र चलायमान महसुस हुनुपर्छ।
5. **स्क्रिनभित्रै अटाउने नियम — यो सबैभन्दा बढी बिग्रने भाग हो, ध्यान दिनुहोस्:**
   - सबैभन्दा बाहिरी कन्टेनरमा * { box-sizing: border-box; } राख्नुहोस्, र html, body मा margin:0; padding:0; overflow:hidden; width:100vw; height:100vh; राख्नुहोस् ताकि पूरा पेज ब्राउजर विन्डोभित्रै ठ्याक्कै अटाओस्, बाहिर पोखिएर नदेखियोस्।
   - मुख्य लेआउटमा absolute/fixed पिक्सेल-आधारित पोजिसनिङ (जस्तै left: 850px) प्रयोग नगर्नुहोस् — त्यसले सानो/ठूलो स्क्रिनमा तत्व बाहिर गएर हराउन सक्छ। बरु Flexbox वा CSS Grid प्रयोग गर्नुहोस् (display:flex/grid, flex-wrap:wrap, gap, justify-content, align-items) जुन उपलब्ध ठाउँ अनुसार आफैं मिलेर बस्छ।
   - फन्ट-साइज, ग्याप, प्याडिङ जस्ता नाप clamp() वा vw/vh जस्ता सापेक्षिक एकाइहरूमा राख्नुहोस् (जस्तै font-size: clamp(18px, 2.2vw, 30px)) ताकि विभिन्न प्रोजेक्टर रिजोल्युसनमा पनि स्वतः मिलोस्।
   - यदि सामग्री लामो भई एउटै स्क्रिनमा नअट्ने भयो भने, त्यो एउटा छुट्टै भित्री क्षेत्र (जस्तै .game-area { max-height: 78vh; overflow-y: auto; }) मा मात्र स्क्रोल हुनुपर्छ, पूरा पेज होइन — र शीर्षक/निर्देशन/स्कोर जस्ता महत्त्वपूर्ण भाग सधैं देखिइरहनुपर्छ (स्क्रोल गर्दा हराउनु हुँदैन)।
   - कुनै पनि तत्व अर्को तत्वमाथि ओभरल्याप भएर लुक्नु हुँदैन, र कुनै पनि पाठ/बटन काटिएर वा आधा मात्र देखिएर रहनु हुँदैन।
   - **वस्तुहरू कहिल्यै एउटै लामो ठाडो (vertical) स्तम्भमा नथाप्नुहोस्** (जस्तै १२ वटा कार्ड एकपछि अर्को तल-तल थुपार्नु) — त्यसले पेज धेरै लामो बनाई तल स्क्रोल नगरी बाँकी भाग (विशेष गरी लक्ष्य/कोठाहरू) देखिँदैन। बरु multi-column grid प्रयोग गर्नुहोस् (जस्तै display:grid; grid-template-columns: repeat(auto-fit, minmax(120px,1fr)); वा 3-4 स्तम्भको flex-wrap) ताकि धेरै वस्तु पनि थोरै उचाइमा फैलिएर अटून्।
   - **स्रोत-वस्तु र लक्ष्य/कोठा दुवै एकैचोटि, सँगै देखिनुपर्छ** — जुन ढाँचामा वस्तुहरू कुनै समूह/कोठा/लक्ष्यमा तान्ने वा राख्ने हो (जस्तै मिलाउने, वर्गीकरण, लेबल गर्ने, नक्सा रङ्ग भर्ने, संरचना जोड्ने), त्यहाँ स्रोत-वस्तुहरू र तिनका लक्ष्य/कोठा/श्रेणीहरू पहिलो नजरमै एउटै स्क्रिनमा देखिनुपर्छ — लक्ष्यहरू तल धेरै टाढा राखेर विद्यार्थीले पहिले स्क्रोल गरेर मात्र भेट्टाउनुपर्ने बनाउनु हुँदैन। यसका लागि स्क्रिनलाई दुई भागमा छुट्याउनुहोस् (जस्तै माथि/तल दुई पट्टी, वा देब्रे-दायाँ दुई स्तम्भ): एक भागमा सानो-सानो स्रोत-कार्डको ग्रिड, अर्को भागमा स्पष्ट लेबल भएका लक्ष्य/कोठाहरू। दुवै भाग सँगै नअटे भने वस्तु संख्या कम गरेर राउन्डमा बाँड्नुहोस् (माथि नै भनिएझैं), तर हरेक राउन्डमा त्यो राउन्डका स्रोत र लक्ष्य दुवै सँगै देखिनैपर्छ।
   - **हरेक लक्ष्य/कोठा/श्रेणीमा स्पष्ट, छोटो नेपाली नाम/शीर्षक लेखिएकै हुनुपर्छ** — खाली वा लेबल नभएको कोठा कहिल्यै नराख्नुहोस्।
6. **इनपुट/अन्तरक्रिया भरपर्दो बनाउनुहोस्:**
   - तान्न मिल्ने (drag) तत्वमा mousedown/mousemove/mouseup को सट्टा Pointer Events (pointerdown, pointermove, pointerup, pointercancel) प्रयोग गर्नुहोस् — यसले माउस र टच दुवैमा एकैचोटि काम गर्छ। तान्न मिल्ने हरेक तत्वमा element.setPointerCapture(event.pointerId) पनि कल गर्नुहोस्।
   - तान्न मिल्ने तत्वमा CSS मा touch-action: none; र user-select: none; -webkit-user-select: none; राख्नुहोस्।
   - सम्भव भएसम्म ड्र्याग-ड्रपको साथसाथै "पहिले एउटा वस्तुमा क्लिक गरेर छान्ने, अनि लक्ष्यमा क्लिक गरेर राख्ने" (click-select-then-click-place) विकल्प पनि दिनुहोस् — किनकि शिक्षकले माउसले सटीक ड्र्याग गर्नुभन्दा दुई क्लिक गर्नु बढी भरपर्दो हुन्छ, र यसले ड्र्याग नै बिग्रँदा पनि खेल चलाउन मिल्छ।
   - सबै बटन/कार्ड/लक्ष्य-क्षेत्र माउसले सजिलै क्लिक गर्न मिल्ने ठूलो साइजमा राख्नुहोस् (कम्तिमा ~56×56px)।
7. इन्टरएक्टिभ बनाउनुहोस्: क्लिक/ड्र्याग जस्ता वास्तविक अन्तरक्रिया चाहिन्छ, केवल स्क्रोल गरेर पढ्ने स्थिर पृष्ठ पर्याप्त छैन।
8. **प्रतिक्रिया/सन्देश लामो समयसम्म देखिनुपर्छ — छिट्टै हराउनु हुँदैन:** सही/गलत छनोटमा रंग/एनिमेसनसँगै छोटो सन्देश देखाउनुहोस्, र त्यो सन्देश कम्तिमा ३.५–४ सेकेन्डसम्म स्क्रिनमा रहनुपर्छ (setTimeout मा कम्तिमा 3500ms राख्नुहोस्) — शिक्षकले कक्षालाई भन्दै/व्याख्या गर्दै गर्दा सन्देश एकै छिनमा हराउनु हुँदैन। अन्त्यमा स्कोर वा सारांश देखाउनुहोस् — यो सारांश पनि स्क्रिनभित्रै अटाउनुपर्छ, नयाँ ठूलो ब्लक थपेर पेज नफैलाउनुहोस्, र सारांश आफैं हराउनु हुँदैन (शिक्षकले फेरि खेल्नुहोस् नथिचेसम्म देखिइरहनुपर्छ)।
9. **नियन्त्रण बटनहरू सधैं देखिने ठाउँमा राख्नुहोस् (जस्तै माथि/तलको पट्टीमा स्थिर/sticky), स्क्रोल गर्दा वा राउन्ड बदल्दा पनि हराउनु हुँदैन:**
   - एउटा "फेरि खेल्नुहोस्" (restart) बटन राख्नुहोस् जसले पूरै अवस्था (सबै वस्तु, स्कोर, प्रगति) पूर्ण रूपमा सुरुको स्थितिमा फर्काओस् — यो बटन जुनसुकै बेला, अड्किएको अवस्थामा पनि, तुरुन्तै देख्न र थिच्न मिल्ने ठाउँमा (जस्तै कुनामा स्थिर रूपमा) राख्नुहोस्, कतै तल गएर/लुकेर बस्नु हुँदैन।
   - यदि सामग्री धेरै भई राउन्ड/समूहमा बाँडिएको छ भने, "← अघिल्लो" र "अर्को →" जस्ता स्पष्ट नेभिगेसन बटन राख्नुहोस् ताकि शिक्षकले आफ्नै गतिमा, कक्षालाई व्याख्या गर्दै, एक-एक वस्तु/राउन्ड अगाडि बढाउन सक्नुहुन्छ — सबै कुरा एकैचोटि नआओस्, शिक्षकको नियन्त्रणमा होस्।
10. **पूरा सिमुलेसन सफलतापूर्वक सकिँदा (सबै वस्तु/राउन्ड पूरा भएपछि) एउटा छोटो, ठूलो, रमाइलो उत्सव-एनिमेसन देखाउनुहोस्** — जस्तै रंगीन कन्फेटी/तारा CSS एनिमेसनले स्क्रिन भरिने, "सबै सही!" वा "बधाई छ!" जस्तो ठूलो पाठसहित। यो एनिमेसन/सन्देश पनि कम्तिमा ३.५ सेकेन्ड रहनुपर्छ र त्यसपछि मात्र सामान्य सारांश देखिनुपर्छ। यो CSS/JS ले नै बनाउनुहोस् (कुनै बाह्य लाइब्रेरी/CDN चाहिँदैन), र यसले स्क्रिनको अरू भाग ढाकेर स्थायी रूपमा नरहोस् — केही सेकेन्डपछि सामान्य सारांशमा फर्किनुपर्छ।
11. viewport meta ट्याग राख्नुहोस्: <meta name="viewport" content="width=device-width, initial-scale=1">
12. कहिल्यै <img>, background-image, वा कुनै पनि src/url() मार्फत बाहिरी फाइल/तस्विर नल्याउनुहोस् — यस्तो कुनै फाइल इन्टरनेटमा वा डिभाइसमा अवस्थित हुँदैन, त्यसैले त्यो सधैं टुटेको/खाली देखिन्छ। "यो चित्र हेर्नुहोस्" जस्तो कुनै पनि कार्य दिनुभएमा, त्यो चित्र/नक्सा/वस्तु अनिवार्य रूपमा इनलाइन SVG (<svg>...</svg>, सीधै HTML भित्र लेखिएको) वा CSS आकारहरू (div + border-radius/gradient/transform जस्ता) प्रयोग गरेरै आफैं कोड गरेर देखाउनुहोस्, ठूला इमोजीले पनि टेवा दिन सक्छ।
13. कुनै पनि तस्विर/नक्सा/चित्र देखिनु आवश्यक भएको सिमुलेसन बनाउनुभएमा, त्यो चित्र पूर्ण रूपमा देखिन्छ र त्यसको कन्टेनरभित्रै भरिन्छ भनी सुनिश्चित गर्नुहोस् — कुनै अधुरो, कटिएको, वा नदेखिने तत्व नराख्नुहोस्।
14. कोड लेखिसकेपछि आफैं जाँच्नुहोस् (यी सबै "हो" नभएसम्म अन्तिम जवाफ नदिनुहोस्): के html/body मा overflow:hidden र width/height 100vw/100vh छ? के लेआउट पूर्णतः flex/grid मा आधारित छ, hardcoded absolute left/top होइन? के कुनै तत्व अर्कोमाथि ओभरल्याप वा काटिएको छैन? के 1280×720 जत्रो landscape स्क्रिनमा जुम/स्क्रोल नगरी सबै देखिन्छ? के फन्ट-साइज प्रोजेक्टरबाट टाढैबाट पढ्न सकिने ठूलो छ? के हरेक तानिने तत्वमा pointer events र touch-action: none छ? के कम्तिमा ८ वटा वस्तु/चरण छन्? के कुनै <img> ट्याग छैन? के स्रोत-वस्तुहरू एउटै लामो ठाडो स्तम्भमा छैनन् (multi-column grid प्रयोग भएको छ)? के लक्ष्य/कोठा/श्रेणी भएको ढाँचा हो भने ती लक्ष्यहरू सबै स्रोत-वस्तुसँगै, स्क्रोल नगरी, सुरुमै देखिन्छन्, र हरेकमा स्पष्ट लेबल छ? **के प्रतिक्रिया/सन्देश कम्तिमा ३५००ms सम्म रहन्छ? के "फेरि खेल्नुहोस्" बटन सधैं स्थिर/देखिने ठाउँमा छ? के अन्त्यमा उत्सव-एनिमेसन छ?**

अब माथिको JSON/व्याख्या नराखी, सिधै HTML कागजात मात्र सुरु गर्नुहोस्।`;
  const raw = await runPrompt(prompt, ctx, { maxOutputTokens: 16000, timeoutMs: 75000 });
  let html = (raw || "").trim();
  // Strip a ```html ... ``` fence if Gemini wrapped it despite instructions.
  html = html.replace(/^```html\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  const docStart = html.search(/<!DOCTYPE html>|<html[\s>]/i);
  if (docStart > 0) html = html.slice(docStart);
  if (!html || docStart === -1) {
    const preview = html ? html.slice(0, 300) : "(खाली प्रतिक्रिया)";
    throw new Error("Gemini ले सिमुलेसन बनाउन सकेन। जवाफको सुरुवात: " + preview);
  }
  // SAFETY NET — despite the prompt's instructions, Gemini occasionally
  // still emits an <img src="..."> pointing at a file that doesn't exist
  // (nothing is hosting it — this runs fully offline in a sandboxed
  // iframe). Rather than let students see a broken-image icon, strip any
  // such tags outright; the surrounding text/layout still works, it just
  // loses that one (non-functional) picture.
  html = html.replace(/<img\b[^>]*>/gi, "");
  return { html, type };
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
