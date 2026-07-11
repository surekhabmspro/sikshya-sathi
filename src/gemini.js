// gemini.js — Google Gemini AI integration (free tier)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

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

export const saveTextbook = async (base64) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(base64, "textbook_pdf");
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
};

export const loadTextbook = async () => {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).get("textbook_pdf");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
};

export const clearTextbook = async () => {
  const db = await openDB();
  return new Promise((resolve) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete("textbook_pdf");
    tx.oncomplete = resolve;
  });
};

// ─── File utilities ───────────────────────────────────────────────────────────
export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// NEW — same idea as fileToBase64 but for Blobs (used when we download a
// material back from Supabase Storage to hand it to Gemini as inline_data).
export const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

// ─── Core Gemini API calls ────────────────────────────────────────────────────
export const generateText = async (prompt) => {
  let res;
  try {
    res = await fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
      }),
    });
  } catch (e) {
    throw new Error("Gemini सर्भरसम्म पुग्न सकिएन (नेटवर्क समस्या): " + e.message);
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Gemini बाट अनपेक्षित जवाफ (HTTP ${res.status}). API key जाँच गर्नुहोस्।`);
  }
  if (data.error) throw new Error(`Gemini API त्रुटि (${data.error.code || res.status}): ${data.error.message}`);
  if (data.promptFeedback?.blockReason) throw new Error("Gemini ले यो अनुरोध रोक्यो: " + data.promptFeedback.blockReason);
  const candidate = data.candidates?.[0];
  if (candidate?.finishReason && candidate.finishReason !== "STOP") {
    throw new Error("Gemini ले पूरा जवाफ दिएन (कारण: " + candidate.finishReason + ")");
  }
  return candidate?.content?.parts?.[0]?.text || "";
};

export const generateWithPDF = async (prompt, pdfBase64) => {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
          { text: prompt },
        ],
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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

// NEW — like generateWithPDF, but takes any number of material parts (PDFs,
// images, extracted docx/pptx/xlsx text) plus the optional global textbook,
// all in one request. This is what lets AI features actually use whatever a
// teacher uploaded to Materials, tagged to the matching chapter.
export const generateWithMaterials = async (prompt, materialParts = [], textbookBase64 = null) => {
  const parts = [...materialParts];
  if (textbookBase64) parts.push({ inline_data: { mime_type: "application/pdf", data: textbookBase64 } });
  parts.push({ text: prompt });

  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

export const parseJSON = (text) => {
  if (!text) return null;
  // 1) Strip markdown code fences if present
  let clean = text.replace(/```json\n?/gi, "").replace(/```\n?/g, "").trim();

  // 2) Try parsing as-is first (fast path — most responses are already clean)
  try {
    return JSON.parse(clean);
  } catch {}

  // 3) Fallback: Gemini sometimes adds a sentence before/after the JSON
  // ("Here's the lesson plan: {...}"). Pull out just the {...} or [...]
  // portion and try again, rather than giving up entirely.
  const firstBrace = clean.search(/[[{]/);
  const lastBraceObj = clean.lastIndexOf("}");
  const lastBraceArr = clean.lastIndexOf("]");
  const lastBrace = Math.max(lastBraceObj, lastBraceArr);
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const slice = clean.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(slice);
    } catch {}
  }

  console.warn("parseJSON: could not parse Gemini response as JSON:", text.slice(0, 300));
  return null;
};

// ─── Internal helper — routes to the right call depending on what's passed ──
// `ctx` can be:
//   - null/undefined              → plain text prompt
//   - a string                    → old behavior, treated as pdfBase64
//   - { pdfBase64, materialParts } → new behavior, richest context
async function runPrompt(prompt, ctx) {
  if (!ctx) return generateText(prompt);
  if (typeof ctx === "string") return generateWithPDF(prompt, ctx); // legacy call style still works
  const { pdfBase64 = null, materialParts = [] } = ctx;
  if (materialParts.length) return generateWithMaterials(prompt, materialParts, pdfBase64);
  if (pdfBase64) return generateWithPDF(prompt, pdfBase64);
  return generateText(prompt);
}

// ─── High-level generation helpers ───────────────────────────────────────────
// Signatures are unchanged in spirit — 2nd/3rd arg can still be a plain
// pdfBase64 string like before, OR the new { pdfBase64, materialParts }
// object once you wire up chapter-tagged Materials in db.js/App.jsx.
export const generateLessonPlan = async (chapterTitle, ctx = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका लागि पाठ योजना बनाउँदै हुनुहुन्छ।
अध्याय: "${chapterTitle}"
JSON मात्र (कुनै अतिरिक्त टेक्स्ट नराख्नुस्):
{
  "objectives": ["उद्देश्य १","उद्देश्य २","उद्देश्य ३"],
  "vocabulary": ["शब्द १","शब्द २","शब्द ३","शब्द ४","शब्द ५"],
  "sequence": ["चरण १","चरण २","चरण ३","चरण ४","चरण ५"],
  "key_questions": ["प्रश्न १?","प्रश्न २?","प्रश्न ३?"],
  "activities": ["क्रियाकलाप १","क्रियाकलाप २"],
  "homework": "गृहकार्य विवरण",
  "notes": "शिक्षकका लागि टिप्पणी",
  "rubric": [{"level":"उत्कृष्ट","desc":"विवरण"},{"level":"राम्रो","desc":"विवरण"},{"level":"सहयोग आवश्यक","desc":"विवरण"}]
}`;
  const text = await runPrompt(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    // NEW: surface exactly what Gemini sent back instead of a generic failure,
    // so the real cause (empty response, refusal, quota error, etc.) is visible.
    const preview = (text && text.trim()) ? text.trim().slice(0, 200) : "(खाली प्रतिक्रिया — Gemini बाट केही फर्केन)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

export const generateQuestions = async (chapterTitle, ctx = null) => {
  const prompt = `नेपालको कक्षा ५ सामाजिक अध्ययन "${chapterTitle}" अध्यायका लागि १० विभिन्न प्रकारका प्रश्नहरू JSON मात्र:
[{"text":"प्रश्न?","type":"छोटो उत्तर","difficulty":"सजिलो","bloom":"सम्झना","answer":"उत्तर"},
{"text":"प्रश्न?","type":"बहुविकल्पीय","difficulty":"मध्यम","bloom":"बुझाई","options":["क) विकल्प","ख) विकल्प","ग) विकल्प","घ) विकल्प"],"correct_option":0,"answer":"उत्तर"}]`;
  const text = await runPrompt(prompt, ctx);
  return parseJSON(text) || [];
};

export const generateActivities = async (chapterTitle, ctx = null) => {
  const prompt = `नेपाल कक्षा ५ "${chapterTitle}" का लागि ५ कक्षागत क्रियाकलाप JSON मात्र:
[{"title":"नाम","type":"game","duration":"१५ मिनेट","competency":"क्षमता","description":"विवरण"}]
प्रकार: game, roleplay, project, map, debate, presentation`;
  const text = await runPrompt(prompt, ctx);
  return parseJSON(text) || [];
};

export const chatWithAI = async (userMessage, lessonContext, ctx = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका शिक्षकको AI सहायक हुनुहुन्छ। नेपालीमा उत्तर दिनुहोस्।

पाठ सन्दर्भ:
${lessonContext}

शिक्षकको प्रश्न: ${userMessage}`;
  return runPrompt(prompt, ctx);
};
