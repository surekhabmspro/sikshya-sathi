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
async function callGemini(parts, { jsonMode = false, maxOutputTokens = 4096 } = {}) {
  const generationConfig = { temperature: 0.7, maxOutputTokens };
  if (jsonMode) generationConfig.response_mime_type = "application/json";

  let res;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts }], generationConfig }),
    });
  } catch (e) {
    throw new Error("Gemini सर्भरसम्म पुग्न सकिएन (नेटवर्क समस्या): " + e.message);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Gemini बाट अनपेक्षित जवाफ (HTTP ${res.status}). API key जाँच गर्नुहोस्।`);
  }

  if (data.error) throw new Error(`Gemini API त्रुटि (${data.error.code || res.status}): ${data.error.message}`);
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

// ─── Internal routers — pick the right call based on what's passed ──────────
// `ctx` can be: null/undefined (plain prompt), a string (legacy — treated as
// pdfBase64), or { pdfBase64, materialParts } (chapter-tagged materials).
async function runPrompt(prompt, ctx) {
  if (!ctx) return generateText(prompt);
  if (typeof ctx === "string") return generateWithPDF(prompt, ctx);
  const { pdfBase64 = null, materialParts = [] } = ctx;
  if (materialParts.length){
    const p = pdfBase64 ? prompt + MATERIALS_PRIORITY_NOTE : prompt;
    return generateWithMaterials(p, materialParts, pdfBase64);
  }
  if (pdfBase64) return generateWithPDF(prompt, pdfBase64);
  return generateText(prompt);
}

async function runPromptJSON(prompt, ctx) {
  if (!ctx) return generateTextJSON(prompt);
  if (typeof ctx === "string") return generateWithPDFJSON(prompt, ctx);
  const { pdfBase64 = null, materialParts = [] } = ctx;
  if (materialParts.length){
    const p = pdfBase64 ? prompt + MATERIALS_PRIORITY_NOTE : prompt;
    return generateWithMaterialsJSON(p, materialParts, pdfBase64);
  }
  if (pdfBase64) return generateWithPDFJSON(prompt, pdfBase64);
  return generateTextJSON(prompt);
}

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
