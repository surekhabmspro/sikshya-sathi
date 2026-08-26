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
// FIX — these five kept English-only keywords ("engage", "explore", ...).
// A teacher's real reference file almost always labels these 5E rows in
// Nepali (or a Nepali transliteration of the English term), so every one
// of these rows was silently never matched — setCellLines was never
// called on them, and the original sample file's own text stayed exactly
// as it was, which is why the export looked "100% identical to the
// reference file" no matter what the AI drafted. Added the common Nepali
// wordings + transliterations alongside the English ones. If a teacher's
// own template uses still-different wording, PlanGroupModal now reports
// which of these rows it could not find (see fillLessonPlanDocx below) so
// that can be fixed by widening this list further.
const LESSON_PLAN_LABELS = {
  major_learning_outcomes: ["major learning outcome", "प्रमुख सिकाइ उपलब्धि", "सिकाइ उपलब्धि"],
  materials_required: ["materials required", "आवश्यक सामग्री", "शैक्षिक सामग्री", "स्रोत सामग्री"],
  engage: ["engage", "इन्गेज", "आकर्षण", "सहभागिता", "अभिप्रेरणा"],
  explore: ["explore", "एक्सप्लोर", "अन्वेषण", "खोजी"],
  explain: ["explain", "एक्सप्लेन", "व्याख्या", "प्रस्तुतीकरण", "स्पष्टीकरण"],
  elaborate: ["elaborate", "एलाबोरेट", "विस्तार", "अभ्यास तथा अभिवृद्धि", "अभिवृद्धि"],
  evaluate: ["evaluate", "इभालुएट", "मूल्याङ्कन"],
};

// data: { major_learning_outcomes:[], materials_required:[], engage, explore, explain, elaborate, evaluate, chapter_title? }
// FIX — now tracks WHICH of the expected rows were actually found/filled
// (matchedKeys) vs not (unmatchedKeys), instead of only a single
// matchedAny boolean. A template that's missing just the Engage/Explore
// rows (say, because it uses unrecognised wording) used to silently keep
// its own old sample text in those cells with no signal anything was
// wrong, as long as at least ONE row elsewhere matched. Callers can now
// warn the teacher exactly which fields didn't get filled in.
export async function fillLessonPlanDocx(templateBlob, data) {
  const { zip, doc } = await loadDocxXml(templateBlob);
  const rows = Array.from(doc.getElementsByTagName("w:tr"));
  const matchedKeys = new Set();

  const fillCell = (tc, key) => {
    const value = data[key];
    const lines = Array.isArray(value) ? formatListLines(value) : [(value || "").trim() || "—"];
    setCellLines(tc, lines);
    matchedKeys.add(key);
  };

  // FIX (layout-aware) — the previous version only handled templates where
  // a row is [label cell][content cell] side by side. This teacher's real
  // template instead puts most labels (Major Learning Outcome, Materials
  // Required, Engage, Elaborate, Evaluate) ALONE in their own row, with the
  // content in a separate row right below — and puts Explore/Explain as a
  // two-label header row (Explore | Explain) followed by a two-cell content
  // row underneath, column-aligned. The old same-row pairing silently
  // matched none of the single-label rows, and for the Explore/Explain
  // header row it mistakenly overwrote the "Explain" label cell with the
  // "Explore" content — which is exactly why every exported lesson came
  // back looking like an unedited copy of the reference file. This version
  // tries, in order: (1) single-label row -> single-cell content row below,
  // (2) multi-label header row -> same-column content row below, (3) the
  // original same-row [label][content] pairing, kept for any template that
  // genuinely uses that layout.
  let i = 0;
  while (i < rows.length) {
    const cells = getRowCells(rows[i]);

    // Case 1: a row that is ONLY a single label, with its content living in
    // the next row's single cell.
    if (cells.length === 1) {
      const key = matchLabel(getCellText(cells[0]), LESSON_PLAN_LABELS);
      if (key && i + 1 < rows.length) {
        const nextCells = getRowCells(rows[i + 1]);
        if (nextCells.length === 1) {
          fillCell(nextCells[0], key);
          i += 2;
          continue;
        }
      }
    }

    // Case 2: a header row where MULTIPLE cells are each their own label
    // (e.g. "Explore" | "Explain" side by side), with content living in the
    // next row's cells at the SAME column position.
    if (cells.length > 1) {
      const keys = cells.map((c) => matchLabel(getCellText(c), LESSON_PLAN_LABELS));
      if (keys.some(Boolean) && i + 1 < rows.length) {
        const nextCells = getRowCells(rows[i + 1]);
        if (nextCells.length === cells.length) {
          let any = false;
          keys.forEach((key, ci) => { if (key) { fillCell(nextCells[ci], key); any = true; } });
          if (any) { i += 2; continue; }
        }
      }
    }

    // Case 3 (fallback): the original same-row [label][content] pairing,
    // kept for any template that DOES lay fields out that way.
    let j = 0;
    while (j < cells.length) {
      const key = matchLabel(getCellText(cells[j]), LESSON_PLAN_LABELS);
      if (key && j + 1 < cells.length) {
        fillCell(cells[j + 1], key);
        j += 2;
      } else j += 1;
    }
    i += 1;
  }

  if (!matchedKeys.size) {
    throw new Error("यो ढाँचा फाइलमा Major Learning Outcome / Engage / Explore जस्ता चिन्हारी शब्दहरू भेटिएनन् — ढाँचा फाइल जाँच्नुहोस्।");
  }
  const unmatchedKeys = Object.keys(LESSON_PLAN_LABELS).filter((k) => !matchedKeys.has(k));
  return { blob: await saveDocxXml(zip, doc), matched: matchedKeys.size > 0, matchedKeys: Array.from(matchedKeys), unmatchedKeys };
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

  let unmatchedLevelCells = 0;
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
      if (!found) unmatchedLevelCells++;
      setCellLines(tc, [(found?.desc || "—")]);
    });
  });

  // unmatchedLevelCells > 0 means some rubric level column in the
  // template didn't line up with any of the AI's level names for that
  // row (e.g. teacher's rubric uses different level names than
  // उत्कृष्ट/राम्रो/सामान्य/सुधार आवश्यक) — surfaced so the caller can warn.
  return { blob: await saveDocxXml(zip, doc), unmatchedLevelCells };
}

