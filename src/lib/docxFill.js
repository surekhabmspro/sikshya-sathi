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

// ─── HEADER FIELDS (Class / Teacher's name / Section / Level / Subject /
// Time / Unit / Lesson) ─────────────────────────────────────────────────
// FIX (ROUND 6 — the actual reason exports "looked exactly like the
// reference file") — every teacher's real template has this header block
// laid out as its OWN, 4th layout pattern that none of the three cases
// above (Case A/B/C, all designed for the 5E body fields) ever covers:
// the label ("Unit: ") and its value ("४, सामाजिक समस्या र समाधान") are
// two separate <w:r> runs sitting in the SAME paragraph, inside the SAME
// table cell — not a label-cell+content-cell pair (Case C), not a
// label-paragraph-then-table (Case A), not a header-row-then-data-row
// (Case B). So this whole block was never touched by any prior round's
// fix, and silently kept the original sample file's own header text
// forever — including "Lesson: पाठ २ - कुलतबाट बचौं", which is exactly
// what a teacher sees first when they open the file, no matter which
// lesson they actually exported. That's why the export "looked identical
// to the reference" even in rounds where the 5E body content underneath
// (Engage/Explore/.../Evaluate) was, in fact, being filled correctly.
const HEADER_RUN_LABELS = {
  unit: ["unit:", "एकाइ:", "अध्याय:"],
  lesson: ["lesson:", "पाठ:"],
};

function getRunText(r) {
  return Array.from(r.getElementsByTagName("w:t")).map((t) => t.textContent).join("");
}

// Scans every paragraph in the WHOLE document (not just top-level body
// children — this header table is nested two levels deep inside the
// letterhead's outer table) for a run whose own text matches one of
// `keywords` as the run's complete trimmed content (so it only matches
// the actual "Unit: " / "Lesson: " label runs, never a label keyword
// that happens to appear mid-sentence somewhere in AI-drafted content).
// When found, the run immediately after it in the same paragraph is
// treated as the value run: its text is replaced (keeping that run's own
// font/size/color), and any further runs in the paragraph after it are
// removed so multi-run values collapse onto the one value run — mirrors
// setCellLines' formatting-preservation approach, just at run level
// instead of paragraph level.
function fillHeaderField(doc, keywords, value) {
  const paragraphs = Array.from(doc.getElementsByTagName("w:p"));
  for (const p of paragraphs) {
    const runs = Array.from(p.getElementsByTagName("w:r")).filter((r) => r.parentNode === p);
    for (let i = 0; i < runs.length - 1; i++) {
      const labelText = normalize(getRunText(runs[i])).replace(/\s+$/, "");
      if (keywords.some((k) => labelText === normalize(k).replace(/\s+$/, ""))) {
        const valueRun = runs[i + 1];
        const ts = Array.from(valueRun.getElementsByTagName("w:t"));
        let tNode = ts[0];
        if (!tNode) {
          tNode = doc.createElementNS(W_NS, "w:t");
          valueRun.appendChild(tNode);
        }
        for (let k = ts.length - 1; k >= 1; k--) ts[k].parentNode.removeChild(ts[k]);
        tNode.setAttribute("xml:space", "preserve");
        tNode.textContent = value;
        for (let j = runs.length - 1; j > i + 1; j--) runs[j].parentNode.removeChild(runs[j]);
        return true;
      }
    }
  }
  return false;
}

