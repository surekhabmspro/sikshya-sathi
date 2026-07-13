// extract.js — client-side text extraction for file types Gemini can't read directly.
// PDFs and images are sent straight to Gemini as inline_data (it reads them natively),
// so they never pass through here. This file only handles docx / pptx / xlsx / csv.
//
// npm install mammoth jszip xlsx

import mammoth from "mammoth";
import JSZip from "jszip";
import * as XLSX from "xlsx";

const MAX_CHARS = 20000; // keep prompts a sane size; Gemini still gets the gist

const truncate = (text) => (text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n...(बाँकी छोटो पारियो)" : text);

// ─── .docx ──────────────────────────────────────────────────────────────────
async function extractDocx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value || "";
}

// ─── .pptx ──────────────────────────────────────────────────────────────────
async function extractPptx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)[1], 10);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)[1], 10);
      return numA - numB;
    });

  let out = "";
  for (let i = 0; i < slideFiles.length; i++) {
    const xml = await zip.files[slideFiles[i]].async("text");
    const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);
    const decoded = texts
      .map((t) => t.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'"))
      .join(" ");
    if (decoded.trim()) out += `\n--- Slide ${i + 1} ---\n${decoded}\n`;
  }
  return out;
}

// ─── .xlsx / .xls ───────────────────────────────────────────────────────────
async function extractSheet(file) {
  const arrayBuffer = await file.arrayBuffer();
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  let out = "";
  for (const sheetName of wb.SheetNames) {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[sheetName]);
    if (csv.trim()) out += `\n--- Sheet: ${sheetName} ---\n${csv}\n`;
  }
  return out;
}

// ─── .doc (legacy binary) — not supported ──────────────────────────────────
// mammoth only reads .docx (the zip-based format). If a teacher uploads an old
// .doc file, we can't safely extract it in the browser.

export const EXTRACTABLE_TYPES = ["doc", "sheet"]; // "doc" here means "word or ppt", matches app's FILE_TYPE_META keys used loosely below
export const NEEDS_EXTRACTION = (ext) => ["docx", "pptx", "xlsx", "xls", "csv"].includes(ext);

/**
 * Extract plain text from a File object, based on its extension.
 * Returns { text, status } where status is 'done' | 'failed' | 'not_needed'.
 */
export async function extractTextFromFile(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  try {
    if (ext === "docx") return { text: truncate(await extractDocx(file)), status: "done" };
    if (ext === "pptx") return { text: truncate(await extractPptx(file)), status: "done" };
    if (ext === "xlsx" || ext === "xls") return { text: truncate(await extractSheet(file)), status: "done" };
    if (ext === "csv") return { text: truncate(await file.text()), status: "done" };
    if (ext === "doc") return { text: "", status: "failed" }; // ask teacher to re-save as .docx
    return { text: "", status: "not_needed" }; // pdf, image, video, audio, etc.
  } catch (e) {
    console.error("Text extraction failed:", e);
    return { text: "", status: "failed" };
  }
}
