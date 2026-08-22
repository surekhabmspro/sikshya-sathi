// ROUND 4 — Document templating engine for the yearly Format Template.
//
// Why this exists: docxtemplater-style libraries need the source file to
// already contain {placeholder} tags. The teacher's uploaded file is a real,
// already-filled-out sample (last year's demo lesson plan/rubric), not a
// blank template. So instead of tag substitution, this module edits the
// docx's own XML directly: it finds each table row by its LABEL cell
// (e.g. "Engage", "Materials Required", a rubric level header like
// "उत्कृष्ट"), and replaces only the paired CONTENT cell's text — leaving
// every paragraph style, run formatting, table border, and the school's
// letterhead completely untouched, because nothing about them is ever
// touched in the first place.
//
// A .docx is just a zip of XML parts; jszip is already a dependency (used
// elsewhere for extraction), so no new dependency is needed here.
import JSZip from "jszip";

const W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DOC_XML_PATH = "word/document.xml";

async function loadDocxXml(blob) {
  const zip = await JSZip.loadAsync(blob);
  const xmlText = await zip.file(DOC_XML_PATH).async("string");
  const doc = new DOMParser().parseFromString(xmlText, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) {
    throw new Error("यो फाइल पढ्न सकिएन — मान्य .docx फाइल हो/होइन जाँच्नुहोस्।");
  }
  return { zip, doc };
}

