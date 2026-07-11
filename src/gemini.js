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

export const generateWithPDF = (prompt, pdfBase64) =>
  callGemini([{ inline_data: { mime_type: "application/pdf", data: pdfBase64 } }, { text: prompt }]);

export const generateWithMaterials = (prompt, materialParts = [], textbookBase64 = null) => {
  const parts = [...materialParts];
  if (textbookBase64) parts.push({ inline_data: { mime_type: "application/pdf", data: textbookBase64 } });
  parts.push({ text: prompt });
  return callGemini(parts);
};

// ─── JSON generation (lesson plans, questions, activities, rubrics) ─────────
// Same shapes as above, but with jsonMode on — this is what actually fixes
// the "AI ले डाटा बनाउन सकेन" failures, since Gemini can no longer wrap the
// JSON in prose or leave it malformed.
export const generateTextJSON = (prompt) => callGemini([{ text: prompt }], { jsonMode: true });

export const generateWithPDFJSON = (prompt, pdfBase64) =>
  callGemini([{ inline_data: { mime_type: "application/pdf", data: pdfBase64 } }, { text: prompt }], { jsonMode: true });

export const generateWithMaterialsJSON = (prompt, materialParts = [], textbookBase64 = null) => {
  const parts = [...materialParts];
  if (textbookBase64) parts.push({ inline_data: { mime_type: "application/pdf", data: textbookBase64 } });
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

// ─── Internal routers — pick the right call based on what's passed ──────────
// `ctx` can be: null/undefined (plain prompt), a string (legacy — treated as
// pdfBase64), or { pdfBase64, materialParts } (chapter-tagged materials).
async function runPrompt(prompt, ctx) {
  if (!ctx) return generateText(prompt);
  if (typeof ctx === "string") return generateWithPDF(prompt, ctx);
  const { pdfBase64 = null, materialParts = [] } = ctx;
  if (materialParts.length) return generateWithMaterials(prompt, materialParts, pdfBase64);
  if (pdfBase64) return generateWithPDF(prompt, pdfBase64);
  return generateText(prompt);
}

async function runPromptJSON(prompt, ctx) {
  if (!ctx) return generateTextJSON(prompt);
  if (typeof ctx === "string") return generateWithPDFJSON(prompt, ctx);
  const { pdfBase64 = null, materialParts = [] } = ctx;
  if (materialParts.length) return generateWithMaterialsJSON(prompt, materialParts, pdfBase64);
  if (pdfBase64) return generateWithPDFJSON(prompt, pdfBase64);
  return generateTextJSON(prompt);
}

// ─── High-level generation helpers ───────────────────────────────────────────
export const generateLessonPlan = async (chapterTitle, ctx = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका लागि पाठ योजना बनाउँदै हुनुहुन्छ।
अध्याय: "${chapterTitle}"
यो ठ्याक्कै यो JSON संरचनामा मात्र जवाफ दिनुहोस्:
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
  const text = await runPromptJSON(prompt, ctx);
  const result = parseJSON(text);
  if (!result) {
    const preview = (text && text.trim()) ? text.trim().slice(0, 300) : "(खाली प्रतिक्रिया — Gemini बाट केही फर्केन)";
    throw new Error("Gemini ले सही ढाँचामा जवाफ दिएन। जवाफको सुरुवात: " + preview);
  }
  return result;
};

export const generateQuestions = async (chapterTitle, ctx = null) => {
  const prompt = `नेपालको कक्षा ५ सामाजिक अध्ययन "${chapterTitle}" अध्यायका लागि १० विभिन्न प्रकारका प्रश्नहरू भएको JSON array मात्र:
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

export const generateActivities = async (chapterTitle, ctx = null) => {
  const prompt = `नेपाल कक्षा ५ "${chapterTitle}" का लागि ५ कक्षागत क्रियाकलाप भएको JSON array मात्र:
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

export const chatWithAI = async (userMessage, lessonContext, ctx = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका शिक्षकको AI सहायक हुनुहुन्छ। नेपालीमा उत्तर दिनुहोस्।

पाठ सन्दर्भ:
${lessonContext}

शिक्षकको प्रश्न: ${userMessage}`;
  return runPrompt(prompt, ctx);
};