// FIX — on mobile (installed PWA / in-app webviews on Android & iOS), the
// classic <a download> click is silently swallowed: no download starts, no
// error is thrown, so the teacher just sees nothing happen after export.
// The reliable mobile path is the Web Share API's file-sharing (works from
// inside a PWA on both platforms and hands the file straight to "Save to
// Files"/Drive/etc.); the old anchor-click stays as the desktop-browser
// fallback since navigator.share with files isn't available there.
//
// FIX — some desktop browsers (Windows Chrome/Edge in particular) also
// report navigator.canShare({files:[...]}) === true, but there the OS
// "Share" flyout is a completely different thing from a save dialog — on
// Windows it surfaces as a small notification-style popup near the
// taskbar with no obvious way to actually save the .docx, which is
// exactly the "notification appears instead of a file download" report.
// Restricted the share-first path to an actual touch/mobile device (where
// it's the fix it was meant to be); every desktop browser now always
// gets the plain, reliable anchor-download.
const IS_MOBILE_DEVICE = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
export async function downloadBlob(blob, filename) {
  const file = new File([blob], filename, { type: blob.type });
  if (IS_MOBILE_DEVICE && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      // User cancelled the share sheet, or share failed — fall through to
      // the anchor-download path below instead of leaving the export stuck.
      if (e?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Bundles several named blobs into one .docx.zip so a multi-lesson export
// (several lesson-plan + rubric files) becomes a single share/download
// instead of many auto-downloads in a row, which mobile browsers throttle
// or block outright after the first one or two.
export async function zipFiles(namedBlobs) {
  const zip = new JSZip();
  for (const { filename, blob } of namedBlobs) zip.file(filename, blob);
  return zip.generateAsync({ type: "blob", mimeType: "application/zip" });
}
