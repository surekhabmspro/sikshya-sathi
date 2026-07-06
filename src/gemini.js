// gemini.js — Google Gemini AI integration (free tier)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

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

// ─── Core Gemini API calls ────────────────────────────────────────────────────
export const generateText = async (prompt) => {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
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

export const parseJSON = (text) => {
  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
};

// ─── High-level generation helpers ───────────────────────────────────────────
export const generateLessonPlan = async (chapterTitle, pdfBase64 = null) => {
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
  const text = pdfBase64 ? await generateWithPDF(prompt, pdfBase64) : await generateText(prompt);
  return parseJSON(text);
};

export const generateQuestions = async (chapterTitle, pdfBase64 = null) => {
  const prompt = `नेपालको कक्षा ५ सामाजिक अध्ययन "${chapterTitle}" अध्यायका लागि १० विभिन्न प्रकारका प्रश्नहरू JSON मात्र:
[{"text":"प्रश्न?","type":"छोटो उत्तर","difficulty":"सजिलो","bloom":"सम्झना","answer":"उत्तर"},
{"text":"प्रश्न?","type":"बहुविकल्पीय","difficulty":"मध्यम","bloom":"बुझाई","options":["क) विकल्प","ख) विकल्प","ग) विकल्प","घ) विकल्प"],"correct_option":0,"answer":"उत्तर"}]`;
  const text = pdfBase64 ? await generateWithPDF(prompt, pdfBase64) : await generateText(prompt);
  return parseJSON(text) || [];
};

export const generateActivities = async (chapterTitle, pdfBase64 = null) => {
  const prompt = `नेपाल कक्षा ५ "${chapterTitle}" का लागि ५ कक्षागत क्रियाकलाप JSON मात्र:
[{"title":"नाम","type":"game","duration":"१५ मिनेट","competency":"क्षमता","description":"विवरण"}]
प्रकार: game, roleplay, project, map, debate, presentation`;
  const text = pdfBase64 ? await generateWithPDF(prompt, pdfBase64) : await generateText(prompt);
  return parseJSON(text) || [];
};

export const chatWithAI = async (userMessage, lessonContext, pdfBase64 = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका शिक्षकको AI सहायक हुनुहुन्छ। नेपालीमा उत्तर दिनुहोस्।

पाठ सन्दर्भ:
${lessonContext}

शिक्षकको प्रश्न: ${userMessage}`;
  return pdfBase64 ? await generateWithPDF(prompt, pdfBase64) : await generateText(prompt);
};