async function saveDocxXml(zip, doc) {
  const xmlText = new XMLSerializer().serializeToString(doc);
  zip.file(DOC_XML_PATH, xmlText);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function getCellText(tc) {
  const parts = [];
  for (const t of Array.from(tc.getElementsByTagName("w:t"))) parts.push(t.textContent);
  return parts.join("");
}

// Replaces a content cell's text with one or more lines/bullets, reusing
// the cell's FIRST paragraph as a formatting template for every line (so
// font, size, color, alignment all carry over exactly), then removing any
// extra original paragraphs and appending cloned ones for extra lines.
function setCellLines(tc, lines) {
  const paragraphs = Array.from(tc.getElementsByTagName("w:p"));
  if (!paragraphs.length || !lines.length) return;
  const templatePara = paragraphs[0];
  const doc = tc.ownerDocument;

  const makeParaWithText = (text) => {
    const p = templatePara.cloneNode(true);
    const runs = Array.from(p.getElementsByTagName("w:r"));
    if (!runs.length) return p;
    // Keep only the first run (for its formatting), drop the rest, put all
    // the text in that one run.
    for (let i = runs.length - 1; i >= 1; i--) runs[i].parentNode.removeChild(runs[i]);
    const run = runs[0];
    const existingT = Array.from(run.getElementsByTagName("w:t"));
    for (let i = existingT.length - 1; i >= 1; i--) existingT[i].parentNode.removeChild(existingT[i]);
    let tNode = existingT[0];
    if (!tNode) {
      tNode = doc.createElementNS(W_NS, "w:t");
      run.appendChild(tNode);
    }
    tNode.setAttribute("xml:space", "preserve");
    tNode.textContent = text;
    return p;
  };

  const newParas = lines.map(makeParaWithText);
  for (const old of paragraphs) old.parentNode.removeChild(old);
  // Insert before the cell's closing (after any non-paragraph content like
  // w:tcPr, which cloneNode already preserved on the cell itself).
  for (const p of newParas) tc.appendChild(p);
}

function getRowCells(tr) {
  return Array.from(tr.getElementsByTagName("w:tc")).filter((tc) => tc.parentNode === tr);
}

function normalize(s) {
  return (s || "").trim().toLowerCase();
}

// Matches a cell's label text against a list of keywords (Nepali and/or
// English) — loose "contains" match so minor wording differences between
// years' formats still match.
function matchLabel(text, keywordGroups) {
  const n = normalize(text);
  if (!n) return null;
  for (const [key, keywords] of Object.entries(keywordGroups)) {
    if (keywords.some((k) => n.includes(normalize(k)))) return key;
  }
  return null;
}

function formatListLines(items) {
  const clean = (items || []).filter((v) => v && v.trim());
  return clean.length ? clean.map((v) => "• " + v.trim()) : ["—"];
}

// ─── LESSON PLAN ──────────────────────────────────────────────────────────
const LESSON_PLAN_LABELS = {
  major_learning_outcomes: ["major learning outcome", "प्रमुख सिकाइ उपलब्धि", "सिकाइ उपलब्धि"],
  materials_required: ["materials required", "आवश्यक सामग्री", "शैक्षिक सामग्री"],
  engage: ["engage"],
  explore: ["explore"],
  explain: ["explain"],
  elaborate: ["elaborate"],
  evaluate: ["evaluate"],
};

// data: { major_learning_outcomes:[], materials_required:[], engage, explore, explain, elaborate, evaluate, chapter_title? }
export async function fillLessonPlanDocx(templateBlob, data) {
  const { zip, doc } = await loadDocxXml(templateBlob);
  const rows = Array.from(doc.getElementsByTagName("w:tr"));
  let matchedAny = false;

  for (const tr of rows) {
    const cells = getRowCells(tr);
    let i = 0;
    while (i < cells.length) {
      const labelText = getCellText(cells[i]);
      const key = matchLabel(labelText, LESSON_PLAN_LABELS);
      if (key && i + 1 < cells.length) {
        const value = data[key];
        const lines = Array.isArray(value) ? formatListLines(value) : [(value || "").trim() || "—"];
        setCellLines(cells[i + 1], lines);
        matchedAny = true;
        i += 2;
      } else {
        i += 1;
      }
    }
  }

  if (!matchedAny) {
    throw new Error("यो ढाँचा फाइलमा Major Learning Outcome / Engage / Explore जस्ता चिन्हारी शब्दहरू भेटिएनन् — ढाँचा फाइल जाँच्नुहोस्।");
  }
  return { blob: await saveDocxXml(zip, doc), matched: matchedAny };
}

// ─── RUBRIC ───────────────────────────────────────────────────────────────
const RUBRIC_LEVEL_LABELS = {
  "उत्कृष्ट": ["उत्कृष्ट", "excellent"],
  "राम्रो": ["राम्रो", "good"],
  "सामान्य": ["सामान्य", "average", "satisfactory"],
  "सुधार आवश्यक": ["सुधार आवश्यक", "needs improvement"],
};

function findLevelForHeader(text) {
  const n = normalize(text);
  for (const [level, keywords] of Object.entries(RUBRIC_LEVEL_LABELS)) {
    if (keywords.some((k) => n.includes(normalize(k)))) return level;
  }
  return null;
}

// rubricRows: [{ criteria, levels:[{level, desc}] }]
// Finds the rubric table by its header row (the row containing the 4 level
// names), maps existing data rows 1:1 onto rubricRows (cloning/removing
// rows if the counts differ so the table always matches exactly), and fills
// each column by the level it was matched to in the header — not by
// position — so column order in the teacher's template doesn't matter.
export async function fillRubricDocx(templateBlob, rubricRows) {
  const { zip, doc } = await loadDocxXml(templateBlob);
  const tables = Array.from(doc.getElementsByTagName("w:tbl"));
  let targetTable = null, headerRow = null, columnLevels = null;

  for (const tbl of tables) {
    const rows = Array.from(tbl.getElementsByTagName("w:tr")).filter((tr) => tr.parentNode === tbl);
    for (const tr of rows) {
      const cells = getRowCells(tr);
      const levels = cells.map((c) => findLevelForHeader(getCellText(c)));
      const foundCount = levels.filter(Boolean).length;
      if (foundCount >= 3) { targetTable = tbl; headerRow = tr; columnLevels = levels; break; }
    }
    if (targetTable) break;
  }

  if (!targetTable) {
    throw new Error("यो ढाँचा फाइलमा उत्कृष्ट/राम्रो/सामान्य/सुधार आवश्यक स्तम्भहरू भेटिएनन् — रुब्रिक्स ढाँचा जाँच्नुहोस्।");
  }

  const allRows = Array.from(targetTable.getElementsByTagName("w:tr")).filter((tr) => tr.parentNode === targetTable);
  const headerIndex = allRows.indexOf(headerRow);
  const dataRows = allRows.slice(headerIndex + 1);
  if (!dataRows.length) throw new Error("रुब्रिक्स तालिकामा डेटा हरू भेटिएनन्।");

  const rowTemplate = dataRows[0];
  // Match/insert enough rows for every rubricRows entry.
  while (dataRows.length < rubricRows.length) {
    const clone = rowTemplate.cloneNode(true);
    dataRows[dataRows.length - 1].parentNode.insertBefore(clone, dataRows[dataRows.length - 1].nextSibling);
    dataRows.push(clone);
  }
  while (dataRows.length > rubricRows.length) {
    const extra = dataRows.pop();
    extra.parentNode.removeChild(extra);
  }

  rubricRows.forEach((rowData, ri) => {
    const cells = getRowCells(dataRows[ri]);
    cells.forEach((tc, ci) => {
      const level = columnLevels[ci];
      if (!level) {
        // First non-level column = criteria label.
        setCellLines(tc, [rowData.criteria || "—"]);
        return;
      }
      const found = (rowData.levels || []).find((l) => normalize(l.level).includes(normalize(level)) || normalize(level).includes(normalize(l.level)));
      setCellLines(tc, [(found?.desc || "—")]);
    });
  });

  return { blob: await saveDocxXml(zip, doc) };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