// data: { major_learning_outcomes:[], materials_required:[], engage, explore, explain, elaborate, evaluate, chapter_title?, lesson_header? }
// FIX — now tracks WHICH of the expected rows were actually found/filled
// (matchedKeys) vs not (unmatchedKeys), instead of only a single
// matchedAny boolean. A template that's missing just the Engage/Explore
// rows (say, because it uses unrecognised wording) used to silently keep
// its own old sample text in those cells with no signal anything was
// wrong, as long as at least ONE row elsewhere matched. Callers can now
// warn the teacher exactly which fields didn't get filled in.
export async function fillLessonPlanDocx(templateBlob, data) {
  const { zip, doc } = await loadDocxXml(templateBlob);
  const matchedKeys = new Set();

  const fillCell = (tc, key) => {
    const value = data[key];
    const lines = Array.isArray(value) ? formatListLines(value) : [(value || "").trim() || "—"];
    setCellLines(tc, lines);
    matchedKeys.add(key);
  };

  // FIX (ROUND 5) — the previous "layout-aware" version still only ever
  // scanned <w:tr> table rows for labels. But this teacher's real template
  // (confirmed by inspecting the actual uploaded reference files) puts most
  // labels — "Major Learning Outcome/s:", "Materials Required...", "Engage",
  // "Elaborate", "Evaluate" — as PLAIN PARAGRAPHS sitting above a separate
  // one-cell content table, not inside any table row at all. Only
  // "Explore"/"Explain" happens to live inside a table as a two-column
  // header row. Because the old code never looked at paragraphs, those five
  // fields' content tables were never touched — they kept the original
  // reference file's own text verbatim, which is exactly why every export
  // came back "100% identical to the reference file" except for
  // Explore/Explain. Fix: walk the document body's direct children
  // (paragraphs AND tables) in document order, remembering the most recent
  // label-matching paragraph as a "pending label", and filling the next
  // table's single content cell when one is pending. The old table-internal
  // matching (multi-label header row, and same-row [label][content]) is
  // kept as-is for templates/rows that use those layouts (e.g.
  // Explore/Explain).
  const body = doc.getElementsByTagName("w:body")[0];
  const topLevel = body ? Array.from(body.childNodes).filter(
    (n) => n.nodeType === 1 && (n.tagName === "w:p" || n.tagName === "w:tbl")
  ) : [];

  let pendingLabel = null;
  for (const el of topLevel) {
    if (el.tagName === "w:p") {
      const text = getCellText(el);
      const key = matchLabel(text, LESSON_PLAN_LABELS);
      if (key) {
        pendingLabel = key;
      } else if (text.trim()) {
        // A non-blank paragraph that isn't itself a label breaks the link
        // between an earlier label and a later table. Blank/spacer
        // paragraphs (common between a label and its table) are ignored so
        // they don't clear a still-pending label.
        pendingLabel = null;
      }
      continue;
    }

    // el.tagName === "w:tbl"
    const rows = Array.from(el.getElementsByTagName("w:tr")).filter((tr) => tr.parentNode === el);

    // Case A: a label paragraph immediately preceded this table, and the
    // table's first row is a single content cell.
    if (pendingLabel && rows.length >= 1) {
      const firstRowCells = getRowCells(rows[0]);
      if (firstRowCells.length === 1) {
        fillCell(firstRowCells[0], pendingLabel);
        pendingLabel = null;
        continue;
      }
    }
    pendingLabel = null;

    // Case B: a header row INSIDE this table where multiple cells are each
    // their own label (e.g. "Explore" | "Explain" side by side), with
    // content in the next row's cells at the same column position.
    if (rows.length >= 2) {
      const headerCells = getRowCells(rows[0]);
      const keys = headerCells.map((c) => matchLabel(getCellText(c), LESSON_PLAN_LABELS));
      if (keys.some(Boolean)) {
        const nextCells = getRowCells(rows[1]);
        if (nextCells.length === headerCells.length) {
          keys.forEach((key, ci) => { if (key) fillCell(nextCells[ci], key); });
          continue;
        }
      }
    }

    // Case C (fallback): the original same-row [label][content] pairing,
    // kept for any template that lays fields out that way.
    for (const tr of rows) {
      const cells = getRowCells(tr);
      let j = 0;
      while (j < cells.length) {
        const key = matchLabel(getCellText(cells[j]), LESSON_PLAN_LABELS);
        if (key && j + 1 < cells.length) {
          fillCell(cells[j + 1], key);
          j += 2;
        } else j += 1;
      }
    }
  }

  if (!matchedKeys.size) {
    throw new Error("यो ढाँचा फाइलमा Major Learning Outcome / Engage / Explore जस्ता चिन्हारी शब्दहरू भेटिएनन् — ढाँचा फाइल जाँच्नुहोस्।");
  }
  const unmatchedKeys = Object.keys(LESSON_PLAN_LABELS).filter((k) => !matchedKeys.has(k));

  // ROUND 6 — fill the "Unit: " / "Lesson: " header runs (see
  // fillHeaderField above). Tracked separately from matchedKeys/unmatchedKeys
  // (a different layout entirely, matched by run not by cell) so the
  // caller can warn specifically if a template's header uses wording this
  // doesn't recognise, without conflating it with the 5E body fields.
  const headerFilled = { unit: false, lesson: false };
  if (data.chapter_title) headerFilled.unit = fillHeaderField(doc, HEADER_RUN_LABELS.unit, data.chapter_title);
  if (data.lesson_header) headerFilled.lesson = fillHeaderField(doc, HEADER_RUN_LABELS.lesson, data.lesson_header);

  return { blob: await saveDocxXml(zip, doc), matched: matchedKeys.size > 0, matchedKeys: Array.from(matchedKeys), unmatchedKeys, headerFilled };
}

