// gemini.js — Google Gemini AI integration (free tier)
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Convert file to base64 for Gemini
export const fileToBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

// Main Gemini text generation
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

// Generate with PDF context
export const generateWithPDF = async (prompt, pdfBase64) => {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        parts: [
          { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 2048 },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
};

// Parse JSON from Gemini response safely
export const parseJSON = (text) => {
  try {
    const clean = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return null;
  }
};

// Generate complete lesson plan from chapter
export const generateLessonPlan = async (chapterTitle, pdfBase64 = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका लागि पाठ योजना बनाउँदै हुनुहुन्छ।
अध्याय: "${chapterTitle}"

यो अध्यायका लागि पाठ योजना JSON मा मात्र दिनुहोस् (कुनै अतिरिक्त टेक्स्ट नराख्नुस्):
{
  "objectives": ["उद्देश्य १", "उद्देश्य २", "उद्देश्य ३"],
  "vocabulary": ["शब्द १", "शब्द २", "शब्द ३", "शब्द ४", "शब्द ५"],
  "sequence": ["चरण १", "चरण २", "चरण ३", "चरण ४", "चरण ५"],
  "key_questions": ["प्रश्न १?", "प्रश्न २?", "प्रश्न ३?"],
  "activities": ["क्रियाकलाप १", "क्रियाकलाप २"],
  "homework": "गृहकार्य विवरण",
  "notes": "शिक्षकका लागि टिप्पणी",
  "rubric": [
    {"level": "उत्कृष्ट", "desc": "विवरण"},
    {"level": "राम्रो", "desc": "विवरण"},
    {"level": "सहयोग आवश्यक", "desc": "विवरण"}
  ]
}`;

  const text = pdfBase64
    ? await generateWithPDF(prompt, pdfBase64)
    : await generateText(prompt);
  return parseJSON(text);
};

// Generate questions from chapter
export const generateQuestions = async (chapterTitle, pdfBase64 = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका लागि प्रश्नहरू बनाउँदै हुनुहुन्छ।
अध्याय: "${chapterTitle}"

विभिन्न प्रकारका १० प्रश्नहरू JSON मा मात्र दिनुहोस्:
[
  {
    "text": "प्रश्न?",
    "type": "छोटो उत्तर",
    "difficulty": "सजिलो",
    "bloom": "सम्झना",
    "answer": "उत्तर"
  },
  {
    "text": "प्रश्न?",
    "type": "बहुविकल्पीय",
    "difficulty": "मध्यम",
    "bloom": "बुझाई",
    "options": ["क) विकल्प", "ख) विकल्प", "ग) विकल्प", "घ) विकल्प"],
    "correct_option": 0,
    "answer": "सही उत्तर"
  }
]
प्रकारहरू: छोटो उत्तर, बहुविकल्पीय, सत्य/असत्य, खाली ठाउँ, विश्लेषणात्मक सोच, परिदृश्य आधारित
कठिनाई: सजिलो, मध्यम, कठिन`;

  const text = pdfBase64
    ? await generateWithPDF(prompt, pdfBase64)
    : await generateText(prompt);
  return parseJSON(text) || [];
};

// Generate activities from chapter
export const generateActivities = async (chapterTitle, pdfBase64 = null) => {
  const prompt = `नेपालको कक्षा ५ सामाजिक अध्ययन, अध्याय "${chapterTitle}" का लागि ५ वटा कक्षागत क्रियाकलापहरू JSON मा मात्र दिनुहोस्:
[
  {
    "title": "क्रियाकलापको नाम",
    "type": "game",
    "duration": "१५ मिनेट",
    "competency": "क्षमता",
    "description": "विवरण"
  }
]
प्रकार: game, roleplay, project, map, debate, presentation`;

  const text = pdfBase64
    ? await generateWithPDF(prompt, pdfBase64)
    : await generateText(prompt);
  return parseJSON(text) || [];
};

// AI Assistant chat
export const chatWithAI = async (userMessage, lessonContext, pdfBase64 = null) => {
  const prompt = `तपाईं नेपालको कक्षा ५ सामाजिक अध्ययनका शिक्षकको AI सहायक हुनुहुन्छ। नेपालीमा उत्तर दिनुहोस्।

पाठ सन्दर्भ:
${lessonContext}

शिक्षकको प्रश्न: ${userMessage}

कृपया पाठ सन्दर्भमा आधारित भएर उत्तर दिनुहोस्। यदि पाठ्यपुस्तक उपलब्ध छ भने त्यसबाट पनि जानकारी लिनुहोस्।`;

  return pdfBase64
    ? await generateWithPDF(prompt, pdfBase64)
    : await generateText(prompt);
};