// FIX — a real teacher's rubric template (confirmed against an actual
// uploaded reference + exported output) has NO "Unit:"/"Lesson:" labelled
// field at all — instead the very first paragraph in the document is a
// single, plain title run naming whatever the original sample project
// was ("राष्ट्रिय विभूति परियोजना कार्य मूल्याङ्कन रुब्रिक्स"), with no
// label to match against. fillHeaderField can't catch this (it only
// matches a label-run followed by a separate value-run); the whole title
// text IS the value here. Confirmed via the real export that the rubric
// TABLE content was in fact already being filled correctly per lesson —
// only this title line was staying as the original sample's own project
// name on every export, which is what made the file look like an exact
// copy. Finds the first non-blank top-level paragraph before any table
// and replaces its whole text (collapsing multiple runs onto the first,
// same approach as fillHeaderField) — keeping that run's own formatting.
function fillTitleParagraph(doc, value) {
  const body = doc.getElementsByTagName("w:body")[0];
  if (!body) return false;
  const topLevel = Array.from(body.childNodes).filter((n) => n.nodeType === 1 && n.tagName === "w:p");
  for (const p of topLevel) {
    const runs = Array.from(p.getElementsByTagName("w:r")).filter((r) => r.parentNode === p);
    if (!runs.length) continue;
    if (!getCellText(p).trim()) continue;
    const firstRun = runs[0];
    const ts = Array.from(firstRun.getElementsByTagName("w:t"));
    let tNode = ts[0];
    if (!tNode) {
      tNode = doc.createElementNS(W_NS, "w:t");
      firstRun.appendChild(tNode);
    }
    for (let k = ts.length - 1; k >= 1; k--) ts[k].parentNode.removeChild(ts[k]);
    tNode.setAttribute("xml:space", "preserve");
    tNode.textContent = value;
    for (let j = runs.length - 1; j > 0; j--) runs[j].parentNode.removeChild(runs[j]);
    return true;
  }
  return false;
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
// headerData: { chapter_title?, lesson_header? } — same "Unit: " / "Lesson: "
// run-label fields as fillLessonPlanDocx's data. FIX — the rubric export
// never called fillHeaderField at all (only the lesson-plan export did),
// so every exported rubric file silently kept the original reference
// template's own Unit/Lesson header text, exactly the bug already fixed
// for lesson plans in ROUND 6 — the teacher was right that it's the same
// problem, just never applied here. Reuses the identical run-matching
// logic/keywords so both exports behave the same way.
// Finds the rubric table by its header row (the row containing the 4 level
// names), maps existing data rows 1:1 onto rubricRows (cloning/removing
// rows if the counts differ so the table always matches exactly), and fills
// each column by the level it was matched to in the header — not by
// position — so column order in the teacher's template doesn't matter.
export async function fillRubricDocx(templateBlob, rubricRows, headerData = {}) {
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
  const headerFilled = { unit: false, lesson: false, title: false };
  if (headerData.chapter_title) headerFilled.unit = fillHeaderField(doc, HEADER_RUN_LABELS.unit, headerData.chapter_title);
  if (headerData.lesson_header) headerFilled.lesson = fillHeaderField(doc, HEADER_RUN_LABELS.lesson, headerData.lesson_header);
  // Only touch the title line if neither labelled Unit/Lesson field existed
  // in this template — a template that DOES use labelled fields shouldn't
  // also have its plain title line overwritten.
  if (headerData.lesson_header && !headerFilled.unit && !headerFilled.lesson) {
    headerFilled.title = fillTitleParagraph(doc, `${headerData.lesson_header} — मूल्याङ्कन रुब्रिक्स`);
  }

  return { blob: await saveDocxXml(zip, doc), unmatchedLevelCells, headerFilled };
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
