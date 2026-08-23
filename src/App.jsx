import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  BookOpen, CalendarDays, CheckCircle2, ClipboardList, ArrowLeft,
  Sparkles, FileText, Users, MessageSquare, PenSquare, Layers, Clock,
  X, Home, NotebookPen, Search, Image as ImageIcon, Video, Music,
  FileSpreadsheet, Presentation, Tag, Eye, EyeOff, HelpCircle, CheckSquare,
  Square, Printer, Shuffle, Bot, Send, Lock, ListChecks, Plus, Smile,
  Meh, Frown, Heart, Gamepad2, FolderKanban, Map as MapIcon, Wand2,
  Brain, Copy, ArrowRight, LogOut, User, AlertCircle, Loader,
  Settings as SettingsIcon, Trash2, RefreshCw, BookMarked, Zap,
  Sun, Moon, Lightbulb, Paperclip, ArrowDown, Pin, RotateCw,
  GraduationCap, PartyPopper, Bell, Palmtree, Megaphone, AlertTriangle, Download,
  Upload, ChevronDown,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import * as db from "./db";
import * as gemini from "./gemini";
import { extractTextFromFile } from "./lib/extract";
import { fillLessonPlanDocx, fillRubricDocx, downloadBlob, zipFiles } from "./lib/docxFill";
import { DataProvider, useData } from "./context/DataContext";

// NEW — every color below is a CSS custom property, not a hardcoded hex.
// That's what makes dark/light mode possible without rewriting every
// component: the actual color values are defined once in the global
// stylesheet (see the :root / [data-theme="dark"] blocks in App()), and
// switching the data-theme attribute on the page instantly re-points every
// one of these to the right value — no re-render logic needed anywhere else.
const ACCENT = "var(--accent)";
const ACCENT_DARK = "var(--accent-dark)";
const ACCENT_LIGHT = "var(--accent-light)";
const MARIGOLD = "var(--marigold)";
const MARIGOLD_DARK = "var(--marigold-dark)";
const TEAL = "var(--teal)";
const TEAL_LIGHT = "var(--teal-light)";
const VIOLET = "var(--violet)";
const VIOLET_LIGHT = "var(--violet-light)";
const BLUE = "var(--blue)";
const BLUE_LIGHT = "var(--blue-light)";
const ROSE = "var(--rose)";
const ROSE_LIGHT = "var(--rose-light)";
const PAPER = "var(--bg)";
const SURFACE = "var(--surface)";
const SURFACE_2 = "var(--surface-2)";
const INK = "var(--ink)";
const INK_SOFT = "var(--ink-soft)";
const BORDER = "var(--border)";
const DANGER = "var(--danger)";
const DANGER_BG = "var(--danger-bg)";
const WARN = "var(--warn)";
const WARN_BG = "var(--warn-bg)";

// NEW — a shared rotating palette (used via PALETTE[i % PALETTE.length]) for
// lists that don't have a natural status/category color of their own —
// activity types, assessment types, journal entries, search results — so
// those screens get the same colorful, distinguishable-at-a-glance look as
// the ones that already have semantic colors (status, file category, etc).
const PALETTE = [ACCENT, MARIGOLD_DARK, TEAL, VIOLET, ROSE, BLUE];

// Elevation scale — used for the "premium, elevated" card/button look.
const SHADOW = {
  sm: "0 1px 2px rgba(var(--shadow-rgb),0.06), 0 1px 1px rgba(var(--shadow-rgb),0.04)",
  md: "0 4px 14px rgba(var(--shadow-rgb),0.10), 0 1px 3px rgba(var(--shadow-rgb),0.08)",
  lg: "0 12px 28px rgba(var(--shadow-rgb),0.18), 0 4px 10px rgba(var(--shadow-rgb),0.10)",
  // "raised" = the 3D/live card look: a bright 1px sheen along the top inner
  // edge (like light catching a slightly domed surface) plus a soft two-layer
  // drop shadow underneath. Used on every Card/StatCard so tiles read as
  // physical, tappable objects instead of flat rectangles.
  raised: "inset 0 1px 0 var(--card-sheen), 0 1px 2px rgba(var(--shadow-rgb),0.06), 0 8px 18px rgba(var(--shadow-rgb),0.13), 0 2px 5px rgba(var(--shadow-rgb),0.09)",
  raisedHover: "inset 0 1px 0 var(--card-sheen), 0 14px 30px rgba(var(--shadow-rgb),0.20), 0 4px 10px rgba(var(--shadow-rgb),0.12)",
  accent: "0 4px 12px color-mix(in srgb, var(--accent) 16%, transparent)",
  marigold: "0 4px 12px color-mix(in srgb, var(--marigold) 18%, transparent)",
};

// color+"1A" string-concat only works when color is a literal hex string; it
// silently produces invalid CSS (transparent) when color is one of the
// var(--x)-based constants above. tint() works for both.
const tint = (color, pct=14) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const FILE_TYPE_META = {
  pdf:   { icon: FileText,        color: "#A23C2A" },
  pptx:  { icon: Presentation,    color: "#D98E2B" },
  doc:   { icon: FileText,        color: "#2C5F9E" },
  image: { icon: ImageIcon,       color: "#9A5B12" },
  video: { icon: Video,           color: "#6B3FA0" },
  audio: { icon: Music,           color: "#7A2E4A" },
  sheet: { icon: FileSpreadsheet, color: "#1B7A4A" },
};

// NEW — material "purpose" categories, distinct from file_type (a lesson
// plan and a Q&A solution might both be .docx — this is what actually
// separates them in the Materials library).
const CATEGORY_META = {
  lesson_plan: { label: "पाठ योजना",        icon: ClipboardList, color: ACCENT },
  presentation:{ label: "प्रस्तुति",         icon: Presentation,  color: MARIGOLD_DARK },
  qa_solution: { label: "प्रश्नोत्तर समाधान", icon: HelpCircle,    color: VIOLET },
  exercise:    { label: "अभ्यास",            icon: PenSquare,     color: TEAL },
  assessment:  { label: "मूल्याङ्कन",         icon: Layers,        color: ROSE },
  other:       { label: "अन्य",              icon: FileText,      color: INK_SOFT },
};
const CATEGORY_ORDER = ["lesson_plan","presentation","qa_solution","exercise","assessment","other"];

// FIX — lesson dropdowns showed "<chapter title> — <lesson title>", which
// read as a plain duplicate ("X — X") whenever a lesson's title was the
// same as its chapter's (very common for single-lesson chapters — see
// screenshot). Now the chapter prefix is only added when it actually adds
// information.
function lessonOptionLabel(l){
  const chapterTitle=l.chapters?.title||l.chapter_title||"";
  if(!chapterTitle||chapterTitle.trim()===String(l.title||"").trim())return l.title;
  return `${chapterTitle} — ${l.title}`;
}

// NEW — auto-detect a material's category (and, where possible, its
// chapter) from its filename, so a teacher uploading "Lesson plan-U1L1" or
// "Prastuti U2L3" doesn't have to hand-pick both every single time.
// - The category comes from keyword matching ("lesson plan"/"योजना" →
//   lesson_plan, "prastuti"/"presentation" → presentation, etc).
// - The chapter comes from a "U<unit>L<lesson>" (or "Unit 1 Lesson 2")
//   pattern in the name, matched against EXISTING chapter titles that
//   already contain the same U#L# tag. It deliberately does NOT guess a
//   chapter by counting position in the list — there's no reliable
//   "lessons per unit" number to compute that from, and a wrong silent
//   guess is worse than no guess. If no existing chapter carries that
//   tag, the unit/lesson is still shown to the teacher as a hint so
//   picking the right chapter by hand takes one glance, not a search.
const CATEGORY_KEYWORDS=[
  {category:"lesson_plan",words:["lesson plan","lessonplan","पाठ योजना","पाठयोजना","योजना","lp-","lp_"," lp "]},
  {category:"presentation",words:["prastuti","प्रस्तुति","presentation","slide","ppt"]},
  {category:"qa_solution",words:["qa","q&a","प्रश्नोत्तर","उत्तर","answer key","answerkey","solution"]},
  {category:"exercise",words:["exercise","worksheet","अभ्यास","practice"]},
  {category:"assessment",words:["assessment","मूल्याङ्कन","परीक्षा","test","quiz","exam"]},
];
function detectCategoryFromName(name){
  const clean=" "+name.toLowerCase().replace(/[._-]/g," ")+" ";
  for(const{category,words}of CATEGORY_KEYWORDS){
    if(words.some((w)=>clean.includes(w.toLowerCase())))return category;
  }
  return null;
}
function detectUnitLessonFromName(name){
  const m=name.match(/U(?:nit)?\s*-?\s*(\d+)\s*[-_. ]?\s*L(?:esson)?\s*-?\s*(\d+)/i);
  return m?{unit:Number(m[1]),lesson:Number(m[2])}:null;
}
function guessChapterFromUnitLesson(unitLesson,chapters){
  if(!unitLesson||!chapters?.length)return null;
  const tag=`U${unitLesson.unit}L${unitLesson.lesson}`;
  const norm=(s)=>(s||"").toUpperCase().replace(/[\s._-]/g,"");
  return chapters.find((c)=>norm(c.title).includes(tag))||null;
}

// NEW — Phase 3: calendar event categories. Same pattern as CATEGORY_META
// above (Materials), so the calendar gets the same color-coding language
// the rest of the app already uses.
const EVENT_CATEGORY_META = {
  event:    { label: "विद्यालय कार्यक्रम", icon: PartyPopper,   color: TEAL },
  holiday:  { label: "बिदा",              icon: Palmtree,      color: MARIGOLD_DARK },
  exam:     { label: "परीक्षा",            icon: GraduationCap, color: ROSE },
  deadline: { label: "म्याद (गृहकार्य/काम)", icon: PenSquare,     color: VIOLET },
  training: { label: "तालिम/गोष्ठी",       icon: Megaphone,     color: "#2C5F9E" },
  reminder: { label: "सम्झना",            icon: Bell,          color: ACCENT },
};
const EVENT_CATEGORY_ORDER = ["event","holiday","exam","deadline","training","reminder"];

const MOOD_META = {
  good: { icon: Smile, color: ACCENT,    label: "राम्रो गयो"   },
  okay: { icon: Meh,   color: "#9A5B12", label: "ठीकै थियो"   },
  hard: { icon: Frown, color: "#A23C2A", label: "गाह्रो थियो" },
};

// FIX — this used to hold the entire textbook as a raw base64 string in
// window.__textbookPDF__, which every single AI call then embedded whole
// into its request body (see gemini.js's old generateWithMaterials). Now it
// just asks gemini.getTextbookPart() for a cached, cheap reference — the
// actual PDF is uploaded to Gemini once per class and reused from there.
// See gemini.js for the caching/upload logic.
const getTextbookPDF = (classLabel) => gemini.getTextbookPart(classLabel);

// NEW — the piece that actually connects Materials to every AI button.
// Your lessons/questions/activities forms use a typed chapter name
// (chapter_title), but Materials/Gemini need a real chapter_id (your
// database already has a proper `chapters` table). This helper resolves
// the typed name to that chapter's id, fetches every material tagged to
// it, and turns them into Gemini parts alongside the global textbook.
// NEW — the token-savings cache the user asked for: instead of attaching
// the whole textbook (even as a cheap file_uri reference, Gemini still
// counts its full token count on EVERY call that includes it), the first
// time a chapter's textbook content is needed it's extracted to plain text
// once and saved (db.textbook_chapter_text, keyed by chapter_id — see
// textbook_chapter_text.sql). Every call after that for the same chapter
// reuses the small cached text instead of re-reading the whole book. Only
// the very first call for a given chapter pays the old (whole-book) cost;
// everything after is a fraction of it. The cache is invalidated
// automatically whenever the textbook PDF is replaced/removed (see
// uploadTextbook/clearTextbookHandler in Settings).
// NEW — pictorial vocabulary support: given a word (Nepali or English),
// tries to find a relevant illustrative photo from that word's own
// Wikipedia article (Nepali Wikipedia first, English as fallback), then
// falls back to Wikidata's structured "image of this entity" field (see
// wikidataImage below) for words that don't have a full Wikipedia article
// yet — not a generic Wikimedia Commons file search (see the safety note
// below on why that was changed). Best-effort only — plenty of abstract
// classroom words won't have a good match from either source, which is
// why a teacher can also upload their own photo instead (see
// vocabImageFromUpload) — zero lookup risk, since it's entirely their own
// choice of picture. Callers just show nothing when the automatic lookup
// returns null instead of a broken image.
//
// Once a picture is found for a word, it's downloaded and (a) uploaded to
// a Supabase Storage bucket ("vocab-images") with a matching row in the
// "vocab_images" table, so it follows the teacher between devices, and
// (b) mirrored into IndexedDB as a base64 data URL, so it still shows with
// no internet connection on whichever device already opened it before.
// A teacher can also mark a picture as not appropriate for a word; that
// decision is saved to Supabase too (and mirrored locally), so the app
// won't keep re-fetching/re-showing it — on any device.
const VOCAB_IMG_DB = "sikshyasathi-vocab-images";
const VOCAB_IMG_STORE = "images";
function openVocabImageDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("no indexedDB")); return; }
    const req = indexedDB.open(VOCAB_IMG_DB, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore(VOCAB_IMG_STORE, { keyPath: "word" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
// Local mirror only — offline fallback / instant repeat-open cache. Not the
// source of truth once Supabase is reachable (see fetchWordImage below).
async function getLocalVocabImage(word) {
  try {
    const idb = await openVocabImageDB();
    return await new Promise((resolve, reject) => {
      const req = idb.transaction(VOCAB_IMG_STORE, "readonly").objectStore(VOCAB_IMG_STORE).get(word);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (e) { return null; }
}
async function saveLocalVocabImage(word, entry) {
  try {
    const idb = await openVocabImageDB();
    await new Promise((resolve, reject) => {
      const tx = idb.transaction(VOCAB_IMG_STORE, "readwrite");
      tx.objectStore(VOCAB_IMG_STORE).put({ word, ...entry, savedAt: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {}
}
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
// Marks a word's image as rejected (teacher deemed it not appropriate) —
// keeps it out of future views for this word, on every device, without
// re-fetching. Removes the old file from the Supabase bucket too, so
// rejected images don't sit around taking up storage.
async function rejectVocabImage(word) {
  const key = (word || "").trim();
  if (!key) return;
  try {
    const { data: existing } = await db.getVocabImage(key);
    await db.upsertVocabImage(key, { rejected: true, storage_path: null, credit: null }, existing?.storage_path);
  } catch (e) {
    // offline or request failed — the local mirror below still keeps this
    // word hidden on this device; it'll reconcile with Supabase next time
    // fetchWordImage runs successfully online.
  }
  await saveLocalVocabImage(key, { rejected: true, dataUrl: null, credit: null });
}
async function fetchWordImage(word) {
  const key = (word || "").trim();
  if (!key) return null;

  // 1) Ask Supabase first — it's the source of truth and is what makes a
  // picture already SAVED by a teacher (or a "not appropriate" decision)
  // follow the teacher between devices. Falls through to the local mirror
  // below if this fails (offline) rather than surfacing an error.
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: row, error } = await db.getVocabImage(key);
      if (!error) {
        if (row?.rejected) {
          await saveLocalVocabImage(key, { rejected: true, dataUrl: null, credit: null });
          return null;
        }
        if (row?.storage_path) {
          const signedUrl = await db.getVocabImageUrl(row.storage_path);
          if (signedUrl) {
            const imgRes = await fetch(signedUrl);
            const blob = await imgRes.blob();
            const dataUrl = await blobToDataUrl(blob);
            await saveLocalVocabImage(key, { dataUrl, credit: row.credit });
            return { url: dataUrl, credit: row.credit || "Wikipedia", saved: true };
          }
        }
        if (row === null) {
          // No saved row yet for this word on any device — look one up as
          // a PREVIEW only (see previewWordImage below). It is NOT written
          // to Supabase or the local mirror here; the teacher has to
          // explicitly tap "बचत गर्नुहोस्" for that to happen, so nothing
          // is kept for reuse without a human choosing to keep it.
          return await previewWordImage(key);
        }
      }
    }
  } catch (e) {
    // network/Supabase unreachable — fall through to local mirror
  }

  // 2) Offline fallback — whatever this device already had saved before.
  const local = await getLocalVocabImage(key);
  if (local) {
    if (local.rejected) return null;
    if (local.dataUrl) return { url: local.dataUrl, credit: local.credit || "Wikipedia", saved: true };
  }
  return null;
}
// Looks up a fresh picture for a word — PREVIEW ONLY. Nothing is written
// to Supabase or the local mirror here; the returned object carries the
// raw blob so saveWordImageForReuse (below) can persist it later, but
// only once the teacher explicitly asks to keep it.
//
// SAFETY FIX — this used to search Wikimedia Commons directly by keyword,
// which searches loosely-matched file names/descriptions across millions
// of user-uploaded files with no moderation for a children's classroom
// context; a word like "साइरन" (siren) could return a completely
// unrelated, inappropriate photo. This now searches Wikipedia articles
// instead (Nepali Wikipedia first, English as fallback) and only uses
// each article's own curated lead/infobox image — the same picture that
// appears at the top of the encyclopedia entry for that exact word/topic,
// not an arbitrary file-search hit. Far narrower and safer, though no
// automated source is perfect for a children's app, which is why the UI
// also requires a teacher to explicitly tap "तस्बिर हेर्नुहोस्" before any
// picture renders, and now also to tap "बचत गर्नुहोस्" before it's kept.
// SAFETY FIX #2 — even scoped to Wikipedia, the previous version used
// fuzzy full-text search ("gsrsearch"), which ranks by best text match
// across ALL articles — so a common word like "साइरन" (a warning siren)
// matched a Nepali actress's biography article ("साइरन (अभिनेत्री)")
// instead, because search has no way to know which sense of the word the
// lesson meant. Ambiguous words are common in a language-learning context
// and this kind of wrong-sense match can't be filtered by keyword lists.
//
// Fix: look up the word as an EXACT article title only (with redirects
// for spelling/capitalization variants), never a fuzzy search match. If
// no article exists at exactly that title, or the title resolves to a
// Wikipedia disambiguation page (meaning the word is itself ambiguous —
// exactly the "साइरन" situation), this returns nothing rather than
// guessing. Showing no picture is always safer than showing the wrong one.
async function wikipediaLeadImage(word, lang) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(word)}&redirects=1&prop=pageimages|pageprops&piprop=thumbnail&pithumbsize=480&format=json&origin=*`;
  const res = await fetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  const page = pages ? Object.values(pages)[0] : null;
  if (!page || page.missing !== undefined) return null; // no exact-title article
  if (page.pageprops && "disambiguation" in page.pageprops) return null; // word is ambiguous
  const thumb = page?.thumbnail?.source;
  if (!thumb) return null;
  return { thumburl: thumb, credit: `Wikipedia (${lang}) — ${page.title}` };
}
// Small Levenshtein distance — used only to decide whether a search
// result's title is close enough to the word itself to trust (see
// wikipediaNearMatchImage below), not for any user-facing feature.
function editDistance(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
// FIX — the exact-title-only rule above is correct for genuinely
// ambiguous words ("साइरन" the siren vs. an actress by the same name —
// see SAFETY FIX #2), but it also silently misses very ordinary,
// unambiguous words whose article title differs only by spelling —
// e.g. "सिसिटिभी" (a phonetic vocabulary-list spelling of CCTV) vs. the
// actual article title with slightly different vowel signs. Rejecting
// those outright made the feature too strict to be useful.
//
// This adds a narrow, controlled middle ground: fuzzy search IS allowed
// here, but a result is only ever accepted if — in RANK ORDER — it is
// the first candidate whose title (a) has no parenthetical qualifier at
// all (a qualifier is exactly the signal that word is ambiguous, like
// "अभिनेत्री" was) and (b) is within a small edit-distance of the word
// itself (catches spelling/diacritic variants without opening the door
// to unrelated topics that merely mention the word somewhere in the
// article). Anything that doesn't clear both bars is skipped, not
// substituted with a looser guess.
async function wikipediaNearMatchImage(word, lang) {
  const target = word.trim();
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&generator=search&gsrnamespace=0&gsrsearch=${encodeURIComponent(target)}&gsrlimit=5&prop=pageimages|pageprops&piprop=thumbnail&pithumbsize=480&format=json&origin=*`;
  const res = await fetch(url);
  const data = await res.json();
  const pages = data?.query?.pages;
  if (!pages) return null;
  const candidates = Object.values(pages).sort((a, b) => (a.index || 0) - (b.index || 0));
  const maxAllowed = Math.max(1, Math.floor(target.length * 0.25));
  for (const page of candidates) {
    if (page.pageprops && "disambiguation" in page.pageprops) continue;
    const title = (page.title || "").trim();
    if (title.includes("(")) continue; // qualifier suffix = treat word as ambiguous
    if (editDistance(title, target) > maxAllowed) continue;
    const thumb = page?.thumbnail?.source;
    if (!thumb) continue;
    return { thumburl: thumb, credit: `Wikipedia (${lang}) — ${title}` };
  }
  return null;
}
// NEW — Wikidata fallback: only reached once every Wikipedia check above
// (both languages, exact title AND near-match) has come back with
// nothing. Wikidata items carry P18 ("image"), a single structured field
// an editor deliberately set as THE picture for that exact entity — not a
// text-search hit, so it keeps the same "one deliberately-chosen picture,
// never a keyword guess" safety property as the Wikipedia lead image
// above. Its label search (wbsearchentities) also covers many topics that
// have a Nepali label but no full Nepali Wikipedia article yet (a Wikidata
// item can exist, and be labelled in Nepali, well before anyone writes an
// article about it). Still exact-match only: a candidate is only accepted
// if the label/alias Wikidata itself says matched the search is an exact
// (case/whitespace-insensitive) match to the word — the same "no fuzzy
// substitution" rule as the Wikipedia checks, so an entity that merely
// resembles the word can't be picked.
async function wikidataImage(word, lang) {
  const target = word.trim();
  if (!target) return null;
  const targetLc = target.toLowerCase();
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(target)}&language=${lang}&uselang=${lang}&type=item&limit=5&format=json&origin=*`;
  const res = await fetch(searchUrl);
  const data = await res.json();
  const candidates = data?.search || [];
  for (const cand of candidates) {
    const matchText = (cand.match?.text || cand.label || "").trim().toLowerCase();
    if (matchText !== targetLc) continue; // exact match only — no fuzzy guessing
    const claimRes = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&entity=${cand.id}&property=P18&format=json&origin=*`);
    const claimData = await claimRes.json();
    const filename = claimData?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
    if (!filename) continue; // this item has no "image" field set
    const thumburl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(filename)}?width=480`;
    return { thumburl, credit: `Wikidata — ${cand.label || target}` };
  }
  return null;
}
async function previewWordImage(word) {
  try {
    const info =
      (await wikipediaLeadImage(word, "ne")) ||
      (await wikipediaLeadImage(word, "en")) ||
      (await wikipediaNearMatchImage(word, "ne")) ||
      (await wikipediaNearMatchImage(word, "en")) ||
      (await wikidataImage(word, "ne")) ||
      (await wikidataImage(word, "en"));
    if (!info?.thumburl) return null;
    const imgRes = await fetch(info.thumburl);
    const blob = await imgRes.blob();
    const dataUrl = await blobToDataUrl(blob);
    return { url: dataUrl, credit: info.credit, blob, saved: false };
  } catch (e) {
    return null;
  }
}
// NEW — manual upload path: builds the exact same preview-object shape as
// previewWordImage (url/credit/blob/saved:false) but straight from a file
// the teacher picked on their own phone/PC — no lookup, no keyword match,
// no risk of a wrong-sense mismatch at all, since the teacher chose the
// exact picture themselves. This is offered as a fallback for words no
// automatic source (Wikipedia or Wikidata) has a good picture for, and as
// an always-available "use my own instead" option once a picture is
// showing. Goes straight to vocabImageRevealed=true (skipping the normal
// reveal gate) since there's nothing here a teacher hasn't already looked
// at before choosing to pick this exact file.
async function vocabImageFromUpload(file) {
  const dataUrl = await blobToDataUrl(file);
  return { url: dataUrl, credit: "शिक्षकद्वारा अपलोड गरिएको तस्बिर", blob: file, saved: false };
}
// Explicit "keep this for reuse" action — only called when the teacher
// taps the save button. Uploads to the shared Supabase bucket + table (so
// every device sees it from now on) and mirrors it locally for offline
// access on this device.
//
// FIX — this used to swallow every failure silently and just return
// false, so a teacher tapping "save" got no feedback at all when it
// didn't work (e.g. the "vocab-images" Storage bucket was never created
// in Supabase — a manual dashboard step the SQL migration can't do for
// you). Now logs the real error to the console and returns it, so the UI
// can tell the teacher WHY it failed instead of just doing nothing.
//
// FIX #2 — every save uploaded a brand-new file but never removed the
// PREVIOUS one for that word (e.g. from an earlier failed attempt while
// still chasing the bucket-not-found / invalid-key issues, or from using
// "change picture" and re-saving). The database row always pointed at
// the newest file, so nothing looked wrong in the app, but old files
// silently piled up unused in the bucket. Now it looks up any existing
// row for the word FIRST and deletes its old file after the new one is
// safely in place, so re-saving replaces rather than accumulates.
async function saveWordImageForReuse(word, blob, credit, teacherId) {
  try {
    const { data: existing } = await db.getVocabImage(word);
    const { path, error: upErr } = await db.uploadVocabImageFile(word, blob, teacherId);
    if (upErr) {
      console.error("saveWordImageForReuse: upload failed", upErr);
      return { ok: false, error: upErr.message || "अपलोड असफल भयो" };
    }
    const { error: rowErr } = await db.upsertVocabImage(word, { rejected: false, storage_path: path, credit }, existing?.storage_path);
    if (rowErr) {
      console.error("saveWordImageForReuse: row upsert failed", rowErr);
      return { ok: false, error: rowErr.message || "डाटा सुरक्षित गर्न सकिएन" };
    }
    const dataUrl = await blobToDataUrl(blob);
    await saveLocalVocabImage(word, { dataUrl, credit });
    return { ok: true };
  } catch (e) {
    console.error("saveWordImageForReuse: unexpected error", e);
    return { ok: false, error: e.message || "अज्ञात त्रुटि" };
  }
}


// NEW — turns a saved Teacher's Guide row into a Gemini `part`. docx goes
// through the same client-side extraction (mammoth) as tagged materials do
// elsewhere in the app — Gemini can't read docx directly; pdf/image go
// straight in as inline_data, same as the textbook.
async function buildGuidePart(guideRow) {
  if (!guideRow) return null;
  try {
    const blob = await db.downloadMaterialFile(guideRow.storage_path);
    if (guideRow.file_type === "docx") {
      const file = new File([blob], guideRow.label || "guide.docx", { type: blob.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      const { text, status } = await extractTextFromFile(file);
      return status === "done" && text ? { text } : null;
    }
    const b64 = await gemini.blobToBase64(blob);
    const mime = blob.type || (guideRow.file_type === "pdf" ? "application/pdf" : "image/jpeg");
    return { inline_data: { mime_type: mime, data: b64 } };
  } catch {
    return null;
  }
}

async function getMaterialContext(chapterTitle, classLabel = null, lessonId = null) {
  if (!chapterTitle || !chapterTitle.trim()) {
    return { pdfBase64: await getTextbookPDF(classLabel), materialParts: [], textbookText: null, matchedCount: 0 };
  }
  const chapterId = await db.getChapterIdByTitle(chapterTitle.trim(), classLabel);
  if (!chapterId) return { pdfBase64: await getTextbookPDF(classLabel), materialParts: [], textbookText: null, matchedCount: 0 };
  // FIX — materials now belong to a specific पाठ (Path), not the whole
  // अध्याय (Unit): a lesson plan/PPT uploaded for Path 2 was previously
  // fed into every Path's AI context just because they shared a chapter.
  // When generating a specific Path, use ONLY that Path's own materials.
  // Falls back to chapter-wide materials that still have no Path tag
  // (uploaded before this existed, or genuinely apply to the whole unit)
  // — never another Path's own files.
  let materials = [];
  if (lessonId) {
    const { data } = await db.getMaterialsByLesson(lessonId);
    materials = data || [];
  }
  if (!materials.length) {
    const { data } = await db.getMaterialsByChapter(chapterId);
    materials = (data || []).filter((m) => !m.lesson_id);
  }
  const materialParts = await gemini.buildMaterialParts(materials, db.downloadMaterialFile);

  let textbookText = await db.getTextbookChapterText(chapterId);
  let pdfBase64 = null;
  if (!textbookText) {
    try {
      const extracted = await gemini.extractChapterText(chapterTitle.trim(), classLabel);
      if (extracted) { textbookText = extracted; db.saveTextbookChapterText(chapterId, extracted); }
      else pdfBase64 = await getTextbookPDF(classLabel); // couldn't isolate this chapter (e.g. title doesn't match the book's wording) — fall back to the whole book for this call only, don't cache a miss
    } catch { pdfBase64 = await getTextbookPDF(classLabel); }
  }
  return { pdfBase64, materialParts, textbookText, matchedCount: materials.length };
}

// FIX — the root cause of the "wrong/broken tagging" problem: every screen
// (Planner, Question Bank, Activities, Assessment) let a teacher pick a
// chapter from the ChapterPicker, but only ever saved the typed chapter
// NAME (chapter_title) onto the row — never the real chapter_id foreign
// key. Materials was the one screen that got this right (see
// getOrCreateChapterId in db.js). Because of that mismatch, the
// `chapters(title)` join used everywhere (getLessons/getQuestions/
// getActivities) always came back empty, so lesson cards, the chapter
// materials list, and AI context-matching all silently broke or
// under-matched. Every save() below now calls this first so chapter_id is
// always set correctly and consistently, the same way Materials already
// does it. Safe to call with an empty title (returns null, meaning
// "unassigned").
async function resolveChapterId(title, classLabel = null) {
  if (!title || !title.trim()) return null;
  try { return await db.getOrCreateChapterId(title.trim(), classLabel); }
  catch { return null; }
}

// NEW — live counts (materials / questions / activities) tagged to one
// chapter, fetched together. Powers the "यो अध्यायसँग जोडिएको" strip in the
// Planner form — the cross-screen interconnection the app was missing,
// only reliable now that chapter_id is always set correctly (see above).
// NEW — live counts (materials / questions / activities / assessments)
// tagged to one chapter, fetched together. Powers the "यो अध्यायसँग
// जोडिएको" strip in the Planner form — the cross-screen interconnection
// the app was missing, only reliable now that chapter_id is always set
// correctly (see above). Also reused by Materials' delete-chapter warning
// (assessments added there — FIX below).
async function getChapterLinkedCounts(chapterId) {
  if (!chapterId) return { materials: 0, questions: 0, activities: 0, assessments: 0 };
  const [mats, qs, acts, asmts] = await Promise.all([
    supabase.from("materials").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
    supabase.from("questions").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
    supabase.from("activities").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
    supabase.from("assessments").select("id", { count: "exact", head: true }).eq("chapter_id", chapterId),
  ]);
  return { materials: mats.count || 0, questions: qs.count || 0, activities: acts.count || 0, assessments: asmts.count || 0 };
}

// NEW — THE single normalization + lookup used everywhere a पाठ (Path) name
// needs to be matched against existing lessons under a chapter, so "same
// title, same chapter" means the same thing everywhere instead of every
// screen doing its own ad-hoc compare. This used to be reimplemented
// separately inside PathPicker (tagging a material) and inside Planner as
// findDuplicatePath (creating/editing a lesson plan) — those two copies
// could and did drift, which is how a Path made from one screen sometimes
// failed to be recognized as "already exists" from the other.
function normTitle(s) { return (s || "").trim().toLowerCase().replace(/\s+/g, " "); }
function findExistingLesson(lessons, chapterTitle, pathTitle, excludeId = null) {
  const ct = normTitle(chapterTitle), pt = normTitle(pathTitle);
  if (!ct || !pt) return null;
  return (lessons || []).find((l) => {
    if (excludeId && l.id === excludeId) return false;
    const lct = normTitle(l.chapters?.title || l.chapter_title || "");
    return lct === ct && normTitle(l.title) === pt;
  }) || null;
}

// NEW — THE single door for "give me the id of this पाठ, creating it under
// this अध्याय if it doesn't exist yet". Reuses findExistingLesson above so a
// teacher re-typing a Path title they already made is always routed to the
// existing one instead of a silent duplicate — no matter which screen
// (Materials' tag dialog, Planner's material-attach-before-save) triggers it.
async function getOrCreateLesson({ lessons, chapterTitle, pathTitle, classLabel, sectionId = null, excludeId = null }) {
  if (!chapterTitle || !chapterTitle.trim() || !pathTitle || !pathTitle.trim()) return null;
  const existing = findExistingLesson(lessons, chapterTitle, pathTitle, excludeId);
  if (existing) return existing;
  const chapter_id = await resolveChapterId(chapterTitle, classLabel);
  const { data } = await db.upsertLesson({ title: pathTitle.trim(), chapter_id, status: "missing", class_label: classLabel, section_id: sectionId });
  return data || null;
}

// NEW — THE single door for describing what deleting an अध्याय will affect,
// used by every screen that offers the delete (Materials, Planner). Before
// this, Materials' delete only ever counted materials and Planner's only
// ever counted पाठ — each blind to what the other screen owned, so the
// warning a teacher saw depended on which screen they happened to delete
// from. Now both show the exact same full picture every time.
async function describeChapterDeletion(chapter, lessons) {
  const pathsCount = (lessons || []).filter((l) => l.chapter_id === chapter.id).length;
  const extra = await getChapterLinkedCounts(chapter.id).catch(() => ({ materials: 0, questions: 0, activities: 0, assessments: 0 }));
  const parts = [];
  if (pathsCount > 0) parts.push(`${pathsCount} पाठ`);
  if (extra.materials > 0) parts.push(`${extra.materials} सामग्री फाइल`);
  if (extra.questions > 0) parts.push(`${extra.questions} प्रश्न`);
  if (extra.activities > 0) parts.push(`${extra.activities} क्रियाकलाप`);
  if (extra.assessments > 0) parts.push(`${extra.assessments} मूल्याङ्कन`);
  return parts.length > 0
    ? `"${chapter.title}" मेटाउने? यसमा जोडिएका ${parts.join(", ")} अब कुनै अध्यायमा तोकिने छैनन् (मेटिने छैनन्, केवल अध्याय-ट्याग हट्नेछ)।`
    : `"${chapter.title}" मेटाउने?`;
}

// NEW — THE single door. Every place in the app that used to build its own
// "generate with AI" flow (Home's chapter-prepare card, Planner's single-add
// form, Planner's bulk-generate, LessonEditModal's regenerate) now calls
// this one function instead. Given an अध्याय (Unit) and a specific पाठ
// (Path) name inside it, it builds the whole bundle in one go — lesson
// plan, questions, activities, assessment rubric — and, critically, tags
// the questions/activities/assessment with this exact lesson_id (not just
// the chapter_id), so several Paths under the same Adhyaya each keep their
// own separate set instead of everything piling up at the Adhyaya level.
// onProgress(stepId, state) is optional, for a step-by-step UI.
async function preparePath({ chapterTitle, chapterId, pathTitle, lessonId, sectionId, classLabel, classContext, onProgress }) {
  const emit = (step, state, message) => onProgress && onProgress(step, state, message);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const title = (pathTitle || "").trim() || chapterTitle;
  const cId = chapterId || await resolveChapterId(chapterTitle, classLabel);
  const ctx = await getMaterialContext(chapterTitle, classLabel, lessonId);

  emit("plan", "loading");
  let lesson = null;
  try {
    const result = await gemini.generateLessonPlan(chapterTitle, ctx, classContext, pathTitle);
    const payload = {
      title, status: "prep", chapter_id: cId,
      section_id: sectionId || null, class_label: classLabel,
      objectives: result.objectives || [], vocabulary: result.vocabulary || [],
      sequence: result.sequence || [], key_questions: result.key_questions || [],
      activities: result.activities || [], homework: result.homework || "", notes: result.notes || "",
    };
    if (lessonId) payload.id = lessonId;
    const { data, error: err } = await db.upsertLesson(payload);
    if (err) throw err;
    lesson = data;
    emit("plan", "done");
  } catch (e) { emit("plan", "error", e.message); throw e; }

  const lid = lesson?.id || lessonId || null;

  // FIX — the plan+questions+activities+rubric calls used to fire back to
  // back with no gap, all carrying the same attached-materials context.
  // Two would often go through fine and the next one or two would then
  // fail — a classic sign of a per-minute rate limit being hit partway
  // through, not a one-off fluke. Each remaining step now: (1) waits a
  // moment before starting, spreading the four calls out instead of
  // bursting them, and (2) gets one extra automatic retry with a longer
  // pause if the first attempt fails, before finally giving up and
  // showing the real error message under that step.
  async function runStep(step, fn) {
    emit(step, "loading");
    await sleep(1200);
    try {
      return await fn();
    } catch (e1) {
      await sleep(4000);
      try {
        return await fn();
      } catch (e2) {
        emit(step, "error", e2.message);
        return null;
      }
    }
  }

  let questionsCount = 0;
  const qs = await runStep("questions", () => gemini.generateQuestions(chapterTitle, ctx, classContext, pathTitle));
  if (qs?.length) {
    // FIX — class_label was never set here (only the lesson itself got
    // it, on line 284 above) — every question generated through this
    // main "AI ले यो पाठ बनाओस्" flow was invisible to class-scoped
    // filtering in Question Bank/Document Search until this fix.
    for (const q of qs) await db.upsertQuestion({ text: q.text, type: q.type || "छोटो उत्तर", difficulty: q.difficulty || "सजिलो", bloom_level: q.bloom || "सम्झना", chapter_id: cId, lesson_id: lid, options: q.options || [], correct_option: q.correct_option ?? null, class_label: classLabel });
    questionsCount = qs.length;
    emit("questions", "done");
  } else if (qs !== null) emit("questions", "error", "AI ले प्रश्न बनाउन सकेन।");

  let activitiesCount = 0;
  const acts = await runStep("activities", () => gemini.generateActivities(chapterTitle, ctx, classContext, pathTitle));
  if (acts?.length) {
    for (const a of acts) await db.upsertActivity({ title: a.title, type: a.type || "game", duration: a.duration, competency: a.competency, description: a.description, chapter_id: cId, lesson_id: lid, class_label: classLabel });
    activitiesCount = acts.length;
    emit("activities", "done");
  } else if (acts !== null) emit("activities", "error", "AI ले क्रियाकलाप बनाउन सकेन।");

  let gotRubric = false;
  // NEW — matches the same 4-level scale (उत्कृष्ट/राम्रो/सामान्य/सुधार
  // आवश्यक) used everywhere else a rubric is created or shown.
  const prompt = `नेपाल ${classContext} "${chapterTitle}"को "${title}" पाठका लागि रुजु सूची अन्तर्गतको मूल्याङ्कन मापदण्ड भएको JSON array मात्र, ठ्याक्कै यी ४ तह (क्रमैसँग): [{"level":"उत्कृष्ट","desc":"..."},{"level":"राम्रो","desc":"..."},{"level":"सामान्य","desc":"..."},{"level":"सुधार आवश्यक","desc":"..."}]`;
  const rubric = await runStep("assessment", () => gemini.generateRubric(prompt, ctx));
  if (rubric?.length) {
    await db.upsertAssessment({ title: `${title} — मूल्याङ्कन`, type: "checklist", rubric, due_date: null, status: "pending", chapter_id: cId, lesson_id: lid });
    gotRubric = true;
    emit("assessment", "done");
  } else if (rubric !== null) emit("assessment", "error", "AI ले मूल्याङ्कन मापदण्ड बनाउन सकेन।");

  return { lesson, questionsCount, activitiesCount, gotRubric };
}

// NEW — a real elevated, "premium" button with hover lift, active press,
// and a soft focus ring, done in plain inline styles + a couple of CSS
// classes injected globally (see the <style> block in App()) so :hover and
// :active actually work instead of relying only on JS mouse handlers.
// Buttons — fully-rounded "pill" shape reads friendlier/more energetic than
// the old squared-13px-radius look, and each filled variant gets a real
// two-stop gradient + a colour-matched glow shadow instead of a flat tint,
// which is what makes a warm palette actually feel vibrant instead of just
// "recolored". Ghost/ AI accents use the marigold family so the app's two
// warm hues (saffron accent + marigold) both get airtime instead of one
// color carrying every button on screen.
function Button({ children, onClick, variant="primary", size="md", disabled, style, icon:Icon, type }) {
  const variants = {
    primary:   { background:`linear-gradient(135deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`, color:"#fff", border:"none", boxShadow:SHADOW.accent },
    marigold:  { background:`linear-gradient(135deg, #FFD874 0%, ${MARIGOLD} 100%)`, color:"#3A2606", border:"none", boxShadow:SHADOW.marigold },
    secondary: { background:SURFACE, color:ACCENT, border:`2px solid ${BORDER}`, boxShadow:SHADOW.sm },
    ghost:     { background:ACCENT_LIGHT, color:ACCENT_DARK, border:"none", boxShadow:"none" },
    danger:    { background:SURFACE, color:DANGER, border:`2px solid ${DANGER_BG}`, boxShadow:SHADOW.sm },
  };
  const sizes = {
    sm: { padding:"10px 18px", fontSize:15.5 },
    md: { padding:"14px 24px", fontSize:16.5 },
    lg: { padding:"17px 30px", fontSize:18 },
  };
  return (
    <button
      type={type||"button"}
      onClick={onClick}
      disabled={disabled}
      className="ss-btn"
      style={{
        display:"flex", alignItems:"center", justifyContent:"center", gap:8,
        borderRadius:999, fontWeight:700, letterSpacing:"-0.005em", fontFamily:"'SSText','Kalimati','Times New Roman',serif",
        cursor:disabled?"wait":"pointer", opacity:disabled?0.65:1,
        ...variants[variant], ...sizes[size], ...style,
      }}>
      {Icon&&<Icon size={size==="lg"?19:size==="sm"?14:16}/>}
      {children}
    </button>
  );
}

// Cards — bumped radius (22) and a subtle warm-tinted gradient surface so
// cards read as "paper lit from above" rather than flat grey boxes; the
// left accent-color rail (when given) is now thicker (5px) and the whole
// card gets a soft matching glow on hover, not just a lift, so color-coded
// lists (materials, activities...) feel lively while scanning.
// NEW — UI overhaul, pass 1: every filter/tab/toggle chip in the app (class
// sections, category filters, calendar categories, AI Sahayak tabs, theme
// toggle, event-category picker) was hand-rolled per screen with its own
// padding/font-size/border-width, close but never quite matching its
// neighbors. One Chip now backs all of them, and its active state carries
// the same small lift+glow the rest of the app already uses for "this is
// the selected one" (PageHeader's icon badge, EmptyState's icon) — a
// consistent little "stamped" tell instead of each screen inventing its own.
function Chip({ children, icon:Icon, active, onClick, color=ACCENT, size="md", dashed, type="button", style }) {
  const sizes = { sm:{padding:"7px 12px",fontSize:14}, md:{padding:"8px 14px",fontSize:15.5}, lg:{padding:"13px 16px",fontSize:16} };
  return (
    <button type={type} onClick={onClick} className="ss-chip ss-btn" style={{
      display:"flex",alignItems:"center",gap:5,borderRadius:999,flexShrink:0,
      border:`1.5px ${dashed?"dashed":"solid"} ${active?color:BORDER}`,
      background:active?color:(dashed?"none":SURFACE),
      color:active?"#fff":INK_SOFT,
      fontWeight:700,whiteSpace:"nowrap",cursor:"pointer",fontFamily:"'SSText','Kalimati','Times New Roman',serif",
      boxShadow:active?`0 4px 10px color-mix(in srgb, ${color} 35%, transparent)`:"none",
      transform:active?"translateY(-1px)":"none",transition:"all .15s ease",
      ...sizes[size], ...style,
    }}>
      {Icon&&<Icon size={size==="lg"?15:13}/>}
      {children}
    </button>
  );
}

// NEW — UI overhaul, pass 2: the two clearest repeated icon-button
// families collapse into one IconButton. Before: 11 near-identical copies
// of "plain X to close this popup" (each re-typing background:none,
// border:none, color:INK_SOFT) plus 7 copies of the translucent
// "on a dark hero panel" action button (LessonMode/quiz headers —
// back/edit/print/refresh/close, each re-typing the same
// rgba(255,255,255,0.15) pill). One component now backs both, as three
// named variants instead of three ad-hoc style objects:
//   ghost   — plain, no background (default modal/drawer close button)
//   surface — same close action sitting on a bordered pill (drawers that
//             float over varied/scrolling content, e.g. search/settings)
//   hero    — translucent white-on-color, for action buttons on a
//             colored hero panel
function IconButton({ icon:Icon, onClick, title, disabled, color, size=19, variant="ghost", spin, type="button", style }) {
  // FIX — "hero" was rgba(255,255,255,0.15) with no border, which reads
  // fine on a fully dark background but nearly disappears against the
  // lighter marigold end of the header gradients these buttons sit on
  // (LessonMode/PrintableSheet/SimulationPanel headers) — that's the
  // "back button not prominent" report. A slightly stronger fill plus a
  // visible border and a soft shadow keeps it readable across the whole
  // gradient, light or dark end, instead of relying on the background
  // alone for contrast.
  const variants = {
    ghost:   { background:"none", border:"none", color:color||INK_SOFT, padding:6 },
    surface: { background:SURFACE_2, border:`1px solid ${BORDER}`, borderRadius:10, color:color||INK_SOFT, padding:9 },
    hero:    { background:"rgba(255,255,255,0.22)", border:"1px solid rgba(255,255,255,0.35)", borderRadius:10, color:"#fff", padding:10, boxShadow:"0 1px 4px rgba(0,0,0,0.18)" },
  };
  return (
    <button type={type} className="ss-icon-btn" onClick={onClick} disabled={disabled} title={title} style={{
      display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
      cursor:disabled?"default":"pointer",
      ...variants[variant], ...style,
    }}>
      <Icon size={size} style={spin?{animation:"spin 1s linear infinite"}:undefined}/>
    </button>
  );
}

function Card({ children, onClick, style, accentColor }) {
  return (
    <div onClick={onClick}
      className={onClick?"ss-card ss-card-hover":"ss-card"}
      style={{
        background:`linear-gradient(165deg, var(--surface) 0%, color-mix(in srgb, var(--surface) 88%, ${accentColor||MARIGOLD} 6%) 100%)`,
        border:`1px solid ${BORDER}`, borderRadius:22, padding:18,
        cursor:onClick?"pointer":"default", boxShadow:SHADOW.raised,
        ...(accentColor?{borderLeft:`5px solid ${accentColor}`,borderTopLeftRadius:9,borderBottomLeftRadius:9}:{}),
        ...style,
      }}>
      {children}
    </div>
  );
}
function SectionLabel({ children, icon:Icon, color }) {
  return (
    <div style={{ display:"flex",alignItems:"center",gap:7, fontSize:15, letterSpacing:"0.08em", textTransform:"uppercase", color:color||ACCENT_DARK, marginBottom:11, fontWeight:800, fontFamily:"'SSText','Kalimati','Times New Roman',serif" }}>
      {Icon&&<Icon size={14} color={color||ACCENT}/>}
      {children}
    </div>
  );
}

// FIX — the earlier "pushpin"/ribbon corner badge read as a cheap novelty
// prop rather than a real design element (user feedback). Removed outright;
// the card's left accent-color rail (see Card's accentColor prop) already
// carries the same at-a-glance category signal without an extra floating
// shape competing for attention.
function PinBadge() {
  return null;
}
const STATUS_META = { ready:{label:"तयार",bg:ACCENT_LIGHT,color:ACCENT}, prep:{label:"तयारी चाहिने",bg:WARN_BG,color:WARN}, missing:{label:"सुरु नभएको",bg:DANGER_BG,color:DANGER} };
function StatusPill({ status }) {
  const s = STATUS_META[status]||STATUS_META.prep;
  return <span style={{ display:"inline-flex",alignItems:"center",gap:6, background:s.bg, color:s.color, fontSize:15.5, fontWeight:700, padding:"4px 12px", borderRadius:999 }}><span style={{width:7,height:7,borderRadius:"50%",background:s.color,flexShrink:0,boxShadow:`0 0 0 3px color-mix(in srgb, ${s.color} 22%, transparent)`}}/>{s.label}</span>;
}
function Spinner({ small }) {
  return <div style={{ display:"flex", justifyContent:"center", alignItems:"center", padding:small?0:40 }}><Loader size={small?18:28} color={ACCENT} style={{ animation:"spin 1s linear infinite" }} /><style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style></div>;
}
// NEW — relative-time text for the topbar sync badge ("३ मिनेट अगाडि सिंक
// भयो" instead of a static "सिंक भएको" that never changed).
function relativeSyncLabel(ts) {
  if (!ts) return "सिंक भएको";
  const secs = Math.floor((Date.now() - ts) / 1000);
  if (secs < 45) return "भर्खरै सिंक भयो";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} मिनेट अगाडि सिंक`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} घण्टा अगाडि सिंक`;
  const days = Math.floor(hrs / 24);
  return `${days} दिन अगाडि सिंक`;
}
function ErrorMsg({ msg }) {
  return <div style={{ display:"flex", alignItems:"center", gap:9, background:DANGER_BG, borderRadius:12, padding:"12px 15px", fontSize:16, color:DANGER, margin:"10px 0", fontWeight:500 }}><AlertCircle size={17}/>{msg}</div>;
}
function EmptyState({ icon:Icon=FileText, text, actionLabel, onAction }) {
  return (
    <div style={{textAlign:"center",padding:"34px 20px"}}>
      <div style={{
        width:60,height:60,borderRadius:20,margin:"0 auto 14px",
        background:`linear-gradient(155deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`,
        display:"flex",alignItems:"center",justifyContent:"center",
        boxShadow:SHADOW.marigold, transform:"rotate(-4deg)",
      }}><Icon size={25} color="#fff" style={{transform:"rotate(4deg)"}}/></div>
      <div style={{fontSize:16.5,fontWeight:700,color:INK_SOFT}}>{text}</div>
      {/* NEW — a message alone in a big empty area doesn't tell you what to
          do next. Giving the empty state its own action button puts the
          obvious next step right where your eye already landed. */}
      {actionLabel&&onAction&&(
        <button className="ss-btn" onClick={onAction} style={{marginTop:16,display:"inline-flex",alignItems:"center",gap:6,background:`linear-gradient(135deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`,color:"#fff",border:"none",borderRadius:999,padding:"11px 20px",fontWeight:700,fontSize:15.5,cursor:"pointer",boxShadow:SHADOW.accent}}><Plus size={15}/>{actionLabel}</button>
      )}
    </div>
  );
}
// NEW — one shared screen-title treatment (icon badge + title + optional
// subtitle + right-aligned action) used across every screen. Before this,
// each screen hand-rolled its own title size/weight/icon usage, so the app
// felt inconsistent moving between sections — this is what makes it read as
// one cohesively-designed product instead of many separate pages.
// The icon badge is now a rounded-square set at a slight tilt (a small
// "stamped/pinned" touch that recurs across the app — see PinBadge) and the
// title uses the Baloo 2 display face so every screen opens on the same
// bold, energetic beat.
function PageHeader({ icon:Icon, title, subtitle, action, color=ACCENT }) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,marginBottom:20,flexWrap:"wrap"}}>
      <div style={{display:"flex",alignItems:"center",gap:13,minWidth:0}}>
        {Icon&&<div style={{width:44,height:44,borderRadius:13,background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 72%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 10px color-mix(in srgb, ${color} 32%, transparent)`}}><Icon size={21} color="#fff"/></div>}
        <div style={{minWidth:0}}>
          <div style={{fontSize:23,fontWeight:800,color:INK,letterSpacing:"-0.01em",lineHeight:1.2,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>{title}</div>
          {subtitle&&<div style={{fontSize:14.5,color:INK_SOFT,fontWeight:600,marginTop:2}}>{subtitle}</div>}
        </div>
      </div>
      {action&&<div style={{flexShrink:0,maxWidth:"100%",minWidth:0}}>{action}</div>}
    </div>
  );
}
// The AI action is the single most important button on most screens — give
// it its own bold gradient treatment (not the quiet "ghost" look) so it
// reads as the obvious next tap rather than blending in with secondary
// actions.
function AIButton({ label, onClick, loading, style }) {
  return (
    <button className="ss-btn" onClick={onClick} disabled={loading} style={{
      display:"flex",alignItems:"center",justifyContent:"center",gap:8,
      background:`linear-gradient(160deg, ${VIOLET} 0%, color-mix(in srgb, ${VIOLET} 72%, black) 100%)`, color:"#fff", border:"none",
      borderRadius:999, fontWeight:700, fontSize:16, padding:"11px 20px",
      cursor:loading?"wait":"pointer", opacity:loading?0.75:1,
      boxShadow:`0 4px 12px color-mix(in srgb, ${VIOLET} 22%, transparent)`,
      fontFamily:"'SSText','Kalimati','Times New Roman',serif", ...style,
    }}>
      {loading?<Spinner small/>:<Zap size={16}/>} {label}
    </button>
  );
}
// NEW — THE single door for saving a material file, same one-door pattern
// as preparePath() for lesson plans. The bulk uploader in समग्री and the
// quick "सामग्री थप्नुहोस्" attach widget (used from Planner, Question Bank,
// Activities, Assessment) used to each have their own copy of this
// extraction + chapter-resolution + storage-upload logic, silently drifting
// out of sync with each other. Both call this now.
async function uploadOneMaterial({ file, chapterTitle, lessonId, category, classLabel }) {
  const typeMap={pdf:"pdf",pptx:"pptx",ppt:"pptx",doc:"doc",docx:"doc",xlsx:"sheet",xls:"sheet",csv:"sheet",jpg:"image",jpeg:"image",png:"image",mp4:"video",mp3:"audio"};
  const ext=file.name.split(".").pop().toLowerCase();
  const fileType=typeMap[ext]||"doc";
  let extracted_text="",extraction_status="not_needed",warning=null;
  if(["docx","pptx","xlsx","xls","csv"].includes(ext)){
    const res=await extractTextFromFile(file);
    extracted_text=res.text;extraction_status=res.status;
    if(res.status==="failed")warning=`${file.name} (टेक्स्ट निकाल्न सकिएन)`;
  }else if(ext==="doc"){
    extraction_status="failed";
    warning=`${file.name} (.doc समर्थित छैन — .docx बनाएर फेरि पठाउनुहोस्)`;
  }
  const{data:{user}}=await supabase.auth.getUser();
  const chapterId=await resolveChapterId(chapterTitle,classLabel);
  const{path,error:upErr}=await db.uploadMaterialFile(file,user.id);
  if(upErr)return{data:null,error:upErr,warning:`${file.name} (${upErr.message})`};
  const{data,error}=await db.insertMaterial({name:file.name,storage_path:path,file_type:fileType,size_bytes:file.size,tags:[],chapter_id:chapterId,lesson_id:lessonId||null,category:category||"other",extracted_text,extraction_status,class_label:classLabel});
  return{data,error,warning};
}

// NEW — the matching single door for re-tagging (chapter/Path/category) an
// already-uploaded material, including lazily extracting text for older
// files uploaded before extraction existed.
async function retagMaterial({ material, chapterTitle, lessonId, category, classLabel }) {
  const chapterId=await resolveChapterId(chapterTitle,classLabel);
  let patch={chapter_id:chapterId,lesson_id:lessonId||null,category,class_label:classLabel};
  const ext=material.name.split(".").pop().toLowerCase();
  if(!material.extracted_text&&["docx","pptx","xlsx","xls","csv"].includes(ext)){
    try{
      const blob=await db.downloadMaterialFile(material.storage_path);
      const file=new File([blob],material.name);
      const res=await extractTextFromFile(file);
      patch.extracted_text=res.text;patch.extraction_status=res.status;
    }catch(e){patch.extraction_status="failed";}
  }
  return await db.updateMaterial(material.id,patch);
}

function MaterialsHint({ count, chapterTitle, pathTitle }) {
  const label=(pathTitle&&pathTitle.trim())?pathTitle:chapterTitle;
  const scope=(pathTitle&&pathTitle.trim())?"पाठ":"अध्याय";
  if (!label || !label.trim()) return null;
  return (
    <div style={{ fontSize:15, color: count>0?ACCENT:WARN, background: count>0?ACCENT_LIGHT:WARN_BG, borderRadius:8, padding:"6px 10px", marginBottom:8, display:"flex", alignItems:"center", gap:6 }}>
      <FileText size={13}/>
      {count>0?`"${label}" ${scope}मा ट्याग गरिएका ${count} फाइल AI ले प्रयोग गर्दैछ`:`"${label}" ${scope}मा कुनै सामग्री ट्याग गरिएको छैन`}
    </div>
  );
}

// NEW — shared "attach a material to this chapter without leaving the form"
// widget. Used by Planner, Question Bank, Activities and Assessment so none
// of them require a separate trip to the Materials tab just to give the AI
// something to read from.
function MaterialAttach({ chapterTitle, lessonId, onEnsureLessonId }) {
  const { uploadMaterial } = useData();
  const [attaching,setAttaching]=useState(false);
  const [attachedNames,setAttachedNames]=useState([]);
  const [attachError,setAttachError]=useState("");

  const attachMaterial=async(e)=>{
    const file=e.target.files[0];if(!file)return;
    if(!chapterTitle||!chapterTitle.trim()){setAttachError("पहिले माथि अध्याय छान्नुहोस्।");e.target.value="";return;}
    // NEW — in a Path-aware context (Planner passes onEnsureLessonId) a
    // material always belongs to a specific पाठ. If this Path hasn't been
    // saved yet, resolve/create it first instead of silently attaching the
    // file at the whole-chapter level. Screens with no Path concept
    // (Question Bank/Activities/Assessment) don't pass onEnsureLessonId,
    // so they keep working exactly as before.
    let lid=lessonId||null;
    if(!lid&&onEnsureLessonId){
      lid=await onEnsureLessonId();
      if(!lid){setAttachError("पहिले माथि पाठको नाम लेख्नुहोस्।");e.target.value="";return;}
    }
    setAttaching(true);setAttachError("");
    const{data,error,warning}=await uploadMaterial({file,chapterTitle:chapterTitle.trim(),lessonId:lid,category:"other"});
    if(error){setAttachError(warning||error.message);setAttaching(false);e.target.value="";return;}
    if(warning)setAttachError(warning);
    setAttachedNames((prev)=>[...prev,file.name]);
    setAttaching(false);e.target.value="";
  };

  const ready=!!chapterTitle?.trim();
  return (
    <div style={{marginBottom:8}}>
      {attachedNames.length>0&&(
        <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:6}}>
          {attachedNames.map((n,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:6,fontSize:15,color:ACCENT,fontWeight:600}}><CheckCircle2 size={14}/><span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{n}</span></div>)}
        </div>
      )}
      {attachError&&<div style={{fontSize:14.5,color:DANGER,marginBottom:6}}>{attachError}</div>}
      <label style={{display:"inline-flex",alignItems:"center",gap:7,background:ready?ACCENT_LIGHT:SURFACE_2,color:ready?ACCENT:INK_SOFT,border:`1.5px dashed ${ready?ACCENT:BORDER}`,borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:15,cursor:ready?"pointer":"not-allowed"}}>
        {attaching?<Spinner small/>:<Paperclip size={15}/>}{attaching?"अपलोड हुँदै...":"सामग्री थप्नुहोस्"}
        <input type="file" onChange={attachMaterial} disabled={!ready||attaching} style={{display:"none"}}/>
      </label>
    </div>
  );
}

// THE single door for choosing (or creating) an अध्याय, used everywhere a
// chapter needs to be picked (Materials, Planner, Question Bank, Activities,
// Assessment). Reads the one shared chapters list straight from context —
// callers just pass value/onChange, nothing else, so there's no way for one
// screen's copy of "the chapters" to drift from another's.
function ChapterPicker({ value, onChange, placeholder }) {
  const { chapters, addChapter } = useData();
  const [showAdd,setShowAdd]=useState(false);
  const [newTitle,setNewTitle]=useState("");
  const [adding,setAdding]=useState(false);

  const submitNew=async()=>{
    if(!newTitle.trim())return;
    setAdding(true);
    try{
      await addChapter(newTitle.trim());
      onChange(newTitle.trim());
      setShowAdd(false);setNewTitle("");
    }finally{setAdding(false);}
  };

  return(
    <div>
      <select
        value={chapters.some((c)=>c.title===value)?value:""}
        onChange={(e)=>{
          if(e.target.value==="__new__"){setShowAdd(true);}
          else {onChange(e.target.value);setShowAdd(false);}
        }}
        className="ss-field"
        style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,color:value?INK:INK_SOFT}}>
        <option value="">{placeholder||"— अध्याय छान्नुहोस् —"}</option>
        {chapters.map((c)=><option key={c.id} value={c.title}>{c.title}</option>)}
        <option value="__new__">+ नयाँ अध्याय थप्नुहोस्</option>
      </select>
      {showAdd&&(
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input autoFocus value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&submitNew()} placeholder="नयाँ अध्यायको नाम लेख्नुहोस्" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
          <button className="ss-btn" onClick={submitNew} disabled={adding||!newTitle.trim()} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16,cursor:"pointer",boxShadow:SHADOW.accent}}>{adding?"...":"थप्नुहोस्"}</button>
        </div>
      )}
    </div>
  );
}

// THE single door — companion to ChapterPicker — for choosing (or creating)
// which पाठ (Path) inside the already-selected अध्याय a material belongs to.
// Reads the one shared lessons list from context and creates new Paths
// through the same getOrCreateLesson() door Planner uses, so a Path can
// never be created twice under two different code paths again.
function PathPicker({ value, onChange, chapterTitle }) {
  const { lessons, addLesson } = useData();
  const [showAdd,setShowAdd]=useState(false);
  const [newTitle,setNewTitle]=useState("");
  const [adding,setAdding]=useState(false);
  const chapterPaths=(lessons||[]).filter((l)=>(l.chapters?.title||l.chapter_title)===chapterTitle);

  const submitNew=async()=>{
    if(!newTitle.trim()||!chapterTitle)return;
    setAdding(true);
    try{
      const lesson=await addLesson(chapterTitle,newTitle.trim());
      if(lesson){onChange(lesson.id);}
      setShowAdd(false);setNewTitle("");
    }finally{setAdding(false);}
  };

  if(!chapterTitle||!chapterTitle.trim()){
    return <div style={{fontSize:14.5,color:INK_SOFT,padding:"9px 2px"}}>पहिले माथि अध्याय छान्नुहोस्।</div>;
  }

  return(
    <div>
      <select
        value={chapterPaths.some((l)=>l.id===value)?value:""}
        onChange={(e)=>{
          if(e.target.value==="__new__"){setShowAdd(true);}
          else{onChange(e.target.value||null);setShowAdd(false);}
        }}
        className="ss-field"
        style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,color:value?INK:INK_SOFT}}>
        <option value="">— पाठ छान्नुहोस् * —</option>
        {chapterPaths.map((l)=><option key={l.id} value={l.id}>{l.title}</option>)}
        <option value="__new__">+ नयाँ पाठ थप्नुहोस्</option>
      </select>
      {showAdd&&(
        <div style={{display:"flex",gap:8,marginTop:8}}>
          <input autoFocus value={newTitle} onChange={(e)=>setNewTitle(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&submitNew()} placeholder="नयाँ पाठको नाम लेख्नुहोस्" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
          <button className="ss-btn" onClick={submitNew} disabled={adding||!newTitle.trim()} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16,cursor:"pointer",boxShadow:SHADOW.accent}}>{adding?"...":"थप्नुहोस्"}</button>
        </div>
      )}
    </div>
  );
}

// NEW — a simple 3-step checklist on the दashboard so a teacher opening the
// app for the first time (or feeling lost) always knows exactly what to do
// next. Disappears once all three steps are done.
function GetStartedCard({ chapters, materialsCount, lessons, onGoMaterials, onGoPlanner }) {
  const step1 = chapters.length>0;
  const step2 = materialsCount>0;
  const step3 = lessons.length>0;
  if(step1&&step2&&step3) return null;

  const Step=({ done, num, title, sub, onClick })=>(
    <div onClick={onClick} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 6px",cursor:onClick?"pointer":"default",opacity:done?0.55:1}}>
      <div style={{width:28,height:28,borderRadius:"50%",background:done?ACCENT:WARN_BG,color:done?"#fff":WARN,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:16,flexShrink:0}}>{done?"✓":num}</div>
      <div style={{flex:1}}>
        <div style={{fontSize:16.5,fontWeight:700,color:INK,textDecoration:done?"line-through":"none"}}>{title}</div>
        {sub&&<div style={{fontSize:15,color:INK_SOFT,marginTop:1}}>{sub}</div>}
      </div>
      {!done&&onClick&&<ArrowRight size={16} color={INK_SOFT}/>}
    </div>
  );

  return(
    <Card style={{marginBottom:20}}>
      <div style={{fontSize:17,fontWeight:700,color:INK,marginBottom:4}}>👋 सुरु गर्नुहोस्</div>
      <div style={{fontSize:15.5,color:INK_SOFT,marginBottom:8}}>तीन सजिलो चरणमा शिक्षा साथी प्रयोग गर्नुहोस्</div>
      <Step done={step1} num={1} title="पहिलो अध्याय थप्नुहोस्" sub="सामग्री वा पाठ योजनाबाट नयाँ अध्याय बनाउन सकिन्छ" onClick={!step1?onGoMaterials:undefined}/>
      <div style={{height:1,background:BORDER}}/>
      <Step done={step2} num={2} title="अध्यायसँग सामग्री अपलोड गर्नुहोस्" sub="PDF, Word, PowerPoint — जे भए पनि" onClick={!step2?onGoMaterials:undefined}/>
      <div style={{height:1,background:BORDER}}/>
      <Step done={step3} num={3} title="AI बाट पाठ योजना बनाउनुहोस्" sub="अपलोड गरेको सामग्री AI ले स्वतः प्रयोग गर्छ" onClick={!step3?onGoPlanner:undefined}/>
    </Card>
  );
}

function LoginScreen({ onLogin }) {
  const [mode,setMode]=useState("login");
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirmPassword,setConfirmPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");

  // NEW — validate locally before ever hitting the network, so mistakes are
  // caught immediately with a specific message instead of waiting on a
  // round trip to get back a generic Supabase error.
  const validate=()=>{
    if(!email.trim())return"इमेल लेख्नुहोस्।";
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))return"मान्य इमेल ठेगाना लेख्नुहोस्।";
    if(!password)return"पासवर्ड लेख्नुहोस्।";
    if(mode==="signup"){
      if(!name.trim())return"आफ्नो नाम लेख्नुहोस्।";
      if(password.length<6)return"पासवर्ड कम्तिमा ६ अक्षरको हुनुपर्छ।";
      if(password!==confirmPassword)return"पासवर्ड मिलेन। फेरि जाँच्नुहोस्।";
    }
    return"";
  };

  const handle=async()=>{
    setError("");setSuccess("");
    const validationError=validate();
    if(validationError){setError(validationError);return;}
    setLoading(true);
    const{data,error:err}=mode==="login"
      ?await db.signIn(email.trim(),password)
      :await db.signUp(email.trim(),password,{data:{full_name:name.trim()}});
    setLoading(false);
    if(err){setError(err.message);return;}
    if(mode==="signup"){
      // NEW — the teacher's name is saved right away so it's already there
      // the first time they log in, instead of a separate Settings step.
      try{localStorage.setItem("ss-teacher-name",name.trim());}catch{}
      setSuccess("इमेल जाँच गरी प्रमाणित गर्नुहोस्।");setMode("login");
      setPassword("");setConfirmPassword("");
    }
    else onLogin(data.session);
  };

  const fieldStyle={width:"100%",border:`1.5px solid ${BORDER}`,borderRadius:12,padding:"13px 42px 13px 42px",fontSize:16.5,outline:"none",background:SURFACE_2,color:INK,caretColor:ACCENT};

  return(
    <div style={{minHeight:"100vh",position:"relative",overflow:"hidden",background:`radial-gradient(1000px 560px at 15% -10%, ${ACCENT_LIGHT}, ${PAPER} 55%)`,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>
      <div style={{position:"absolute",top:-120,right:-100,width:340,height:340,borderRadius:"50%",background:`radial-gradient(circle, ${tint(MARIGOLD,20)}, transparent 70%)`,pointerEvents:"none"}}/>
      <div style={{position:"absolute",bottom:-140,left:-110,width:360,height:360,borderRadius:"50%",background:`radial-gradient(circle, ${tint(ROSE,16)}, transparent 70%)`,pointerEvents:"none"}}/>

      <div style={{width:"100%",maxWidth:408,position:"relative"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <img src="/icons/icon-192.png" alt="शिक्षा साथी" width={76} height={76} style={{borderRadius:26,margin:"0 auto 18px",display:"block",boxShadow:SHADOW.marigold,transform:"rotate(-4deg)"}}/>
          <div style={{fontSize:32,fontWeight:800,color:INK,letterSpacing:"-0.01em",fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>शिक्षा साथी</div>
          <div style={{fontSize:16.5,color:INK_SOFT,marginTop:6,fontWeight:600}}>जुनसुकै कक्षा र विषयका शिक्षकको साथी</div>
        </div>

        <Card style={{boxShadow:SHADOW.lg,padding:8,border:`1px solid ${BORDER}`,borderRadius:26}}>
          <div style={{display:"flex",gap:4,padding:6,background:SURFACE_2,borderRadius:999,marginBottom:22}}>
            <button onClick={()=>{setMode("login");setError("");}} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:999,border:"none",cursor:"pointer",fontWeight:700,fontSize:16,background:mode==="login"?`linear-gradient(135deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`:"transparent",color:mode==="login"?"#fff":INK_SOFT,boxShadow:mode==="login"?SHADOW.accent:"none"}}>लगइन</button>
            <button onClick={()=>{setMode("signup");setError("");}} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:999,border:"none",cursor:"pointer",fontWeight:700,fontSize:16,background:mode==="signup"?`linear-gradient(135deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`:"transparent",color:mode==="signup"?"#fff":INK_SOFT,boxShadow:mode==="signup"?SHADOW.accent:"none"}}>नयाँ खाता</button>
          </div>

          <div style={{padding:"0 18px 22px"}}>
            {error&&<ErrorMsg msg={error}/>}
            {success&&<div style={{display:"flex",alignItems:"center",gap:8,background:ACCENT_LIGHT,borderRadius:12,padding:"11px 15px",fontSize:16,color:ACCENT,marginBottom:12,fontWeight:600}}><CheckCircle2 size={16}/>{success}</div>}

            <div style={{display:"flex",flexDirection:"column",gap:13}}>
              {mode==="signup"&&(
                <div style={{position:"relative"}}>
                  <User size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                  <input type="text" placeholder="तपाईंको नाम" value={name} onChange={(e)=>setName(e.target.value)} style={{...fieldStyle,paddingRight:15}}/>
                </div>
              )}
              <div style={{position:"relative"}}>
                <User size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                <input type="email" autoCapitalize="none" placeholder="इमेल" value={email} onChange={(e)=>setEmail(e.target.value)} style={{...fieldStyle,paddingRight:15}}/>
              </div>
              <div style={{position:"relative"}}>
                <Lock size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                <input type={showPassword?"text":"password"} placeholder="पासवर्ड" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&mode==="login"&&handle()} style={fieldStyle}/>
                <button className="ss-icon-btn" type="button" onClick={()=>setShowPassword(!showPassword)} style={{position:"absolute",right:9,top:"50%",transform:"translateY(-50%)",cursor:"pointer",color:INK_SOFT,display:"flex",padding:5}}>{showPassword?<EyeOff size={17}/>:<Eye size={17}/>}</button>
              </div>
              {mode==="signup"&&(
                <>
                  <div style={{position:"relative"}}>
                    <Lock size={17} color={INK_SOFT} style={{position:"absolute",left:15,top:"50%",transform:"translateY(-50%)",pointerEvents:"none"}}/>
                    <input type={showPassword?"text":"password"} placeholder="पासवर्ड फेरि लेख्नुहोस्" value={confirmPassword} onChange={(e)=>setConfirmPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handle()} style={{...fieldStyle,paddingRight:15}}/>
                  </div>
                  <div style={{fontSize:14,color:INK_SOFT,marginTop:-6}}>पासवर्ड कम्तिमा ६ अक्षरको हुनुपर्छ।</div>
                </>
              )}
              <Button variant="primary" size="lg" onClick={handle} disabled={loading} style={{width:"100%",marginTop:4}}>{loading?<Spinner small/>:mode==="login"?"लगइन गर्नुहोस्":"खाता बनाउनुहोस्"}</Button>
            </div>
          </div>
        </Card>

        <div style={{textAlign:"center",marginTop:22,fontSize:14.5,color:INK_SOFT}}>नेपाली शिक्षकहरूका लागि, ❤️ सहित बनाइएको</div>
      </div>
    </div>
  );
}

function SectionSelector({ sections, current, onChange, onAdd }) {
  const [adding,setAdding]=useState(false);
  const [name,setName]=useState("");
  const [loading,setLoading]=useState(false);
  const save=async()=>{
    if(!name.trim())return;
    setLoading(true);
    const{data,error}=await db.createSection(name.trim());
    setLoading(false);
    if(!error){onAdd(data);setName("");setAdding(false);}
  };
  return(
    <div style={{padding:"11px 16px",background:SURFACE,borderBottom:`1px solid ${BORDER}`}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        {sections.map((s)=>(
          <Chip key={s.id} onClick={()=>onChange(s)} active={current?.id===s.id} size="lg">{s.name}</Chip>
        ))}
        {adding?(
          <div style={{display:"flex",gap:6,alignItems:"center",flexShrink:0}}>
            <input autoFocus value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&save()} placeholder="जस्तै: ५ क" style={{border:`1.5px solid ${BORDER}`,borderRadius:10,padding:"7px 11px",fontSize:15.5,width:100}}/>
            <button className="ss-btn" onClick={save} disabled={loading} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"7px 13px",fontWeight:700,fontSize:15.5,cursor:"pointer",boxShadow:SHADOW.accent}}>{loading?"...":"थप"}</button>
            <IconButton icon={X} onClick={()=>setAdding(false)} size={16}/>
          </div>
        ):(
          <Chip onClick={()=>setAdding(true)} icon={Plus} dashed>नयाँ सेक्सन</Chip>
        )}
      </div>
    </div>
  );
}

// NEW — shared full-screen printable overlay for any single generated/saved
// document (an activity, a rubric, a saved AI resource). Mirrors the same
// no-print chrome pattern LessonMode already uses, so window.print() only
// outputs the actual content, never the nav/header.
function PrintableSheet({ title, subtitle, chip, chipColor, onClose, children }) {
  return (
    <div className="print-area" style={{position:"fixed",inset:0,background:PAPER,zIndex:70,display:"flex",flexDirection:"column"}}>
      <div className="no-print" style={{background:`linear-gradient(120deg, ${MARIGOLD} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",padding:"14px 16px",display:"flex",alignItems:"center",gap:10}}>
        <IconButton icon={ArrowLeft} onClick={onClose} variant="hero" size={20}/>
        <div style={{flex:1,minWidth:0}}>
          {subtitle&&<div style={{fontSize:14,opacity:0.75}}>{subtitle}</div>}
          <div style={{fontSize:18.5,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{title}</div>
        </div>
        <IconButton icon={Printer} onClick={()=>window.print()} title="प्रिन्ट गर्नुहोस्" variant="hero" size={19}/>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:20,maxWidth:720,margin:"0 auto",width:"100%"}}>
        {chip&&<span style={{fontSize:13.5,background:tint(chipColor||ACCENT,15),color:chipColor||ACCENT,padding:"4px 10px",borderRadius:999,fontWeight:700,display:"inline-block",marginBottom:12}}>{chip}</span>}
        {children}
      </div>
    </div>
  );
}


// FIX — "printable whole at one click" was broken: the on-screen tabs below
// only ever render whichever ONE tab is currently active (the others are
// unmounted, not just hidden), so window.print() could only ever print
// that single tab. This component now renders a second, always-complete
// copy of the plan (every section, in order) that stays invisible on
// screen (`.print-only`, display:none by default) and is the ONLY thing
// shown when actually printing (`@media print` flips it to visible and
// hides everything tagged `.no-print`, including the tabs). One click on
// the printer icon now always produces the full plan, regardless of which
// tab was open.
// NEW — FIX: the edit button used to force-navigate to the Planner screen
// no matter where you actually were (open a lesson from the Dashboard,
// tap edit, get yanked to a completely different screen). This is the
// same edit form, but mountable as a popup from anywhere — closes right
// back to wherever you opened it from, the way LessonMode itself already
// works as an always-available overlay instead of a screen route.
function LessonEditModal({ lesson, classContext, classLabel, onClose, onSaved }) {
  const [form,setForm]=useState(()=>lessonToForm(lesson));
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState("");
  const [showDetails,setShowDetails]=useState(true);

  // FIX — used to only regenerate the lesson-plan text fields (objectives,
  // sequence...) and leave questions/activities/rubric untouched, as a
  // separate implementation from Home/Planner's own generate buttons. Now
  // calls the same single preparePath() door everything else uses, so
  // regenerating here also refreshes this Path's questions, activities and
  // rubric (tied to this exact lesson, not just the Adhyaya).
  const autoGenerate=async()=>{
    const chapter=form.chapter_title;
    if(!chapter.trim()){setError("पहिले अध्याय छान्नुहोस्।");return;}
    if(!form.title.trim()){setError("पहिले पाठको नाम लेख्नुहोस्।");return;}
    setGenerating(true);setError("");
    try{
      const {lesson}=await preparePath({chapterTitle:chapter,pathTitle:form.title,lessonId:form.id,classLabel,classContext});
      if(lesson)setForm(lessonToForm(lesson));
      else setError("AI ले डाटा बनाउन सकेन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };
  // NEW — regenerates ONLY the vocabulary list (see gemini.generateVocabulary),
  // for when the teacher wants more/different hard words without touching
  // objectives, sequence, questions, activities or rubric they may have
  // already reviewed/edited. Merges in by word — existing entries (and any
  // manual edits to them) are kept; only genuinely new words are added, so
  // nothing already there gets silently overwritten or reshuffled.
  const [vocabGenerating,setVocabGenerating]=useState(false);
  const regenerateVocabOnly=async()=>{
    const chapter=form.chapter_title;
    if(!chapter.trim()){setError("पहिले अध्याय छान्नुहोस्।");return;}
    setVocabGenerating(true);setError("");
    try{
      const ctx=await getMaterialContext(chapter,classLabel,form.id);
      const fresh=await gemini.generateVocabulary(chapter,ctx,classContext,form.title);
      const existingLines=form.vocabulary.split(";").map((v)=>v.trim()).filter(Boolean);
      const existingWords=new Set(existingLines.map((v)=>v.split(":")[0].trim()));
      const merged=[...existingLines, ...fresh.filter((v)=>!existingWords.has(v.split(":")[0].trim()))];
      setForm({...form, vocabulary: merged.join("; ")});
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setVocabGenerating(false);
  };

  const save=async()=>{
    if(!form.title.trim()){setError("पाठको नाम आवश्यक छ।");return;}
    setSaving(true);setError("");
    const chapter_id=await resolveChapterId(form.chapter_title,classLabel);
    const payload={...form,chapter_id,class_label:classLabel,
      objectives:form.objectives.split("\n").filter(Boolean),
      vocabulary:form.vocabulary.split(";").map((v)=>v.trim()).filter(Boolean),
      sequence:form.sequence.split("\n").filter(Boolean),
      key_questions:form.key_questions.split("\n").filter(Boolean),
      activities:form.activities.split("\n").filter(Boolean),
    };
    const{data,error:err}=await db.upsertLesson(payload);
    setSaving(false);
    if(err){setError(err.message);return;}
    onSaved(data);
    onClose();
  };

  const delLesson=async()=>{
    if(!confirm("यो पाठ मेटाउने?"))return;
    setDeleting(true);
    await db.deleteLesson(form.id);
    setDeleting(false);
    onSaved(null,true); // true = deleted
    onClose();
  };

  return(
    <div className="no-print" onClick={onClose} style={{position:"fixed",inset:0,zIndex:88,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.55)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:16}}>
      <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:18,padding:"24px 28px",maxWidth:"min(94vw, 820px)",width:"100%",maxHeight:"94vh",overflowY:"auto",boxSizing:"border-box",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`,fontSize:"clamp(15px, 1.6vw, 17px)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <div style={{fontWeight:800,fontSize:18,color:INK}}>पाठ सम्पादन गर्नुहोस्</div>
          <IconButton icon={X} onClick={onClose} size={20}/>
        </div>
        {error&&<ErrorMsg msg={error}/>}
        <div style={{display:"flex",flexDirection:"column",gap:9}}>
          <div>
            <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>पाठको नाम</div>
            <input placeholder="पाठको नाम *" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
          </div>
          <div>
            <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>अध्याय</div>
            <ChapterPicker value={form.chapter_title} onChange={(v)=>setForm({...form,chapter_title:v})} placeholder="— अध्याय छान्नुहोस् —"/>
          </div>
          <div>
            <AIButton label={generating?"बनाउँदै...":"AI बाट पुनः पूर्ण तयार गर्नुहोस् (योजना+प्रश्न+क्रियाकलाप+मूल्याङ्कन)"} onClick={autoGenerate} loading={generating} style={{width:"100%",justifyContent:"center"}}/>
          </div>
          <button className="ss-icon-btn" type="button" onClick={()=>setShowDetails((v)=>!v)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",color:ACCENT,fontWeight:700,fontSize:15,cursor:"pointer",padding:"6px 0",alignSelf:"flex-start"}}>
            {showDetails?<ArrowDown size={15}/>:<ArrowRight size={15}/>}विवरण {showDetails?"लुकाउनुहोस्":"देखाउनुहोस्"}
          </button>
          {showDetails&&(<>
            {[["homework","गृहकार्य"],["notes","नोट"]].map(([f,p])=>(
              <input key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            ))}
            {[["objectives","उद्देश्यहरू (प्रत्येक नयाँ लाइनमा)"],["vocabulary","शब्दावली — शब्द: अर्थ; अर्को शब्द: अर्थ"],["sequence","पढाउने क्रम (प्रत्येक नयाँ लाइनमा)"],["key_questions","मुख्य प्रश्नहरू (प्रत्येक नयाँ लाइनमा)"],["activities","क्रियाकलापहरू (प्रत्येक नयाँ लाइनमा)"]].map(([f,p])=>(
              <textarea key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} rows={3} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            ))}
          </>)}
          <div style={{display:"flex",gap:8}}>
            {["missing","prep","ready"].map((s)=>{const meta=STATUS_META[s];const active=form.status===s;return(
              <button key={s} onClick={()=>setForm({...form,status:s})} style={{flex:1,padding:"8px",borderRadius:10,border:`1.5px solid ${active?meta.color:`color-mix(in srgb, ${meta.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${meta.color} 14%, ${SURFACE})`:SURFACE,cursor:"pointer",boxShadow:active?`0 4px 10px color-mix(in srgb, ${meta.color} 25%, transparent)`:"none"}}><StatusPill status={s}/></button>
            );})}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="ss-btn" onClick={delLesson} disabled={deleting} style={{padding:"11px 14px",borderRadius:10,border:`1px solid ${DANGER_BG}`,background:DANGER_BG,color:DANGER,fontWeight:700,cursor:"pointer"}}><Trash2 size={16}/></button>
            <button onClick={onClose} className="ss-btn" style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
            <button className="ss-btn" onClick={save} disabled={saving} style={{flex:2,padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"परिवर्तन सुरक्षित गर्नुहोस्"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function LessonMode({ lesson, onClose, onEdit, autoPrint, classLabel, classContext, teacherName, initialTab }) {
  // NEW — lets Search jump straight to this lesson's मूल्याङ्कन tab (or
  // any tab) instead of always opening on पढाउने.
  const [tab,setTab]=useState(initialTab||"sequence");
  // NEW — vocabulary entries are stored as "शब्द: अर्थ" (word: meaning). This
  // used to just print the whole string as one flat pill (word and meaning
  // both always visible, taking up space and cluttering the row). Now only
  // the word shows; tapping it reveals the meaning in a small popup.
  const [vocabPopup,setVocabPopup]=useState(null);
  // NEW — Phase 2: lets a teacher collapse "आजको उद्देश्य" once they've
  // glanced at it, so it stops eating vertical space on every visit.
  const [objOpen,setObjOpen]=useState(true);
  // NEW — on desktop, objectives move into a popup instead of always
  // sitting in the rail, so the rail stays a slim tab list and the actual
  // content gets the space (see the "empty space on PC" fix below).
  const [objPopup,setObjPopup]=useState(false);
  // NEW — pictorial vocabulary: when a hard word's meaning popup opens,
  // try to fetch a relevant illustrative image for it (best-effort, see
  // fetchWordImage). Resets whenever a different word (or none) is open.
  const [vocabImage,setVocabImage]=useState(null);
  const [vocabImageLoading,setVocabImageLoading]=useState(false);
  // NEW — safety gate: a fetched picture is never auto-displayed. The
  // teacher must tap "तस्बिर हेर्नुहोस्" first, every time, so nothing can
  // pop into view unexpectedly (in front of students, or at all) before a
  // human has chosen to look. Resets whenever a different word opens.
  const [vocabImageRevealed,setVocabImageRevealed]=useState(false);
  // NEW — tracks the in-progress "बचत गर्नुहोस्" (save/keep) tap so the
  // button can show a brief loading state and can't be double-tapped.
  const [vocabImageSaving,setVocabImageSaving]=useState(false);
  // NEW — surfaces WHY a save failed (e.g. Supabase storage bucket not
  // set up yet) instead of the button just silently doing nothing.
  const [vocabSaveError,setVocabSaveError]=useState("");
  // NEW — manual search fallback: automatic lookup only matches a word
  // against a Wikipedia article title (exact, or a close spelling
  // variant — see wikipediaNearMatchImage). That correctly finds nothing
  // for a Devanagari-spelled loanword/acronym like "सिसिटिभी" (a phonetic
  // spelling of "C-C-T-V"), since no amount of title-similarity matching
  // bridges two different scripts. Rather than guess at a translation,
  // this lets the teacher type the actual term to look up (e.g. "CCTV" or
  // "Closed-circuit television") — it still goes through the exact same
  // safety checks (exact-title-or-near-match, no disambiguation pages),
  // just searching the term the teacher provided instead of the raw word.
  const [vocabManualQuery,setVocabManualQuery]=useState("");
  // NEW — distinguishes "automatic lookup found nothing" from "teacher
  // tapped the change/refresh icon wanting a different picture", so the
  // search box can explain the one thing that trips people up either way:
  // Wikipedia has exactly ONE lead picture per article, so searching the
  // very same word/phrase again always returns the very same picture —
  // getting a different one means typing a genuinely different term, not
  // just re-tapping search.
  const [vocabChangeRequested,setVocabChangeRequested]=useState(false);
  const [vocabManualSearching,setVocabManualSearching]=useState(false);
  // NEW — the manual search/upload panel starts collapsed behind a small
  // button rather than showing the search box + explanatory text right
  // away. Most words won't have an automatic match, so showing all of
  // that by default for every one of them would clutter the popup for no
  // reason — it's only needed when a teacher actually wants to go find or
  // add a picture themselves.
  const [vocabManualPanelOpen,setVocabManualPanelOpen]=useState(false);
  // NEW — manual upload: lets the teacher pick a photo straight from their
  // own phone/PC gallery instead of an automatic Wikipedia/Wikidata match.
  // The hidden <input type="file"> is triggered by a styled button (see
  // vocabFileInputRef.current.click() below); onChange hands the picked
  // file to vocabImageFromUpload, which skips lookup entirely.
  const vocabFileInputRef=useRef(null);
  const handleVocabFileUpload=async(e)=>{
    const file=e.target.files?.[0];
    e.target.value=""; // allow picking the same file again later
    if(!file)return;
    const img=await vocabImageFromUpload(file);
    setVocabImage(img);
    setVocabImageRevealed(true);
    setVocabSaveError("");
  };
  useEffect(()=>{
    if(!vocabPopup){setVocabImage(null);setVocabImageRevealed(false);setVocabManualQuery("");setVocabSaveError("");setVocabChangeRequested(false);setVocabManualPanelOpen(false);return;}
    let cancelled=false;
    setVocabImage(null);setVocabImageRevealed(false);setVocabImageLoading(true);setVocabManualQuery(vocabPopup.word||"");setVocabSaveError("");setVocabChangeRequested(false);setVocabManualPanelOpen(false);
    fetchWordImage(vocabPopup.word).then((img)=>{if(!cancelled){setVocabImage(img);setVocabImageLoading(false);}});
    return ()=>{cancelled=true;};
  },[vocabPopup]);
  const tabs=[{id:"sequence",label:"पढाउने",icon:ClipboardList},{id:"questions",label:"प्रश्नहरू",icon:MessageSquare},{id:"activities",label:"क्रियाकलाप",icon:Users},{id:"simulation",label:"सिमुलेसन",icon:Gamepad2},{id:"rubric",label:"मूल्याङ्कन",icon:Layers},{id:"homework",label:"गृहकार्य",icon:PenSquare}];
  const objectives=lesson.objectives||[];
  const vocabulary=lesson.vocabulary||[];
  // NEW — पढाउने क्रम used to be read straight off lesson.sequence with no
  // way to change a single step without regenerating the whole plan. This
  // makes it stateful (same pattern as activitiesState below) so a single
  // step can be edited or removed and saved immediately.
  const [sequenceState,setSequenceState]=useState(()=>lesson.sequence||[]);
  useEffect(()=>{setSequenceState(lesson.sequence||[]);},[lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const sequence=sequenceState;
  const [seqEditingIdx,setSeqEditingIdx]=useState(null);
  const [seqEditText,setSeqEditText]=useState("");
  const persistSequence=async(next)=>{
    setSequenceState(next);
    const{error}=await db.updateLesson(lesson.id,{sequence:next});
    if(error)alert("सुरक्षित हुन सकेन: "+(error.message||"कृपया फेरि प्रयास गर्नुहोस्।"));
  };
  const startEditSequence=(i)=>{setSeqEditingIdx(i);setSeqEditText(sequence[i]);};
  const saveEditedSequence=(i)=>{
    const text=seqEditText.trim();
    if(!text)return;
    persistSequence(sequence.map((s,idx)=>idx===i?text:s));
    setSeqEditingIdx(null);
  };
  const deleteSequenceStep=(i)=>{
    if(!window.confirm("यो चरण हटाउने?"))return;
    persistSequence(sequence.filter((_,idx)=>idx!==i));
    setSeqEditingIdx(null);
  };
  const keyQuestions=lesson.key_questions||[];
  // NEW — "प्रश्नहरू" used to just print each question with nothing to do
  // with it. Answers were never part of the data model (these are open
  // discussion prompts, not a quiz bank with a stored correct answer), so
  // tapping a question now asks Gemini for a short suggested answer on the
  // spot, grounded in this chapter. Answers are cached in "प्रश्न||उत्तर"
  // form back into key_questions once generated, so re-opening this same
  // lesson later shows it instantly instead of regenerating.
  const [qState,setQState]=useState(()=>keyQuestions.map((raw)=>{
    const idx=raw.indexOf("||");
    return idx>-1?{q:raw.slice(0,idx),a:raw.slice(idx+2)}:{q:raw,a:null};
  }));
  const [qOpen,setQOpen]=useState(()=>new Set());
  const [qLoading,setQLoading]=useState(()=>new Set());
  const [qErrors,setQErrors]=useState({});
  useEffect(()=>{
    setQState(keyQuestions.map((raw)=>{
      const idx=raw.indexOf("||");
      return idx>-1?{q:raw.slice(0,idx),a:raw.slice(idx+2)}:{q:raw,a:null};
    }));
    setQOpen(new Set());setQLoading(new Set());setQErrors({});
  },[lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchAnswer=async(i,forceRetry=false)=>{
    setQOpen((prev)=>new Set(prev).add(i));
    if((qState[i]?.a&&!forceRetry)||qLoading.has(i))return;
    setQErrors((prev)=>{const n={...prev};delete n[i];return n;});
    setQLoading((prev)=>new Set(prev).add(i));
    try{
      const prompt=`तपाईं नेपाली शिक्षक हुनुहुन्छ। "${chapterTitle}" पाठको सन्दर्भमा तलको कक्षा-छलफल प्रश्नको छोटो, स्पष्ट सुझाव-उत्तर (३-४ वाक्यमा, कक्षामा भन्न मिल्ने सरल भाषामा) दिनुहोस्। प्रश्न नदोहोर्‍याई सिधै उत्तर मात्र दिनुहोस्।\n\nप्रश्न: ${qState[i].q}`;
      const answer=(await gemini.generateText(prompt)).trim();
      if(!answer)throw new Error("empty");
      const next=qState.map((it,idx)=>idx===i?{...it,a:answer}:it);
      // FIX — this used to fire the db save without awaiting it or
      // checking the result, so a failed save (network hiccup, expired
      // session, etc.) looked identical to a successful one on screen —
      // the answer showed up, but never actually reached the database,
      // so it was gone again on the next reload. Now it's awaited and a
      // failure is shown immediately instead of only being discovered
      // later.
      const{error}=await db.updateLesson(lesson.id,{key_questions:next.map((it)=>it.a?`${it.q}||${it.a}`:it.q)});
      if(error){setQErrors((prev)=>({...prev,[i]:"उत्तर देखियो तर सुरक्षित हुन सकेन — फेरि प्रयास गर्नुहोस्।"}));return;}
      setQState(next);
    }catch{
      setQErrors((prev)=>({...prev,[i]:"उत्तर तयार गर्न सकिएन।"}));
    }finally{
      setQLoading((prev)=>{const next=new Set(prev);next.delete(i);return next;});
    }
  };
  const toggleQuestion=(i)=>{
    if(qOpen.has(i)){setQOpen((prev)=>{const n=new Set(prev);n.delete(i);return n;});return;}
    fetchAnswer(i);
  };

  // NEW — an AI-generated answer used to be view-only. Now it can be
  // edited (in case the AI got something slightly wrong) or cleared
  // entirely (to regenerate fresh, or just leave it blank) — same as any
  // other content in this app should work once it exists.
  const [qEditingIdx,setQEditingIdx]=useState(null);
  const [qEditText,setQEditText]=useState("");
  const persistQuestions=async(next)=>{
    setQState(next);
    const{error}=await db.updateLesson(lesson.id,{key_questions:next.map((it)=>it.a?`${it.q}||${it.a}`:it.q)});
    if(error)alert("सुरक्षित हुन सकेन: "+(error.message||"कृपया फेरि प्रयास गर्नुहोस्।"));
  };
  const startEditAnswer=(i,e)=>{e.stopPropagation();setQEditingIdx(i);setQEditText(qState[i].a||"");};
  const saveEditedAnswer=(i,e)=>{
    e.stopPropagation();
    persistQuestions(qState.map((it,idx)=>idx===i?{...it,a:qEditText.trim()||null}:it));
    setQEditingIdx(null);
  };
  const deleteAnswer=(i,e)=>{
    e.stopPropagation();
    persistQuestions(qState.map((it,idx)=>idx===i?{...it,a:null}:it));
    setQEditingIdx(null);
  };

  // NEW — the above only ever let you edit/clear the AI-generated answer;
  // the question text itself, and the ability to remove a whole question
  // from the lesson, didn't exist. Separate editing state from the answer
  // editor above so a teacher can be mid-edit on one and not the other.
  const [qTextEditingIdx,setQTextEditingIdx]=useState(null);
  const [qTextEditText,setQTextEditText]=useState("");
  const startEditQuestion=(i,e)=>{e.stopPropagation();setQTextEditingIdx(i);setQTextEditText(qState[i].q);};
  const saveEditedQuestion=(i,e)=>{
    e.stopPropagation();
    const text=qTextEditText.trim();
    if(!text)return;
    persistQuestions(qState.map((it,idx)=>idx===i?{...it,q:text}:it));
    setQTextEditingIdx(null);
  };
  const deleteQuestion=(i,e)=>{
    e.stopPropagation();
    if(!window.confirm("यो प्रश्न हटाउने?"))return;
    persistQuestions(qState.filter((_,idx)=>idx!==i));
    // indices shift after removal, so any open/loading/error state keyed
    // by index would point at the wrong item now — reset it.
    setQOpen(new Set());setQLoading(new Set());setQErrors({});
    setQTextEditingIdx(null);
  };

  const [activitiesState,setActivitiesState]=useState(()=>lesson.activities||[]);
  // NEW — the lesson plan's own "activities" list only ever comes with 2
  // by default (see the generateMoreActivities comment in gemini.js for
  // why). This lets a teacher ask AI for a few more on demand instead of
  // being stuck with just the two the initial plan generated — appends
  // to whatever's already there (skipping anything AI repeats verbatim)
  // and saves right away, the same persist-immediately pattern the
  // प्रश्नहरू tab's answer generation above uses.
  const [activitiesGenerating,setActivitiesGenerating]=useState(false);
  const [activitiesError,setActivitiesError]=useState("");
  useEffect(()=>{setActivitiesState(lesson.activities||[]);setActivitiesError("");},[lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // NEW — shared save path for the activities list (AI-appended, edited,
  // or deleted all go through this one place) instead of each caller
  // repeating its own db.updateLesson + state-set + error-handling.
  const persistActivities=async(next)=>{
    setActivitiesState(next);
    const{error}=await db.updateLesson(lesson.id,{activities:next});
    if(error){setActivitiesError("सुरक्षित हुन सकेन: "+(error.message||""));return false;}
    return true;
  };
  const addMoreActivities=async()=>{
    setActivitiesGenerating(true);setActivitiesError("");
    try{
      const ctx=await getMaterialContext(chapterTitle,classLabel,lesson.id);
      const more=await gemini.generateMoreActivities(chapterTitle,ctx,classContext,lesson.title,activitiesState);
      const fresh=(more||[]).filter((a)=>a&&!activitiesState.includes(a));
      if(fresh.length===0){setActivitiesError("AI ले थप नयाँ क्रियाकलाप दिन सकेन — फेरि प्रयास गर्नुहोस्।");return;}
      await persistActivities([...activitiesState,...fresh]);
    }catch(e){setActivitiesError("AI त्रुटि: "+e.message);}
    setActivitiesGenerating(false);
  };
  const [actEditingIdx,setActEditingIdx]=useState(null);
  const [actEditText,setActEditText]=useState("");
  const startEditActivity=(i)=>{setActEditingIdx(i);setActEditText(activitiesState[i]);};
  const saveEditedActivity=(i)=>{
    const text=actEditText.trim();
    if(!text)return;
    persistActivities(activitiesState.map((a,idx)=>idx===i?text:a));
    setActEditingIdx(null);
  };
  const deleteActivity=(i)=>{
    if(!window.confirm("यो क्रियाकलाप हटाउने?"))return;
    persistActivities(activitiesState.filter((_,idx)=>idx!==i));
    setActEditingIdx(null);
  };
  const activities=activitiesState;
  // FIX — was lesson.rubric, a column nothing in the app ever writes to.
  // The real rubric lives in the assessments table, tied to this lesson
  // via lesson_id (see getAssessmentsByLesson in db.js). Falls back to
  // lesson.rubric only for any legacy row that might still have it set,
  // so nothing that did work before stops working.
  const [linkedRubric,setLinkedRubric]=useState(lesson.rubric||[]);
  // NEW — the rubric tab used to only display a rubric created elsewhere
  // (the standalone मूल्याङ्कन screen in थप). That screen duplicated what
  // this tab already had the context for — chapter, lesson, class — so
  // it's gone now and this tab creates the rubric itself instead.
  const [linkedAssessmentId,setLinkedAssessmentId]=useState(null);
  const [rubricForm,setRubricForm]=useState(false);
  const [rubricType,setRubricType]=useState("checklist");
  const [rubricText,setRubricText]=useState("");
  const [rubricDueDate,setRubricDueDate]=useState("");
  const [rubricGenerating,setRubricGenerating]=useState(false);
  const [rubricSaving,setRubricSaving]=useState(false);
  const [rubricError,setRubricError]=useState("");
  const [rubricMatchedCount,setRubricMatchedCount]=useState(0);
  useEffect(()=>{
    let cancelled=false;
    db.getAssessmentsByLesson(lesson.id).then(({data})=>{
      if(cancelled)return;
      const latest=(data||[]).find((a)=>a.rubric?.length>0);
      setLinkedRubric(latest?.rubric||lesson.rubric||[]);
      setLinkedAssessmentId(latest?.id||null);
    });
    return()=>{cancelled=true;};
  },[lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rubric=linkedRubric;
  const chapterTitle=lesson.chapters?.title||lesson.chapter_title||"";
  // FIX — this used to only update inside generateRubric(), so it stayed
  // at its default of 0 (showing "कुनै सामग्री ट्याग गरिएको छैन") until the
  // teacher clicked "AI बाट rubric" in THIS session — even when materials
  // genuinely were tagged for the chapter (e.g. a rubric generated in an
  // earlier session, now just being viewed/edited). Checking eagerly here,
  // the same way the AI-chat tab already does, keeps the count accurate
  // as soon as the tab opens, not just after a fresh generate.
  //
  // NOTE — this must come after chapterTitle is declared above (a plain
  // const, so referencing it any earlier in this component throws
  // "Cannot access 'chapterTitle' before initialization" and crashes the
  // whole screen — that's what the previous version of this fix did).
  useEffect(()=>{
    let cancelled=false;
    if(chapterTitle){
      db.getChapterIdByTitle(chapterTitle,classLabel).then((id)=>{
        if(cancelled)return;
        if(!id)return setRubricMatchedCount(0);
        db.getMaterialsByChapter(id).then(({data})=>{if(!cancelled)setRubricMatchedCount((data||[]).length);});
      });
    }
    return ()=>{cancelled=true;};
  },[chapterTitle,classLabel]);
  // NEW — मूल्याङ्कनका आधारहरू: replaced the earlier 6-way rubric-type
  // split (अवलोकन/मौखिक/व्यावहारिक/प्रोजेक्ट/क्रियाकलाप/पोर्टफोलियो) with
  // the full 10-factor set the actual rubric rules call for.
  const RUBRIC_TYPES=[
    {id:"checklist",label:"रुजु सूची"},
    {id:"performance",label:"कार्यसम्पादन तथा प्रदर्शन"},
    {id:"discussion",label:"कुराकानी तथा छलफल"},
    {id:"self",label:"विद्यार्थी स्व मूल्याङ्कन"},
    {id:"project",label:"परियोजना तथा प्रयोगात्मक कार्य मूल्याङ्कन"},
    {id:"rating",label:"श्रेणी मापन"},
    {id:"parent",label:"अभिभावकको प्रतिक्रिया"},
    {id:"oral",label:"मौखिक कार्य मूल्याङ्कन"},
    {id:"peer",label:"सहपाठी मूल्याङ्कन"},
    {id:"participation",label:"कक्षाकोठा सहभागिता मूल्याङ्कन"},
  ];
  // NEW — मूल्याङ्कन तह चार वटा (उत्कृष्ट/राम्रो/सामान्य/सुधार आवश्यक) मा
  // तय भयो — AI प्रोम्प्ट, प्लेसहोल्डर, र प्रदर्शन रङ सबैतिर एउटै सूची
  // प्रयोग हुन्छ ताकि जहाँ पनि तह मिल्दो देखियोस्।
  const RUBRIC_LEVELS=["उत्कृष्ट","राम्रो","सामान्य","सुधार आवश्यक"];
  const RUBRIC_LEVEL_COLOR={"उत्कृष्ट":ACCENT,"राम्रो":TEAL,"सामान्य":MARIGOLD_DARK,"सुधार आवश्यक":ROSE};
  const generateRubric=async()=>{
    setRubricGenerating(true);setRubricError("");
    try{
      const ctx=await getMaterialContext(chapterTitle,classLabel);
      setRubricMatchedCount(ctx.matchedCount||0);
      const rubricTypeLabel=RUBRIC_TYPES.find((t)=>t.id===rubricType)?.label||rubricType;
      const prompt=`नेपाल ${classContext} "${chapterTitle}" पाठ "${lesson.title}" का लागि "${rubricTypeLabel}" अन्तर्गतको मूल्याङ्कन मापदण्ड भएको JSON array मात्र, ठ्याक्कै यी ${RUBRIC_LEVELS.length} तह (क्रमैसँग) प्रयोग गरेर: ${JSON.stringify(RUBRIC_LEVELS.map((level)=>({level,desc:"..."})))}`;
      const gen=await gemini.generateRubric(prompt,ctx);
      if(gen)setRubricText(gen.map((r)=>`${r.level}: ${r.desc}`).join("\n"));
      else setRubricError("मूल्याङ्कन बनाउन सकिएन।");
    }catch(e){setRubricError("AI त्रुटि: "+e.message);}
    setRubricGenerating(false);
  };
  const saveRubric=async()=>{
    setRubricSaving(true);setRubricError("");
    const parsed=rubricText?rubricText.split("\n").filter(Boolean).map((line)=>{const[level,...rest]=line.split(":");return{level:level.trim(),desc:rest.join(":").trim()};}):[];
    if(parsed.length===0){setRubricError("मूल्याङ्कन मापदण्ड लेख्नुहोस्।");setRubricSaving(false);return;}
    const{data,error}=await db.upsertAssessment({id:linkedAssessmentId||undefined,title:`${lesson.title} — मूल्याङ्कन`,type:rubricType,rubric:parsed,due_date:rubricDueDate||null,status:"pending",chapter_id:lesson.chapter_id||null,lesson_id:lesson.id});
    setRubricSaving(false);
    if(error){setRubricError("सुरक्षित हुन सकेन: "+(error.message||""));return;}
    setLinkedRubric(parsed);setLinkedAssessmentId(data?.id||linkedAssessmentId);setRubricForm(false);
  };
  const startRubricEdit=()=>{
    setRubricText(rubric.map((r)=>`${r.level}: ${r.desc}`).join("\n"));
    setRubricForm(true);
  };
  // NEW — until now a rubric could only ever be overwritten (सम्पादन), never
  // actually removed. Deletes the underlying assessments row (see
  // deleteAssessment in db.js) when one exists, and always clears the
  // tab's own state either way.
  const deleteRubric=async()=>{
    if(!window.confirm("मूल्याङ्कन मापदण्ड मेटाउने?"))return;
    if(linkedAssessmentId){
      const{error}=await db.deleteAssessment(linkedAssessmentId);
      if(error){setRubricError("हटाउन सकिएन: "+(error.message||""));return;}
    }
    setLinkedRubric([]);setLinkedAssessmentId(null);setRubricForm(false);
  };

  // NEW — गृहकार्य was a single plain-text field on the lesson with no way
  // to change or clear it from LessonMode itself (only from the separate
  // Planner edit form). Stateful + persisted the same way sequence/
  // activities are above.
  const [homeworkState,setHomeworkState]=useState(lesson.homework||"");
  const [hwEditing,setHwEditing]=useState(false);
  const [hwEditText,setHwEditText]=useState("");
  const [hwSaving,setHwSaving]=useState(false);
  useEffect(()=>{setHomeworkState(lesson.homework||"");setHwEditing(false);},[lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const startEditHomework=()=>{setHwEditText(homeworkState);setHwEditing(true);};
  const saveHomework=async()=>{
    setHwSaving(true);
    const text=hwEditText.trim();
    const{error}=await db.updateLesson(lesson.id,{homework:text});
    setHwSaving(false);
    if(error){alert("सुरक्षित हुन सकेन: "+(error.message||""));return;}
    setHomeworkState(text);setHwEditing(false);
  };
  const deleteHomework=async()=>{
    if(!window.confirm("गृहकार्य हटाउने?"))return;
    const{error}=await db.updateLesson(lesson.id,{homework:""});
    if(error){alert("हटाउन सकिएन: "+(error.message||""));return;}
    setHomeworkState("");setHwEditing(false);
  };

  // NEW — "प्रिन्ट" from the Planner list opens this lesson and prints it
  // immediately, in one click, with no extra tap needed once it's open.
  useEffect(()=>{
    if(!autoPrint)return;
    const t=setTimeout(()=>window.print(),300);
    return()=>clearTimeout(t);
  },[autoPrint]);

  return(
    <div className="print-area" style={{position:"fixed",inset:0,background:PAPER,zIndex:50,display:"flex",flexDirection:"column"}}>
      <style>{`
        /* NEW — Phase 2: "आजको पाठ सुरु" used to be a single centered
           720px column no matter the screen size — on a laptop/desktop
           that meant huge empty margins left and right, with the tab bar
           squeezed along the top exactly like on a phone. This gives
           desktop its own real layout (tabs as a left rail, content using
           the freed-up width) while keeping mobile tight and thumb-friendly. */
        .lesson-shell{display:flex;flex-direction:column;flex:1;min-height:0;}
        .lesson-tabs{display:flex;overflow-x:auto;background:${SURFACE};border-bottom:1px solid ${BORDER};}
        .lesson-tab-btn{display:flex;align-items:center;gap:5px;padding:11px 12px;border:none;background:none;border-bottom:3px solid transparent;font-weight:600;font-size:16px;cursor:pointer;white-space:nowrap;}
        .lesson-content{flex:1;overflow-y:auto;padding:14px 16px;width:100%;}
        .lesson-obj-mobile{display:block;}
        .lesson-obj-trigger{display:none;}
        @media(min-width:860px){
          .lesson-shell{flex-direction:row;overflow:hidden;}
          .lesson-rail{width:250px;flex-shrink:0;display:flex;flex-direction:column;overflow-y:auto;border-right:1px solid ${BORDER};background:${SURFACE};}
          .lesson-tabs{flex-direction:column;overflow-x:visible;border-bottom:none;padding:10px;gap:2px;}
          .lesson-tab-btn{border-bottom:none;border-left:3px solid transparent;border-radius:10px;padding:11px 13px;justify-content:flex-start;}
          .lesson-tab-btn.active{background:${ACCENT_LIGHT};border-left-color:${MARIGOLD};}
          /* FIX — this used to be max-width:900px with no centering, so on
             a wide monitor the content pane sat pinned against the rail
             and everything past 900px was just dead empty screen. Centered
             now, so any leftover space is balanced on both sides instead
             of wasted on one, and objectives move out of the rail into a
             popup (below) so the rail stays a slim, uncluttered tab list. */
          .lesson-content{max-width:1040px;margin:0 auto;padding:30px 40px;}
          .lesson-obj-mobile{display:none;}
          .lesson-obj-trigger{display:flex;}
        }
      `}</style>
      <div className="no-print" style={{background:`linear-gradient(120deg, ${MARIGOLD} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",padding:"12px 16px",display:"flex",alignItems:"center",gap:10,flexShrink:0}}>
        <IconButton icon={ArrowLeft} onClick={onClose} variant="hero" size={20}/>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13.5,opacity:0.75}}>{chapterTitle}</div>
          <div style={{fontSize:18,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{lesson.title}</div>
        </div>
        {onEdit&&<IconButton icon={PenSquare} onClick={()=>onEdit(lesson)} title="सम्पादन गर्नुहोस्" variant="hero" size={19}/>}
        <IconButton icon={Printer} onClick={()=>window.print()} title="पूरा पाठ योजना प्रिन्ट गर्नुहोस्" variant="hero" size={19}/>
      </div>

      <div className="no-print lesson-shell">
        <div className="lesson-rail">
          {(objectives.length>0||vocabulary.length>0)&&(<>
            <div className="lesson-obj-mobile" style={{padding:"10px 16px 12px",borderBottom:`1px solid ${BORDER}`}}>
              {/* NEW — collapsible: a teacher who already knows today's
                  objective by heart (most days, after the first glance)
                  can close this and get straight to the tab content
                  instead of scrolling past it every time. */}
              <button className="ss-btn" onClick={()=>setObjOpen((v)=>!v)} style={{display:"flex",alignItems:"center",gap:5,width:"100%",background:"none",border:"none",cursor:"pointer",padding:0,marginBottom:objOpen?5:0,color:INK_SOFT,fontSize:14.5,fontWeight:600}}>
                <ArrowDown size={14} style={{transform:objOpen?"rotate(0deg)":"rotate(-90deg)",transition:"transform .15s ease",flexShrink:0}}/>
                आजको उद्देश्य
              </button>
              {objOpen&&(<>
                <ul style={{margin:0,paddingLeft:16,fontSize:16,color:INK,lineHeight:1.55}}>{objectives.map((o,i)=><li key={i}>{o}</li>)}</ul>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:8}}>
                  {vocabulary.map((v)=>{
                    const idx=v.indexOf(":");
                    const word=idx>-1?v.slice(0,idx).trim():v.trim();
                    const meaning=idx>-1?v.slice(idx+1).trim():"";
                    return(
                      <button className="ss-btn" key={v} onClick={()=>meaning&&setVocabPopup({word,meaning})} style={{background:WARN_BG,color:MARIGOLD_DARK,fontSize:15,fontWeight:600,padding:"3px 8px",borderRadius:6,border:"none",display:"flex",alignItems:"center",gap:3,cursor:meaning?"pointer":"default"}}>
                        {word}{meaning&&<HelpCircle size={11}/>}
                      </button>
                    );
                  })}
                </div>
              </>)}
            </div>
            {/* NEW — desktop: instead of objectives permanently taking up
                rail space, a slim trigger opens them in a popup. Sits
                above the tab list now (see it first, then teach) rather
                than below, where it read like an afterthought. */}
            <button className="lesson-obj-trigger ss-btn" onClick={()=>setObjPopup(true)} style={{alignItems:"center",gap:8,margin:"10px 10px 4px",padding:"11px 13px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE_2,cursor:"pointer",color:INK,fontWeight:700,fontSize:15}}>
              <ClipboardList size={15} color={ACCENT}/>आजको उद्देश्य हेर्नुहोस्
            </button>
          </>)}
          <div className="lesson-tabs">
            {tabs.map((t)=>{const Icon=t.icon;const active=tab===t.id;return<button key={t.id} onClick={()=>setTab(t.id)} className={`lesson-tab-btn${active?" active":""}`} style={{color:active?ACCENT:INK_SOFT,borderBottomColor:active?ACCENT:"transparent"}}><Icon size={15}/>{t.label}</button>;})}
          </div>
        </div>
        <div className="lesson-content">
        {tab==="sequence"&&(<div><SectionLabel icon={ClipboardList}>पढाउने क्रम</SectionLabel>{sequence.length===0?<div style={{color:INK_SOFT}}>पढाउने क्रम थपिएको छैन।</div>:(<ol style={{margin:0,paddingLeft:0,listStyle:"none",display:"flex",flexDirection:"column",gap:14}}>{sequence.map((s,i)=>{
          const isEditing=seqEditingIdx===i;
          return(<li key={i} style={{display:"flex",gap:14,padding:"15px 16px",background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(160deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:SHADOW.accent}}>{i+1}</div>
            <div style={{flex:1,minWidth:0}}>
              {isEditing?(
                <div>
                  <textarea autoFocus value={seqEditText} onChange={(e)=>setSeqEditText(e.target.value)} rows={2} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 11px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,resize:"vertical",marginBottom:8}}/>
                  <div style={{display:"flex",gap:7}}>
                    <button className="ss-btn" onClick={()=>setSeqEditingIdx(null)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,fontSize:14,cursor:"pointer"}}>रद्द</button>
                    <button className="ss-btn" onClick={()=>saveEditedSequence(i)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>सुरक्षित गर्नुहोस्</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                  <div style={{fontSize:20,color:INK,lineHeight:1.55,paddingTop:3}}>{s}</div>
                  <div style={{display:"flex",gap:10,flexShrink:0,paddingTop:5}}>
                    <button className="ss-icon-btn" onClick={()=>startEditSequence(i)} title="सम्पादन" style={{cursor:"pointer",padding:6,color:ACCENT,display:"flex"}}><PenSquare size={15}/></button>
                    <button className="ss-icon-btn" onClick={()=>deleteSequenceStep(i)} title="हटाउनुहोस्" style={{cursor:"pointer",padding:6,color:DANGER,display:"flex"}}><Trash2 size={15}/></button>
                  </div>
                </div>
              )}
            </div>
          </li>);})}</ol>)}{lesson.notes&&<div style={{marginTop:14,background:WARN_BG,borderRadius:10,padding:12}}><div style={{fontSize:15,fontWeight:700,color:WARN,marginBottom:3}}>नोट</div><div style={{fontSize:16.5,color:INK}}>{lesson.notes}</div></div>}</div>)}
        {tab==="questions"&&<div><SectionLabel icon={MessageSquare} color={VIOLET}>कक्षामा सोध्नुहोस्</SectionLabel><div style={{display:"flex",flexDirection:"column",gap:14}}>{qState.length===0?<div style={{color:INK_SOFT}}>प्रश्नहरू थपिएका छैनन्।</div>:qState.map((item,i)=>{
          const isOpen=qOpen.has(i);const isLoading=qLoading.has(i);const isEditingAnswer=qEditingIdx===i;const isEditingQuestion=qTextEditingIdx===i;const color=PALETTE[i%PALETTE.length];
          return(
            <Card key={i} accentColor={color} onClick={isEditingQuestion?undefined:()=>toggleQuestion(i)} style={{cursor:isEditingQuestion?"default":"pointer",padding:"16px 18px"}}>
              <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
                <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 70%, black) 100%)`,color:"#fff",fontWeight:700,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                {isEditingQuestion?(
                  <div onClick={(e)=>e.stopPropagation()}>
                    <textarea autoFocus value={qTextEditText} onChange={(e)=>setQTextEditText(e.target.value)} rows={2} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 11px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,resize:"vertical",marginBottom:8}}/>
                    <div style={{display:"flex",gap:7}}>
                      <button className="ss-btn" onClick={()=>setQTextEditingIdx(null)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,fontSize:14,cursor:"pointer"}}>रद्द</button>
                      <button className="ss-btn" onClick={(e)=>saveEditedQuestion(i,e)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>सुरक्षित गर्नुहोस्</button>
                    </div>
                  </div>
                ):(
                  <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                    <div style={{fontSize:20,color:INK,fontWeight:isOpen?700:600,lineHeight:1.5}}>{item.q}</div>
                    <div style={{display:"flex",alignItems:"center",gap:10,flexShrink:0,marginTop:3}}>
                      <button className="ss-icon-btn" onClick={(e)=>startEditQuestion(i,e)} title="सम्पादन" style={{cursor:"pointer",padding:6,color:ACCENT,display:"flex"}}><PenSquare size={15}/></button>
                      <button className="ss-icon-btn" onClick={(e)=>deleteQuestion(i,e)} title="हटाउनुहोस्" style={{cursor:"pointer",padding:6,color:DANGER,display:"flex"}}><Trash2 size={15}/></button>
                      <span className="ss-icon-btn" style={{padding:6,color:INK_SOFT,display:"flex"}}><ArrowDown size={17} style={{flexShrink:0,transform:isOpen?"rotate(180deg)":"none",transition:"transform .15s ease"}}/></span>
                    </div>
                  </div>
                )}
                </div>
              </div>
              {isOpen&&(
                <div style={{marginTop:12,paddingTop:12,paddingLeft:46,borderTop:`1px solid ${BORDER}`,fontSize:18,color:INK_SOFT,lineHeight:1.55}}>
                  {isLoading?(
                    <span style={{display:"flex",alignItems:"center",gap:7}}><Loader size={14} style={{animation:"spin 1s linear infinite"}}/>उत्तर तयार गर्दै...</span>
                  ):qErrors[i]?(
                    <span style={{color:DANGER}}>{qErrors[i]} <button className="ss-btn" onClick={(e)=>{e.stopPropagation();fetchAnswer(i,true);}} style={{color:ACCENT,fontWeight:700,background:"none",border:"none",cursor:"pointer",padding:0}}>फेरि प्रयास गर्नुहोस्</button></span>
                  ):isEditingAnswer?(
                    <div onClick={(e)=>e.stopPropagation()}>
                      <textarea autoFocus value={qEditText} onChange={(e)=>setQEditText(e.target.value)} rows={3} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 11px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,resize:"vertical",marginBottom:8}}/>
                      <div style={{display:"flex",gap:7}}>
                        <button className="ss-btn" onClick={()=>setQEditingIdx(null)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,fontSize:14,cursor:"pointer"}}>रद्द</button>
                        <button className="ss-btn" onClick={(e)=>saveEditedAnswer(i,e)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>सुरक्षित गर्नुहोस्</button>
                      </div>
                    </div>
                  ):item.a?(
                    <div>
                      <div style={{marginBottom:8}}>{item.a}</div>
                      <div style={{display:"flex",gap:12}}>
                        <button className="ss-btn" onClick={(e)=>startEditAnswer(i,e)} style={{display:"flex",alignItems:"center",gap:4,color:ACCENT,fontWeight:700,fontSize:14,background:"none",border:"none",cursor:"pointer",padding:0}}><PenSquare size={13}/>सम्पादन</button>
                        <button className="ss-btn" onClick={(e)=>deleteAnswer(i,e)} style={{display:"flex",alignItems:"center",gap:4,color:DANGER,fontWeight:700,fontSize:14,background:"none",border:"none",cursor:"pointer",padding:0}}><Trash2 size={13}/>हटाउनुहोस्</button>
                      </div>
                    </div>
                  ):(
                    <button className="ss-btn" onClick={(e)=>{e.stopPropagation();fetchAnswer(i,true);}} style={{display:"flex",alignItems:"center",gap:5,color:ACCENT,fontWeight:700,fontSize:14.5,background:"none",border:"none",cursor:"pointer",padding:0}}><Sparkles size={13}/>उत्तर तयार गर्नुहोस्</button>
                  )}
                </div>
              )}
            </Card>
          );
        })}</div></div>}
        {tab==="activities"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
            <SectionLabel icon={Users} color={TEAL}>क्रियाकलापहरू</SectionLabel>
            {/* NEW — the plan's own activities list only ever starts with
                2 (see gemini.js generateMoreActivities); this lets a
                teacher ask for a few more without regenerating the whole
                lesson plan. */}
            <AIButton label={activitiesGenerating?"बनाउँदै...":"AI बाट थप्नुहोस्"} onClick={addMoreActivities} loading={activitiesGenerating}/>
          </div>
          {activitiesError&&<ErrorMsg msg={activitiesError}/>}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>{activities.length===0?<div style={{color:INK_SOFT}}>क्रियाकलापहरू थपिएका छैनन्।</div>:activities.map((a,i)=>{const color=PALETTE[i%PALETTE.length];const isEditing=actEditingIdx===i;return(
          <Card key={i} accentColor={color} style={{padding:"16px 18px"}}>
            <div style={{display:"flex",alignItems:"flex-start",gap:14}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 70%, black) 100%)`,color:"#fff",fontWeight:700,fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{i+1}</div>
              <div style={{flex:1,minWidth:0}}>
              {isEditing?(
                <div>
                  <textarea autoFocus value={actEditText} onChange={(e)=>setActEditText(e.target.value)} rows={2} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 11px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,resize:"vertical",marginBottom:8}}/>
                  <div style={{display:"flex",gap:7}}>
                    <button className="ss-btn" onClick={()=>setActEditingIdx(null)} style={{padding:"6px 12px",borderRadius:8,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,fontSize:14,cursor:"pointer"}}>रद्द</button>
                    <button className="ss-btn" onClick={()=>saveEditedActivity(i)} style={{padding:"6px 12px",borderRadius:8,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:14,cursor:"pointer"}}>सुरक्षित गर्नुहोस्</button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:8}}>
                  <div style={{fontSize:20,color:INK,lineHeight:1.55,paddingTop:3}}>{a}</div>
                  <div style={{display:"flex",gap:10,flexShrink:0,paddingTop:5}}>
                    <button className="ss-icon-btn" onClick={()=>startEditActivity(i)} title="सम्पादन" style={{cursor:"pointer",padding:6,color:ACCENT,display:"flex"}}><PenSquare size={15}/></button>
                    <button className="ss-icon-btn" onClick={()=>deleteActivity(i)} title="हटाउनुहोस्" style={{cursor:"pointer",padding:6,color:DANGER,display:"flex"}}><Trash2 size={15}/></button>
                  </div>
                </div>
              )}
              </div>
            </div>
          </Card>
        );})}</div></div>}
        {tab==="simulation"&&<SimulationPanel lesson={lesson} chapterTitle={chapterTitle} classLabel={classLabel} classContext={classContext}/>}
        {tab==="homework"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
            <SectionLabel icon={PenSquare} color={MARIGOLD_DARK}>दिने गृहकार्य</SectionLabel>
            {!hwEditing&&<div style={{display:"flex",gap:14,flexShrink:0}}>
              <button className="ss-btn" onClick={startEditHomework} title="सम्पादन" style={{background:"none",border:"none",cursor:"pointer",padding:0,color:ACCENT,display:"flex",alignItems:"center",gap:4,fontWeight:700,fontSize:14.5}}><PenSquare size={14}/>सम्पादन</button>
              {homeworkState&&<button className="ss-btn" onClick={deleteHomework} title="हटाउनुहोस्" style={{background:"none",border:"none",cursor:"pointer",padding:0,color:DANGER,display:"flex",alignItems:"center",gap:4,fontWeight:700,fontSize:14.5}}><Trash2 size={14}/>हटाउनुहोस्</button>}
            </div>}
          </div>
          {hwEditing?(
            <Card>
              <textarea autoFocus value={hwEditText} onChange={(e)=>setHwEditText(e.target.value)} rows={4} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 11px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,resize:"vertical",marginBottom:10}}/>
              <div style={{display:"flex",gap:8}}>
                <button className="ss-btn" onClick={()=>setHwEditing(false)} style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
                <button className="ss-btn" onClick={saveHomework} disabled={hwSaving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer"}}>{hwSaving?"...":"सुरक्षित"}</button>
              </div>
            </Card>
          ):<Card><div style={{fontSize:17,color:INK,lineHeight:1.6}}>{homeworkState||"गृहकार्य थपिएको छैन।"}</div></Card>}
        </div>}
        {tab==="rubric"&&<div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginBottom:10}}>
            <SectionLabel icon={Layers} color={ROSE}>मूल्याङ्कन मापदण्ड</SectionLabel>
            {!rubricForm&&<div style={{display:"flex",gap:8,flexShrink:0}}>
              <button className="ss-btn" onClick={rubric.length===0?()=>setRubricForm(true):startRubricEdit} style={{display:"flex",alignItems:"center",gap:5,background:SURFACE_2,border:`1px solid ${BORDER}`,borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:14.5,color:INK,cursor:"pointer"}}>{rubric.length===0?<><Plus size={14}/>बनाउनुहोस्</>:<><PenSquare size={13}/>सम्पादन</>}</button>
              {rubric.length>0&&<button className="ss-btn" onClick={deleteRubric} style={{display:"flex",alignItems:"center",gap:5,background:SURFACE_2,border:`1px solid ${BORDER}`,borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:14.5,color:DANGER,cursor:"pointer"}}><Trash2 size={13}/>हटाउनुहोस्</button>}
            </div>}
          </div>
          {rubricForm?(
            <Card style={{marginBottom:14}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                <div style={{fontWeight:700,fontSize:16.5}}>{lesson.title} — मूल्याङ्कन</div>
                <AIButton label={rubricGenerating?"बनाउँदै...":"AI बाट rubric"} onClick={generateRubric} loading={rubricGenerating}/>
              </div>
              {rubricError&&<ErrorMsg msg={rubricError}/>}
              <MaterialsHint count={rubricMatchedCount} chapterTitle={chapterTitle}/>
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
                  {RUBRIC_TYPES.map((t,i)=>{const c=PALETTE[i%PALETTE.length];const active=rubricType===t.id;return(
                    <button key={t.id} onClick={()=>setRubricType(t.id)} style={{padding:"9px 8px",borderRadius:10,border:`1.5px solid ${active?c:`color-mix(in srgb, ${c} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${c} 14%, ${SURFACE})`:SURFACE,color:active?c:INK,fontWeight:600,fontSize:13.5,lineHeight:1.3,cursor:"pointer"}}>{t.label}</button>
                  );})}
                </div>
                <textarea placeholder={`मापदण्ड:\n${RUBRIC_LEVELS.map((l)=>`${l}: ...`).join("\n")}`} value={rubricText} onChange={(e)=>setRubricText(e.target.value)} rows={5} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
                <input type="date" value={rubricDueDate} onChange={(e)=>setRubricDueDate(e.target.value)} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
                <div style={{display:"flex",gap:8}}>
                  <button onClick={()=>setRubricForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
                  <button className="ss-btn" onClick={saveRubric} disabled={rubricSaving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{rubricSaving?"...":"सुरक्षित"}</button>
                </div>
              </div>
            </Card>
          ):rubric.length===0?<div style={{color:INK_SOFT}}>मूल्याङ्कन मापदण्ड थपिएको छैन।</div>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{rubric.map((r,i)=>{const c=RUBRIC_LEVEL_COLOR[r.level]||MARIGOLD_DARK;return<Card key={i} accentColor={c}><div style={{fontWeight:700,color:c,fontSize:16.5,marginBottom:3}}>{r.level}</div><div style={{fontSize:16.5,color:INK}}>{r.desc}</div></Card>;})}</div>}
        </div>}
        </div>
      </div>


      {objPopup&&(
        <div className="no-print" onClick={()=>setObjPopup(false)} style={{position:"fixed",inset:0,zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.5)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:20}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:20,padding:"28px 30px",maxWidth:"min(92vw, 640px)",width:"100%",maxHeight:"86vh",overflowY:"auto",boxSizing:"border-box",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <div style={{fontSize:"clamp(20px, 2.4vw, 24px)",fontWeight:800,color:INK}}>आजको उद्देश्य</div>
              <IconButton icon={X} onClick={()=>setObjPopup(false)}/>
            </div>
            <ul style={{margin:0,paddingLeft:20,fontSize:"clamp(16.5px, 1.9vw, 19px)",color:INK,lineHeight:1.7}}>{objectives.map((o,i)=><li key={i}>{o}</li>)}</ul>
            {vocabulary.length>0&&(
              <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:12}}>
                {vocabulary.map((v)=>{
                  const idx=v.indexOf(":");
                  const word=idx>-1?v.slice(0,idx).trim():v.trim();
                  const meaning=idx>-1?v.slice(idx+1).trim():"";
                  return(
                    <button className="ss-btn" key={v} onClick={()=>meaning&&setVocabPopup({word,meaning})} style={{background:WARN_BG,color:MARIGOLD_DARK,fontSize:15,fontWeight:600,padding:"4px 9px",borderRadius:7,border:"none",display:"flex",alignItems:"center",gap:3,cursor:meaning?"pointer":"default"}}>
                      {word}{meaning&&<HelpCircle size={11}/>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {vocabPopup&&(
        <div className="no-print" onClick={()=>setVocabPopup(null)} style={{position:"fixed",inset:0,zIndex:80,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.5)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:20}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:20,padding:"30px 32px",maxWidth:"min(92vw, 760px)",width:"100%",maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`}}>
            <div style={{fontSize:"clamp(22px, 2.6vw, 27px)",fontWeight:800,color:MARIGOLD_DARK,marginBottom:12}}>{vocabPopup.word}</div>
            <div style={{fontSize:"clamp(17px, 2vw, 20px)",color:INK,lineHeight:1.7}}>{vocabPopup.meaning}</div>
            {vocabImageLoading&&(
              <div style={{marginTop:16,height:320,borderRadius:12,background:SURFACE_2,display:"flex",alignItems:"center",justifyContent:"center",color:INK_SOFT,fontSize:14}}><Spinner small/></div>
            )}
            {/* NEW — shown only when automatic lookup found nothing. Common
                for Devanagari-spelled loanwords/acronyms (e.g. "सिसिटिभी"
                for CCTV) where no Wikipedia title textually resembles the
                word itself. Lets the teacher type the real term instead —
                still goes through the same exact/near-match + no-
                disambiguation safety checks as the automatic lookup, and
                still requires the reveal + save taps below before anything
                is shown or kept. */}
            {!vocabImageLoading&&!vocabImage&&!vocabManualPanelOpen&&(
              // NEW — collapsed state: no automatic match, but instead of
              // showing the search box + explanation right away, just a
              // small unobtrusive button. Expands to the full panel below
              // only if the teacher actually taps it.
              <button className="ss-btn" onClick={()=>setVocabManualPanelOpen(true)} style={{marginTop:16,width:"100%",padding:"10px",borderRadius:10,border:`1.5px dashed ${BORDER}`,background:SURFACE_2,color:INK_SOFT,fontWeight:600,fontSize:13.5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <ImageIcon size={14}/> {vocabChangeRequested?"फरक तस्बिर खोज्नुहोस्":"तस्बिर खोज्नुहोस् वा थप्नुहोस्"}
              </button>
            )}
            {!vocabImageLoading&&!vocabImage&&vocabManualPanelOpen&&(
              <div style={{marginTop:16,padding:12,borderRadius:12,border:`1.5px dashed ${BORDER}`,background:SURFACE_2}}>
                {vocabChangeRequested?(
                  <div style={{fontSize:13,color:INK_SOFT,marginBottom:8}}>Wikipedia मा हरेक शब्दको एउटै मात्र तस्बिर हुन्छ — उही शब्द फेरि खोज्दा उही तस्बिर नै आउँछ। फरक तस्बिर चाहिएमा फरक नाम/वाक्यांश (जस्तै अङ्ग्रेजी नाम वा पूरा नाम) प्रयोग गरेर खोज्नुहोस्:</div>
                ):(
                  <div style={{fontSize:13,color:INK_SOFT,marginBottom:8}}>यो शब्दको लागि तस्बिर स्वतः फेला परेन। अर्को नामले खोज्नुहोस् (जस्तै अङ्ग्रेजी नाम वा पूरा नाम):</div>
                )}
                <div style={{display:"flex",gap:8}}>
                  <input
                    value={vocabManualQuery}
                    onChange={(e)=>setVocabManualQuery(e.target.value)}
                    onKeyDown={(e)=>{if(e.key==="Enter")e.currentTarget.blur();}}
                    placeholder="जस्तै: CCTV वा Closed-circuit television"
                    style={{flex:1,padding:"9px 12px",borderRadius:9,border:`1px solid ${BORDER}`,background:SURFACE,color:INK,fontSize:14}}
                  />
                  <button className="ss-btn" disabled={vocabManualSearching||!vocabManualQuery.trim()} onClick={async()=>{
                    setVocabManualSearching(true);
                    const result=await previewWordImage(vocabManualQuery.trim());
                    setVocabImage(result);
                    setVocabImageRevealed(false);
                    setVocabManualSearching(false);
                  }} style={{padding:"9px 14px",borderRadius:9,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:13.5,cursor:vocabManualSearching?"default":"pointer",opacity:vocabManualSearching||!vocabManualQuery.trim()?0.6:1,whiteSpace:"nowrap"}}>
                    {vocabManualSearching?"खोज्दै...":"खोज्नुहोस्"}
                  </button>
                </div>
                {/* NEW — no automatic source (Wikipedia or Wikidata) has a
                    match: offer uploading a photo directly as the other
                    option, since it carries zero lookup risk. */}
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}>
                  <div style={{flex:1,height:1,background:BORDER}}/>
                  <span style={{fontSize:11.5,color:INK_SOFT}}>वा</span>
                  <div style={{flex:1,height:1,background:BORDER}}/>
                </div>
                <button className="ss-btn" onClick={()=>vocabFileInputRef.current?.click()} style={{marginTop:10,width:"100%",padding:"9px",borderRadius:9,border:`1.5px dashed ${BORDER}`,background:SURFACE,color:INK,fontWeight:600,fontSize:13.5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <Upload size={14}/> आफ्नै तस्बिर अपलोड गर्नुहोस्
                </button>
              </div>
            )}
            {!vocabImageLoading&&vocabImage&&!vocabImageRevealed&&(
              <button className="ss-btn" onClick={()=>setVocabImageRevealed(true)} style={{marginTop:16,width:"100%",padding:"12px",borderRadius:12,border:`1.5px dashed ${BORDER}`,background:SURFACE_2,color:INK,fontWeight:600,fontSize:14.5,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <ImageIcon size={16}/> तस्बिर हेर्नुहोस् (हेर्नुअघि जाँच्नुहोस्)
              </button>
            )}
            {!vocabImageLoading&&vocabImage&&vocabImageRevealed&&(
              <div style={{marginTop:16,position:"relative"}}>
                {/* NEW — sized for projector visibility: this popup is
                    read off a classroom projector, not a phone screen, so
                    the picture needs to hold up from the back of the
                    room. Scales with the viewport (min(62vh, 560px)) so it
                    stays large on a projected display while still fitting
                    a shorter laptop screen without overflowing. */}
                <img src={vocabImage.url} alt={vocabPopup.word} style={{width:"100%",maxHeight:"min(62vh, 560px)",objectFit:"cover",borderRadius:12,border:`1px solid ${BORDER}`,display:"block"}} onError={()=>setVocabImage(null)}/>
                <div style={{position:"absolute",top:8,right:8,display:"flex",gap:6}}>
                  {/* NEW — teacher asked to save the picture to their own
                      phone/PC (to reuse in a printed worksheet, share, etc.),
                      not just keep it cached inside the app. The image is
                      already a data URL, so a plain download link is enough
                      — no server round-trip needed. */}
                  <a
                    href={vocabImage.url}
                    download={`${(vocabPopup.word||"tasbir").replace(/[\\/:*?"<>|]/g,"").trim()||"tasbir"}.jpg`}
                    title="यो तस्बिर फोन/पीसीमा सुरक्षित गर्नुहोस्"
                    style={{background:"rgba(20,18,14,0.65)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",border:"none",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff",textDecoration:"none"}}
                  ><Download size={15}/></a>
                  {/* NEW — "change this picture" is now separate from
                      "reject it" (trash). Trash permanently marks the
                      word as having no good picture (won't auto-fetch
                      again). This just clears the current preview and
                      opens the manual search box, for when the picture
                      is fine but the teacher wants to try a different
                      one — without blacklisting the current match. */}
                  <button className="ss-btn" onClick={()=>{setVocabImage(null);setVocabImageRevealed(false);setVocabSaveError("");setVocabChangeRequested(true);setVocabManualPanelOpen(true);}} title="फरक तस्बिर खोज्नुहोस्" style={{background:"rgba(20,18,14,0.65)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",border:"none",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff"}}><RefreshCw size={14}/></button>
                  {/* NEW — teacher can swap the automatic match for their
                      own uploaded photo at any time, not just when
                      automatic lookup finds nothing. */}
                  <button className="ss-btn" onClick={()=>vocabFileInputRef.current?.click()} title="आफ्नै तस्बिर अपलोड गर्नुहोस्" style={{background:"rgba(20,18,14,0.65)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",border:"none",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff"}}><Upload size={14}/></button>
                  <button className="ss-btn" onClick={async()=>{await rejectVocabImage(vocabPopup.word);setVocabImage(null);setVocabSaveError("");}} title="यो तस्बिर उपयुक्त छैन — हटाउनुहोस्" style={{background:"rgba(20,18,14,0.65)",backdropFilter:"blur(6px)",WebkitBackdropFilter:"blur(6px)",border:"none",borderRadius:8,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:"#fff"}}><Trash2 size={15}/></button>
                </div>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,marginTop:6,flexWrap:"wrap"}}>
                  {/* NEW — a freshly-fetched picture is a PREVIEW only; it
                      is not written to the app's shared library until the
                      teacher explicitly taps this, so nothing gets kept
                      for reuse without a human choosing to keep it. Once
                      saved (or if it was already saved from an earlier
                      session/device), this button is gone. */}
                  {!vocabImage.saved?(
                    <button className="ss-btn" disabled={vocabImageSaving} onClick={async()=>{
                      setVocabImageSaving(true);setVocabSaveError("");
                      const { data:{ user } } = await supabase.auth.getUser();
                      if(!user){ setVocabSaveError("लगइन फेला परेन — फेरि लगइन गरेर हेर्नुहोस्।"); setVocabImageSaving(false); return; }
                      const result = await saveWordImageForReuse(vocabPopup.word, vocabImage.blob, vocabImage.credit, user.id);
                      if(result.ok) setVocabImage({...vocabImage, saved:true});
                      else setVocabSaveError(result.error||"बचत गर्न सकिएन।");
                      setVocabImageSaving(false);
                    }} style={{padding:"7px 12px",borderRadius:9,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:13,cursor:vocabImageSaving?"default":"pointer",display:"flex",alignItems:"center",gap:6,opacity:vocabImageSaving?0.7:1}}>
                      <CheckCircle2 size={14}/> {vocabImageSaving?"बचत हुँदैछ...":"पछि प्रयोगको लागि बचत गर्नुहोस्"}
                    </button>
                  ):(
                    <div style={{fontSize:12.5,color:INK_SOFT,display:"flex",alignItems:"center",gap:5}}><CheckCircle2 size={13} color={ACCENT}/> बचत भयो — अफलाइनका लागि सुरक्षित</div>
                  )}
                  <div style={{fontSize:11.5,color:INK_SOFT,textAlign:"right"}}>तस्बिर: {vocabImage.credit||"Wikipedia"}</div>
                </div>
                {/* NEW — surfaces the real reason a save failed (e.g. the
                    "vocab-images" Supabase Storage bucket was never
                    created — see vocab_images_migration.sql's setup
                    notes) instead of the button silently doing nothing. */}
                {vocabSaveError&&(
                  <div style={{marginTop:6,fontSize:12.5,color:ROSE,background:WARN_BG,borderRadius:8,padding:"6px 10px"}}>बचत गर्न सकिएन: {vocabSaveError}</div>
                )}
              </div>
            )}
            {/* NEW — hidden native file picker backing both "आफ्नै तस्बिर
                अपलोड गर्नुहोस्" buttons above; accept restricts the OS
                picker to image files. */}
            <input ref={vocabFileInputRef} type="file" accept="image/*" onChange={handleVocabFileUpload} style={{display:"none"}}/>
            <button className="ss-btn" onClick={()=>setVocabPopup(null)} style={{marginTop:16,width:"100%",padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>बुझें</button>
          </div>
        </div>
      )}

      {/* print-only — the full plan, every section, always in this order,
          regardless of which tab was open on screen. Styled as a proper
          printable handout: bordered header block, a byline row (class/
          teacher/date), and consistent section rules — not just a plain
          dump of text. */}
      <div className="print-only" style={{fontFamily:"'SSText','Kalimati','Times New Roman',serif",color:"#111",maxWidth:"18cm",margin:"0 auto"}}>
        <div style={{border:"1.5px solid #111",borderRadius:6,padding:"14px 18px",marginBottom:16}}>
          {chapterTitle&&<div style={{fontSize:12.5,letterSpacing:"0.06em",textTransform:"uppercase",color:"#444",fontWeight:700,marginBottom:3}}>{chapterTitle}</div>}
          <div style={{fontSize:23,fontWeight:800,marginBottom:8,lineHeight:1.25}}>{lesson.title}</div>
          <div style={{display:"flex",flexWrap:"wrap",gap:"4px 18px",fontSize:12.5,color:"#333",borderTop:"1px solid #ccc",paddingTop:7}}>
            {classLabel&&<span><strong>कक्षा:</strong> {classLabel}</span>}
            {teacherName&&<span><strong>शिक्षक:</strong> {teacherName}</span>}
            <span><strong>मिति:</strong> {new Date().toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"})}</span>
          </div>
        </div>

        {objectives.length>0&&(
          <div style={{marginBottom:16,breakInside:"avoid"}}>
            <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>उद्देश्यहरू</div>
            <ul style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{objectives.map((o,i)=><li key={i} style={{marginBottom:3}}>{o}</li>)}</ul>
          </div>
        )}

        {vocabulary.length>0&&(
          <div style={{marginBottom:16,breakInside:"avoid"}}>
            <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>शब्दावली</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>{vocabulary.map((v)=><span key={v} style={{border:"1px solid #999",borderRadius:4,padding:"2px 9px",fontSize:13}}>{v}</span>)}</div>
          </div>
        )}

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>पढाउने क्रम</div>
          {sequence.length===0?<div>—</div>:<ol style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{sequence.map((s,i)=><li key={i} style={{marginBottom:6}}>{s}</li>)}</ol>}
        </div>

        {lesson.notes&&(
          <div style={{marginBottom:16,breakInside:"avoid",background:"#f4f4f4",borderLeft:"3px solid #111",padding:"8px 12px",borderRadius:"0 4px 4px 0"}}>
            <div style={{fontWeight:700,fontSize:12.5,marginBottom:3}}>नोट</div>
            <div style={{lineHeight:1.55}}>{lesson.notes}</div>
          </div>
        )}

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>कक्षामा सोध्ने प्रश्नहरू</div>
          {keyQuestions.length===0?<div>—</div>:<ol style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{keyQuestions.map((q,i)=><li key={i} style={{marginBottom:5}}>{q.includes("||")?q.slice(0,q.indexOf("||")):q}</li>)}</ol>}
        </div>

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>क्रियाकलापहरू</div>
          {activities.length===0?<div>—</div>:<ol style={{margin:0,paddingLeft:20,lineHeight:1.65}}>{activities.map((a,i)=><li key={i} style={{marginBottom:5}}>{a}</li>)}</ol>}
        </div>

        <div style={{marginBottom:16,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>गृहकार्य</div>
          <div style={{lineHeight:1.6}}>{lesson.homework||"—"}</div>
        </div>

        <div style={{marginBottom:8,breakInside:"avoid"}}>
          <div style={{fontWeight:700,fontSize:13.5,textTransform:"uppercase",letterSpacing:"0.05em",borderBottom:"1.5px solid #111",paddingBottom:3,marginBottom:7}}>मूल्याङ्कन मापदण्ड</div>
          {rubric.length===0?<div>—</div>:(
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13.5}}>
              <tbody>
                {rubric.map((r,i)=>(
                  <tr key={i} style={{borderBottom:"1px solid #ddd"}}>
                    <td style={{padding:"6px 10px 6px 0",fontWeight:700,whiteSpace:"nowrap",verticalAlign:"top",width:"28%"}}>{r.level}</td>
                    <td style={{padding:"6px 0",verticalAlign:"top"}}>{r.desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// NEW — per-lesson library of AI-generated interactive simulations. Each
// generation is saved as its own row (see db.saveSimulation) so a teacher
// can build up several attempts for the same lesson and keep whichever
// ones actually work in class, instead of only ever having the latest —
// same "save, don't just view once" pattern as Saved Resources.
function SimulationPanel({ lesson, chapterTitle, classLabel, classContext }) {
  const [sims,setSims]=useState([]);
  const [loading,setLoading]=useState(true);
  const [generating,setGenerating]=useState(false);
  const [error,setError]=useState("");
  const [viewing,setViewing]=useState(null);
  const [deletingId,setDeletingId]=useState(null);

  const load=useCallback(async()=>{
    setLoading(true);
    const{data}=await db.getSimulationsByLesson(lesson.id);
    setSims(data||[]);
    setLoading(false);
  },[lesson.id]);
  useEffect(()=>{load();},[load]);

  const generate=async()=>{
    setGenerating(true);setError("");
    try{
      const ctx=await getMaterialContext(chapterTitle,classLabel);
      // Which formats were used recently — combine BOTH signals so variety
      // holds within a single lesson (repeatedly hitting "generate" here)
      // AND across different lessons (one generation per lesson, the more
      // common workflow). pickNextSimulationType cares about (a) mechanic
      // counts, to round-robin drag/tap/type/slider, and (b) the LAST
      // element of the array, to avoid repeating the exact same type back
      // to back — so both lists are reversed to oldest-first and this
      // lesson's own history is appended last, making the most recent
      // item always this lesson's latest simulation if it has one (the
      // most relevant "don't repeat what we just did here" signal),
      // falling back to the global most-recent item for a brand-new
      // lesson with no history of its own yet.
      const{data:recentTypesDesc}=await db.getRecentSimulationTypes(12);
      const globalAsc=(recentTypesDesc||[]).slice().reverse();
      const lessonAsc=sims.map((s)=>s.type).filter(Boolean).slice().reverse();
      const usedTypes=[...globalAsc, ...lessonAsc];
      const nextType=gemini.pickNextSimulationType(usedTypes);
      const{html,type}=await gemini.generateSimulation(chapterTitle,lesson.title,ctx,classContext,nextType);
      const chapter_id=await resolveChapterId(chapterTitle,classLabel);
      // NEW — 2-3 discussion questions for after the game ends, generated
      // alongside the simulation itself. Best-effort: a failure here
      // (rate limit, malformed JSON) should never block saving/showing
      // the simulation, which is the part that actually matters in class.
      let discussionTips=[];
      try{discussionTips=await gemini.generateDiscussionTips(chapterTitle,lesson.title,type.label,ctx,classContext);}catch{ /* keep empty — footer just won't show tips */ }
      const{data,error}=await db.saveSimulation({lesson_id:lesson.id,chapter_id,chapter_title:chapterTitle,title:`${lesson.title} — ${type.label}`,type:type.id,html_content:html,discussion_tips:discussionTips});
      if(error)throw error;
      setSims((prev)=>[data,...prev]);
      setViewing(data);
    }catch(e){setError("AI त्रुटि: "+(e.message||"सिमुलेसन बनाउन सकिएन।"));}
    setGenerating(false);
  };

  const remove=async(id,e)=>{
    e?.stopPropagation();
    setDeletingId(id);
    await db.deleteSimulation(id);
    setSims((prev)=>prev.filter((s)=>s.id!==id));
    setDeletingId(null);
    if(viewing?.id===id)setViewing(null);
  };

  return(<div>
    <SectionLabel icon={Gamepad2} color={VIOLET}>इन्टरएक्टिभ सिमुलेसन</SectionLabel>
    <div style={{fontSize:15.5,color:INK_SOFT,marginBottom:12,lineHeight:1.5}}>यस पाठका लागि AI ले प्रोजेक्टरमा देखाई कक्षालाई खेलाउन मिल्ने अन्तरक्रियात्मक अभ्यास बनाउँछ — तपाईंले ल्यापटपमा माउसले चलाउनुहुन्छ। हरेक पटक "नयाँ बनाउनुहोस्" थिच्दा फरक-फरक शैली प्रयास गरिन्छ, र पुरानोहरू पनि सुरक्षित रहन्छन्।</div>
    {error&&<ErrorMsg msg={error}/>}
    <button className="ss-btn" onClick={generate} disabled={generating} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:7,width:"100%",padding:"13px",borderRadius:12,border:"none",background:`linear-gradient(180deg, ${VIOLET} 0%, color-mix(in srgb, ${VIOLET} 75%, black) 100%)`,color:"#fff",fontWeight:700,fontSize:16.5,cursor:generating?"default":"pointer",boxShadow:SHADOW.accent,marginBottom:generating?6:16}}>
      {generating?<><Loader size={17} style={{animation:"spin 1s linear infinite"}}/>सिमुलेसन बनाउँदै र जाँच्दै... (१-२ मिनेट लाग्न सक्छ)</>:<><Wand2 size={17}/>{sims.length?"नयाँ सिमुलेसन बनाउनुहोस्":"AI बाट सिमुलेसन बनाउनुहोस्"}</>}
    </button>
    {/* NEW — this generation genuinely takes a while (large, detailed
        output) — saying so up front avoids a teacher assuming it's stuck
        and refreshing/retrying mid-generation. */}
    {generating&&<div style={{fontSize:13.5,color:INK_SOFT,textAlign:"center",marginBottom:16}}>यसमा १-२ मिनेटसम्म लाग्न सक्छ — कृपया पर्खनुहोस्...</div>}
    {loading?<Spinner/>:sims.length===0?<EmptyState icon={Gamepad2} text="अझै कुनै सिमुलेसन बनाइएको छैन। माथिको बटनबाट पहिलो बनाउनुहोस्।"/>:(
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {sims.map((s,i)=>{const color=PALETTE[i%PALETTE.length];return(
          <Card key={s.id} accentColor={color} onClick={()=>setViewing(s)} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:40,height:40,borderRadius:10,background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Gamepad2 size={19} color="#fff"/></div>
            <div style={{minWidth:0,flex:1}}>
              <div style={{fontWeight:700,fontSize:16.5,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.title}</div>
              <div style={{fontSize:14,color:INK_SOFT}}>{new Date(s.created_at).toLocaleDateString("ne-NP",{day:"2-digit",month:"short",year:"numeric"})}</div>
            </div>
            <button className="ss-icon-btn" onClick={(e)=>remove(s.id,e)} disabled={deletingId===s.id} style={{color:DANGER,cursor:"pointer",padding:6,flexShrink:0}}><Trash2 size={16}/></button>
          </Card>
        );})}
      </div>
    )}
    {viewing&&(
      <div className="no-print" style={{position:"fixed",inset:0,zIndex:90,background:"#000",display:"flex",flexDirection:"column"}}>
        {/* FIX — this row used flexWrap:"wrap", so on a narrow phone the
            "designed for laptop/projector" subtitle wrapped onto its own
            second line, silently doubling the header's height and eating
            into the vertical space the game itself had to render in — that
            extra fixed-height band above the content is what read as "a
            notification hiding the content." No wrap now, and the subtitle
            (which is informational, not essential) hides below 560px via
            the media query, instead of ever pushing onto a second line. */}
        {/* FIX — background was `INK`, a CSS var that TEXT uses and that
            flips to a pale cream color in dark theme (the app's default —
            see index.html: --ink:#FBEEDD in [data-theme="dark"]). Used as a
            background behind white text/icons, that's white-ish-on-white —
            invisible, exactly the "white bar, nothing visible" bug. This
            whole overlay is a fixed always-dark "cinema mode" viewer (the
            outer div is literally background:"#000"), so the bar needs a
            fixed dark literal, not a theme-dependent variable that was
            never meant to be used as a background at all. */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"#1C1006",color:"#fff",flexShrink:0}}>
          <div style={{flex:1,minWidth:0,fontWeight:700,fontSize:15.5,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{viewing.title}</div>
          <span className="ss-sim-subtitle" style={{fontSize:13,color:"rgba(255,255,255,0.6)",fontWeight:600,whiteSpace:"nowrap"}}>🖥️ ल्यापटप/प्रोजेक्टरका लागि डिजाइन गरिएको</span>
          <IconButton icon={generating?Loader:RefreshCw} spin={generating} onClick={generate} disabled={generating} title="अर्को नयाँ सिमुलेसन बनाउनुहोस्" variant="hero" size={17} style={{borderRadius:8,padding:8}}/>
          <IconButton icon={X} onClick={()=>setViewing(null)} variant="hero" size={19} style={{borderRadius:8,padding:8}}/>
          <style>{`@media (max-width:560px){.ss-sim-subtitle{display:none;}}`}</style>
        </div>
        <SimulationStage html={viewing.html_content} title={viewing.title}/>
        {viewing.discussion_tips?.length>0&&<DiscussionTipsFooter tips={viewing.discussion_tips}/>}
      </div>
    )}
  </div>);
}

// NEW — collapsible footer with 2-3 teacher discussion questions for after
// the game ends (see gemini.generateDiscussionTips). Kept as a normal-flow
// footer below the iframe rather than something detected/triggered from
// inside the sandboxed simulation — the sandboxed iframe has no reliable
// way to tell the parent "the game just ended", so instead this stays
// tucked away (collapsed by default, doesn't compete with the game for
// attention) and the teacher opens it whenever they're ready to wrap up.
function DiscussionTipsFooter({ tips }) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{flexShrink:0,background:"#1C1006",color:"#fff",borderTop:"1px solid rgba(255,255,255,0.12)"}}>
      <button className="ss-icon-btn" onClick={()=>setOpen((o)=>!o)} style={{width:"100%",display:"flex",alignItems:"center",gap:8,padding:"9px 14px",color:"inherit",cursor:"pointer",fontWeight:700,fontSize:14}}>
        <MessageSquare size={15}/>
        <span style={{flex:1,textAlign:"left"}}>छलफल प्रश्न (खेल सकिएपछि सोध्नुहोस्)</span>
        <span style={{fontSize:12,opacity:0.7}}>{open?"▲":"▼"}</span>
      </button>
      {open&&(
        <div style={{padding:"0 14px 12px",display:"flex",flexDirection:"column",gap:6}}>
          {tips.map((t,i)=>(
            <div key={i} style={{fontSize:14,lineHeight:1.5,color:"rgba(255,255,255,0.9)"}}>{i+1}. {t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

// FIX — this used to wrap the iframe in a fixed 1280×720 "stage" and scale
// that whole stage down with a CSS transform to fit. The prompt already
// requires the AI to build the page with flex/grid + clamp()/vw/vh (see
// "स्क्रिनभित्रै अटाउने नियम" in gemini.generateSimulation), i.e. it's
// meant to reflow to whatever viewport it's given — locking it to a fixed
// 16:9 canvas and shrinking that canvas fought against its own responsive
// layout. On a tall portrait phone the math (scale = width/1280, often
// ~0.3) produced a tiny sliver of game surrounded by large black bars top
// and bottom — that's the "black gap" hiding the content in the
// screenshots. Letting the iframe fill its real container directly lets
// the content's own responsive CSS do the reflowing, so there's no
// artificial letterbox on any screen. A brief, dismissable hint (not an
// overlay that blocks the game) nudges toward landscape on narrow phones,
// since the content still reads best wide.
function SimulationStage({ html, title }) {
  const [hintDismissed, setHintDismissed] = useState(false);
  const isNarrowPortrait = typeof window !== "undefined" && window.innerWidth < 700 && window.innerHeight > window.innerWidth;
  return (
    <div style={{flex:1,minHeight:0,display:"flex",flexDirection:"column",background:"#000",overflow:"hidden"}}>
      {isNarrowPortrait && !hintDismissed && (
        <div style={{flexShrink:0,display:"flex",alignItems:"center",gap:8,padding:"6px 12px",background:"rgba(255,193,7,0.15)",color:"#ffc107",fontSize:12.5,fontWeight:600}}>
          <span style={{flex:1}}>📱↻ राम्रोसँग हेर्न फोन ल्यान्डस्केप (आडा) बनाउनुहोस्</span>
          <button className="ss-icon-btn" onClick={()=>setHintDismissed(true)} style={{color:"inherit",cursor:"pointer",fontWeight:700,padding:"3px 7px"}}>✕</button>
        </div>
      )}
      <iframe title={title} srcDoc={html} sandbox="allow-scripts" style={{flex:1,minHeight:0,width:"100%",border:"none",background:"#fff"}}/>
    </div>
  );
}

function StatCard({ icon:Icon, value, label, color, onClick, accent }) {
  return (
    <Card onClick={onClick} accentColor={color} style={{padding:"14px 16px",position:"relative"}}>
      <div style={{display:"flex",alignItems:"center",gap:11}}>
        <div style={{
          width:40,height:40,borderRadius:12,flexShrink:0,
          background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 72%, black) 100%)`,
          display:"flex",alignItems:"center",justifyContent:"center",
          boxShadow:`0 3px 8px color-mix(in srgb, ${color} 30%, transparent)`,
        }}>
          <Icon size={19} color="#fff"/>
        </div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:24,fontWeight:800,color:INK,lineHeight:1.05,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>{value}</div>
          <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginTop:2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
        </div>
      </div>
    </Card>
  );
}

// NEW — the things a one-click "prepare this chapter" run produces. The
// lesson plan and any presentation/PPT come from what the teacher already
// uploaded (shown separately below) — this only fills in what AI is
// actually useful for: questions, activities, and an assessment rubric.
const PREP_STEPS=[
  {id:"plan",label:"पाठ योजना"},
  {id:"questions",label:"प्रश्नहरू"},
  {id:"activities",label:"क्रियाकलाप"},
  {id:"assessment",label:"मूल्याङ्कन"},
];
function PrepStepRow({ label, state, message }) {
  const color=state==="done"?ACCENT:state==="error"?DANGER:state==="loading"?MARIGOLD_DARK:INK_SOFT;
  const bg=state==="done"?ACCENT_LIGHT:state==="error"?DANGER_BG:state==="loading"?WARN_BG:SURFACE_2;
  return(
    <div style={{padding:"7px 2px"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:24,height:24,borderRadius:"50%",background:bg,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
          {state==="loading"?<Loader size={12} color={color} style={{animation:"spin 1s linear infinite"}}/>
            :state==="done"?<CheckCircle2 size={13} color={color}/>
            :state==="error"?<AlertCircle size={13} color={color}/>
            :<div style={{width:6,height:6,borderRadius:"50%",background:color}}/>}
        </div>
        <div style={{fontSize:16,fontWeight:600,color:state==="idle"?INK_SOFT:INK}}>{label}</div>
      </div>
      {/* NEW — a failed step used to just show a red dot with no way to
          know why. Now shows the actual error (after both the in-call and
          the extra preparePath-level retry have been used up), so a
          repeated rate-limit/timeout is visible instead of a silent X. */}
      {state==="error"&&message&&<div style={{fontSize:14,color:DANGER,marginLeft:34,marginTop:2}}>{message}</div>}
    </div>
  );
}

// NEW — shows what the teacher has already uploaded for this chapter
// (lesson plan, PPT, etc., tagged by category in Materials). This is the
// source of truth for the lesson plan/presentation — AI never overwrites
// these, it only reads them for context.
function ChapterMaterialsList({ materials, onGoMaterials }) {
  if(!materials||materials.length===0){
    return(
      <div style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:WARN,background:WARN_BG,borderRadius:10,padding:"9px 12px",marginBottom:10}}>
        <FileText size={14}/>
        <span style={{flex:1}}>यो अध्यायमा अझै पाठ योजना/PPT थपिएको छैन।</span>
        <button className="ss-icon-btn" onClick={onGoMaterials} style={{background:"none",border:"none",color:MARIGOLD_DARK,fontWeight:700,fontSize:14.5,cursor:"pointer",textDecoration:"underline",flexShrink:0}}>थप्नुहोस्</button>
      </div>
    );
  }
  return(
    <div style={{display:"flex",flexDirection:"column",gap:5,marginBottom:10}}>
      {materials.map((m)=>{
        const meta=CATEGORY_META[m.category]||CATEGORY_META.other;
        const Icon=meta.icon;
        return(
          <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,fontSize:15,color:INK,background:SURFACE_2,borderRadius:8,padding:"7px 10px"}}>
            <Icon size={14} color={meta.color} style={{flexShrink:0}}/>
            <span style={{fontWeight:700,color:meta.color,fontSize:13.5,flexShrink:0}}>{meta.label}</span>
            <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{m.name}</span>
          </div>
        );
      })}
    </div>
  );
}

// NEW — HomeScreen replaces the old Dashboard. The lesson plan and teaching
// materials (PPT, worksheets, etc.) are uploaded once by the teacher —
// tagged to a chapter in Materials. From there, picking that chapter here
// and tapping one button prepares everything AI can usefully add on top —
// questions, activities, and an assessment rubric — reading the teacher's
// own uploaded lesson plan/PPT and the textbook as its source, never
// replacing them. This is meant to be the only screen a teacher needs to
// touch on a normal day.
function HomeScreen({ onOpenLesson, onGoPlanner, onGoMaterials, onGoAITools, onGoSettings, section, homework, hwLoading, onRefreshHomework, loading, teacherName, classContext, classLabel, initialPanel, onInitialPanelConsumed, active }) {
  const { chapters, lessons, materials } = useData();
  // FIX — "today's lesson" was permanently whichever lesson happened to be
  // first "ready" (or just lessons[0]), with no way to change it — so once
  // you'd taught it, the card kept pointing at the same chapter forever.
  // A teacher can now explicitly pick which lesson is "today's"; the
  // choice is remembered (per class) until changed again, and falls back
  // to the automatic pick if the chosen lesson gets deleted.
  const [todayOverrideId,setTodayOverrideId]=useState(()=>{
    try{return localStorage.getItem(`ss-today-lesson::${classLabel||"default"}`)||null;}catch{return null;}
  });
  const [pickingToday,setPickingToday]=useState(false);
  useEffect(()=>{
    try{setTodayOverrideId(localStorage.getItem(`ss-today-lesson::${classLabel||"default"}`)||null);}catch{}
  },[classLabel]);
  const chooseToday=(l)=>{
    setTodayOverrideId(l.id);setPickingToday(false);
    try{localStorage.setItem(`ss-today-lesson::${classLabel||"default"}`,l.id);}catch{}
  };
  const today=lessons.find((l)=>l.id===todayOverrideId)||lessons.find((l)=>l.status==="ready")||lessons[0];
  // FIX — this used to be its own separate fetch (mount-only), so
  // uploading a file elsewhere never updated the dashboard count until the
  // whole app reloaded. Derived directly from the shared materials list
  // now — always current, no fetch of its own needed.
  const materialsCount=(materials||[]).length;
  const [textbookReady,setTextbookReady]=useState(false);
  useEffect(()=>{ let cancelled=false; getTextbookPDF(classLabel).then((part)=>{if(!cancelled)setTextbookReady(!!part);}); return ()=>{cancelled=true;}; },[classLabel]);

  // NEW — थप used to be its own nav tab holding just गृहकार्य, डायरी, and
  // पात्रो — three things with no shared identity of their own, sitting
  // behind a tap most of a screen's height ended up empty. आज is already
  // the daily-glance dashboard (today's lesson, stats), so these belong
  // here instead: one destination for "how's today/this week going"
  // rather than two. Removing थप also takes bottom nav from 5 items to 4.
  // FIX — पात्रो (Calendar) used to render inline, in full, directly on
  // this dashboard: its own header, upload/add buttons, a full row of 6
  // category filter chips, and the whole month grid — permanently taking
  // up most of the screen and, on a phone, crowding right up against the
  // "कार्यक्रम थप्नुहोस्" flow that shows those same 6 category buttons
  // again inside its own form, which read as duplicated buttons. It's a
  // popup now, opened from one compact tile below (same pattern already
  // used for गृहकार्य/डायरी), so the category chips only ever appear in
  // one place at a time — inside the calendar itself, not permanently
  // sitting on the dashboard too.
  const [openPanel,setOpenPanel]=useState(null); // null | "homework" | "journal" | "calendar"
  useEffect(()=>{
    if(!initialPanel)return;
    setOpenPanel(initialPanel);
    onInitialPanelConsumed?.();
  },[initialPanel,onInitialPanelConsumed]);
  const [journalCount,setJournalCount]=useState(null);
  useEffect(()=>{db.getJournalEntries(classLabel).then(({data})=>setJournalCount((data||[]).length));},[openPanel,classLabel]);
  const pendingHomework=homework.filter((h)=>h.checked_count<h.total_students).length;

  if(loading)return<Spinner/>;
  const hour=new Date().getHours();
  const timeGreeting=hour<11?"शुभ प्रभात":hour<16?"नमस्ते":"शुभ साँझ";

  return(
    <div className="ss-page" style={{padding:"20px 18px 130px",maxWidth:760,margin:"0 auto"}}>
      {teacherName&&(
        <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <div style={{fontSize:24,fontWeight:800,color:INK,fontFamily:"'SSText','Kalimati','Times New Roman',serif",letterSpacing:"-0.01em"}}>{timeGreeting}, {teacherName} जी</div>
          <span style={{fontSize:22}}>👋</span>
        </div>
      )}

      {!textbookReady&&(
        <Card onClick={onGoSettings} accentColor={MARIGOLD_DARK} style={{marginBottom:16,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
          <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(160deg, ${MARIGOLD} 0%, ${MARIGOLD_DARK} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 8px color-mix(in srgb, ${MARIGOLD_DARK} 30%, transparent)`}}><BookMarked size={19} color="#fff"/></div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:16.5,color:INK}}>पहिले पाठ्यपुस्तक अपलोड गर्नुहोस्</div>
            <div style={{fontSize:14.5,color:INK_SOFT}}>सेटिङमा गएर PDF थप्नुहोस् — त्यसपछि मात्र AI ले तयार गर्न सक्छ</div>
          </div>
          <ArrowRight size={18} color={INK_SOFT} style={{flexShrink:0}}/>
        </Card>
      )}

      {today&&(
        <div style={{background:`linear-gradient(120deg, ${MARIGOLD} 0%, ${ACCENT_DARK} 100%)`,borderRadius:24,padding:"18px 20px",color:"#fff",marginBottom:16,boxShadow:SHADOW.accent,position:"relative",overflow:"hidden"}}>
          <div style={{position:"absolute",top:-36,right:-30,width:130,height:130,borderRadius:"50%",background:"rgba(255,255,255,0.09)"}}/>
          <div style={{position:"absolute",bottom:-40,right:60,width:80,height:80,borderRadius:"50%",background:"rgba(255,255,255,0.07)"}}/>
          <div style={{position:"relative",minWidth:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8}}>
              <div style={{display:"inline-flex",fontSize:12.5,opacity:0.95,fontWeight:700,letterSpacing:"0.04em",textTransform:"uppercase",background:"rgba(255,255,255,0.18)",padding:"3px 10px",borderRadius:999}}>आजको पाठ · {today.chapters?.title||today.chapter_title||""}</div>
              {/* NEW — was previously impossible to change; this is the fix. */}
              {lessons.length>1&&(
                <button className="ss-btn" onClick={()=>setPickingToday((v)=>!v)} style={{background:"rgba(255,255,255,0.2)",border:"none",color:"#fff",borderRadius:999,padding:"4px 11px",fontSize:13,fontWeight:700,cursor:"pointer",flexShrink:0,whiteSpace:"nowrap"}}>बदल्नुहोस्</button>
              )}
            </div>
            <div style={{fontSize:21,fontWeight:800,margin:"8px 0 14px",letterSpacing:"-0.01em",overflowWrap:"break-word",fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>{today.title}</div>
            {pickingToday?(
              <div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:16,padding:8,marginBottom:4,maxHeight:220,overflowY:"auto",boxShadow:SHADOW.lg}}>
                {lessons.map((l)=>(
                  <div key={l.id} onClick={()=>chooseToday(l)} style={{padding:"9px 10px",borderRadius:10,cursor:"pointer",background:l.id===today.id?ACCENT_LIGHT:"transparent"}}>
                    <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600}}>{l.chapters?.title||l.chapter_title||""}</div>
                    <div style={{fontSize:15.5,color:INK,fontWeight:700}}>{l.title}</div>
                  </div>
                ))}
              </div>
            ):(
              // FIX — "print/display in class" is one of the two things
              // done almost every day, but used to always be a second tap
              // buried inside the lesson viewer (open lesson → find print
              // button). It's a one-tap action from the dashboard now,
              // sitting right next to opening the lesson itself.
              <div style={{display:"flex",gap:9,flexWrap:"wrap"}}>
                <Button size="sm" icon={Sparkles} onClick={()=>onOpenLesson(today)} style={{background:"#fff",color:ACCENT_DARK,boxShadow:"0 4px 14px rgba(0,0,0,0.18)"}}>आजको पाठ सुरु</Button>
                <Button size="sm" icon={Printer} onClick={()=>onOpenLesson(today,{autoPrint:true})} style={{background:"rgba(255,255,255,0.2)",border:"1.5px solid rgba(255,255,255,0.4)",color:"#fff"}}>प्रिन्ट गर्नुहोस्</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FIX — this used to be its own full "generate" flow, duplicating
          (and drifting out of sync with) the one inside Planner. Now it's a
          plain shortcut: Planner is the single door where you pick an
          Adhyaya, see its Paths, and generate a Path's full bundle. */}
      <Card onClick={()=>onGoPlanner()} accentColor={ACCENT} style={{marginBottom:16,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
        <div style={{width:40,height:40,borderRadius:12,background:`linear-gradient(160deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 8px color-mix(in srgb, ${ACCENT} 30%, transparent)`}}><Wand2 size={19} color="#fff"/></div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:16.5,color:INK}}>पाठ योजना बनाउनुहोस्</div>
          <div style={{fontSize:14.5,color:INK_SOFT}}>अध्याय छान्नुहोस्, त्यसभित्र पाठ थप्नुहोस् — AI ले एकैचोटि सबै तयार गर्छ</div>
        </div>
        <ArrowRight size={18} color={INK_SOFT} style={{flexShrink:0}}/>
      </Card>

      <SectionLabel icon={Zap} color={ACCENT}>एक नजरमा</SectionLabel>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:18}}>
        <StatCard icon={BookOpen} value={chapters?.length||0} label="अध्यायहरू" color={ACCENT} accent onClick={onGoMaterials}/>
        <StatCard icon={FileText} value={materialsCount} label="सामग्री फाइल" color={ROSE} accent onClick={onGoMaterials}/>
        <StatCard icon={CheckCircle2} value={lessons.filter((l)=>l.status==="ready").length} label="तयार पाठ" color={TEAL} accent onClick={onGoPlanner}/>
        <StatCard icon={ListChecks} value={homework.length} label="गृहकार्य" color={VIOLET} accent onClick={()=>setOpenPanel("homework")}/>
      </div>

      <GetStartedCard chapters={chapters||[]} materialsCount={materialsCount} lessons={lessons} onGoMaterials={onGoMaterials} onGoPlanner={onGoPlanner}/>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12,marginTop:18,marginBottom:18}}>
        <SummaryPanel icon={ListChecks} color={BLUE} title="गृहकार्य" onOpen={()=>setOpenPanel("homework")}
          subtitle={hwLoading?"लोड हुँदै...":homework.length===0?"कुनै गृहकार्य छैन":`${homework.length} जम्मा · ${pendingHomework} जाँच बाँकी`}/>
        <SummaryPanel icon={Heart} color={ROSE} title="डायरी" onOpen={()=>setOpenPanel("journal")}
          subtitle={journalCount===null?"लोड हुँदै...":journalCount===0?"कुनै प्रविष्टि छैन":`${journalCount} प्रविष्टि`}/>
        <SummaryPanel icon={CalendarDays} color={VIOLET} title="पात्रो" onOpen={()=>setOpenPanel("calendar")}
          subtitle="कार्यक्रम, बिदा, परीक्षा मिति हेर्नुहोस्"/>
      </div>
      {openPanel==="homework"&&<ManagerPopup title="गृहकार्य" onClose={()=>setOpenPanel(null)}><HomeworkManager section={section} loading={hwLoading} homework={homework} onRefresh={onRefreshHomework} classLabel={classLabel}/></ManagerPopup>}
      {openPanel==="journal"&&<ManagerPopup title="डायरी" onClose={()=>setOpenPanel(null)}><TeachingJournal lessons={lessons} classLabel={classLabel}/></ManagerPopup>}
      {openPanel==="calendar"&&<ManagerPopup title="पात्रो" onClose={()=>setOpenPanel(null)}><CalendarView classLabel={classLabel} active={true}/></ManagerPopup>}
    </div>
  );
}

const EMPTY_LESSON_FORM={id:null,title:"",status:"missing",chapter_title:"",objectives:"",vocabulary:"",sequence:"",key_questions:"",activities:"",homework:"",notes:""};

// NEW — turns a saved lesson row back into the editable form shape (the
// reverse of save()'s split/join). This is what makes a lesson plan
// actually editable after creation instead of create-once/view-only.
function lessonToForm(l){
  return{
    id:l.id, title:l.title||"", status:l.status||"missing",
    chapter_title:l.chapters?.title||l.chapter_title||"",
    objectives:(l.objectives||[]).join("\n"),
    vocabulary:(l.vocabulary||[]).join("; "),
    sequence:(l.sequence||[]).join("\n"),
    key_questions:(l.key_questions||[]).map((q)=>q.includes("||")?q.slice(0,q.indexOf("||")):q).join("\n"),
    activities:(l.activities||[]).join("\n"),
    homework:l.homework||"", notes:l.notes||"",
  };
}

// NEW — every अध्याय (Unit) shown as a group, holding its own list of पाठ
// (Path) entries — real Unit→Lesson structure instead of a flat list where
// Adhyaya and Path kept blurring into the same thing. Groups every chapter
// from `chapters` (even ones with zero paths yet, so a freshly-added
// Adhyaya still shows up ready to receive its first Path) and buckets each
// lesson under its chapter_id (falling back to a title match for any old
// rows saved before chapter_id was reliably set).
function groupLessonsByChapter(chapters, lessons) {
  const norm=(s)=>(s||"").trim().toLowerCase().replace(/\s+/g," ");
  const byId=new Map();
  const byTitle=new Map();
  const matchedIds=new Set();
  for(const l of lessons){
    const cid=l.chapter_id||null;
    const ctitle=norm(l.chapters?.title||l.chapter_title||"");
    if(cid){ if(!byId.has(cid))byId.set(cid,[]); byId.get(cid).push(l); }
    else if(ctitle){ if(!byTitle.has(ctitle))byTitle.set(ctitle,[]); byTitle.get(ctitle).push(l); }
  }
  const groups=(chapters||[]).map((c)=>{
    const idMatches=byId.get(c.id)||[];
    const titleMatches=byTitle.get(norm(c.title))||[];
    idMatches.forEach((l)=>matchedIds.add(l.id));
    titleMatches.forEach((l)=>matchedIds.add(l.id));
    return{ chapter:c, paths:[...idMatches, ...titleMatches] };
  });
  // FIX — a lesson whose chapter_id points at nothing (or nothing that
  // matched by title either) used to just silently vanish from this whole
  // screen: not in any chapter's group, no error, nothing. It still counted
  // toward Home's "तयार पाठ" total (which doesn't group by chapter at all),
  // so a teacher would see "2 तयार पाठ" on the dashboard and "0 पाठ" inside
  // the one chapter they have — with no way to find the missing 2 anywhere
  // in Planner. Surfacing them in their own "अध्याय नतोकिएको" bucket makes
  // orphaned Paths visible and clickable (open → re-save with a chapter
  // picked → they get a real chapter_id and move into the right group).
  const orphans=lessons.filter((l)=>!matchedIds.has(l.id));
  if(orphans.length) groups.push({chapter:{id:"__unassigned__",title:"अध्याय नतोकिएको"},paths:orphans,unassigned:true});
  return groups;
}

// NEW — read-only printable view of a chapter's saved Yojana (day-wise
// classroom sequence, generated from its approved Plan Group). Reuses the
// same PrintableSheet chrome as every other single-document printout.
function YojanaSheet({ lesson, onClose }) {
  const periods = Array.isArray(lesson.yojana) ? lesson.yojana : [];
  return (
    <PrintableSheet title={lesson.title} subtitle="Yojana" chip="कक्षा योजना" chipColor={ACCENT} onClose={onClose}>
      {periods.length===0&&<div style={{fontSize:15.5,color:INK_SOFT}}>Yojana अझै छैन।</div>}
      {periods.map((p,i)=>(
        <div key={i} style={{marginBottom:16,paddingBottom:14,borderBottom:i<periods.length-1?`1px solid ${BORDER}`:"none"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
            <span style={{fontSize:13,fontWeight:700,color:ACCENT,background:ACCENT_LIGHT,borderRadius:999,padding:"3px 10px"}}>अवधि {p.period}</span>
            {p.stage&&<span style={{fontSize:13,fontWeight:700,color:VIOLET,background:VIOLET_LIGHT,borderRadius:999,padding:"3px 10px"}}>{p.stage}</span>}
          </div>
          {p.title&&<div style={{fontSize:17,fontWeight:800,color:INK,marginBottom:4}}>{p.title}</div>}
          <div style={{fontSize:15.5,color:INK,lineHeight:1.7}}>{p.description}</div>
        </div>
      ))}
    </PrintableSheet>
  );
}

// NEW — the official Lesson Plan + Rubric for school submission (distinct
// from the classroom-facing "AI ले यो पाठ बनाओस्" bundle above, and from
// the day-to-day Planner lessons). Per chapter: shows an existing saved
// Plan Group if one covers this chapter (possibly merged with others), or
// offers "AI ले मस्यौदा बनाओस्" (drafts from the Teacher's Guide +
// textbook, auto-detecting merged chapters AND merged lessons) vs "आफैं
// लेख्नुहोस्" (blank form, filled and saved manually). Either way the
// result is reviewable/editable before "स्वीकृत गर्नुहोस्" (approve) — only
// an approved group is used for Yojana generation.
//
// FIX (per-lesson, decoupled from Planner lessons) — this used to draft ONE
// shared plan/rubric for the whole chapter. It's now one full plan per
// OFFICIAL lesson — but an official lesson is a designation the
// student-assessment guidance document defines for itself, NOT the same
// thing as a classroom lesson row in the Planner. A chapter can have 5
// classroom lessons while the guidance document only recognizes 4 official
// ones (two classroom lessons sharing one सिकाइ उपलब्धि, merged into a
// single official plan). So this list is its own independent, freely
// editable set of "official lesson" entries — named by the AI (from the
// guide) or by the teacher — never assumed to be 1:1 with Planner lessons.
const RUBRIC_LEVELS = ["उत्कृष्ट", "राम्रो", "सामान्य", "सुधार आवश्यक"];
const emptyRubricRow = () => ({ criteria: "", levels: RUBRIC_LEVELS.map((level) => ({ level, desc: "" })) });
const emptyOfficialLesson = (title = "") => ({
  lesson_title: title, source_lesson_titles: [], source_reason: null,
  major_learning_outcomes: [""], materials_required: [""],
  engage: "", explore: "", explain: "", elaborate: "", evaluate: "",
  rubric: [emptyRubricRow()],
});

function PlanGroupModal({ chapter, allChapters, lessons, classLabel, classContext, onClose }) {
  const [phase, setPhase] = useState("loading"); // loading | choose | drafting | review
  const [existingGroup, setExistingGroup] = useState(null);
  const [groupChapterTitles, setGroupChapterTitles] = useState([chapter.title]);
  const [groupReason, setGroupReason] = useState(null);
  const [source, setSource] = useState("ai_drafted");
  const [draft, setDraft] = useState({ lessons: [] });
  const [openIdx, setOpenIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [formatTemplateId, setFormatTemplateId] = useState(null);
  const [teacherGuideId, setTeacherGuideId] = useState(null);

  // Classroom (Planner) lessons under the given chapter titles — used only
  // as REFERENCE context for the AI and as a helpful hint in the UI, never
  // as the list the official plans are built from.
  const classroomLessonsForChapterTitles = (titles) => {
    const ids = new Set((allChapters || []).filter((c) => titles.includes(c.title)).map((c) => c.id));
    if (!ids.has(chapter.id)) ids.add(chapter.id);
    return (lessons || []).filter((l) => ids.has(l.chapter_id));
  };

  useEffect(() => {
    (async () => {
      const { data } = await db.getPlanGroupForChapter(chapter.id);
      if (data) {
        setExistingGroup(data);
        setSource(data.source);
        const titles = (allChapters || []).filter((c) => (data.chapter_ids || []).includes(c.id)).map((c) => c.title);
        setGroupChapterTitles(titles);
        setDraft({ lessons: (data.lessons || []).map((l) => ({ ...emptyOfficialLesson(l.lesson_title), ...l })) });
        setFormatTemplateId(data.format_template_id || null);
        setTeacherGuideId(data.teacher_guide_id || null);
        setPhase("review");
      } else {
        setPhase("choose");
      }
    })();
  }, [chapter.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const startManual = () => {
    setSource("uploaded"); setGroupChapterTitles([chapter.title]); setGroupReason(null);
    setDraft({ lessons: [emptyOfficialLesson()] }); setOpenIdx(0); setPhase("review");
  };

  const startAIDraft = async () => {
    setPhase("drafting"); setBusy(true); setError("");
    try {
      const [{ data: guide }, { data: template }] = await Promise.all([
        db.getActiveTeacherGuide(), db.getActiveFormatTemplate(classLabel),
      ]);
      setFormatTemplateId(template?.id || null); setTeacherGuideId(guide?.id || null);
      const guidePart = await buildGuidePart(guide);
      const guideClassText = guidePart ? await gemini.extractGuideClassSection(guidePart, classLabel) : null;
      const allTitles = (allChapters || []).map((c) => c.title);
      const groups = await gemini.detectChapterGrouping(guideClassText, allTitles);
      const myGroup = groups.find((g) => g.chapter_titles.includes(chapter.title)) || { chapter_titles: [chapter.title], reason: null };
      setGroupChapterTitles(myGroup.chapter_titles); setGroupReason(myGroup.reason);
      const classroomTitles = classroomLessonsForChapterTitles(myGroup.chapter_titles).map((l) => l.title);
      const officialUnits = await gemini.detectOfficialLessons(guideClassText, myGroup.chapter_titles, classroomTitles);
      const ctx = await getMaterialContext(chapter.title, classLabel, null);
      const results = await gemini.draftPlanGroupLessons(myGroup.chapter_titles, officialUnits.map((u) => u.official_title), ctx, classContext, guideClassText);
      setSource("ai_drafted");
      const merged = officialUnits.map((u, i) => {
        const r = results[i] || {};
        return {
          lesson_title: r.lesson_title || u.official_title,
          source_lesson_titles: u.source_lesson_titles || [], source_reason: u.reason || null,
          major_learning_outcomes: r.major_learning_outcomes?.length ? r.major_learning_outcomes : [""],
          materials_required: r.materials_required?.length ? r.materials_required : [""],
          engage: r.engage || "", explore: r.explore || "", explain: r.explain || "",
          elaborate: r.elaborate || "", evaluate: r.evaluate || "",
          rubric: r.rubric?.length ? r.rubric : [emptyRubricRow()],
        };
      });
      setDraft({ lessons: merged }); setOpenIdx(0);
      setPhase("review");
    } catch (e) {
      setError(e.message || "मस्यौदा बनाउन सकिएन।"); setPhase("choose");
    }
    setBusy(false);
  };

  const setLesson = (li, patch) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, ...patch } : l) }));
  const setLessonField = (li, key, value) => setLesson(li, { [key]: value });
  const setLessonListItem = (li, key, i, value) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, [key]: l[key].map((v, vi) => vi === i ? value : v) } : l) }));
  const addLessonListItem = (li, key) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, [key]: [...l[key], ""] } : l) }));
  const removeLessonListItem = (li, key, i) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, [key]: l[key].filter((_, vi) => vi !== i) } : l) }));
  const setLessonRubricDesc = (li, ri, lvi, value) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, rubric: l.rubric.map((row, rIdx) => rIdx === ri ? { ...row, levels: row.levels.map((lv, lvIdx) => lvIdx === lvi ? { ...lv, desc: value } : lv) } : row) } : l) }));
  const setLessonRubricCriteria = (li, ri, value) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, rubric: l.rubric.map((row, rIdx) => rIdx === ri ? { ...row, criteria: value } : row) } : l) }));
  const addLessonRubricRow = (li) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, rubric: [...l.rubric, emptyRubricRow()] } : l) }));
  const removeLessonRubricRow = (li, ri) => setDraft((d) => ({ ...d, lessons: d.lessons.map((l, idx) => idx === li ? { ...l, rubric: l.rubric.filter((_, rIdx) => rIdx !== ri) } : l) }));
  const addOfficialLesson = () => setDraft((d) => ({ ...d, lessons: [...d.lessons, emptyOfficialLesson()] }));
  const removeOfficialLesson = (li) => { setDraft((d) => ({ ...d, lessons: d.lessons.filter((_, idx) => idx !== li) })); setOpenIdx(-1); };

  const persist = async (status) => {
    setBusy(true); setError("");
    try {
      const ids = [];
      for (const title of groupChapterTitles) {
        const id = await db.getChapterIdByTitle(title, classLabel);
        if (id) ids.push(id);
      }
      if (!ids.includes(chapter.id)) ids.push(chapter.id);
      const payload = {
        class_label: classLabel, title: groupChapterTitles.join(" + "), chapter_ids: ids, source, status,
        lessons: draft.lessons.filter((l) => l.lesson_title.trim()).map((l) => ({
          lesson_title: l.lesson_title.trim(),
          source_lesson_titles: l.source_lesson_titles || [], source_reason: l.source_reason || null,
          major_learning_outcomes: l.major_learning_outcomes.filter((v) => v.trim()),
          materials_required: l.materials_required.filter((v) => v.trim()),
          engage: l.engage, explore: l.explore, explain: l.explain, elaborate: l.elaborate, evaluate: l.evaluate,
          rubric: l.rubric.filter((r) => r.criteria.trim()),
        })),
        format_template_id: formatTemplateId, teacher_guide_id: teacherGuideId,
      };
      if (!payload.lessons.length) { setError("कम्तीमा एउटा आधिकारिक पाठको नाम राख्नुहोस्।"); setBusy(false); return; }
      const { data, error: err } = existingGroup
        ? await db.updatePlanGroup(existingGroup.id, payload)
        : await db.insertPlanGroup(payload);
      if (err) throw err;
      setExistingGroup(data);
      if (status === "approved") onClose(true);
    } catch (e) { setError(e.message || "सुरक्षित हुन सकेन।"); }
    setBusy(false);
  };

  // ROUND 4 — fills THIS YEAR'S active format template (uploaded in
  // Settings) with the reviewed content above, producing real .docx files
  // in the school's exact layout/formatting. Works on a draft too (not
  // only approved), per the teacher's request to reuse this on
  // already-saved plans as well.
  //
  // FIX (per-lesson) — one lesson-plan (+ rubric) file per OFFICIAL lesson,
  // not one for the whole chapter. Every generated file is bundled into a
  // single .zip before handing off to downloadBlob, both so a multi-lesson
  // export is one share/save action instead of several, and because
  // downloadBlob itself now prefers the Web Share API — the fix for the
  // "Word file won't save" problem on mobile, where a plain <a download>
  // click is silently swallowed inside an installed PWA / in-app browser.
  const [exportBusy, setExportBusy] = useState(false);
  const [exportMsg, setExportMsg] = useState("");
  const exportDocx = async () => {
    setExportBusy(true); setExportMsg("");
    try {
      const { data: template } = formatTemplateId
        ? await supabase.from("format_templates").select("*").eq("id", formatTemplateId).maybeSingle()
        : await db.getActiveFormatTemplate(classLabel);
      if (!template?.lesson_plan_storage_path) {
        setExportMsg("पहिले सेटिङ्समा यस वर्षको पाठ योजना ढाँचा अपलोड गर्नुहोस्।"); setExportBusy(false); return;
      }
      const lpBlob = await db.downloadMaterialFile(template.lesson_plan_storage_path);
      const rubricBlob = (template.rubric_storage_path && template.rubric_file_type === "docx")
        ? await db.downloadMaterialFile(template.rubric_storage_path) : null;

      const files = [];
      for (const l of draft.lessons) {
        if (!l.lesson_title.trim()) continue;
        const { blob: filledLP } = await fillLessonPlanDocx(lpBlob, {
          major_learning_outcomes: l.major_learning_outcomes,
          materials_required: l.materials_required,
          engage: l.engage, explore: l.explore, explain: l.explain, elaborate: l.elaborate, evaluate: l.evaluate,
        });
        files.push({ filename: `${l.lesson_title}-पाठ-योजना.docx`, blob: filledLP });
        if (rubricBlob) {
          const { blob: filledRubric } = await fillRubricDocx(rubricBlob, l.rubric);
          files.push({ filename: `${l.lesson_title}-रुब्रिक्स.docx`, blob: filledRubric });
        }
      }

      if (!files.length) { setExportMsg("कम्तीमा एउटा आधिकारिक पाठको नाम राख्नुहोस्।"); setExportBusy(false); return; }

      if (files.length === 1) {
        await downloadBlob(files[0].blob, files[0].filename);
      } else {
        const zipped = await zipFiles(files);
        await downloadBlob(zipped, `${chapter.title}-पाठ-योजनाहरू.zip`);
      }

      if (!rubricBlob && template.rubric_storage_path) {
        setExportMsg("पाठ योजनाहरू तयार भए। रुब्रिक्स ढाँचा फोटोको रूपमा राखिएकाले त्यसलाई उस्तै ढाँचामा स्वतः भर्न मिल्दैन — रुब्रिक्सको Word फाइल अपलोड गरे स्वतः भरिनेछ।");
      } else {
        setExportMsg("Word फाइल तयार भयो। Word वा Google Docs मा खोली 'PDF मा बचत गर्नुहोस्' गर्नुहोस्।");
      }
    } catch (e) { setExportMsg("त्रुटि: " + (e.message || "एक्सपोर्ट गर्न सकिएन।")); }
    setExportBusy(false);
  };

  return (
    <div className="no-print" onClick={onClose} style={{position:"fixed",inset:0,zIndex:88,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.55)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:16}}>
      <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:20,padding:"24px 26px",maxWidth:"min(94vw, 780px)",width:"100%",maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box",boxShadow:SHADOW.lg}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
          <div style={{fontSize:19,fontWeight:800,color:INK}}>आधिकारिक पाठ योजना — {chapter.title}</div>
          <IconButton icon={X} onClick={()=>onClose(false)} size={20}/>
        </div>

        {phase==="loading"&&<div style={{padding:"30px 0"}}><Spinner/></div>}

        {phase==="choose"&&(
          <div style={{display:"flex",flexDirection:"column",gap:12,marginTop:14}}>
            {error&&<div style={{fontSize:15,color:DANGER,background:DANGER_BG,borderRadius:10,padding:"10px 12px"}}>{error}</div>}
            <div style={{fontSize:15.5,color:INK_SOFT,lineHeight:1.6}}>यो अध्यायको लागि अझै कुनै आधिकारिक पाठ योजना/रुब्रिक्स छैन। यहाँको "आधिकारिक पाठ" संख्या कक्षामा पढाइने पाठ्यपुस्तकका पाठ संख्यासँग बराबर नहुन सक्छ — विद्यार्थी मूल्याङ्कन मार्गदर्शनले साझा सिकाइ उपलब्धि भएका पाठहरू गाभेको हुन सक्छ।</div>
            <AIButton label="✨ AI ले मस्यौदा बनाओस् (मार्गदर्शनअनुसार पाठ छुट्याएर)" onClick={startAIDraft} loading={busy} style={{width:"100%",justifyContent:"center",fontSize:16.5,padding:"13px"}}/>
            <button className="ss-btn" onClick={startManual} style={{width:"100%",padding:"12px",borderRadius:10,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,fontWeight:700,fontSize:16,cursor:"pointer"}}>आफैं लेख्नुहोस्</button>
          </div>
        )}

        {phase==="drafting"&&(
          <div style={{padding:"30px 0",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
            <Spinner/>
            <div style={{fontSize:15.5,color:INK_SOFT}}>मार्गदर्शनअनुसार पाठ छुट्याउँदै, हरेकको मस्यौदा तयार गर्दै...</div>
          </div>
        )}

        {phase==="review"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16,marginTop:10}}>
            {error&&<div style={{fontSize:15,color:DANGER,background:DANGER_BG,borderRadius:10,padding:"10px 12px"}}>{error}</div>}
            {groupChapterTitles.length>1&&(
              <div style={{fontSize:14.5,color:ACCENT,background:ACCENT_LIGHT,borderRadius:10,padding:"9px 12px",lineHeight:1.6}}>
                यो योजना {groupChapterTitles.length} वटा अध्यायसँग साझा छ: {groupChapterTitles.join(", ")}{groupReason?` — ${groupReason}`:""}
              </div>
            )}
            {existingGroup?.status==="approved"&&<div style={{fontSize:14,fontWeight:700,color:ACCENT}}>✓ स्वीकृत — Yojana यसैबाट बन्न सक्छ</div>}

            {draft.lessons.map((lesson, li) => {
              const isOpen = openIdx === li;
              return (
                <div key={li} style={{border:`1.5px solid ${BORDER}`,borderRadius:14,overflow:"hidden"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,padding:"10px 10px 10px 14px",background:SURFACE_2}}>
                    <div style={{fontWeight:800,fontSize:14.5,color:INK_SOFT,flexShrink:0}}>{li+1}.</div>
                    <input value={lesson.lesson_title} onChange={(e)=>setLessonField(li,"lesson_title",e.target.value)} placeholder="आधिकारिक पाठको नाम" className="ss-field" style={{flex:1,borderRadius:8,padding:"7px 10px",fontSize:15.5,fontWeight:700,border:`1.5px solid ${BORDER}`,background:SURFACE}}/>
                    <IconButton icon={ChevronDown} onClick={()=>setOpenIdx(isOpen?-1:li)} size={18} style={{transform:isOpen?"rotate(180deg)":"none",transition:"transform 0.15s"}}/>
                    <IconButton icon={Trash2} onClick={()=>removeOfficialLesson(li)} size={16}/>
                  </div>
                  {lesson.source_lesson_titles?.length>0&&(
                    <div style={{fontSize:13.5,color:INK_SOFT,padding:"6px 14px",background:SURFACE_2,lineHeight:1.5}}>
                      पाठ्यपुस्तकका पाठहरू: {lesson.source_lesson_titles.join(", ")}{lesson.source_reason?` — ${lesson.source_reason}`:""}
                    </div>
                  )}
                  {isOpen&&(
                    <div style={{display:"flex",flexDirection:"column",gap:16,padding:"16px 14px"}}>
                      <div>
                        <SectionLabel icon={ClipboardList} color={VIOLET}>प्रमुख सिकाइ उपलब्धि</SectionLabel>
                        {lesson.major_learning_outcomes.map((v,i)=>(
                          <div key={i} style={{display:"flex",gap:6,marginBottom:6}}>
                            <input value={v} onChange={(e)=>setLessonListItem(li,"major_learning_outcomes",i,e.target.value)} className="ss-field" style={{flex:1,borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
                            <IconButton icon={X} onClick={()=>removeLessonListItem(li,"major_learning_outcomes",i)} size={16}/>
                          </div>
                        ))}
                        <button className="ss-btn" onClick={()=>addLessonListItem(li,"major_learning_outcomes")} style={{fontSize:14,color:ACCENT,background:"none",border:"none",fontWeight:700,cursor:"pointer",padding:"4px 0"}}>+ थप्नुहोस्</button>
                      </div>

                      <div>
                        <SectionLabel icon={FolderKanban} color={TEAL}>आवश्यक सामग्री</SectionLabel>
                        {lesson.materials_required.map((v,i)=>(
                          <div key={i} style={{display:"flex",gap:6,marginBottom:6}}>
                            <input value={v} onChange={(e)=>setLessonListItem(li,"materials_required",i,e.target.value)} className="ss-field" style={{flex:1,borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
                            <IconButton icon={X} onClick={()=>removeLessonListItem(li,"materials_required",i)} size={16}/>
                          </div>
                        ))}
                        <button className="ss-btn" onClick={()=>addLessonListItem(li,"materials_required")} style={{fontSize:14,color:ACCENT,background:"none",border:"none",fontWeight:700,cursor:"pointer",padding:"4px 0"}}>+ थप्नुहोस्</button>
                      </div>

                      {[["engage","Engage"],["explore","Explore"],["explain","Explain"],["elaborate","Elaborate"],["evaluate","Evaluate"]].map(([key,label])=>(
                        <div key={key}>
                          <SectionLabel icon={Layers} color={PALETTE[0]}>{label}</SectionLabel>
                          <textarea value={lesson[key]} onChange={(e)=>setLessonField(li,key,e.target.value)} rows={3} className="ss-field" style={{width:"100%",borderRadius:10,padding:"10px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
                        </div>
                      ))}

                      <div>
                        <SectionLabel icon={CheckSquare} color={MARIGOLD_DARK}>मूल्याङ्कन रुब्रिक्स</SectionLabel>
                        {lesson.rubric.map((row,ri)=>(
                          <div key={ri} style={{border:`1.5px solid ${BORDER}`,borderRadius:12,padding:10,marginBottom:8}}>
                            <div style={{display:"flex",gap:6,marginBottom:8}}>
                              <input value={row.criteria} onChange={(e)=>setLessonRubricCriteria(li,ri,e.target.value)} placeholder="मूल्याङ्कनको क्षेत्र (जस्तै: विषयवस्तु बुझाइ)" className="ss-field" style={{flex:1,borderRadius:10,padding:"9px 12px",fontSize:15.5,fontWeight:700,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
                              <IconButton icon={Trash2} onClick={()=>removeLessonRubricRow(li,ri)} size={16}/>
                            </div>
                            {row.levels.map((lvl,lvi)=>(
                              <div key={lvi} style={{display:"flex",gap:8,alignItems:"center",marginBottom:5}}>
                                <div style={{fontSize:13.5,fontWeight:700,color:INK_SOFT,width:100,flexShrink:0}}>{lvl.level}</div>
                                <input value={lvl.desc} onChange={(e)=>setLessonRubricDesc(li,ri,lvi,e.target.value)} className="ss-field" style={{flex:1,borderRadius:8,padding:"7px 10px",fontSize:14.5,border:`1.5px solid ${BORDER}`,background:SURFACE}}/>
                              </div>
                            ))}
                          </div>
                        ))}
                        <button className="ss-btn" onClick={()=>addLessonRubricRow(li)} style={{fontSize:14,color:ACCENT,background:"none",border:"none",fontWeight:700,cursor:"pointer",padding:"4px 0"}}>+ मूल्याङ्कन क्षेत्र थप्नुहोस्</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <button className="ss-btn" onClick={addOfficialLesson} style={{width:"100%",padding:"11px",borderRadius:10,border:`1.5px dashed ${BORDER}`,background:"none",color:INK_SOFT,fontWeight:700,fontSize:15,cursor:"pointer"}}>+ थप आधिकारिक पाठ थप्नुहोस्</button>

            <div style={{display:"flex",gap:8,marginTop:6}}>
              <button className="ss-btn" onClick={()=>persist("draft")} disabled={busy} style={{flex:1,padding:"12px",borderRadius:10,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,fontWeight:700,fontSize:15.5,cursor:"pointer"}}>{busy?"...":"मस्यौदाको रूपमा सुरक्षित"}</button>
              <button className="ss-btn" onClick={()=>persist("approved")} disabled={busy} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,fontSize:15.5,cursor:"pointer",boxShadow:SHADOW.accent}}>{busy?"...":"स्वीकृत गर्नुहोस्"}</button>
            </div>
            <button className="ss-btn" onClick={exportDocx} disabled={exportBusy||!draft.lessons.length} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"12px",borderRadius:10,border:`1.5px solid ${TEAL}`,background:"none",color:TEAL,fontWeight:700,fontSize:15.5,cursor:"pointer"}}><Download size={16}/>{exportBusy?"तयार गर्दै...":"यस वर्षको ढाँचामा Word डाउनलोड गर्नुहोस् (हरेक आधिकारिक पाठ छुट्टै)"}</button>
            {exportMsg&&<div style={{fontSize:14.5,color:INK_SOFT,lineHeight:1.6}}>{exportMsg}</div>}
          </div>
        )}
      </div>
    </div>
  );
}



function Planner({ onOpenLesson, section, loading, onRefresh, classContext, classLabel, editLessonId, onEditConsumed, prefillChapter, onPrefillConsumed }) {
  const { chapters, lessons, materials, addChapter, renameChapter: renameChapterCtx, deleteChapter: deleteChapterCtx, refreshLessons } = useData();
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState(EMPTY_LESSON_FORM);
  const [saving,setSaving]=useState(false);
  const [generating,setGenerating]=useState(false);
  const [stepState,setStepState]=useState({});
  const [error,setError]=useState("");
  const [linkedCounts,setLinkedCounts]=useState(null);
  const [showDetails,setShowDetails]=useState(false);
  const [showMaterials,setShowMaterials]=useState(false);
  const [changingChapter,setChangingChapter]=useState(false);
  const [expanded,setExpanded]=useState(()=>new Set());
  const [editingChapterId,setEditingChapterId]=useState(null);
  const [chapterEditValue,setChapterEditValue]=useState("");
  const [chapterBusy,setChapterBusy]=useState(null);
  const [planGroupChapter,setPlanGroupChapter]=useState(null);
  const [yojanaLesson,setYojanaLesson]=useState(null);
  const [yojanaBusyId,setYojanaBusyId]=useState(null);

  // NEW — generates (or reopens) this chapter's own day-wise Yojana from
  // its APPROVED Plan Group, splitting a merged group's shared plan across
  // its chapters. Saved on the lesson row so it only needs generating once.
  const openYojana=async(l,chapter)=>{
    if(l.yojana){setYojanaLesson(l);return;}
    setYojanaBusyId(l.id);
    try{
      const{data:group}=await db.getPlanGroupForChapter(chapter.id);
      if(!group){alert("पहिले यस अध्यायको आधिकारिक पाठ योजना बनाउनुहोस्।");setYojanaBusyId(null);return;}
      if(group.status!=="approved"){alert("Yojana बनाउनुअघि पाठ योजना स्वीकृत गर्नुपर्छ।");setYojanaBusyId(null);return;}
      const siblingTitles=chapters.filter((c)=>(group.chapter_ids||[]).includes(c.id)&&c.id!==chapter.id).map((c)=>c.title);
      const groupWithTitles={...group,chapter_ids_titles:siblingTitles};
      const ctx=await getMaterialContext(chapter.title,classLabel,l.id);
      const yojana=await gemini.draftYojanaForChapter(chapter.title,groupWithTitles,ctx,classContext);
      const{data:saved,error}=await db.saveLessonYojana(l.id,yojana);
      if(error)throw error;
      await refreshLessons();
      setYojanaLesson(saved);
    }catch(e){alert("त्रुटि: "+(e.message||"Yojana बनाउन सकिएन।"));}
    setYojanaBusyId(null);
  };
  const isEditing=!!form.id;
  const groups=groupLessonsByChapter(chapters,lessons);

  // FIX — nothing used to stop the same पाठ name being saved twice under the
  // same अध्याय: "AI ले यो पाठ बनाओस्" (and the manual save button) always
  // inserted a fresh row whenever form.id was empty, even if a Path with
  // that exact title already existed here. This now goes through the same
  // findExistingLesson() door PathPicker uses (see App.jsx module scope),
  // so the two can never disagree about what counts as a duplicate.
  const findDuplicatePath=(chapterTitle,pathTitle)=>findExistingLesson(lessons,chapterTitle,pathTitle,form.id||null);

  // NEW — अध्याय (Unit) rename/delete, right from Planner where units are
  // now actually created and managed. Both now go through the same single
  // door (useData().renameChapter/deleteChapter) that Materials uses, so
  // there's exactly one implementation of "what happens when a chapter is
  // renamed/deleted" — not two that can quietly drift apart — and both
  // screens' lists refresh together, automatically, every time.
  const renameChapter=async(chapter)=>{
    const title=chapterEditValue.trim();
    if(!title||title===chapter.title){setEditingChapterId(null);return;}
    setChapterBusy(chapter.id);
    await renameChapterCtx(chapter,title);
    setChapterBusy(null);setEditingChapterId(null);
  };
  const deleteChapterInPlanner=async(chapter,e)=>{
    e.stopPropagation();
    setChapterBusy(chapter.id);
    await deleteChapterCtx(chapter);
    setChapterBusy(null);
  };

  // NEW — opening a lesson for editing can be triggered from outside this
  // screen (the "सम्पादन गर्नुहोस्" button inside a lesson's full-screen
  // view). When that happens App() hands us the lesson's id here; once we
  // find it among the lessons already loaded, we populate the form exactly
  // like clicking "Edit" locally would, then tell App() the trigger has
  // been consumed so it doesn't keep re-firing.
  useEffect(()=>{
    if(!editLessonId)return;
    const l=lessons.find((x)=>x.id===editLessonId);
    if(l){
      setForm(lessonToForm(l));setShowForm(true);setShowDetails(true);
      window.scrollTo({top:0,behavior:"smooth"});
    }
    onEditConsumed?.();
  },[editLessonId,lessons,onEditConsumed]);

  // NEW — arriving from the Dashboard's "chapter prepared" card: open the
  // Planner with that chapter already selected, editing the existing plan
  // if there is one instead of risking a duplicate.
  useEffect(()=>{
    if(!prefillChapter)return;
    const existing=lessons.find((l)=>(l.chapters?.title||l.chapter_title)===prefillChapter);
    if(existing)setForm(lessonToForm(existing));
    else setForm({...EMPTY_LESSON_FORM,chapter_title:prefillChapter});
    setShowForm(true);setShowDetails(true);
    window.scrollTo({top:0,behavior:"smooth"});
    onPrefillConsumed?.();
  },[prefillChapter,lessons,onPrefillConsumed]);

  // NEW — shows live counts of what's already linked to the picked chapter
  // (materials / questions / activities), so a teacher can see at a glance
  // whether this chapter has supporting content elsewhere in the app —
  // this is the "different screens feel connected" fix, made reliable now
  // that chapter_id is always resolved correctly (see resolveChapterId).
  useEffect(()=>{
    let cancelled=false;
    const title=form.chapter_title;
    if(!title||!title.trim()){setLinkedCounts(null);return;}
    (async()=>{
      const chapterId=await db.getChapterIdByTitle(title.trim(),classLabel);
      if(cancelled)return;
      if(!chapterId){setLinkedCounts(null);return;}
      const counts=await getChapterLinkedCounts(chapterId);
      if(!cancelled)setLinkedCounts(counts);
    })();
    return()=>{cancelled=true;};
  },[form.chapter_title,classLabel]);

  // FIX — this used to be its own separate fetch (db.getMaterialsByLesson,
  // re-run only when form.id changed), so uploading another file to the
  // SAME already-created Path didn't update the count until the form was
  // reopened. Materials is now one shared list across the whole app (see
  // App()'s loadMaterials), so this just filters it directly — always
  // exactly in sync, no separate fetch or refresh trigger needed at all.
  const matchedCount=useMemo(()=>form.id?(materials||[]).filter((m)=>m.lesson_id===form.id).length:0,[materials,form.id]);

  // NEW — lets material-attach lazily create this Path's row the first
  // time a file is dropped on a brand-new (unsaved) Path, so "सामग्री
  // थप्नुहोस्" works immediately after typing a title, without forcing the
  // teacher to run AI generation first just to get an id to tag against.
  const ensurePath=async()=>{
    if(form.id)return form.id;
    if(!form.chapter_title.trim()||!form.title.trim())return null;
    // FIX — now goes through the same getOrCreateLesson() door PathPicker
    // uses to tag a material, instead of its own separate dup-check +
    // insert. One implementation, so it can't drift from the other again.
    const lesson=await getOrCreateLesson({lessons,chapterTitle:form.chapter_title,pathTitle:form.title,classLabel,sectionId:section?.id||null});
    if(lesson){
      setForm((f)=>({...f,id:lesson.id}));
      // FIX — this created the Path row in the database but used to never
      // tell Planner's own shared lessons list to refresh, so a Path
      // created just by attaching a file (without ever tapping "AI ले यो
      // पाठ बनाओस्") stayed invisible in both this screen's अध्याय list
      // AND समग्री's Path picker until an unrelated refresh happened to
      // fire.
      onRefresh?.();
      return lesson.id;
    }
    return null;
  };

  const startEdit=(l)=>{setForm(lessonToForm(l));setShowForm(true);setShowDetails(true);setShowMaterials(true);setChangingChapter(false);setStepState({});};
  // NEW — chapterTitle is now passed in from whichever अध्याय group's
  // "+ नयाँ पाठ" button was tapped, so the Path being created is always
  // clearly inside a specific Unit — no more guessing/typing the chapter
  // separately after the fact.
  const startNew=(chapterTitle="")=>{setForm({...EMPTY_LESSON_FORM,chapter_title:chapterTitle});setShowForm(true);setShowDetails(false);setShowMaterials(false);setChangingChapter(!chapterTitle);setStepState({});
    window.scrollTo({top:0,behavior:"smooth"});};

  // FIX — THE single door. Was previously three separate implementations
  // (this form's own generate, the dashboard's chapter-prepare card, and a
  // bulk "do every chapter" button) each calling the AI slightly
  // differently. Now this is the only place Planner triggers generation,
  // and it calls the exact same preparePath() every other screen uses —
  // producing the lesson plan AND the questions/activities/rubric for this
  // specific पाठ (Path) in one go, tied to this lesson's own id.
  const autoGenerate=async()=>{
    const chapter=form.chapter_title;
    if(!chapter.trim()){setError("पहिले अध्याय छान्नुहोस्।");return;}
    if(!form.title.trim()){setError("पहिले पाठको नाम लेख्नुहोस्।");return;}
    if(!isEditing){
      const dup=findDuplicatePath(chapter,form.title);
      if(dup){
        if(confirm(`"${dup.title}" नामको पाठ यो अध्यायमा पहिले नै छ। त्यही खोल्ने हो?`)){
          setForm(lessonToForm(dup));setShowDetails(true);setShowMaterials(true);setChangingChapter(false);
        }else setError("यो नामको पाठ पहिले नै अवस्थित छ — फरक नाम प्रयोग गर्नुहोस्।");
        return;
      }
    }
    setGenerating(true);setError("");setStepState({plan:{state:"loading"},questions:{state:"idle"},activities:{state:"idle"},assessment:{state:"idle"}});
    try{
      const {lesson,questionsCount,activitiesCount,gotRubric}=await preparePath({
        chapterTitle:chapter,pathTitle:form.title,lessonId:form.id||null,
        sectionId:section?.id||null,classLabel,classContext,
        onProgress:(step,state,message)=>setStepState((s)=>({...s,[step]:{state,message}})),
      });
      if(lesson){
        setForm(lessonToForm(lesson));
        // FIX — this created/updated the Path in the database (via
        // preparePath) but never told Planner's shared lessons list to
        // refresh, so a Path made through the main "AI ले यो पाठ बनाओस्"
        // button — the most common way to create one — stayed invisible
        // in both this screen's अध्याय list and समग्री's Path picker until
        // an unrelated screen refresh happened to fire. This was very
        // likely the biggest single cause of "Path doesn't show up".
        onRefresh?.();
      }else setError("AI ले डाटा बनाउन सकेन।");
    }catch(e){setError("AI त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!form.title.trim()){setError("पाठको नाम आवश्यक छ।");return;}
    if(!isEditing){
      const dup=findDuplicatePath(form.chapter_title,form.title);
      if(dup){
        if(confirm(`"${dup.title}" नामको पाठ यो अध्यायमा पहिले नै छ। त्यही खोल्ने हो?`)){
          setForm(lessonToForm(dup));setShowDetails(true);setShowMaterials(true);setChangingChapter(false);
        }else setError("यो नामको पाठ पहिले नै अवस्थित छ — फरक नाम प्रयोग गर्नुहोस्।");
        return;
      }
    }
    setSaving(true);setError("");
    // FIX — resolve the real chapter_id (not just the typed title) before
    // saving, so this lesson is actually linked to its chapter everywhere
    // else in the app (materials list, AI matching, chapter hub).
    const chapter_id=await resolveChapterId(form.chapter_title,classLabel);
    const payload={...form,chapter_id,section_id:section?.id||null,class_label:classLabel,
      objectives:form.objectives.split("\n").filter(Boolean),
      vocabulary:form.vocabulary.split(";").map((v)=>v.trim()).filter(Boolean),
      sequence:form.sequence.split("\n").filter(Boolean),
      key_questions:form.key_questions.split("\n").filter(Boolean),
      activities:form.activities.split("\n").filter(Boolean),
    };
    if(!isEditing)delete payload.id; // let the database assign a new id for a fresh lesson
    const{error:err}=await db.upsertLesson(payload);
    setSaving(false);
    if(err){setError(err.message);return;}
    setShowForm(false);
    setForm(EMPTY_LESSON_FORM);
    setShowDetails(false);
    onRefresh();
  };

  const deleteLesson=async(id,e)=>{
    e.stopPropagation();
    if(!confirm("यो पाठ मेटाउने?"))return;
    await db.deleteLesson(id);onRefresh();
  };

  const toggleExpand=(id)=>setExpanded((prev)=>{const next=new Set(prev);next.has(id)?next.delete(id):next.add(id);return next;});

  // NEW — quick inline "+ नयाँ अध्याय", so a fresh Unit can be created right
  // from this screen and immediately shown as an (empty) group ready for
  // its first Path — same add-chapter logic ChapterPicker already used,
  // just surfaced directly here too.
  const [addingChapter,setAddingChapter]=useState(false);
  const [newChapterTitle,setNewChapterTitle]=useState("");
  const submitNewChapter=async()=>{
    if(!newChapterTitle.trim())return;
    const title=newChapterTitle.trim();
    await addChapter(title);
    setAddingChapter(false);setNewChapterTitle("");
    onRefresh();
  };

  return(
    <div className="ss-page" style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <PageHeader icon={ClipboardList} title="पाठ योजना" color={ACCENT} action={
        <Button size="sm" icon={Plus} onClick={()=>setAddingChapter(true)}>नयाँ अध्याय</Button>
      }/>

      {/* NEW — पहिले अध्याय (Unit), त्यसपछि त्यो भित्र धेरै पाठ (Path):
          every अध्याय below can hold several पाठ, expanded/collapsed like
          a folder, instead of one flat list where the two kept blurring
          together. */}
      <div style={{fontSize:14.5,color:INK_SOFT,marginBottom:14,lineHeight:1.5}}>पहिले अध्याय छान्नुहोस् वा खोल्नुहोस्, त्यसपछि त्यो भित्र पाठ थप्नुहोस्। हरेक पाठको आफ्नै छुट्टै योजना, प्रश्न, क्रियाकलाप र मूल्याङ्कन हुन्छ।</div>

      {addingChapter&&(
        <Card style={{marginBottom:14}}>
          <div style={{fontWeight:700,fontSize:16.5,marginBottom:8}}>नयाँ अध्याय</div>
          <div style={{display:"flex",gap:8}}>
            <input autoFocus value={newChapterTitle} onChange={(e)=>setNewChapterTitle(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&submitNewChapter()} placeholder="अध्यायको नाम लेख्नुहोस्" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <button className="ss-btn" onClick={submitNewChapter} disabled={!newChapterTitle.trim()} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16,cursor:"pointer",boxShadow:SHADOW.accent}}>थप्नुहोस्</button>
            <button className="ss-btn" onClick={()=>{setAddingChapter(false);setNewChapterTitle("");}} style={{padding:"10px 14px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer"}}>रद्द</button>
          </div>
        </Card>
      )}

      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <div style={{fontWeight:700,fontSize:18}}>{isEditing?"पाठ सम्पादन गर्नुहोस्":"नयाँ पाठ"}</div>
            {isEditing&&<span style={{fontSize:13.5,background:ACCENT_LIGHT,color:ACCENT,padding:"3px 9px",borderRadius:999,fontWeight:700}}>सम्पादन मोड</span>}
          </div>
          {error&&<ErrorMsg msg={error}/>}
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {/* FIX — the अध्याय picker used to always show as a full
                dropdown, even though it's almost always already known
                (you tapped "+ नयाँ पाठ" inside a specific अध्याय's card).
                Now it's just a plain label in that common case, with a
                small "बदल्नुहोस्" to change it if truly needed — one less
                decision on screen for the normal path. */}
            <div>
              {form.chapter_title&&!changingChapter?(
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:SURFACE_2,borderRadius:12,padding:"11px 14px"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontSize:12.5,color:INK_SOFT,fontWeight:700,marginBottom:1}}>अध्याय</div>
                    <div style={{fontSize:16.5,fontWeight:700,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{form.chapter_title}</div>
                  </div>
                  <button className="ss-icon-btn" type="button" onClick={()=>setChangingChapter(true)} style={{background:"none",border:"none",color:ACCENT,fontWeight:700,fontSize:14.5,cursor:"pointer",flexShrink:0}}>बदल्नुहोस्</button>
                </div>
              ):(
                <>
                  <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>यो पाठ कुन अध्यायमा पर्छ?</div>
                  <ChapterPicker value={form.chapter_title} onChange={(v)=>{setForm({...form,chapter_title:v});setChangingChapter(false);}} placeholder="— अध्याय छान्नुहोस् —"/>
                </>
              )}
            </div>

            <div>
              <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:700,marginBottom:4}}>यो पाठको नाम के हो?</div>
              <input autoFocus={!form.chapter_title} placeholder="जस्तै: सडक सुरक्षा र ट्राफिक नियम" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"12px 14px",fontSize:17,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            </div>

            {/* FIX — this used to sit below the AI generate button, so a
                teacher who already had a lesson plan/PPT ready to attach
                would tap generate first, then notice the attach option
                after — generating from nothing when material to generate
                *from* was one tap away. Attaching material first (if any
                exists) means the generate button below can actually use
                it. */}
            <button className="ss-icon-btn" type="button" onClick={()=>setShowMaterials((v)=>!v)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",color:INK_SOFT,fontWeight:600,fontSize:14.5,cursor:"pointer",padding:"2px 0",alignSelf:"flex-start"}}>
              {showMaterials?<ArrowDown size={14}/>:<ArrowRight size={14}/>}📎 पहिले नै लेसन प्लान/PPT छ भने यहाँ थप्नुहोस् (वैकल्पिक)
            </button>
            {showMaterials&&(
              <div>
                <MaterialsHint count={matchedCount} chapterTitle={form.chapter_title} pathTitle={form.title}/>
                <MaterialAttach chapterTitle={form.chapter_title} lessonId={form.id} onEnsureLessonId={ensurePath}/>
                {linkedCounts&&(
                  <div style={{display:"flex",gap:6,flexWrap:"wrap",marginTop:4}}>
                    <span style={{fontSize:13.5,background:SURFACE_2,color:INK_SOFT,padding:"4px 9px",borderRadius:999,fontWeight:700}}>❓ यो अध्यायमा {linkedCounts.questions} प्रश्न</span>
                    <span style={{fontSize:13.5,background:SURFACE_2,color:INK_SOFT,padding:"4px 9px",borderRadius:999,fontWeight:700}}>🎲 {linkedCounts.activities} क्रियाकलाप</span>
                  </div>
                )}
              </div>
            )}

            {/* FIX — THE single door: one big, obvious button, generates
                the lesson plan AND questions AND activities AND a rubric
                together, all tied to this exact Path. Now sits after the
                attach-materials option above, so if a plan/PPT is already
                attached, this button can draw on it — attach first,
                generate second, not the other way around. */}
            <div>
              <AIButton label={generating?"बनाउँदै...":"✨ AI ले यो पाठ बनाओस्"} onClick={autoGenerate} loading={generating} style={{width:"100%",justifyContent:"center",fontSize:17,padding:"14px"}}/>
              {(generating||Object.keys(stepState).length>0)&&(
                <div style={{marginTop:10,borderTop:`1px solid ${BORDER}`,paddingTop:6}}>
                  {PREP_STEPS.map((s)=><PrepStepRow key={s.id} label={s.label} state={stepState[s.id]?.state||"idle"} message={stepState[s.id]?.message}/>)}
                </div>
              )}
            </div>

            <button className="ss-icon-btn" type="button" onClick={()=>setShowDetails((v)=>!v)} style={{display:"flex",alignItems:"center",gap:5,background:"none",border:"none",color:INK_SOFT,fontWeight:600,fontSize:14.5,cursor:"pointer",padding:"2px 0",alignSelf:"flex-start"}}>
              {showDetails?<ArrowDown size={14}/>:<ArrowRight size={14}/>}✏️ हातैले सम्पादन गर्नुहोस् (उद्देश्य, शब्दावली, गृहकार्य...)
            </button>
            {showDetails&&(
              <>
                {[["homework","गृहकार्य"],["notes","नोट"]].map(([f,p])=>(
                  <input key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
                ))}
                {[["objectives","उद्देश्यहरू (प्रत्येक नयाँ लाइनमा)"],["vocabulary","शब्दावली — यसरी लेख्नुहोस्: शब्द: अर्थ; अर्को शब्द: अर्थ"],["sequence","पढाउने क्रम (प्रत्येक नयाँ लाइनमा)"],["key_questions","मुख्य प्रश्नहरू (प्रत्येक नयाँ लाइनमा)"],["activities","क्रियाकलापहरू (प्रत्येक नयाँ लाइनमा)"]].map(([f,p])=>(
                  <textarea key={f} placeholder={p} value={form[f]} onChange={(e)=>setForm({...form,[f]:e.target.value})} rows={3} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
                ))}
                {/* NEW — "तयार" (ready) status only makes sense once there's
                    something to mark ready; hiding it until a plan exists
                    removes a meaningless decision from a brand-new form. */}
                {form.id&&(
                  <div style={{display:"flex",gap:8}}>
                    {["missing","prep","ready"].map((s)=>{const meta=STATUS_META[s];const active=form.status===s;return(
                      <button key={s} onClick={()=>setForm({...form,status:s})} style={{flex:1,padding:"8px",borderRadius:10,border:`1.5px solid ${active?meta.color:`color-mix(in srgb, ${meta.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${meta.color} 14%, ${SURFACE})`:SURFACE,cursor:"pointer",boxShadow:active?`0 4px 10px color-mix(in srgb, ${meta.color} 25%, transparent)`:"none"}}><StatusPill status={s}/></button>
                    );})}
                  </div>
                )}
              </>
            )}
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>{setShowForm(false);setForm(EMPTY_LESSON_FORM);setShowDetails(false);setShowMaterials(false);setChangingChapter(false);setStepState({});}} className="ss-btn" style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":isEditing?"परिवर्तन सुरक्षित गर्नुहोस्":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}

      {loading?<Spinner/>:groups.length===0?<EmptyState icon={ClipboardList} text="अझै कुनै अध्याय छैन।" actionLabel="पहिलो अध्याय थप्नुहोस्" onAction={()=>setAddingChapter(true)}/>:(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {groups.map(({chapter,paths,unassigned},gi)=>{
            const isOpen=expanded.has(chapter.id);
            const chapColor=unassigned?DANGER:PALETTE[gi%PALETTE.length];
            return(
              <Card key={chapter.id} accentColor={unassigned?DANGER:chapColor} style={unassigned?{padding:0,overflow:"hidden",border:`1.5px dashed ${DANGER}`}:{padding:0,overflow:"hidden"}}>
                <div onClick={()=>editingChapterId!==chapter.id&&toggleExpand(chapter.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"14px 16px",cursor:"pointer"}}>
                  {editingChapterId===chapter.id?(
                    <div style={{display:"flex",gap:6,flex:1,minWidth:0}} onClick={(e)=>e.stopPropagation()}>
                      <input autoFocus value={chapterEditValue} onChange={(e)=>setChapterEditValue(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&renameChapter(chapter)} className="ss-field" style={{flex:1,minWidth:0,borderRadius:10,padding:"7px 10px",fontSize:16,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
                      <button className="ss-btn" onClick={()=>renameChapter(chapter)} disabled={chapterBusy===chapter.id} style={{padding:"7px 12px",borderRadius:999,border:"none",background:ACCENT,color:"#fff",fontWeight:700,cursor:"pointer"}}>✓</button>
                      <button className="ss-btn" onClick={()=>setEditingChapterId(null)} style={{padding:"7px 12px",borderRadius:999,border:`1px solid ${BORDER}`,background:SURFACE,cursor:"pointer"}}>✕</button>
                    </div>
                  ):(
                    <>
                      <div style={{display:"flex",alignItems:"center",gap:10,minWidth:0,flex:1}}>
                        <div style={{width:30,height:30,borderRadius:10,flexShrink:0,background:`linear-gradient(155deg, ${chapColor} 0%, color-mix(in srgb, ${chapColor} 65%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",transform:"rotate(-3deg)"}}>{isOpen?<ArrowDown size={15} color="#fff" style={{transform:"rotate(3deg)"}}/>:<ArrowRight size={15} color="#fff" style={{transform:"rotate(3deg)"}}/>}</div>
                        <div style={{fontWeight:700,fontSize:17,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>{chapter.title}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                        <span style={{fontSize:13.5,background:paths.length?`color-mix(in srgb, ${chapColor} 18%, transparent)`:SURFACE_2,color:paths.length?chapColor:INK_SOFT,padding:"3px 10px",borderRadius:999,fontWeight:700}}>{paths.length} पाठ</span>
                        {!unassigned&&<button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();setEditingChapterId(chapter.id);setChapterEditValue(chapter.title);}} title="नाम बदल्नुहोस्" style={{cursor:"pointer",color:INK_SOFT,padding:4}}><PenSquare size={15}/></button>}
                        {!unassigned&&<button className="ss-icon-btn" onClick={(e)=>deleteChapterInPlanner(chapter,e)} disabled={chapterBusy===chapter.id} title="मेटाउनुहोस्" style={{cursor:"pointer",color:DANGER,padding:4}}><Trash2 size={15}/></button>}
                      </div>
                    </>
                  )}
                </div>
                {isOpen&&(
                  <div style={{padding:"0 16px 16px",display:"flex",flexDirection:"column",gap:8}}>
                    {unassigned&&<div style={{fontSize:13.5,color:DANGER,background:"color-mix(in srgb, "+DANGER+" 12%, transparent)",borderRadius:8,padding:"8px 10px"}}>यी पाठहरू कुनै अध्यायसँग जोडिएका छैनन् (पुरानो डाटा)। प्रत्येक खोलेर सम्पादन गर्नुहोस् र सही अध्याय छान्नुहोस्, अनि सुरक्षित गर्नुहोस् — त्यसपछि यो माथिको ठीक अध्याय समूहमा सर्नेछ।</div>}
                    {paths.length===0&&<div style={{fontSize:14.5,color:INK_SOFT,padding:"4px 0 8px"}}>यो अध्यायमा अझै कुनै पाठ छैन।</div>}
                    {paths.map((l)=>(
                      <div key={l.id} onClick={()=>onOpenLesson(l)} style={{display:"flex",alignItems:"center",gap:8,background:SURFACE_2,borderRadius:10,padding:"10px 12px",cursor:"pointer"}}>
                        <div style={{flex:1,minWidth:0,fontWeight:700,fontSize:16,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.title}</div>
                        <StatusPill status={l.status}/>
                        <button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();openYojana(l,chapter);}} title="Yojana" disabled={yojanaBusyId===l.id} style={{cursor:"pointer",color:l.yojana?ACCENT:INK_SOFT,padding:4}}><CalendarDays size={15}/></button>
                        <button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();startEdit(l);}} title="सम्पादन गर्नुहोस्" style={{cursor:"pointer",color:INK_SOFT,padding:4}}><PenSquare size={15}/></button>
                        <button className="ss-icon-btn" onClick={(e)=>{e.stopPropagation();onOpenLesson(l,{autoPrint:true});}} title="प्रिन्ट गर्नुहोस्" style={{cursor:"pointer",color:INK_SOFT,padding:4}}><Printer size={15}/></button>
                        <button className="ss-icon-btn" onClick={(e)=>deleteLesson(l.id,e)} title="मेटाउनुहोस्" style={{cursor:"pointer",color:INK_SOFT,padding:4}}><Trash2 size={15}/></button>
                      </div>
                    ))}
                    {!unassigned&&<button className="ss-btn" onClick={()=>setPlanGroupChapter(chapter)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:VIOLET_LIGHT,border:"none",color:VIOLET,borderRadius:10,padding:"10px",fontWeight:700,fontSize:15,cursor:"pointer"}}><ClipboardList size={14}/>आधिकारिक पाठ योजना / रुब्रिक्स</button>}
                    {!unassigned&&<button className="ss-btn" onClick={()=>startNew(chapter.title)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,background:"none",border:`1.5px dashed ${BORDER}`,color:ACCENT,borderRadius:10,padding:"10px",fontWeight:700,fontSize:15,cursor:"pointer"}}><Plus size={14}/>नयाँ पाठ थप्नुहोस्</button>}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {planGroupChapter&&<PlanGroupModal chapter={planGroupChapter} allChapters={chapters} lessons={lessons} classLabel={classLabel} classContext={classContext} onClose={()=>setPlanGroupChapter(null)}/>}
      {yojanaLesson&&<YojanaSheet lesson={yojanaLesson} onClose={()=>setYojanaLesson(null)}/>}
    </div>
  );
}

function CategoryPicker({ value, onChange }) {
  return(
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))",gap:7}}>
      {CATEGORY_ORDER.map((key)=>{
        const meta=CATEGORY_META[key];const Icon=meta.icon;const active=value===key;
        return(
          <button key={key} type="button" onClick={()=>onChange(key)} className="ss-chip" style={{display:"flex",flexDirection:"column",alignItems:"center",gap:7,padding:"12px 6px",borderRadius:14,border:`1.5px solid ${active?meta.color:`color-mix(in srgb, ${meta.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${meta.color} 14%, ${SURFACE})`:SURFACE,color:active?meta.color:INK,fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:active?`0 6px 16px color-mix(in srgb, ${meta.color} 30%, transparent)`:SHADOW.sm}}>
            <div style={{width:38,height:38,borderRadius:11,background:`linear-gradient(160deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${meta.color} 40%, transparent)`}}><Icon size={18} color="#fff"/></div>
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

// FIX — Materials had its own separate copy of `lessons`, fetched only for
// its Path pickers. Creating a new Path from here updated that local copy
// but never touched Planner's own `lessons` state up in App — so a Path
// created from समग्री only ever showed up in योजना after a full app
// reload. Materials now shares the SAME `lessons` (and its refresh
// function) that Planner uses, one source of truth for both screens.
// FIX — Materials had its own separate copy of both `lessons` (for its
// Path pickers) and `materials` (its main list) — each fetched only for
// this screen, so anything created or uploaded elsewhere (Planner, Question
// Bank, Activities, Assessment) never told Materials to refresh. A Path or
// a file could exist correctly in the database and still be invisible here
// until the app fully reloaded. Materials now receives BOTH as shared
// state from App(), same source of truth every other screen reads from —
// no separate copies left anywhere to fall out of sync.
function Materials({ classLabel }) {
  const { chapters, lessons, materials, materialsLoading, refreshMaterials, uploadMaterial, retagMaterial: retagMaterialCtx, deleteMaterial } = useData();
  const [uploading,setUploading]=useState(false);
  const [query,setQuery]=useState("");
  const [preview,setPreview]=useState(null);
  const [previewUrl,setPreviewUrl]=useState("");
  const [previewError,setPreviewError]=useState("");
  const [error,setError]=useState("");
  const [syncing,setSyncing]=useState(false);
  const [uploadChapter,setUploadChapter]=useState("");
  const [uploadCategory,setUploadCategory]=useState("lesson_plan");
  // NEW — filename auto-tagging: files chosen now go into a review list
  // (one row per file, category + chapter pre-filled from the filename
  // when detected) instead of uploading immediately with one category/
  // chapter applied to the whole batch. Nothing is uploaded until the
  // teacher confirms the review.
  const [pendingFiles,setPendingFiles]=useState(null);
  const [pendingError,setPendingError]=useState("");
  const [tagging,setTagging]=useState(null);
  const [tagValue,setTagValue]=useState("");
  const [tagCategory,setTagCategory]=useState("other");
  const [retagging,setRetagging]=useState(false);
  const [categoryFilter,setCategoryFilter]=useState("all");
  // NEW — filtering was category-only; a teacher with many chapters had no
  // way to jump straight to "everything for Chapter 4" without typing its
  // exact name into search. This mirrors the chapter-based browsing the
  // Planner now has, so Materials and Planner pivot around the same
  // concept instead of feeling like separate apps.
  const [chapterFilter,setChapterFilter]=useState("all"); // "all" | "untagged" | chapter id
  const [sortBy,setSortBy]=useState("newest");
  // FIX — "अध्याय व्यवस्थापन" (rename/delete a chapter) used to be its own
  // collapsible card here too, duplicating what योजना's own chapter list
  // already does (rename, delete, same underlying single-door functions).
  // Two places to rename or delete the same chapter, with no reason to
  // prefer one over the other, is confusing rather than convenient —
  // chapter administration lives in योजना now; here below is just the
  // अध्याय filter for browsing files, which is a materials-specific job.
  // NEW — multi-file upload progress ("3 / 7 अपलोड हुँदै"), since the file
  // picker below now accepts several files at once instead of one at a time.
  const [uploadProgress,setUploadProgress]=useState(null);

  const loading=materialsLoading;
  const load=refreshMaterials;
  const sync=async()=>{setSyncing(true);await load();setSyncing(false);};

  // NEW — file selection no longer uploads immediately. It builds one
  // review row per file with category + chapter pre-filled by
  // detectCategoryFromName/guessChapterFromUnitLesson, falling back to
  // whatever was picked in the "यो फाइल कस्तो प्रकारको हो?" section above
  // when a file's name doesn't clearly say. The teacher reviews (and can
  // change) each row before anything actually uploads.
  const selectFiles=(e)=>{
    const files=Array.from(e.target.files||[]);
    e.target.value="";
    if(!files.length)return;
    const rows=files.map((file,i)=>{
      const detectedCategory=detectCategoryFromName(file.name);
      const unitLesson=detectUnitLessonFromName(file.name);
      const guessedChapter=guessChapterFromUnitLesson(unitLesson,chapters||[]);
      return{
        _key:`f${i}-${file.name}`,
        file,
        name:file.name,
        category:detectedCategory||uploadCategory,
        categoryAuto:!!detectedCategory,
        chapterTitle:guessedChapter?.title||uploadChapter||"",
        chapterAuto:!!guessedChapter,
        pathId:null,
        unitLessonHint:unitLesson?`U${unitLesson.unit}L${unitLesson.lesson}`:null,
      };
    });
    setPendingError("");
    setPendingFiles(rows);
  };

  const updatePendingRow=(key,patch)=>setPendingFiles((prev)=>prev.map((r)=>r._key===key?{...r,...patch}:r));

  const confirmPendingUpload=async()=>{
    if(!pendingFiles?.length)return;
    if(pendingFiles.some((r)=>!r.chapterTitle.trim())){
      setPendingError("हरेक फाइलको लागि अध्याय छान्नुहोस् — केही फाइलमा अझै छानिएको छैन।");
      return;
    }
    // FIX — materials belong to a specific पाठ (Path), not the whole
    // अध्याय (Unit): a lesson plan, PPT, or any other file is always for
    // one particular lesson, so every file now needs a Path picked (or
    // created) before it can upload — no more "applies to the whole
    // chapter" option, which is what made AI context matching hochpotch
    // (a file for Path 2 was bleeding into Path 1's generation).
    if(pendingFiles.some((r)=>!r.pathId)){
      setPendingError("हरेक फाइलको लागि पाठ पनि छान्नुहोस् वा नयाँ बनाउनुहोस् — केही फाइलमा अझै छानिएको छैन।");
      return;
    }
    setUploading(true);setError("");setPendingError("");
    // FIX — this loop used to duplicate MaterialAttach's upload logic
    // (extraction, chapter resolution, storage upload) almost line for
    // line, with the two slowly drifting apart. Both now call the exact
    // same useData().uploadMaterial() door.
    let failedNames=[];
    for(let i=0;i<pendingFiles.length;i++){
      const row=pendingFiles[i];
      const file=row.file;
      setUploadProgress(pendingFiles.length>1?{current:i+1,total:pendingFiles.length,name:file.name}:null);
      const{error:err,warning}=await uploadMaterial({file,chapterTitle:row.chapterTitle.trim(),lessonId:row.pathId,category:row.category});
      if(err){failedNames.push(warning||`${file.name} (${err.message})`);continue;}
      if(warning)failedNames.push(warning);
    }
    if(failedNames.length)setError(failedNames.join(" · "));
    setUploading(false);setUploadProgress(null);setPendingFiles(null);
  };

  const deleteMat=async(mat)=>{
    if(!confirm(`"${mat.name}" मेटाउने?`))return;
    await deleteMaterial(mat);
  };

  // NEW — PDFs/docs/sheets now skip the in-app iframe/Google-viewer preview
  // entirely and open directly in a new tab. Embedding those in an <iframe>
  // depends on the browser having a native PDF plugin (desktop Chrome has
  // one; most mobile browsers/WebViews don't render it reliably inside an
  // iframe at all), which is what was causing "opens as a download instead
  // of previewing". Direct tab navigation is the one thing every browser —
  // mobile included — handles correctly for these file types.
  //
  // The blank tab is opened SYNCHRONOUSLY, in the same click, before any
  // `await` — opening it after the async URL fetch resolves gets treated as
  // an untrusted popup and silently blocked on many mobile browsers, which
  // is the other classic cause of "I tap it and nothing happens".
  const openPreview=(mat)=>{
    const directOpen=["pdf","doc","pptx","sheet"].includes(mat.file_type);
    const win=directOpen?window.open("","_blank"):null;
    if(!directOpen){setPreview(mat);setPreviewUrl("");setPreviewError("");}
    (async()=>{
      try{
        const url=await Promise.race([
          db.getMaterialUrl(mat.storage_path),
          new Promise((_,reject)=>setTimeout(()=>reject(new Error("timeout")),12000)),
        ]);
        if(!url){
          win?.close();setPreview(mat);setPreviewUrl("");
          setPreviewError("यो फाइलको लिङ्क तयार गर्न सकिएन।");
          return;
        }
        if(directOpen){ if(win)win.location.href=url; else window.open(url,"_blank"); }
        else setPreviewUrl(url);
      }catch(e){
        win?.close();setPreview(mat);setPreviewUrl("");
        setPreviewError(e.message==="timeout"?"लिङ्क तयार गर्न धेरै समय लाग्यो। फेरि प्रयास गर्नुहोस्।":"लिङ्क तयार गर्दा त्रुटि भयो। फेरि प्रयास गर्नुहोस्।");
      }
    })();
  };

  // NEW: tag (or re-tag) an already-uploaded material's chapter + category.
  // If it's a docx/pptx/xlsx uploaded before this feature existed and has
  // no extracted_text yet, re-download it and extract now.
  const [tagPathId,setTagPathId]=useState(null);
  const openTagEditor=(mat)=>{
    setTagging(mat);setTagValue(mat.chapters?.title||"");setTagCategory(mat.category||"other");setTagPathId(mat.lesson_id||null);setTagError("");
  };

  const [tagError,setTagError]=useState("");
  const saveTag=async()=>{
    if(!tagging||!tagValue.trim())return;
    // FIX — same "must belong to a पाठ, not the whole अध्याय" rule as new
    // uploads: re-tagging can't leave a file chapter-wide either, or it
    // silently falls back to bleeding into every Path's AI context again.
    if(!tagPathId){setTagError("पाठ पनि छान्नुहोस् वा नयाँ बनाउनुहोस्।");return;}
    setRetagging(true);setTagError("");
    try{
      const{error:err}=await retagMaterialCtx({material:tagging,chapterTitle:tagValue.trim(),lessonId:tagPathId,category:tagCategory});
      if(err)throw err;
      setRetagging(false);setTagging(null);
    }catch(e){
      // FIX — this used to have no error handling at all: if anything
      // above threw, retagging stayed stuck at "true" forever (button
      // permanently disabled) and the modal never closed or showed why —
      // it just sat there looking unresponsive.
      setRetagging(false);setTagError(e.message||"त्रुटि भयो। फेरि प्रयास गर्नुहोस्।");
    }
  };

  const filtered=useMemo(()=>{
    const q=query.trim().toLowerCase();
    let list=materials;
    if(categoryFilter!=="all") list=list.filter((m)=>(m.category||"other")===categoryFilter);
    if(chapterFilter==="untagged") list=list.filter((m)=>!m.chapter_id);
    else if(chapterFilter!=="all") list=list.filter((m)=>m.chapter_id===chapterFilter);
    if(q) list=list.filter((m)=>m.name.toLowerCase().includes(q));
    list=[...list].sort((a,b)=>{
      if(sortBy==="name") return a.name.localeCompare(b.name);
      return new Date(b.created_at||0)-new Date(a.created_at||0);
    });
    return list;
  },[materials,query,categoryFilter,chapterFilter,sortBy]);

  const untaggedCount=materials.filter((m)=>!m.chapters?.title).length;
  const categoryCounts=useMemo(()=>{
    const counts={};
    CATEGORY_ORDER.forEach((k)=>{counts[k]=0;});
    materials.forEach((m)=>{const k=m.category||"other";counts[k]=(counts[k]||0)+1;});
    return counts;
  },[materials]);

  return(
    <div className="ss-page" style={{padding:"20px 18px 130px",maxWidth:1040,margin:"0 auto"}}>
      <PageHeader icon={FolderKanban} title="सामग्री पुस्तकालय" color={ROSE} action={
        <Button variant="secondary" size="sm" icon={RefreshCw} onClick={sync} disabled={syncing}>{syncing?"...":"सिंक"}</Button>
      }/>
      {error&&<ErrorMsg msg={error}/>}
      {untaggedCount>0&&(
        <div onClick={()=>setChapterFilter("untagged")} style={{background:WARN_BG,borderRadius:14,padding:"11px 16px",fontSize:16,color:WARN,margin:"12px 0",display:"flex",alignItems:"center",gap:8,fontWeight:600,cursor:"pointer"}}>
          <Tag size={15}/>{untaggedCount} फाइलमा अध्याय तोकिएको छैन — AI ले ती फाइल प्रयोग गर्न सक्दैन। हेर्न यहाँ थिच्नुहोस्।
        </div>
      )}

      <Card accentColor={ROSE} style={{marginBottom:16,marginTop:12}}>
        <div style={{fontSize:16.5,fontWeight:700,color:INK,marginBottom:8}}>नयाँ फाइल थप्नुहोस्</div>
        <div style={{fontSize:15,color:INK_SOFT,marginBottom:12}}>तल थिचेर आफ्नो फोनबाट फाइल छान्नुहोस् (लेसन प्लान, PPT, जे भए पनि) — कुन अध्याय र पाठको हो भनेर पछि सोध्नेछौं।</div>
        <label className="ss-btn" style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,background:`linear-gradient(160deg, ${ROSE} 0%, color-mix(in srgb, ${ROSE} 72%, black) 100%)`,color:"#fff",border:"none",borderRadius:999,padding:"14px",fontSize:17,fontWeight:700,cursor:"pointer",boxShadow:`0 4px 12px color-mix(in srgb, ${ROSE} 22%, transparent)`}}>
          <Plus size={17}/>फाइल छान्नुहोस्
          <input type="file" multiple onChange={selectFiles} style={{display:"none"}} accept=".pdf,.pptx,.ppt,.doc,.docx,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.mp4,.mp3"/>
        </label>
      </Card>

      {pendingFiles&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",zIndex:70,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>!uploading&&setPendingFiles(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:20,padding:"24px 26px",maxWidth:"min(94vw, 880px)",width:"100%",maxHeight:"90vh",overflowY:"auto",boxSizing:"border-box",boxShadow:SHADOW.lg,fontSize:"clamp(15px, 1.6vw, 17px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:19,fontWeight:800,color:INK}}>{pendingFiles.length} फाइल — समीक्षा गर्नुहोस्</div>
              <IconButton icon={X} onClick={()=>!uploading&&setPendingFiles(null)} size={20}/>
            </div>
            <div style={{fontSize:14.5,color:INK_SOFT,marginBottom:14}}>फाइलनामबाट पत्ता लागेका प्रकार/अध्याय <Sparkles size={11} style={{display:"inline",verticalAlign:"-1px"}}/> चिन्हसहित देखिन्छन्। पत्ता नलागेकालाई आफैं छान्नुहोस्।</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {pendingFiles.map((row)=>(
                <div key={row._key} style={{border:`1.5px solid ${BORDER}`,borderRadius:12,padding:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:9,fontSize:15,fontWeight:700,color:INK,overflow:"hidden"}}>
                    <FileText size={14} color={INK_SOFT} style={{flexShrink:0}}/>
                    <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{row.name}</span>
                    {row.unitLessonHint&&<span style={{flexShrink:0,fontSize:12.5,fontWeight:700,color:ACCENT,background:ACCENT_LIGHT,borderRadius:999,padding:"2px 8px"}}>{row.unitLessonHint}</span>}
                  </div>
                  <div style={{marginBottom:8}}>
                    <div style={{fontSize:12.5,fontWeight:700,color:INK_SOFT,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.03em"}}>प्रकार</div>
                    {/* FIX — this used to always show the full category
                        picker even though it's auto-detected correctly most
                        of the time; now it's a plain badge you only need to
                        touch if the guess is wrong. */}
                    {row.categoryEditing?(
                      <CategoryPicker value={row.category} onChange={(v)=>updatePendingRow(row._key,{category:v,categoryAuto:false,categoryEditing:false})}/>
                    ):(
                      <div onClick={()=>updatePendingRow(row._key,{categoryEditing:true})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:SURFACE_2,borderRadius:10,padding:"9px 12px",cursor:"pointer"}}>
                        <span style={{fontSize:15,fontWeight:600,color:INK,display:"flex",alignItems:"center",gap:5}}>{CATEGORY_META[row.category]?.label||row.category}{row.categoryAuto&&<Sparkles size={12} color={ACCENT}/>}</span>
                        <span style={{fontSize:13.5,color:ACCENT,fontWeight:700,flexShrink:0}}>बदल्नुहोस्</span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{fontSize:12.5,fontWeight:700,color:INK_SOFT,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.03em"}}>अध्याय</div>
                    {row.chapterTitle&&!row.chapterEditing?(
                      <div onClick={()=>updatePendingRow(row._key,{chapterEditing:true})} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,background:SURFACE_2,borderRadius:10,padding:"9px 12px",cursor:"pointer"}}>
                        <span style={{fontSize:15,fontWeight:600,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:5}}>{row.chapterTitle}{row.chapterAuto&&<Sparkles size={12} color={ACCENT} style={{flexShrink:0}}/>}</span>
                        <span style={{fontSize:13.5,color:ACCENT,fontWeight:700,flexShrink:0}}>बदल्नुहोस्</span>
                      </div>
                    ):(
                      <ChapterPicker value={row.chapterTitle} onChange={(v)=>updatePendingRow(row._key,{chapterTitle:v,chapterAuto:false,chapterEditing:false,pathId:null})} placeholder="अध्याय छान्नुहोस् *"/>
                    )}
                  </div>
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:12.5,fontWeight:700,color:INK_SOFT,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.03em"}}>पाठ *</div>
                    <PathPicker value={row.pathId} onChange={(v)=>updatePendingRow(row._key,{pathId:v})} chapterTitle={row.chapterTitle}/>
                  </div>
                </div>
              ))}
            </div>
            {pendingError&&<div style={{background:DANGER_BG,color:DANGER,borderRadius:10,padding:"9px 12px",fontSize:14.5,fontWeight:600,marginTop:12}}>{pendingError}</div>}
            <div style={{display:"flex",gap:8,marginTop:16}}>
              <button className="ss-btn" onClick={()=>setPendingFiles(null)} disabled={uploading} style={{padding:"12px 16px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:700,cursor:uploading?"default":"pointer"}}>रद्द</button>
              <button className="ss-btn" onClick={confirmPendingUpload} disabled={uploading} style={{flex:1,padding:"12px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:uploading?"default":"pointer",boxShadow:SHADOW.accent}}>{uploading?(uploadProgress?`अपलोड हुँदै... (${uploadProgress.current}/${uploadProgress.total})`:"अपलोड हुँदै..."):"अपलोड गर्नुहोस्"}</button>
            </div>
          </div>
        </div>
      )}

      <div style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:12}}>
        <Chip onClick={()=>setCategoryFilter("all")} active={categoryFilter==="all"} size="lg">सबै ({materials.length})</Chip>
        {CATEGORY_ORDER.map((key)=>{
          const meta=CATEGORY_META[key];const Icon=meta.icon;const active=categoryFilter===key;
          return(
            <Chip key={key} onClick={()=>setCategoryFilter(key)} active={active} color={meta.color} icon={Icon} size="lg">{meta.label} ({categoryCounts[key]||0})</Chip>
          );
        })}
      </div>

      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <div style={{flex:1,minWidth:180,display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 14px"}}>
          <Search size={16} color={INK_SOFT}/>
          <input value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="फाइल खोज्नुहोस्..." style={{border:"none",outline:"none",fontSize:16.5,flex:1,minWidth:0,background:"transparent",color:INK,caretColor:ACCENT,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}/>
        </div>
        {/* NEW — browse materials by chapter, same concept the Planner now
            uses, instead of only being able to filter by file category. */}
        <select value={chapterFilter} onChange={(e)=>setChapterFilter(e.target.value)} style={{border:`1px solid ${chapterFilter!=="all"?ACCENT:BORDER}`,borderRadius:12,padding:"11px 14px",fontSize:16,fontFamily:"'SSText','Kalimati','Times New Roman',serif",background:chapterFilter!=="all"?ACCENT_LIGHT:SURFACE,color:chapterFilter!=="all"?ACCENT:INK,fontWeight:600}}>
          <option value="all">सबै अध्याय</option>
          <option value="untagged">अध्याय नतोकिएका</option>
          {(chapters||[]).map((c)=><option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        <select value={sortBy} onChange={(e)=>setSortBy(e.target.value)} style={{border:`1px solid ${BORDER}`,borderRadius:12,padding:"11px 14px",fontSize:16,fontFamily:"'SSText','Kalimati','Times New Roman',serif",background:SURFACE,color:INK,fontWeight:600}}>
          <option value="newest">नयाँ पहिले</option>
          <option value="name">नाम अनुसार (क-ज्ञ)</option>
        </select>
      </div>

      {loading?<Spinner/>:filtered.length===0?(
        <EmptyState icon={FileText} text={query?`"${query}" फेला परेन।`:chapterFilter!=="all"?"यो फिल्टरमा कुनै फाइल छैन।":"यो श्रेणीमा फाइल थपिएको छैन।"}/>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
          {filtered.map((f)=>{
            const meta=FILE_TYPE_META[f.file_type]||FILE_TYPE_META.doc;const Icon=meta.icon;
            const catMeta=CATEGORY_META[f.category||"other"];const CatIcon=catMeta.icon;
            const needsExtraction=["doc","sheet","pptx"].includes(f.file_type);
            return(
              <Card key={f.id} accentColor={catMeta.color} style={{padding:14,paddingTop:46,position:"relative",overflow:"visible"}}>
                <PinBadge color={catMeta.color}/>
                <div style={{position:"absolute",top:6,right:6,display:"flex",gap:2,zIndex:2}}>
                  <button className="ss-btn" onClick={()=>openTagEditor(f)} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:f.chapters?.title?ACCENT:"#C7A34A",boxShadow:SHADOW.sm}} title="अध्याय/प्रकार तोक्नुहोस्"><Tag size={18}/></button>
                  <button className="ss-btn" onClick={()=>deleteMat(f)} style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:INK_SOFT,boxShadow:SHADOW.sm}}><Trash2 size={18}/></button>
                </div>
                {/* FIX — onClick now lives only on this inner block, not on
                    the Card. The tag/delete buttons above are a sibling
                    with no shared clickable ancestor, so tapping them can
                    never also trigger the preview modal — no reliance on
                    stopPropagation timing at all. */}
                <div onClick={()=>openPreview(f)} style={{cursor:"pointer"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:9}}>
                    <div style={{width:40,height:40,borderRadius:11,background:`linear-gradient(160deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${meta.color} 40%, transparent)`}}><Icon size={19} color="#fff"/></div>
                    <div style={{fontSize:13.5,background:tint(catMeta.color,15),color:catMeta.color,padding:"3px 9px",borderRadius:999,fontWeight:700,display:"flex",alignItems:"center",gap:4,border:`1px solid color-mix(in srgb, ${catMeta.color} 30%, transparent)`}}><CatIcon size={11}/>{catMeta.label}</div>
                  </div>
                  <div style={{fontSize:16,fontWeight:700,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{f.name}</div>
                  <div style={{fontSize:14,color:INK_SOFT,marginBottom:6,fontWeight:600}}>{f.file_type?.toUpperCase()}</div>
                  {f.chapters?.title?(
                    <span style={{fontSize:13.5,background:ACCENT_LIGHT,color:ACCENT,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom"}}>{f.chapters.title}</span>
                  ):(
                    <span style={{fontSize:13.5,background:WARN_BG,color:WARN,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block"}}>अध्याय छैन</span>
                  )}
                  {f.lessons?.title?(
                    <span style={{fontSize:13.5,background:SURFACE_2,color:INK_SOFT,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",verticalAlign:"bottom",marginLeft:4,marginTop:4}}>📍{f.lessons.title}</span>
                  ):(
                    // NEW — materials uploaded before Path tagging existed
                    // (or via the old chapter-wide option) show this so a
                    // teacher can see at a glance which files still need a
                    // Path assigned via the 🏷 button.
                    <span style={{fontSize:13.5,background:WARN_BG,color:WARN,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block",marginLeft:4,marginTop:4}}>पाठ छैन</span>
                  )}
                  {needsExtraction&&f.extraction_status==="done"&&<div style={{fontSize:13.5,color:ACCENT,marginTop:5,fontWeight:700}}>✓ AI तयार</div>}
                  {needsExtraction&&f.extraction_status==="failed"&&<div style={{fontSize:13.5,color:DANGER,marginTop:5,fontWeight:700}}>⚠ टेक्स्ट निकाल्न सकिएन</div>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {preview&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.6)",backdropFilter:"blur(28px)",WebkitBackdropFilter:"blur(28px)",zIndex:60,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setPreview(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:18,padding:24,maxWidth:"min(95vw, 1100px)",width:"100%",maxHeight:"95vh",display:"flex",flexDirection:"column",boxSizing:"border-box",boxShadow:SHADOW.lg,fontSize:"clamp(15px, 1.6vw, 17px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:18,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingRight:10}}>{preview.name}</div>
              <IconButton icon={X} onClick={()=>setPreview(null)} size={20}/>
            </div>
            {!previewUrl&&!previewError?(
              <div style={{textAlign:"center",padding:20,color:INK_SOFT,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}><Spinner small/>लिङ्क तयार गर्दै...</div>
            ):previewError?(
              <div style={{textAlign:"center",padding:20,display:"flex",flexDirection:"column",alignItems:"center",gap:10}}>
                <AlertCircle size={28} color={DANGER}/>
                <div style={{color:DANGER,fontSize:16,fontWeight:600}}>{previewError}</div>
                <button className="ss-btn" onClick={()=>openPreview(preview)} style={{display:"flex",alignItems:"center",gap:6,background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"9px 16px",fontWeight:700,fontSize:15,cursor:"pointer",boxShadow:SHADOW.accent}}><RotateCw size={14}/>फेरि प्रयास गर्नुहोस्</button>
              </div>
            ):(
              <div style={{flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12}}>
                {preview.file_type==="image"&&(
                  <img src={previewUrl} alt={preview.name} style={{width:"100%",borderRadius:12}}/>
                )}
                {preview.file_type==="video"&&(
                  <video src={previewUrl} controls style={{width:"100%",borderRadius:12}}/>
                )}
                {preview.file_type==="audio"&&(
                  <audio src={previewUrl} controls style={{width:"100%"}}/>
                )}
                <Button variant="primary" onClick={()=>window.open(previewUrl,"_blank")} style={{width:"100%"}}>नयाँ ट्याबमा खोल्नुहोस् / डाउनलोड गर्नुहोस्</Button>
              </div>
            )}
          </div>
        </div>
      )}
      {tagging&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.6)",backdropFilter:"blur(28px)",WebkitBackdropFilter:"blur(28px)",zIndex:65,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setTagging(null)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:18,padding:28,maxWidth:"min(92vw, 620px)",width:"100%",maxHeight:"90vh",overflowY:"auto",WebkitOverflowScrolling:"touch",boxSizing:"border-box",boxShadow:SHADOW.lg,fontSize:"clamp(15px, 1.6vw, 17px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:12}}>
              <div style={{fontSize:18,fontWeight:700}}>अध्याय र प्रकार तोक्नुहोस्</div>
              <IconButton icon={X} onClick={()=>setTagging(null)} size={20}/>
            </div>
            <div style={{fontSize:16,color:INK_SOFT,marginBottom:14}}>{tagging.name}</div>
            {tagError&&<ErrorMsg msg={tagError}/>}
            <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.03em"}}>प्रकार</div>
            <CategoryPicker value={tagCategory} onChange={setTagCategory}/>
            <div style={{height:14}}/>
            <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.03em"}}>अध्याय</div>
            <ChapterPicker value={tagValue} onChange={(v)=>{setTagValue(v);setTagPathId(null);}} placeholder="— अध्याय छान्नुहोस् —"/>
            <div style={{height:14}}/>
            <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.03em"}}>पाठ *</div>
            <PathPicker value={tagPathId} onChange={setTagPathId} chapterTitle={tagValue}/>
            <div style={{height:16}}/>
            <Button variant="primary" onClick={saveTag} disabled={retagging} style={{width:"100%"}}>{retagging?"प्रशोधन गर्दै...":"सुरक्षित गर्नुहोस्"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeworkManager({ section, loading, homework, onRefresh, classLabel }) {
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({title:"",total_students:30,remark:""});
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(!form.title.trim())return;setSaving(true);
    // FIX — class_label was never set here, so every गृहकार्य saved
    // regardless of which class you were viewing when you added it.
    await db.upsertHomework({...form,section_id:section?.id||null,checked_count:0,class_label:classLabel});
    setSaving(false);setShowForm(false);setForm({title:"",total_students:30,remark:""});onRefresh();
  };
  const bump=async(hw,delta)=>{
    await db.upsertHomework({...hw,checked_count:Math.max(0,Math.min(hw.total_students,hw.checked_count+delta))});onRefresh();
  };
  const deleteHw=async(hw)=>{
    if(!confirm(`"${hw.title}" मेटाउने?`))return;
    await supabase.from("homework").delete().eq("id",hw.id);onRefresh();
  };
  return(
    <div className="ss-page" style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <PageHeader icon={ListChecks} title="गृहकार्य" color={BLUE} action={
        <Button size="sm" icon={Plus} onClick={()=>setShowForm(true)} style={{background:`linear-gradient(160deg, ${BLUE} 0%, color-mix(in srgb, ${BLUE} 72%, black) 100%)`}}>नयाँ</Button>
      }/>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:9}}>
            <input placeholder="गृहकार्यको शीर्षक" value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <input type="number" placeholder="कुल विद्यार्थी" value={form.total_students} onChange={(e)=>setForm({...form,total_students:parseInt(e.target.value)||0})} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
            <textarea placeholder="टिप्पणी" value={form.remark} onChange={(e)=>setForm({...form,remark:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:homework.length===0?<EmptyState icon={ListChecks} text="कुनै गृहकार्य छैन।" actionLabel="पहिलो गृहकार्य थप्नुहोस्" onAction={()=>setShowForm(true)}/>:(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))",gap:12,alignItems:"start"}}>
          {homework.map((h)=>{
            const pct=h.total_students>0?Math.round((h.checked_count/h.total_students)*100):0;
            const done=h.checked_count>=h.total_students;
            return(
              <Card key={h.id} accentColor={done?ACCENT:MARIGOLD} style={{paddingTop:20,position:"relative",overflow:"visible"}}>
                <PinBadge color={done?ACCENT:MARIGOLD}/>
                <div style={{display:"flex",justifyContent:"space-between",gap:8,marginBottom:8}}>
                  <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:17,fontWeight:700,color:INK}}>{h.title}</div>
                  <div style={{display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
                    <span style={{fontSize:15,fontWeight:700,color:done?ACCENT:WARN,background:done?ACCENT_LIGHT:WARN_BG,padding:"3px 8px",borderRadius:999}}>{h.checked_count}/{h.total_students}</span>
                    <button className="ss-icon-btn" onClick={()=>deleteHw(h)} style={{cursor:"pointer",color:INK_SOFT,padding:6}}><Trash2 size={14}/></button>
                  </div>
                </div>
                <div style={{height:6,background:BORDER,borderRadius:99,marginBottom:10}}>
                  <div style={{height:6,width:`${pct}%`,background:done?ACCENT:MARIGOLD,borderRadius:99}}/>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <button className="ss-btn" onClick={()=>bump(h,-1)} style={{width:34,height:34,borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontSize:18.5,fontWeight:700,cursor:"pointer"}}>−</button>
                  <div style={{fontSize:16,color:INK_SOFT,fontWeight:600,flex:1}}>जाँच गर्नुहोस्</div>
                  <button className="ss-btn" onClick={()=>bump(h,1)} style={{width:34,height:34,borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontSize:18.5,fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>+</button>
                </div>
                {h.remark&&<div style={{marginTop:10,background:SURFACE_2,borderRadius:8,padding:"8px 10px",fontSize:16,color:INK_SOFT}}>{h.remark}</div>}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TeachingJournal({ lessons, classLabel }) {
  const [entries,setEntries]=useState([]);
  const [loading,setLoading]=useState(true);
  const [showForm,setShowForm]=useState(false);
  const [form,setForm]=useState({lesson_id:"",taught:"",difficulty:"",idea:"",mood:"good"});
  const [saving,setSaving]=useState(false);
  // FIX — db.getJournalEntries() took no class argument: डायरी entries
  // from every class piled up together forever with no way to separate them.
  const load=useCallback(async()=>{setLoading(true);const{data}=await db.getJournalEntries(classLabel);setEntries(data||[]);setLoading(false);},[classLabel]);
  useEffect(()=>{load();},[load]);
  const save=async()=>{
    if(!form.taught.trim()&&!form.difficulty.trim()&&!form.idea.trim())return;
    // FIX — the old "आजको पाठ" field was free-typed text that never
    // actually got saved (upsertJournalEntry silently dropped it — the
    // table links to a real lesson via lesson_id, which the form never
    // set). Every entry is now tied to an actual lesson plan, or left
    // unlinked on purpose if there's no matching lesson yet — either way
    // nothing typed here disappears anymore.
    setSaving(true);
    await db.upsertJournalEntry({lesson_id:form.lesson_id||null,taught:form.taught,difficulty:form.difficulty,idea:form.idea,mood:form.mood});
    setSaving(false);setShowForm(false);setForm({lesson_id:"",taught:"",difficulty:"",idea:"",mood:"good"});load();
  };
  return(
    <div className="ss-page" style={{padding:"20px 20px 130px",maxWidth:820,margin:"0 auto"}}>
      <PageHeader icon={Heart} title="डायरी" color={ROSE} action={
        !showForm&&<Button size="sm" icon={Plus} onClick={()=>setShowForm(true)} style={{background:`linear-gradient(160deg, ${ROSE} 0%, color-mix(in srgb, ${ROSE} 72%, black) 100%)`}}>थप</Button>
      }/>
      {showForm&&(
        <Card style={{marginBottom:14}}>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            <div>
              <div style={{fontSize:14.5,fontWeight:700,color:INK_SOFT,marginBottom:4}}>आजको पाठ (वैकल्पिक)</div>
              {(lessons||[]).length===0?(
                <div style={{fontSize:15,color:INK_SOFT,background:SURFACE_2,borderRadius:10,padding:"9px 12px"}}>अझै कुनै पाठ योजना बनाइएको छैन — पाठ योजनामा एउटा थपेपछि यहाँ छान्न सकिन्छ।</div>
              ):(
                <select value={form.lesson_id} onChange={(e)=>setForm({...form,lesson_id:e.target.value})} style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>
                  <option value="">— कुनै पाठसँग नजोडी —</option>
                  {lessons.map((l)=><option key={l.id} value={l.id}>{lessonOptionLabel(l)}</option>)}
                </select>
              )}
            </div>
            <textarea placeholder="के पढाइयो?" value={form.taught} onChange={(e)=>setForm({...form,taught:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <textarea placeholder="के गाह्रो भयो?" value={form.difficulty} onChange={(e)=>setForm({...form,difficulty:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <textarea placeholder="अर्को पटककालागि सुझाव" value={form.idea} onChange={(e)=>setForm({...form,idea:e.target.value})} rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical"}}/>
            <div style={{display:"flex",gap:8}}>
              {Object.entries(MOOD_META).map(([key,m])=>{const Icon=m.icon;const active=form.mood===key;return(
                <button key={key} onClick={()=>setForm({...form,mood:key})} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:7,padding:"7px 8px",borderRadius:11,border:`1.5px solid ${active?m.color:`color-mix(in srgb, ${m.color} 25%, ${BORDER})`}`,background:active?`color-mix(in srgb, ${m.color} 14%, ${SURFACE})`:SURFACE,color:active?m.color:INK,fontSize:15,fontWeight:700,cursor:"pointer",boxShadow:active?`0 4px 10px color-mix(in srgb, ${m.color} 30%, transparent)`:"none"}}>
                  <div style={{width:22,height:22,borderRadius:7,background:`linear-gradient(160deg, ${m.color} 0%, color-mix(in srgb, ${m.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Icon size={11} color="#fff"/></div>
                  {m.label}
                </button>
              );})}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button onClick={()=>setShowForm(false)} className="ss-btn" style={{flex:1,padding:"10px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द</button>
              <button className="ss-btn" onClick={save} disabled={saving} style={{flex:1,padding:"10px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"सुरक्षित"}</button>
            </div>
          </div>
        </Card>
      )}
      {loading?<Spinner/>:entries.length===0?<EmptyState icon={Heart} text="कुनै प्रविष्टि छैन।" actionLabel="पहिलो प्रविष्टि थप्नुहोस्" onAction={()=>setShowForm(true)}/>:(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:10,alignItems:"start"}}>
          {entries.map((e)=>{const mood=MOOD_META[e.mood]||MOOD_META.okay;const MIcon=mood.icon;return(
            <Card key={e.id} accentColor={mood.color} style={{paddingTop:20,position:"relative",overflow:"visible"}}>
              <PinBadge color={mood.color}/>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div style={{fontSize:16.5,fontWeight:700,color:INK}}>{e.lessons?.title||e.entry_date}</div>
                <div style={{display:"flex",alignItems:"center",gap:4,background:tint(mood.color,15),color:mood.color,padding:"3px 9px",borderRadius:999,fontSize:14.5,fontWeight:700}}><MIcon size={12}/>{mood.label}</div>
              </div>
              {e.taught&&<div style={{fontSize:16,color:INK,marginBottom:5}}><strong>के पढाइयो:</strong> {e.taught}</div>}
              {e.difficulty&&<div style={{fontSize:16,color:INK_SOFT,marginBottom:5}}><strong>गाह्रो:</strong> {e.difficulty}</div>}
              {e.idea&&<div style={{background:WARN_BG,borderRadius:8,padding:"7px 10px",fontSize:16,color:MARIGOLD_DARK}}>💡 {e.idea}</div>}
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}

function AIAssistant({ lessons, classContext, classLabel }) {
  // FIX — this used to hard-pick lessons[0] with no way to change it, so
  // the assistant could silently be answering about the wrong chapter with
  // no indication why. A visible picker replaces the blind guess.
  const [lessonId,setLessonId]=useState(lessons[0]?.id||"");
  // FIX — that initial useState only ever ran once, on mount. If lessons
  // was still loading at that point (empty array), lessonId got stuck at
  // "" forever — the dropdown would visually default to showing the
  // first lesson once the list arrived (a bare browser <select> falls
  // back to its first <option> when the controlled value matches
  // nothing), while the chat underneath still silently treated it as "no
  // lesson selected". Also covers the currently-picked lesson being
  // deleted from Planner while this tab is open.
  useEffect(()=>{
    if(!lessons.length){ if(lessonId) setLessonId(""); return; }
    if(!lessons.some((l)=>l.id===lessonId)) setLessonId(lessons[0].id);
  },[lessons]);
  const lesson=lessons.find((l)=>l.id===lessonId)||null;
  const chapterTitle=lesson?.chapters?.title||lesson?.chapter_title||"";
  const [messages,setMessages]=useState([{role:"ai",text:lesson?`नमस्ते! म "${lesson.title}" पाठ, ट्याग गरिएका सामग्री, र पाठ्यपुस्तकबाट उत्तर दिन्छु। तलका छिटो प्रश्न थिच्नुहोस्।`:"नमस्ते! पहिले पाठ योजनामा एउटा पाठ थप्नुहोस्।"}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const [matchedCount,setMatchedCount]=useState(0);
  const [textbookReady,setTextbookReady]=useState(false);
  const bottomRef=useRef(null);
  const QUICK=["आजको पाठ बुझाउनुहोस्","उद्देश्यहरू देखाउनुहोस्","मुख्य प्रश्नहरू दिनुहोस्","क्रियाकलाप सुझाव दिनुहोस्","गृहकार्य के दिने?","शब्दावली सूची देखाउनुहोस्","मूल्याङ्कन कसरी गर्ने?"];
  useEffect(()=>{bottomRef.current?.scrollIntoView({behavior:"smooth"});},[messages]);
  useEffect(()=>{ let cancelled=false; getTextbookPDF(classLabel).then((part)=>{if(!cancelled)setTextbookReady(!!part);}); return ()=>{cancelled=true;}; },[classLabel]);
  // NEW — switching lessons mid-conversation resets the chat with a fresh
  // greeting for the newly-picked lesson, so old answers about a different
  // chapter don't linger and get mistaken for being about the new one.
  useEffect(()=>{
    setMessages([{role:"ai",text:lesson?`नमस्ते! म "${lesson.title}" पाठ, ट्याग गरिएका सामग्री, र पाठ्यपुस्तकबाट उत्तर दिन्छु। तलका छिटो प्रश्न थिच्नुहोस्।`:"नमस्ते! पहिले पाठ योजनामा एउटा पाठ थप्नुहोस्।"}]);
  },[lessonId]);
  useEffect(()=>{
    if(chapterTitle){
      db.getChapterIdByTitle(chapterTitle,classLabel).then((id)=>{
        if(!id)return setMatchedCount(0);
        db.getMaterialsByChapter(id).then(({data})=>setMatchedCount((data||[]).length));
      });
    }
  },[chapterTitle,classLabel]);
  const send=async(text)=>{
    const t=text.trim();if(!t||loading)return;
    setMessages((prev)=>[...prev,{role:"user",text:t}]);setInput("");setLoading(true);
    try{
      const context=lesson?`पाठ: ${lesson.title}\nअध्याय: ${lesson.chapters?.title||lesson.chapter_title||""}\nउद्देश्य: ${(lesson.objectives||[]).join(", ")}\nशब्दावली: ${(lesson.vocabulary||[]).join(", ")}\nक्रियाकलाप: ${(lesson.activities||[]).join(", ")}\nगृहकार्य: ${lesson.homework||""}`: "कुनै पाठ छैन।";
      // NEW: pull in materials tagged to this lesson's chapter, alongside the global textbook
      const ctx=await getMaterialContext(chapterTitle,classLabel);
      const reply=await gemini.chatWithAI(t,context,ctx,classContext);
      setMessages((prev)=>[...prev,{role:"ai",text:reply}]);
    }catch(e){setMessages((prev)=>[...prev,{role:"ai",text:"AI सँग जोडिन सकिएन: "+e.message}]);}
    setLoading(false);
  };
  // NEW — "स्पष्ट पार्नुहोस्": expands one specific AI reply in place with
  // more depth (examples, simpler wording, step-by-step breakdown) instead
  // of the teacher having to retype "explain more" and lose the original
  // context. Sends the exact reply text back to the AI as what to expand,
  // grounded in the same lesson/materials/textbook context as everything
  // else in this chat, and appends the fuller version right below it.
  const [elaboratingIdx,setElaboratingIdx]=useState(null);
  const elaborate=async(i)=>{
    if(loading||elaboratingIdx!==null)return;
    const target=messages[i];
    if(!target||target.role!=="ai")return;
    setElaboratingIdx(i);
    try{
      const context=lesson?`पाठ: ${lesson.title}\nअध्याय: ${lesson.chapters?.title||lesson.chapter_title||""}\nउद्देश्य: ${(lesson.objectives||[]).join(", ")}\nशब्दावली: ${(lesson.vocabulary||[]).join(", ")}\nक्रियाकलाप: ${(lesson.activities||[]).join(", ")}\nगृहकार्य: ${lesson.homework||""}`: "कुनै पाठ छैन।";
      const ctx=await getMaterialContext(chapterTitle,classLabel);
      const prompt=`तलको आफ्नै जवाफलाई थप स्पष्ट र विस्तृत बनाउनुहोस् — थप उदाहरण, कक्षामा प्रयोग गर्न मिल्ने सरल भाषा, र आवश्यक भए चरणबद्ध विवरण थपेर। नयाँ विषय नथप्नुहोस्, यही जवाफलाई मात्र गहिरो बनाउनुहोस्:\n\n"${target.text}"`;
      const reply=await gemini.chatWithAI(prompt,context,ctx,classContext);
      setMessages((prev)=>{
        const next=[...prev];
        next.splice(i+1,0,{role:"ai",text:reply,expansionOf:i});
        return next;
      });
    }catch(e){
      setMessages((prev)=>[...prev,{role:"ai",text:"स्पष्ट पार्न सकिएन: "+e.message}]);
    }finally{
      setElaboratingIdx(null);
    }
  };
  return(
    <div className="ss-page-read" style={{display:"flex",flexDirection:"column",height:"calc(100vh - 170px)",maxWidth:720,margin:"0 auto",width:"100%"}}>
      <div style={{padding:"14px 16px 8px"}}>
        <div style={{fontSize:19,fontWeight:800,color:INK,display:"flex",alignItems:"center",gap:9,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}><div style={{width:34,height:34,borderRadius:10,background:`linear-gradient(160deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 8px color-mix(in srgb, ${ACCENT} 30%, transparent)`}}><Bot size={17} color="#fff"/></div>AI शिक्षण सहायक</div>
        {lessons.length>0&&(
          <select value={lessonId} onChange={(e)=>setLessonId(e.target.value)} style={{marginTop:8,width:"100%",borderRadius:10,padding:"8px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,color:INK,fontWeight:600,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>
            {lessons.map((l)=><option key={l.id} value={l.id}>{lessonOptionLabel(l)}</option>)}
          </select>
        )}
        {/* FIX — this used to be one dense, wrapping sentence ("Google
            Gemini AI · पाठ्यपुस्तक लोड भएको छैन (...) · "X" का ३ सामग्री")
            all in one small muted color — hard to scan at a glance, and on
            a narrow phone it wrapped mid-thought. Split into separate
            small status badges so each fact (AI engine, textbook status,
            materials count) is its own scannable chip instead of one run-
            on line. */}
        <div style={{display:"flex",alignItems:"center",gap:6,marginTop:9,flexWrap:"wrap"}}>
          <span style={{display:"flex",alignItems:"center",gap:4,fontSize:13.5,fontWeight:700,color:MARIGOLD_DARK,background:WARN_BG,padding:"4px 9px",borderRadius:999}}><Zap size={11}/>Gemini AI</span>
          <span style={{display:"flex",alignItems:"center",gap:4,fontSize:13.5,fontWeight:700,color:textbookReady?TEAL:INK_SOFT,background:textbookReady?TEAL_LIGHT:SURFACE_2,padding:"4px 9px",borderRadius:999,border:textbookReady?"none":`1px solid ${BORDER}`}}>{textbookReady?"📘 पाठ्यपुस्तक लोड भयो":"📘 पाठ्यपुस्तक लोड छैन"}</span>
          {chapterTitle&&<span style={{display:"flex",alignItems:"center",gap:4,fontSize:13.5,fontWeight:700,color:ACCENT,background:ACCENT_LIGHT,padding:"4px 9px",borderRadius:999}}><Tag size={11}/>{matchedCount} सामग्री ट्याग गरिएको</span>}
        </div>
        {!textbookReady&&<div style={{fontSize:13.5,color:INK_SOFT,marginTop:5}}>सेटिङमा गएर पाठ्यपुस्तक अपलोड गर्न सकिन्छ।</div>}
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"6px 16px",display:"flex",flexDirection:"column"}}>
        {messages.length<=1?(
          // NEW — instead of one greeting bubble sitting at the top of a mostly
          // empty scroll area (the "big empty space" problem), the idle chat
          // fills that space with the quick-prompts as a proper card grid, so
          // the screen has something useful to look at before the user types.
          <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",gap:14,padding:"6px 2px 18px"}}>
            <div style={{maxWidth:"88%",background:SURFACE,color:INK,border:`1px solid ${BORDER}`,borderRadius:14,padding:"11px 14px",fontSize:16.5,lineHeight:1.6,boxShadow:SHADOW.raised}}>{messages[0]?.text}</div>
            <div>
              <SectionLabel icon={Zap} color={MARIGOLD_DARK}>छिटो सुरुवात</SectionLabel>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(155px,1fr))",gap:9}}>
                {QUICK.map((q,i)=>{const c=PALETTE[i%PALETTE.length];return(
                  <button key={q} onClick={()=>send(q)} className="ss-btn ss-card-hover" style={{textAlign:"left",background:SURFACE,border:`1px solid ${BORDER}`,borderLeft:`4px solid ${c}`,borderRadius:13,padding:"12px 13px",fontSize:15,fontWeight:600,color:INK,cursor:"pointer",boxShadow:SHADOW.raised,display:"flex",alignItems:"center",gap:8}}>
                    <Zap size={14} color={c} style={{flexShrink:0}}/>{q}
                  </button>
                );})}
              </div>
            </div>
          </div>
        ):(
          <>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",flexDirection:"column",alignItems:m.role==="user"?"flex-end":"flex-start",marginBottom:10}}>
                <div style={{maxWidth:"88%",background:m.role==="user"?`linear-gradient(135deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:SURFACE,color:m.role==="user"?"#fff":INK,border:m.role==="ai"?`1px solid ${BORDER}`:"none",borderRadius:14,padding:"11px 14px",fontSize:16.5,lineHeight:1.6,whiteSpace:"pre-wrap",boxShadow:m.role==="ai"?SHADOW.sm:SHADOW.accent}}>{m.text}</div>
                {m.role==="ai"&&(
                  <button className="ss-btn" onClick={()=>elaborate(i)} disabled={loading||elaboratingIdx!==null} style={{display:"flex",alignItems:"center",gap:4,marginTop:4,background:"none",border:"none",color:ACCENT,fontWeight:700,fontSize:13.5,cursor:elaboratingIdx!==null?"default":"pointer",padding:"2px 2px",opacity:elaboratingIdx!==null&&elaboratingIdx!==i?0.5:1}}>
                    <Sparkles size={12}/>{elaboratingIdx===i?"स्पष्ट पार्दै...":"स्पष्ट पार्नुहोस्"}
                  </button>
                )}
              </div>
            ))}
            {loading&&<div style={{display:"flex",marginBottom:10}}><div style={{background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:14,padding:"11px 14px",color:INK_SOFT,fontSize:16.5}}>सोच्दै छु...</div></div>}
          </>
        )}
        <div ref={bottomRef}/>
      </div>
      {messages.length>1&&(
        <div style={{padding:"8px 16px",display:"flex",gap:7,flexWrap:"wrap"}}>
          {QUICK.map((q)=><button className="ss-btn" key={q} onClick={()=>send(q)} style={{flexShrink:0,background:WARN_BG,color:MARIGOLD_DARK,border:"none",borderRadius:999,padding:"7px 12px",fontSize:15,fontWeight:600,whiteSpace:"nowrap",cursor:"pointer"}}>{q}</button>)}
        </div>
      )}
      <div style={{display:"flex",gap:8,padding:"8px 16px 16px"}}>
        <input value={input} onChange={(e)=>setInput(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&send(input)} placeholder="आफ्नो प्रश्न लेख्नुहोस्..." style={{flex:1,minWidth:0,border:`1px solid ${BORDER}`,borderRadius:999,padding:"12px 16px",fontSize:16.5,outline:"none",background:SURFACE_2,color:INK,caretColor:ACCENT,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}/>
        <button className="ss-btn" onClick={()=>send(input)} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:"50%",width:44,height:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,boxShadow:SHADOW.accent}}><Send size={17}/></button>
      </div>
    </div>
  );
}

function SummaryPanel({ icon:Icon, color, title, subtitle, onOpen }) {
  return(
    <Card onClick={onOpen} accentColor={color} style={{cursor:"pointer",display:"flex",alignItems:"center",gap:12,paddingTop:22,position:"relative",overflow:"visible"}}>
      <PinBadge color={color}/>
      <div style={{width:42,height:42,borderRadius:12,background:`linear-gradient(160deg, ${color} 0%, color-mix(in srgb, ${color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${color} 40%, transparent)`}}><Icon size={20} color="#fff"/></div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:17,fontWeight:700,color:INK}}>{title}</div>
        <div style={{fontSize:14.5,color:INK_SOFT,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{subtitle}</div>
      </div>
      <ArrowRight size={18} color={INK_SOFT} style={{flexShrink:0}}/>
    </Card>
  );
}

// NEW — generic popup wrapper so any full manager (Homework, Diary) can
// open on top of wherever the teacher already is, same pattern as the
// Settings popup, instead of being its own dedicated screen.
function ManagerPopup({ title, onClose, children }) {
  return(
    <div className="no-print" onClick={onClose} style={{position:"fixed",inset:0,zIndex:88,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.55)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:16}}>
      <div onClick={(e)=>e.stopPropagation()} style={{background:PAPER,borderRadius:18,width:"100%",maxWidth:"min(95vw, 1080px)",maxHeight:"95vh",overflowY:"auto",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`,position:"relative"}}>
        <div style={{position:"sticky",top:0,zIndex:2,display:"flex",justifyContent:"flex-end",padding:"14px 14px 0",background:PAPER}}>
          <IconButton icon={X} onClick={onClose} variant="surface"/>
        </div>
        <div style={{padding:"0 4px 10px"}}>{children}</div>
      </div>
    </div>
  );
}

function AITools({ lessons, classContext, classLabel, initialTab, onInitialTabConsumed }) {
  // FIX — "AI च्याट" used to be its own top-level screen, separate from
  // every other AI feature (resources/saved), even though it draws on
  // the exact same lesson/material context. It's the first tab here now,
  // so there's one AI screen with one obvious place to look, not two
  // screens that both start with "AI".
  const [tab,setTab]=useState("chat");
  // NEW — arriving here from a Search result: jump straight to the
  // relevant sub-tab instead of always opening on chat.
  useEffect(()=>{
    if(!initialTab)return;
    setTab(initialTab==="saved"?"resources":initialTab);
    onInitialTabConsumed?.();
  },[initialTab,onInitialTabConsumed]);
  // FIX — Question Bank, Activities Library, and Assessment used to sit
  // here as their own tabs, but they duplicated what Yojana's per-lesson
  // प्रश्नहरू/क्रियाकलाप/मूल्याङ्कन tabs already do for that lesson, just
  // against a separate reusable table instead of the lesson itself — two
  // places to generate the same kind of content with no clear reason to
  // pick one over the other. Question Bank and Activities are dropped
  // entirely (Yojana's per-lesson tabs cover that job now). Assessment
  // wasn't a real duplicate — it's the only place a rubric ever gets
  // created — so rubric creation moved into Yojana's rubric tab directly
  // instead of getting deleted.
  // FIX — सुरक्षित was its own tab too, usually just a short list (or an
  // empty state) with nothing else on the whole screen — a tab switch for
  // one thin list. It's embedded inside स्रोत निर्माता now (generate, then
  // see everything you've generated, same screen), so AI Sahayak is down
  // to 2 tabs, each one worth switching to.
  const TABS=[
    {id:"chat",label:"च्याट",icon:Bot,color:ACCENT,bg:ACCENT_LIGHT},
    {id:"resources",label:"स्रोत",icon:Wand2,color:MARIGOLD_DARK,bg:WARN_BG},
  ];
  return(
    <div>
      <div className="no-print" style={{position:"sticky",top:0,zIndex:8,background:SURFACE,borderBottom:`1px solid ${BORDER}`,padding:"10px 14px"}}>
        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
          {TABS.map((t)=>{const Icon=t.icon;const active=tab===t.id;return(
            <Chip key={t.id} onClick={()=>setTab(t.id)} active={active} color={t.color} icon={Icon} size="sm">{t.label}</Chip>
          );})}
        </div>
      </div>
      {tab==="chat"&&<AIAssistant lessons={lessons} classContext={classContext} classLabel={classLabel}/>}
      {tab==="resources"&&<ResourceCreator lessons={lessons} classContext={classContext} classLabel={classLabel}/>}
    </div>
  );
}

// NEW — lifted to module scope (was local to ResourceCreator) so both the
// generator and the Saved Resources library can share the same icon/color
// per template type instead of duplicating the list.
const RESOURCE_TEMPLATES=[
  {id:"worksheet",title:"कार्यपत्र",icon:FileText,color:ACCENT,prompt:(l,classContext)=>`${classContext} "${l?.title||""}" पाठका लागि अभ्यास कार्यपत्र नेपालीमा बनाउनुहोस्। उद्देश्य: ${(l?.objectives||[]).join(", ")}`},
  {id:"revision",title:"पुनरावलोकन",icon:ClipboardList,color:TEAL,prompt:(l,classContext)=>`${classContext} "${l?.title||""}" पाठको पुनरावलोकन पाना बनाउनुहोस्। मुख्य बुँदा, शब्दावली र प्रश्नहरू।`},
  {id:"flashcard",title:"फ्ल्यासकार्ड",icon:Copy,color:VIOLET,prompt:(l)=>`"${l?.title||""}" पाठका शब्दावलीहरू: ${(l?.vocabulary||[]).join(", ")} — फ्ल्यासकार्ड बनाउनुहोस्।`},
  {id:"mindmap",title:"अवधारणा नक्सा",icon:Brain,color:BLUE,prompt:(l)=>`"${l?.title||""}" पाठको अवधारणा नक्सा (text format) बनाउनुहोस्।`},
  {id:"vocab",title:"शब्दावली सूची",icon:Tag,color:ROSE,prompt:(l)=>`"${l?.title||""}" पाठका शब्दावलीहरू अर्थ र वाक्य प्रयोगसहित: ${(l?.vocabulary||[]).join(", ")}`},
  {id:"practice",title:"अभ्यास प्रश्न",icon:PenSquare,color:MARIGOLD_DARK,prompt:(l)=>`"${l?.title||""}" पाठका लागि १५ वटा विभिन्न प्रकारका अभ्यास प्रश्नहरू बनाउनुहोस्।`},
];
const resourceTemplateMeta=(id)=>RESOURCE_TEMPLATES.find((t)=>t.id===id)||{title:"स्रोत",icon:Wand2,color:MARIGOLD_DARK};

function ResourceCreator({ lessons, classContext, classLabel }) {
  const [active,setActive]=useState(null);
  const [generating,setGenerating]=useState(false);
  const [generatedText,setGeneratedText]=useState("");
  const [matchedCount,setMatchedCount]=useState(0);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  // NEW — bumped after every successful save so the सुरक्षित list embedded
  // below (see SavedResources' embedded/refreshKey props) picks up the
  // new item immediately instead of only refreshing on next visit.
  const [savedRefreshKey,setSavedRefreshKey]=useState(0);
  // FIX — this used to hard-pick lessons[0] with no way to change it, same
  // bug AI च्याट had (see the FIX comment on AIAssistant above) — a
  // teacher generating a worksheet had no way to tell, or change, which
  // पाठ it was actually being generated for. Same picker, same behavior:
  // defaults to the first लesson, but stays in sync if the list changes
  // (e.g. that lesson gets deleted from Planner while this tab is open)
  // and lets the teacher pick a different one.
  const [lessonId,setLessonId]=useState(lessons[0]?.id||"");
  useEffect(()=>{
    if(!lessons.length){ if(lessonId) setLessonId(""); return; }
    if(!lessons.some((l)=>l.id===lessonId)) setLessonId(lessons[0].id);
  },[lessons]);
  const lesson=lessons.find((l)=>l.id===lessonId)||null;
  const chapterTitle=lesson?.chapters?.title||lesson?.chapter_title||"";
  // NEW — switching lessons clears whatever was generated for the
  // previous one, same reasoning as AIAssistant resetting its chat on
  // lesson switch: a worksheet left on screen after picking a different
  // lesson looks current but is actually about the wrong पाठ.
  useEffect(()=>{setActive(null);setGeneratedText("");setSaved(false);},[lessonId]);
  const generate=async(template)=>{
    setActive(template);setGenerating(true);setGeneratedText("");setSaved(false);
    try{
      // NEW: use materials tagged to this lesson's chapter + the global textbook
      const ctx=await getMaterialContext(chapterTitle,classLabel);
      setMatchedCount(ctx.matchedCount||0);
      const prompt=template.prompt(lesson,classContext);
      const text=await gemini.generateFromContext(prompt,ctx);
      setGeneratedText(text);
    }catch(e){setGeneratedText("त्रुटि: "+e.message);}
    setGenerating(false);
  };

  const save=async()=>{
    if(!active||!generatedText)return;
    setSaving(true);
    const title=lesson?`${active.title} — ${lesson.title}`:active.title;
    // FIX — class_label was never set on saved resources, so every one
    // you generate shows up under सुरक्षित स्रोत regardless of class.
    const{error}=await db.saveResource({title,template_id:active.id,chapter_title:chapterTitle||null,content:generatedText,class_label:classLabel});
    setSaving(false);
    if(!error){setSaved(true);setSavedRefreshKey((k)=>k+1);}
  };

  return(
    <div className="ss-page" style={{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      <div className="no-print" style={{marginBottom:4}}><PageHeader icon={Wand2} title="स्रोत निर्माता" color={MARIGOLD_DARK}/></div>
      <div className="no-print" style={{fontSize:16,color:INK_SOFT,marginBottom:16}}>{lesson?`"${lesson.title}" — AI बाट स्वतः बनाइन्छ।`:"पहिले पाठ योजनामा पाठ थप्नुहोस्।"}</div>
      <div className="no-print"><MaterialsHint count={matchedCount} chapterTitle={chapterTitle}/></div>
      <div className="no-print" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:10,marginBottom:20}}>
        {RESOURCE_TEMPLATES.map((t)=>{const Icon=t.icon;return<Card key={t.id} onClick={()=>generate(t)} accentColor={t.color} style={{padding:14,paddingTop:24,position:"relative",overflow:"visible",border:active?.id===t.id?`2px solid ${t.color}`:`1px solid ${BORDER}`}}><PinBadge color={t.color}/><div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(160deg, ${t.color} 0%, color-mix(in srgb, ${t.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:8,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${t.color} 40%, transparent)`}}><Icon size={18} color="#fff"/></div><div style={{fontWeight:700,fontSize:16,color:INK}}>{t.title}</div></Card>;})}
      </div>
      {active&&(
        <Card>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
            <div style={{fontWeight:700,fontSize:17}}>{active.title}</div>
            {!generating&&generatedText&&(
              <div className="no-print" style={{display:"flex",gap:7}}>
                <button className="ss-btn" onClick={save} disabled={saving||saved} style={{display:"flex",alignItems:"center",gap:5,background:saved?ACCENT_LIGHT:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:saved?ACCENT:"#fff",border:"none",borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:16,cursor:saved?"default":"pointer",boxShadow:saved?"none":SHADOW.accent}}>{saved?<><CheckCircle2 size={14}/>सुरक्षित भयो</>:saving?"...":<><BookMarked size={14}/>सुरक्षित गर्नुहोस्</>}</button>
                <button className="ss-btn" onClick={()=>window.print()} style={{display:"flex",alignItems:"center",gap:5,background:`linear-gradient(180deg, #DDB054 0%, ${MARIGOLD} 100%)`,color:"#2A1E07",border:"none",borderRadius:10,padding:"7px 12px",fontWeight:700,fontSize:16,cursor:"pointer",boxShadow:SHADOW.marigold}}><Printer size={14}/>प्रिन्ट</button>
              </div>
            )}
          </div>
          {generating?<div style={{display:"flex",alignItems:"center",gap:8,color:INK_SOFT,fontSize:16.5,padding:20}}><Spinner small/>AI बनाउँदैछ...</div>:(
            <pre style={{background:SURFACE_2,borderRadius:10,padding:14,fontSize:16,color:INK,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"'SSText','Kalimati','Times New Roman',serif",maxHeight:400,overflowY:"auto"}}>{generatedText}</pre>
          )}
        </Card>
      )}
      {/* NEW — साझा गरिएको सुरक्षित स्रोतहरू लगेको ठाउँ यहाँ नै छ, अलग
          सुरक्षित ट्याब चाहिँदैन: के बनाइयो र पहिले के बनाइसकिएको छ दुवै
          एउटै स्क्रोलमा देखिन्छ। */}
      <div className="no-print" style={{marginTop:24,paddingTop:20,borderTop:`1px solid ${BORDER}`}}>
        <SavedResources classLabel={classLabel} embedded refreshKey={savedRefreshKey}/>
      </div>
    </div>
  );
}

// NEW — the library of previously-saved AI resources (worksheets, flashcards,
// mindmaps, etc.) so a generated document survives navigating away instead
// of vanishing. Decorated the same corkboard-pin way as the Materials library.
// FIX — used to be its own AI Sahayak tab, sitting mostly empty on its own
// (a plain list, or nothing at all, with a whole tab switch just to see
// it). Generating and reviewing what you've generated are the same task,
// so this now renders embedded directly under स्रोत निर्माता's generator
// instead — `embedded` drops the page header/padding since it's nested,
// and `refreshKey` lets the parent force a reload right after a save.
function SavedResources({ classLabel, embedded, refreshKey }) {
  const [items,setItems]=useState([]);
  const [loading,setLoading]=useState(true);
  const [viewing,setViewing]=useState(null);
  // FIX — same bug as the lessons/homework/chapters loaders: on a failed
  // fetch this used to run setItems(data||[]) regardless, wiping the
  // whole "AI बाट बनाएका" list to empty. That's especially bad here since
  // this is the *only* copy of things you already generated — losing the
  // list (even just visually) means re-generating from scratch. Now a
  // failed refresh keeps whatever's already showing and says so.
  const [loadError,setLoadError]=useState("");
  // FIX — no classLabel: saved resources from every class showed up
  // together here regardless of which class you're currently viewing.
  const load=useCallback(async()=>{
    setLoading(true);
    const{data,error}=await db.getSavedResources(classLabel);
    if(error){setLoadError("सुरक्षित स्रोतहरू लोड गर्न सकिएन — देखिएको सूची पुरानो हुन सक्छ।");setLoading(false);return;}
    setLoadError("");setItems(data||[]);setLoading(false);
  },[classLabel]);
  useEffect(()=>{load();},[load,refreshKey]);

  const remove=async(id,e)=>{
    e.stopPropagation();
    if(!confirm("यो सुरक्षित स्रोत मेटाउने?"))return;
    await db.deleteSavedResource(id);load();
  };

  return(
    <div className={embedded?"":"ss-page"} style={embedded?{}:{padding:"20px 20px 130px",maxWidth:1040,margin:"0 auto"}}>
      {embedded?(
        <div className="no-print" style={{marginBottom:12}}><SectionLabel icon={BookMarked} color={ROSE}>सुरक्षित स्रोतहरू</SectionLabel></div>
      ):(<>
        <div style={{marginBottom:4}}><PageHeader icon={BookMarked} title="सुरक्षित स्रोतहरू" color={ROSE}/></div>
        <div style={{fontSize:16,color:INK_SOFT,marginBottom:16}}>AI बाट बनाएका र सुरक्षित गरेका कार्यपत्र, फ्ल्यासकार्ड, पुनरावलोकन पाना — पछि हेर्न वा प्रिन्ट गर्न।</div>
      </>)}
      {loadError&&<ErrorMsg msg={loadError}/>}
      {loading?<Spinner/>:items.length===0?(
        <EmptyState icon={BookMarked} text="अझै कुनै स्रोत सुरक्षित गरिएको छैन। माथिबाट बनाएर 'सुरक्षित गर्नुहोस्' थिच्नुहोस्।"/>
      ):(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>
          {items.map((r)=>{
            const meta=resourceTemplateMeta(r.template_id);const Icon=meta.icon;
            return(
              <Card key={r.id} onClick={()=>setViewing(r)} accentColor={meta.color} style={{padding:14,paddingTop:46,position:"relative",overflow:"visible"}}>
                <PinBadge color={meta.color}/>
                <button className="ss-btn" onClick={(e)=>remove(r.id,e)} style={{position:"absolute",top:6,right:6,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:10,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:INK_SOFT,boxShadow:SHADOW.sm,zIndex:2}}><Trash2 size={16}/></button>
                <div style={{width:40,height:40,borderRadius:11,background:`linear-gradient(160deg, ${meta.color} 0%, color-mix(in srgb, ${meta.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",marginBottom:9,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${meta.color} 40%, transparent)`}}><Icon size={19} color="#fff"/></div>
                <div style={{fontSize:16,fontWeight:700,color:INK,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",marginBottom:4}}>{r.title}</div>
                {r.chapter_title&&<span style={{fontSize:13.5,background:ACCENT_LIGHT,color:ACCENT,padding:"3px 8px",borderRadius:999,fontWeight:700,display:"inline-block",maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.chapter_title}</span>}
                <div style={{fontSize:13.5,color:INK_SOFT,marginTop:6,fontWeight:600}}>{r.created_at?new Date(r.created_at).toLocaleDateString("ne-NP"):""}</div>
              </Card>
            );
          })}
        </div>
      )}
      {viewing&&(
        <PrintableSheet title={viewing.title} subtitle={resourceTemplateMeta(viewing.template_id).title} chip={viewing.chapter_title} chipColor={resourceTemplateMeta(viewing.template_id).color} onClose={()=>setViewing(null)}>
          <pre style={{background:SURFACE_2,borderRadius:10,padding:14,fontSize:16,color:INK,lineHeight:1.7,whiteSpace:"pre-wrap",fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>{viewing.content}</pre>
        </PrintableSheet>
      )}
    </div>
  );
}


function DocumentSearch({ lessons, homework, classLabel, onOpenLesson, onGoMaterials, onGoHomework }) {
  const [query,setQuery]=useState("");
  const [allMaterials,setAllMaterials]=useState([]);
  const [allAssessments,setAllAssessments]=useState([]);
  useEffect(()=>{
    // FIX — getMaterials was called with no classLabel, so सबैतिर खोज
    // searched (and could jump you to) content from every class, not just
    // the one you're currently in.
    db.getMaterials(classLabel).then(({data})=>setAllMaterials(data||[]));
    // NEW — प्रश्न/क्रियाकलाप results are gone along with Question Bank/
    // Activities Library (see AITools) — that content now lives per-lesson
    // inside Yojana and is found there, not through a standalone bank.
    // मूल्याङ्कन results now jump straight into the lesson they belong to
    // (see onOpenLesson below), since rubrics are created there directly
    // and there's no separate मूल्याङ्कन screen anymore.
    db.getAssessments(classLabel).then(({data})=>setAllAssessments(data||[]));
  },[classLabel]);
  // FIX — results were pure display, tapping one did nothing. Each result
  // now knows how to jump to where it actually lives.
  const results=useMemo(()=>{
    const q=query.trim().toLowerCase();if(!q)return[];
    return[
      ...lessons.filter((l)=>l.title?.toLowerCase().includes(q)||(l.objectives||[]).some((o)=>o.toLowerCase().includes(q))).map((l)=>({kind:"पाठ",title:l.title,sub:l.chapters?.title||l.chapter_title||"",icon:ClipboardList,color:ACCENT,onClick:()=>onOpenLesson?.(l)})),
      ...allMaterials.filter((m)=>m.name?.toLowerCase().includes(q)||m.chapters?.title?.toLowerCase().includes(q)).map((m)=>({kind:"सामग्री",title:m.name,sub:(m.chapters?.title?m.chapters.title+" · ":"")+(m.file_type?.toUpperCase()||""),icon:FileText,color:DANGER,onClick:onGoMaterials})),
      ...allAssessments.filter((a)=>a.title?.toLowerCase().includes(q)).map((a)=>{const l=lessons.find((x)=>x.id===a.lesson_id);return{kind:"मूल्याङ्कन",title:a.title,sub:a.chapters?.title||"",icon:NotebookPen,color:BLUE,onClick:l?()=>onOpenLesson?.(l,{tab:"rubric"}):undefined};}),
      ...homework.filter((h)=>h.title?.toLowerCase().includes(q)).map((h)=>({kind:"गृहकार्य",title:h.title,sub:`${h.checked_count}/${h.total_students}`,icon:ListChecks,color:WARN,onClick:onGoHomework})),
    ];
  },[query,lessons,allMaterials,allAssessments,homework,onOpenLesson,onGoMaterials,onGoHomework]);
  return(
    <div className="ss-page-read" style={{padding:"20px 20px 130px",maxWidth:820,margin:"0 auto"}}>
      <div style={{marginBottom:4}}><PageHeader icon={Search} title="सबैतिर खोज" color={TEAL}/></div>
      <div style={{display:"flex",alignItems:"center",gap:8,background:SURFACE,border:`1px solid ${BORDER}`,borderRadius:14,padding:"12px 14px",marginBottom:14,marginTop:10}}>
        <Search size={17} color={INK_SOFT}/>
        <input autoFocus autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck="false" value={query} onChange={(e)=>setQuery(e.target.value)} placeholder="खोज्नुहोस्..." style={{border:"none",outline:"none",boxShadow:"none",WebkitAppearance:"none",appearance:"none",fontSize:17,flex:1,minWidth:0,background:"transparent",color:INK,caretColor:ACCENT,fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}/>
      </div>
      {!query.trim()?<EmptyState icon={Search} text="टाइप गर्नुहोस्..."/>:results.length===0?<EmptyState icon={Search} text={`"${query}" फेला परेन।`}/>:(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{fontSize:15.5,color:INK_SOFT,marginBottom:4}}>{results.length} परिणाम</div>
          {results.map((r,i)=>{const Icon=r.icon;return<Card key={i} onClick={r.onClick} accentColor={r.color} style={{display:"flex",gap:10,alignItems:"center",paddingTop:22,position:"relative",overflow:"visible",cursor:r.onClick?"pointer":"default"}}><PinBadge color={r.color}/><div style={{width:36,height:36,borderRadius:8,background:`linear-gradient(160deg, ${r.color} 0%, color-mix(in srgb, ${r.color} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`inset 0 1px 0 rgba(255,255,255,0.35), 0 3px 8px color-mix(in srgb, ${r.color} 40%, transparent)`}}><Icon size={17} color="#fff"/></div><div style={{flex:1,minWidth:0}}><div style={{fontSize:14,color:r.color,fontWeight:700,marginBottom:2}}>{r.kind}</div><div style={{fontSize:16.5,color:INK,fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.title}</div>{r.sub&&<div style={{fontSize:15,color:INK_SOFT}}>{r.sub}</div>}</div>{r.onClick&&<ArrowRight size={17} color={INK_SOFT} style={{flexShrink:0}}/>}</Card>;})}
        </div>
      )}
    </div>
  );
}

// NEW — Phase 3: date helpers for the calendar module (local dates, not
// UTC, so a day never shifts by one depending on timezone).
const fmtDate=(d)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parseDate=(s)=>{const[y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};

function CalendarView({ classLabel, active }) {
  const today=new Date();
  const [year,setYear]=useState(today.getFullYear());
  const [month,setMonth]=useState(today.getMonth());
  const [selected,setSelected]=useState(fmtDate(today));
  const MONTHS=["जनवरी","फेब्रुअरी","मार्च","अप्रिल","मे","जुन","जुलाई","अगस्ट","सेप्टेम्बर","अक्टोबर","नोभेम्बर","डिसेम्बर"];
  const DAYS=["आ","सो","म","बु","बि","शु","श"];
  const daysInMonth=new Date(year,month+1,0).getDate();
  const firstDay=new Date(year,month,1).getDay();

  const [events,setEvents]=useState([]);
  const [assessments,setAssessments]=useState([]);
  const [loading,setLoading]=useState(true);
  // NEW — live preview: a day cell that's hovered (desktop, mouse pointer)
  // shows a small floating tooltip with that day's events, right where the
  // pointer is — no click needed, nothing to scroll to.
  const [hoverDate,setHoverDate]=useState(null);
  const [showForm,setShowForm]=useState(false);
  const [editing,setEditing]=useState(null);
  const [form,setForm]=useState(null);
  const [saving,setSaving]=useState(false);
  // NEW — AI calendar upload: a teacher uploads a photo/PDF of the actual
  // school calendar, Gemini reads it and proposes events, the teacher
  // reviews/edits/deselects before anything is saved. Manual add (above)
  // stays completely separate and untouched.
  const [uploading,setUploading]=useState(false);
  const [uploadError,setUploadError]=useState("");
  const [reviewEvents,setReviewEvents]=useState(null); // null = no review open; array = extracted, pending confirm
  const [savingReview,setSavingReview]=useState(false);
  // FIX — saveEvent used to silently do nothing on failure (e.g. the
  // calendar_events table/policies missing from the database): the modal
  // just sat there with no feedback, which is exactly what "कार्यक्रम
  // थप्नुहोस्" not working looked like from the outside. Now any db error
  // is shown right in the form instead of being swallowed.
  const [formError,setFormError]=useState("");

  const load=useCallback(async()=>{
    setLoading(true);
    // FIX — db.getAssessments() was called with no classLabel, so exam
    // due-dates from every class showed up as markers on this calendar
    // regardless of which class was selected.
    const [{data:ev},{data:as}]=await Promise.all([db.getCalendarEvents(classLabel),db.getAssessments(classLabel)]);
    setEvents(ev||[]);
    setAssessments((as||[]).filter((a)=>a.due_date));
    setLoading(false);
  },[classLabel]);
  // FIX — this only ever loaded once (on mount), but Calendar stays alive
  // in the background once visited (like every other tab). An assessment
  // created elsewhere (Assessment Builder, or generated as part of a Path)
  // while Calendar wasn't the active tab used to never show up here until
  // a full app reload. Now it reloads every time this tab becomes active
  // again, not just the first time.
  useEffect(()=>{ if(active) load(); },[active,load]);

  // NEW — teacher-added events and existing assessment due-dates (already
  // real dates in the database) merged into one shape, so "परीक्षा
  // तालिका" isn't a separate disconnected list — an assessment with a due
  // date IS an exam-schedule entry on this calendar automatically.
  const allItems=useMemo(()=>{
    const fromEvents=events.map((e)=>({id:`ev-${e.id}`,title:e.title,category:e.category,start:e.start_date,end:e.end_date||e.start_date,time:e.time,notes:e.notes,editable:true,raw:e}));
    const fromAssessments=assessments.map((a)=>({id:`as-${a.id}`,title:a.title,category:"exam",start:a.due_date,end:a.due_date,editable:false,raw:a}));
    return [...fromEvents,...fromAssessments];
  },[events,assessments]);

  const itemsByDate=useMemo(()=>{
    const map={};
    for(const it of allItems){
      let d=parseDate(it.start);const end=parseDate(it.end);let guard=0;
      while(d<=end&&guard<62){
        (map[fmtDate(d)] ||= []).push(it);
        d=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);guard++;
      }
    }
    return map;
  },[allItems]);

  const selectedItems=(itemsByDate[selected]||[]).sort((a,b)=>(a.time||"99:99").localeCompare(b.time||"99:99"));

  // FIX — openNew always used to write into whichever date was already
  // "selected" (a separate bit of state), which meant tapping a day and
  // then "कार्यक्रम थप्नुहोस्" could disagree if selection changed in
  // between. It now optionally takes the exact date to prefill, so the
  // inline per-day "+" always adds to the day it's sitting under.
  const openNew=(dateStr)=>{setEditing(null);setFormError("");setForm({title:"",category:"event",start_date:dateStr||selected,end_date:"",multiDay:false,time:"",notes:"",allClasses:false});setShowForm(true);};
  const openEdit=(it)=>{if(!it.editable)return;const raw=it.raw;setEditing(raw);setFormError("");setForm({title:raw.title,category:raw.category,start_date:raw.start_date,end_date:raw.end_date||"",multiDay:!!raw.end_date,time:raw.time||"",notes:raw.notes||"",allClasses:!raw.class_label});setShowForm(true);};

  const saveEvent=async()=>{
    if(!form.title.trim()||!form.start_date)return;
    setSaving(true);setFormError("");
    const payload={
      ...(editing?{id:editing.id}:{}),
      title:form.title.trim(),
      category:form.category,
      start_date:form.start_date,
      end_date:form.multiDay&&form.end_date?form.end_date:null,
      time:form.time||null,
      notes:form.notes.trim()||null,
      class_label:form.allClasses?null:classLabel,
    };
    const{error}=await db.upsertCalendarEvent(payload);
    setSaving(false);
    if(!error){setShowForm(false);setEditing(null);load();}
    else setFormError("सुरक्षित गर्न सकिएन: "+(error.message||"अज्ञात त्रुटि। कृपया पछि फेरि प्रयास गर्नुहोस्।"));
  };

  const deleteEvent=async(raw)=>{
    if(!confirm(`"${raw.title}" मेटाउने?`))return;
    await db.deleteCalendarEvent(raw.id);
    load();
  };

  // NEW — sends the uploaded calendar (photo or PDF) to Gemini and asks
  // for a structured list of events back. Nepali school calendars are
  // often printed in Bikram Sambat (BS) dates, not AD — Gemini is asked to
  // convert to AD, but this is exactly the kind of thing worth double-
  // checking, which is why nothing is saved until the teacher reviews and
  // confirms each item below, and every date field stays editable there.
  const handleCalendarUpload=async(e)=>{
    const file=e.target.files?.[0];
    e.target.value="";
    if(!file)return;
    setUploading(true);setUploadError("");
    try{
      const base64=await gemini.fileToBase64(file);
      const mimeType=file.type||(file.name.toLowerCase().endsWith(".pdf")?"application/pdf":"image/jpeg");
      const prompt=`यो विद्यालयको पात्रो (school calendar) हो। यसमा भएका सबै घटनाहरू (विदा, परीक्षा, कार्यक्रम, तालिम, म्याद, आदि) पहिचान गरेर तलको JSON structure मा मात्र फर्काउनुहोस्, अरू कुनै टेक्स्ट नथप्नुहोस्:

[{"title":"...", "category":"event|holiday|exam|deadline|training|reminder", "start_date":"YYYY-MM-DD", "end_date":"YYYY-MM-DD वा null (एकदिने भए null)", "notes":"थप विवरण भए, नत्र null"}]

महत्त्वपूर्ण:
- मिति नेपाली पात्रो (Bikram Sambat/BS) मा लेखिएको भए, अंग्रेजी (AD/Gregorian) मा रूपान्तर गरेर मात्र दिनुहोस्। कागजातमा दुवै (BS र AD) भएमा AD नै प्रयोग गर्नुहोस्।
- category हरूमध्ये एउटा मात्र प्रयोग गर्नुहोस् (माथि सूचीबद्ध ६ वटा), अनुमान लगाएर सबैभन्दा मिल्दो छान्नुहोस्।
- टिठिक मिति पत्ता नलागेको घटना हरू छोड्नुहोस्।
- आजको मिति सन्दर्भको लागि: ${fmtDate(new Date())}`;
      const raw=await gemini.generateWithFileJSON(prompt,base64,mimeType);
      let parsed;
      try{parsed=JSON.parse(raw);}catch{throw new Error("AI ले मिल्दो जानकारी दिन सकेन। अर्को फाइल प्रयास गर्नुहोस्।");}
      if(!Array.isArray(parsed)||parsed.length===0){throw new Error("यो फाइलबाट कुनै घटना फेला परेन।");}
      const cleaned=parsed
        .filter((ev)=>ev?.title&&ev?.start_date&&/^\d{4}-\d{2}-\d{2}$/.test(ev.start_date))
        .map((ev,i)=>({
          _key:`u${i}`,selected:true,
          title:String(ev.title).slice(0,200),
          category:EVENT_CATEGORY_ORDER.includes(ev.category)?ev.category:"event",
          start_date:ev.start_date,
          end_date:(ev.end_date&&/^\d{4}-\d{2}-\d{2}$/.test(ev.end_date))?ev.end_date:"",
          notes:ev.notes?String(ev.notes).slice(0,300):"",
        }));
      if(cleaned.length===0)throw new Error("यो फाइलबाट मिल्दो मिति भएका घटना फेला परेन।");
      setReviewEvents(cleaned);
    }catch(err){
      setUploadError(err.message||"पात्रो पढ्न सकिएन। फेरि प्रयास गर्नुहोस्।");
    }finally{
      setUploading(false);
    }
  };

  const updateReviewItem=(key,patch)=>setReviewEvents((prev)=>prev.map((it)=>it._key===key?{...it,...patch}:it));

  const confirmReviewEvents=async()=>{
    const selected=reviewEvents.filter((it)=>it.selected);
    if(selected.length===0){setReviewEvents(null);return;}
    setSavingReview(true);
    const rows=selected.map((it)=>({
      title:it.title.trim(),category:it.category,start_date:it.start_date,
      end_date:it.end_date||null,notes:it.notes.trim()||null,
      class_label:classLabel,source:"imported",
    }));
    const{error}=await db.bulkInsertCalendarEvents(rows);
    setSavingReview(false);
    if(!error){setReviewEvents(null);load();}
    else setUploadError("सुरक्षित गर्न सकिएन: "+error.message);
  };

  const selectedLabel=(()=>{const d=parseDate(selected);return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;})();

  // NEW — live calendar: instead of a fixed list glued to the bottom of
  // the page (always another scroll away), the month grid is split into
  // weeks so a small details panel can be dropped in right after whichever
  // week the selected day sits in — it appears in place, directly under
  // that date, with nothing to scroll past to see it.
  const selDateObj=parseDate(selected);
  const selInThisMonth=selDateObj.getFullYear()===year&&selDateObj.getMonth()===month;
  const totalCells=firstDay+daysInMonth;
  const totalWeeks=Math.ceil(totalCells/7);
  const weeks=Array.from({length:totalWeeks},(_,w)=>Array.from({length:7},(_,d)=>{
    const dayNum=w*7+d-firstDay+1;
    return (dayNum>=1&&dayNum<=daysInMonth)?dayNum:null;
  }));

  return(
    <div className="ss-page-read" style={{padding:"20px 20px 130px",maxWidth:760,margin:"0 auto",overflowX:"hidden"}}>
      <style>{`
        .cal-header-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:2px;}
        .cal-cat-row{max-width:100%;}
        @media(max-width:400px){
          .cal-cat-row .ss-chip{font-size:12.5px!important;padding:6px 9px!important;}
        }
        .cal-day-cell{position:relative;}
        .cal-day-btn{width:100%;box-sizing:border-box;}
        .cal-tooltip{position:absolute;bottom:calc(100% + 5px);left:50%;transform:translateX(-50%);z-index:30;background:${SURFACE};border:1px solid ${BORDER};border-radius:10px;padding:7px 9px;box-shadow:${SHADOW.lg};min-width:140px;max-width:190px;pointer-events:none;text-align:left;}
        .cal-tooltip-title{font-size:12.5px;font-weight:700;color:${INK};white-space:normal;line-height:1.3;}
        .cal-tooltip-title+.cal-tooltip-title{margin-top:4px;}
        .cal-tooltip-more{font-size:11px;color:${INK_SOFT};margin-top:3px;}
        @media(hover:none){.cal-tooltip{display:none;}}
        .cal-day-panel{grid-column:1 / -1;}
      `}</style>
      <PageHeader icon={CalendarDays} title="पात्रो" color={VIOLET} action={
        <div className="cal-header-actions">
          {/* NEW — upload a photo/PDF of the actual school calendar and let
              AI propose events, instead of typing every holiday/exam date
              in by hand. Manual add (next button) still works exactly as
              before — this is an addition, not a replacement. */}
          <label className="ss-btn" style={{display:"flex",alignItems:"center",gap:6,background:SURFACE_2,color:INK,border:`1px solid ${BORDER}`,borderRadius:999,padding:"9px 16px",fontWeight:700,fontSize:15.5,cursor:uploading?"default":"pointer",boxShadow:SHADOW.sm,flexShrink:0,whiteSpace:"nowrap"}}>
            <Paperclip size={16}/>{uploading?"पढ्दै...":"पात्रो अपलोड गर्नुहोस्"}
            <input type="file" accept="application/pdf,.pdf,image/*" onChange={handleCalendarUpload} disabled={uploading} style={{display:"none"}}/>
          </label>
          <Button size="sm" icon={Plus} onClick={()=>openNew()} style={{background:`linear-gradient(160deg, ${VIOLET} 0%, color-mix(in srgb, ${VIOLET} 72%, black) 100%)`,boxShadow:`0 4px 12px color-mix(in srgb, ${VIOLET} 22%, transparent)`,flexShrink:0,whiteSpace:"nowrap"}}>कार्यक्रम थप्नुहोस्</Button>
        </div>
      }/>
      {uploadError&&<div style={{background:DANGER_BG,color:DANGER,borderRadius:12,padding:"10px 14px",fontSize:15,fontWeight:600,marginBottom:14}}>{uploadError}</div>}

      <Card accentColor={VIOLET} style={{marginBottom:14,padding:14,overflow:"visible"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <button className="ss-btn" onClick={()=>{if(month===0){setMonth(11);setYear((y)=>y-1);}else setMonth((m)=>m-1);}} style={{background:`linear-gradient(135deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`,border:"none",borderRadius:999,width:34,height:34,fontWeight:700,cursor:"pointer",color:"#fff",fontSize:18,boxShadow:SHADOW.sm}}>‹</button>
          <div style={{textAlign:"center"}}>
            <select value={month} onChange={(e)=>setMonth(Number(e.target.value))} style={{border:"none",fontWeight:800,fontSize:19,color:INK,cursor:"pointer",background:"transparent",fontFamily:"'SSText','Kalimati','Times New Roman',serif"}}>
              {MONTHS.map((m,i)=><option key={i} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={(e)=>setYear(Number(e.target.value))} style={{border:"none",fontWeight:800,fontSize:19,color:INK,cursor:"pointer",background:"transparent",fontFamily:"'SSText','Kalimati','Times New Roman',serif",marginLeft:4}}>
              {Array.from({length:5},(_,i)=>today.getFullYear()-1+i).map((y)=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <button className="ss-btn" onClick={()=>{if(month===11){setMonth(0);setYear((y)=>y+1);}else setMonth((m)=>m+1);}} style={{background:`linear-gradient(135deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`,border:"none",borderRadius:999,width:34,height:34,fontWeight:700,cursor:"pointer",color:"#fff",fontSize:18,boxShadow:SHADOW.sm}}>›</button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:6}}>
          {DAYS.map((d)=><div key={d} style={{textAlign:"center",fontSize:15,fontWeight:700,color:INK_SOFT,padding:"4px 0"}}>{d}</div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
          {(()=>{
            // NEW — live calendar: the grid is built week-by-week instead
            // of as one flat run of days, so a details panel can be
            // dropped in as its own full-width row right after the week
            // that holds the selected date — in place, not at the bottom.
            const nodes=[];
            weeks.forEach((week,wi)=>{
              week.forEach((day,di)=>{
                if(day===null){nodes.push(<div key={`e-${wi}-${di}`}/>);return;}
                const dateStr=fmtDate(new Date(year,month,day));
                const isToday=dateStr===fmtDate(today);
                const isSel=dateStr===selected;
                const dayItems=itemsByDate[dateStr]||[];
                const dots=[...new Set(dayItems.map((i)=>i.category))].slice(0,3);
                nodes.push(
                  <div key={dateStr} className="cal-day-cell"
                    onMouseEnter={()=>setHoverDate(dateStr)}
                    onMouseLeave={()=>setHoverDate((h)=>h===dateStr?null:h)}>
                    <button className="ss-btn cal-day-btn" onClick={()=>setSelected(dateStr)} style={{aspectRatio:1,borderRadius:12,border:isToday||isSel?"none":`1px solid color-mix(in srgb, ${BORDER} 60%, transparent)`,background:isToday?`linear-gradient(135deg, ${MARIGOLD} 0%, ${ACCENT} 100%)`:isSel?ACCENT_LIGHT:"transparent",color:isToday?"#fff":isSel?ACCENT:INK,fontWeight:isToday||isSel?700:600,fontSize:16.5,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,padding:0,boxShadow:isToday?SHADOW.accent:"none"}}>
                      <span>{day}</span>
                      {dots.length>0&&(
                        <span style={{display:"flex",gap:2,height:5}}>
                          {dots.map((cat)=><span key={cat} style={{width:5,height:5,borderRadius:"50%",background:isToday?"#fff":EVENT_CATEGORY_META[cat]?.color||INK_SOFT,flexShrink:0}}/>)}
                        </span>
                      )}
                    </button>
                    {/* NEW — hovering with a mouse (desktop) previews the
                        day's events right there, no click needed. */}
                    {hoverDate===dateStr&&dayItems.length>0&&(
                      <div className="cal-tooltip">
                        {dayItems.slice(0,3).map((it)=><div key={it.id} className="cal-tooltip-title">{it.title}</div>)}
                        {dayItems.length>3&&<div className="cal-tooltip-more">+{dayItems.length-3} थप</div>}
                      </div>
                    )}
                  </div>
                );
              });
              // NEW — clicking (or already having selected) a date in this
              // week drops its full details in right here, as its own row,
              // instead of at the very bottom of the page.
              if(selInThisMonth&&week.includes(selDateObj.getDate())){
                nodes.push(
                  <div key={`panel-${wi}`} className="cal-day-panel" style={{background:SURFACE_2,border:`1px solid ${BORDER}`,borderRadius:14,padding:"11px 12px 9px",margin:"6px 0 2px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,gap:8}}>
                      <div style={{fontSize:14.5,fontWeight:800,color:INK}}>{selectedLabel}</div>
                      <button className="ss-btn" onClick={()=>openNew(selected)} style={{display:"flex",alignItems:"center",gap:4,background:"none",border:`1.5px dashed ${VIOLET}`,borderRadius:999,padding:"4px 10px",fontSize:13,fontWeight:700,color:VIOLET,cursor:"pointer",flexShrink:0}}><Plus size={13}/>थप्नुहोस्</button>
                    </div>
                    {loading?<Spinner small/>:selectedItems.length===0?(
                      <div style={{color:INK_SOFT,fontSize:14.5,padding:"2px 0 4px"}}>यो दिन कुनै कार्यक्रम छैन।</div>
                    ):(
                      <div style={{display:"flex",flexDirection:"column",gap:6}}>
                        {selectedItems.map((it)=>{
                          const meta=EVENT_CATEGORY_META[it.category]||EVENT_CATEGORY_META.event;const Icon=meta.icon;
                          return(
                            <div key={it.id} style={{display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,background:SURFACE,border:`1px solid ${BORDER}`,borderLeft:`4px solid ${meta.color}`}}>
                              <Icon size={15} color={meta.color} style={{flexShrink:0}}/>
                              <div style={{flex:1,minWidth:0}} onClick={()=>openEdit(it)} title={it.editable?"सम्पादन गर्नुहोस्":""} className={it.editable?"ss-btn":""}>
                                <div style={{fontSize:15,color:INK,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{it.title}</div>
                                <div style={{fontSize:12.5,color:INK_SOFT,display:"flex",gap:5,flexWrap:"wrap"}}>
                                  <span>{meta.label}</span>{it.time&&<span>· {it.time}</span>}{!it.editable&&<span>· मूल्याङ्कनबाट</span>}{it.start!==it.end&&<span>· {parseDate(it.start).getDate()}–{parseDate(it.end).getDate()} {MONTHS[parseDate(it.end).getMonth()]}</span>}
                                </div>
                              </div>
                              {it.editable&&<button className="ss-icon-btn" onClick={()=>deleteEvent(it.raw)} style={{cursor:"pointer",color:INK_SOFT,padding:5,flexShrink:0}}><Trash2 size={14}/></button>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
            });
            return nodes;
          })()}
        </div>
      </Card>

      {showForm&&form&&(
        <div style={{position:"fixed",inset:0,background:"rgba(20,18,14,0.55)",backdropFilter:"blur(22px)",WebkitBackdropFilter:"blur(22px)",zIndex:70,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowForm(false)}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:SURFACE,borderRadius:20,padding:24,maxWidth:"min(94vw, 720px)",width:"100%",maxHeight:"90vh",overflowX:"hidden",overflowY:"auto",boxSizing:"border-box",boxShadow:SHADOW.lg,fontSize:"clamp(15px, 1.6vw, 17px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontSize:19,fontWeight:800,color:INK}}>{editing?"कार्यक्रम सम्पादन":"नयाँ कार्यक्रम"}</div>
              <IconButton icon={X} onClick={()=>setShowForm(false)} size={20}/>
            </div>
            <input autoFocus value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="कार्यक्रमको नाम" className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,marginBottom:10,boxSizing:"border-box"}}/>
            <div className="cal-cat-row" style={{display:"flex",gap:7,flexWrap:"wrap",marginBottom:12}}>
              {EVENT_CATEGORY_ORDER.map((key)=>{
                const meta=EVENT_CATEGORY_META[key];const Icon=meta.icon;const active=form.category===key;
                return<Chip key={key} onClick={()=>setForm({...form,category:key})} active={active} color={meta.color} icon={Icon} size="sm">{meta.label}</Chip>;
              })}
            </div>
            <div style={{display:"flex",gap:8,marginBottom:10,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:140}}>
                <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginBottom:4}}>मिति</div>
                <input type="date" value={form.start_date} onChange={(e)=>setForm({...form,start_date:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
              </div>
              <div style={{flex:1,minWidth:120}}>
                <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginBottom:4}}>समय (वैकल्पिक)</div>
                <input type="time" value={form.time} onChange={(e)=>setForm({...form,time:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
              </div>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:7,marginBottom:10,cursor:"pointer",fontSize:15,color:INK,fontWeight:600}}>
              <input type="checkbox" checked={form.multiDay} onChange={(e)=>setForm({...form,multiDay:e.target.checked})}/> धेरै दिनसम्म चल्ने (जस्तै: बिदा)
            </label>
            {form.multiDay&&(
              <div style={{marginBottom:10}}>
                <div style={{fontSize:13.5,color:INK_SOFT,fontWeight:600,marginBottom:4}}>अन्तिम मिति</div>
                <input type="date" value={form.end_date} min={form.start_date} onChange={(e)=>setForm({...form,end_date:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:10,padding:"9px 12px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2}}/>
              </div>
            )}
            <label style={{display:"flex",alignItems:"center",gap:7,marginBottom:10,cursor:"pointer",fontSize:15,color:INK,fontWeight:600}}>
              <input type="checkbox" checked={form.allClasses} onChange={(e)=>setForm({...form,allClasses:e.target.checked})}/> सबै कक्षाका लागि (विद्यालयब्यापी)
            </label>
            <textarea value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} placeholder="टिप्पणी (वैकल्पिक)" rows={2} className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16,border:`1.5px solid ${BORDER}`,background:SURFACE_2,resize:"vertical",marginBottom:14}}/>
            {formError&&<div style={{background:DANGER_BG,color:DANGER,borderRadius:10,padding:"9px 12px",fontSize:14.5,fontWeight:600,marginBottom:12}}>{formError}</div>}
            <div style={{display:"flex",gap:8}}>
              {editing&&<button className="ss-btn" onClick={()=>{deleteEvent(editing);setShowForm(false);}} style={{padding:"11px 16px",borderRadius:10,border:`1px solid ${DANGER_BG}`,background:DANGER_BG,color:DANGER,fontWeight:700,cursor:"pointer"}}><Trash2 size={16}/></button>}
              <button className="ss-btn" onClick={saveEvent} disabled={saving||!form.title.trim()} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"सुरक्षित हुँदैछ...":"सुरक्षित गर्नुहोस्"}</button>
            </div>
          </div>
        </div>
      )}

      {/* NEW — AI extraction review: nothing from an uploaded calendar
          gets saved until the teacher confirms it here. Each row is
          editable and can be unchecked, since AI reading a scanned/photo
          calendar (and possibly converting BS dates to AD) won't always
          be perfect. */}
      {reviewEvents&&(
        <div className="no-print" style={{position:"fixed",inset:0,zIndex:85,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.55)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:16}}>
          <div style={{background:SURFACE,borderRadius:18,padding:24,maxWidth:"min(94vw, 880px)",width:"100%",maxHeight:"93vh",display:"flex",flexDirection:"column",boxSizing:"border-box",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`,fontSize:"clamp(15px, 1.6vw, 17px)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
              <div style={{fontSize:19,fontWeight:800,color:INK}}>{reviewEvents.length} घटना फेला पर्यो</div>
              <IconButton icon={X} onClick={()=>setReviewEvents(null)} size={20}/>
            </div>
            <div style={{fontSize:14.5,color:INK_SOFT,marginBottom:12,lineHeight:1.5}}>मिति र विवरण जाँच गर्नुहोस् — गलत भए सच्याउनुहोस् वा नचाहिने भए ✕ थिच्नुहोस्, त्यसपछि मात्र सुरक्षित हुनेछ।</div>
            <div style={{overflowY:"auto",display:"flex",flexDirection:"column",gap:8,marginBottom:14}}>
              {reviewEvents.map((it)=>{
                const meta=EVENT_CATEGORY_META[it.category]||EVENT_CATEGORY_META.event;
                return(
                  <div key={it._key} style={{display:"flex",gap:8,padding:10,borderRadius:12,background:it.selected?SURFACE_2:"transparent",border:`1px solid ${it.selected?BORDER:"transparent"}`,opacity:it.selected?1:0.5}}>
                    <input type="checkbox" checked={it.selected} onChange={(e)=>updateReviewItem(it._key,{selected:e.target.checked})} style={{marginTop:10,flexShrink:0}}/>
                    <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:6}}>
                      <input value={it.title} onChange={(e)=>updateReviewItem(it._key,{title:e.target.value})} className="ss-field" style={{width:"100%",borderRadius:8,padding:"7px 10px",fontSize:15.5,fontWeight:700,border:`1px solid ${BORDER}`,background:SURFACE}}/>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <select value={it.category} onChange={(e)=>updateReviewItem(it._key,{category:e.target.value})} style={{borderRadius:7,padding:"5px 8px",fontSize:13.5,border:`1px solid ${BORDER}`,background:SURFACE,color:meta.color,fontWeight:700}}>
                          {EVENT_CATEGORY_ORDER.map((k)=><option key={k} value={k}>{EVENT_CATEGORY_META[k].label}</option>)}
                        </select>
                        <input type="date" value={it.start_date} onChange={(e)=>updateReviewItem(it._key,{start_date:e.target.value})} style={{borderRadius:7,padding:"5px 8px",fontSize:13.5,border:`1px solid ${BORDER}`,background:SURFACE}}/>
                        <input type="date" value={it.end_date} placeholder="अन्तिम मिति" onChange={(e)=>updateReviewItem(it._key,{end_date:e.target.value})} style={{borderRadius:7,padding:"5px 8px",fontSize:13.5,border:`1px solid ${BORDER}`,background:SURFACE,color:it.end_date?INK:INK_SOFT}}/>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="ss-btn" onClick={()=>setReviewEvents(null)} style={{flex:1,padding:"11px",borderRadius:10,border:`1px solid ${BORDER}`,background:SURFACE,fontWeight:600,cursor:"pointer",boxShadow:SHADOW.sm}}>रद्द गर्नुहोस्</button>
              <button className="ss-btn" onClick={confirmReviewEvents} disabled={savingReview} style={{flex:1,padding:"11px",borderRadius:10,border:"none",background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",fontWeight:700,cursor:"pointer",boxShadow:SHADOW.accent}}>{savingReview?"सुरक्षित हुँदैछ...":`${reviewEvents.filter((it)=>it.selected).length} थप्नुहोस्`}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Settings({ session, sections, currentSection, onSectionAdded, onSectionUpdated, onSectionDeleted, theme, onToggleTheme, installPrompt, isStandalone, isIOS, onInstall, classLabel, subjectLabel, onClassChange, onSubjectChange, teacherName, onTeacherNameChange }) {
  const [nameDraft,setNameDraft]=useState(teacherName);
  const [nameMsg,setNameMsg]=useState("");
  const [classDraft,setClassDraft]=useState(classLabel);
  const [subjectDraft,setSubjectDraft]=useState(subjectLabel);
  const [classMsg,setClassMsg]=useState("");
  const [name,setName]=useState("");
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState("");
  const [sectionMsg,setSectionMsg]=useState("");
  const [uploading,setUploading]=useState(false);
  const [pdfLoaded,setPdfLoaded]=useState(false);
  const [exportBusy,setExportBusy]=useState(false);
  const [exportMsg,setExportMsg]=useState("");

  // NEW — Teacher's Guide + this year's Lesson Plan/Rubric format, both
  // re-uploadable any time the school changes them. Neither's structure is
  // hardcoded anywhere in the app — the AI reads these files fresh whenever
  // it drafts a Plan Group. See migration_curriculum_templates.sql.
  const [teacherGuide,setTeacherGuide]=useState(null);
  const [guideBusy,setGuideBusy]=useState(false);
  const [guideMsg,setGuideMsg]=useState("");
  const [formatTemplate,setFormatTemplate]=useState(null);
  const [templateYearDraft,setTemplateYearDraft]=useState("");
  const [templateLPFile,setTemplateLPFile]=useState(null);
  const [templateRubricFile,setTemplateRubricFile]=useState(null);
  const [templateBusy,setTemplateBusy]=useState(false);
  const [templateMsg,setTemplateMsg]=useState("");

  useEffect(()=>{
    db.getActiveTeacherGuide().then(({data})=>setTeacherGuide(data||null));
  },[]);
  useEffect(()=>{
    db.getActiveFormatTemplate(classLabel).then(({data})=>{
      setFormatTemplate(data||null);
      setTemplateYearDraft(data?.year_label||"");
    });
  },[classLabel]);

  const uploadGuideHandler=async(e)=>{
    const file=e.target.files[0];
    if(!file)return;
    setGuideBusy(true);setGuideMsg("अपलोड हुँदै...");
    try{
      const{data:{user}}=await supabase.auth.getUser();
      const{path,error:upErr}=await db.uploadTeacherGuideFile(file,user.id);
      if(upErr)throw upErr;
      const fileType=file.type==="application/pdf"?"pdf":file.type.startsWith("image/")?"image":"docx";
      const{data,error}=await db.insertTeacherGuide({label:file.name,storage_path:path,file_type:fileType});
      if(error)throw error;
      setTeacherGuide(data);
      setGuideMsg(`"${file.name}" सुरक्षित भयो — अब यही मार्गदर्शनबाट पाठ योजना बनाइनेछ।`);
    }catch(err){setGuideMsg("त्रुटि: "+(err.message||"अपलोड असफल भयो।"));}
    setGuideBusy(false);e.target.value="";
  };

  const deleteGuideHandler=async()=>{
    if(!teacherGuide||!confirm("यो विद्यार्थी मूल्याङ्कन मार्गदर्शन हटाउने? यसपछि AI ले नयाँ मार्गदर्शन नहुन्जेल पाठ्यपुस्तकको भरमा मात्र योजना बनाउनेछ।"))return;
    setGuideBusy(true);
    await db.deleteTeacherGuide(teacherGuide.id,teacherGuide.storage_path);
    setTeacherGuide(null);setGuideBusy(false);
    setGuideMsg("हटाइयो।");setTimeout(()=>setGuideMsg(""),2000);
  };

  const saveFormatTemplate=async()=>{
    if(!templateLPFile&&!formatTemplate?.lesson_plan_storage_path){setTemplateMsg("कम्तीमा पाठ योजनाको ढाँचा फाइल चाहिन्छ।");return;}
    if(!templateYearDraft.trim()){setTemplateMsg("वर्ष लेख्नुहोस् (जस्तै २०८२)।");return;}
    setTemplateBusy(true);setTemplateMsg("सुरक्षित हुँदै...");
    try{
      const{data:{user}}=await supabase.auth.getUser();
      let lpPath=formatTemplate?.lesson_plan_storage_path||null;
      let lpType=formatTemplate?.lesson_plan_file_type||null;
      let rubricPath=formatTemplate?.rubric_storage_path||null;
      let rubricType=formatTemplate?.rubric_file_type||null;
      if(templateLPFile){
        const{path,error}=await db.uploadFormatTemplateFile(templateLPFile,user.id,classLabel,"lesson-plan");
        if(error)throw error;
        lpPath=path;lpType=templateLPFile.name.split(".").pop().toLowerCase();
      }
      if(templateRubricFile){
        const{path,error}=await db.uploadFormatTemplateFile(templateRubricFile,user.id,classLabel,"rubric");
        if(error)throw error;
        rubricPath=path;rubricType=templateRubricFile.name.split(".").pop().toLowerCase();
      }
      const{data,error}=await db.insertFormatTemplate({
        class_label:classLabel,year_label:templateYearDraft.trim(),
        lesson_plan_storage_path:lpPath,lesson_plan_file_type:lpType,
        rubric_storage_path:rubricPath,rubric_file_type:rubricType,
      });
      if(error)throw error;
      setFormatTemplate(data);setTemplateLPFile(null);setTemplateRubricFile(null);
      setTemplateMsg(`"${classLabel}" का लागि ${templateYearDraft} को ढाँचा सुरक्षित भयो।`);
    }catch(err){setTemplateMsg("त्रुटि: "+(err.message||"सुरक्षित हुन सकेन।"));}
    setTemplateBusy(false);
  };

  const exportAllData=async()=>{
    setExportBusy(true);setExportMsg("");
    try{
      const[lessons,homework,chapters,resources,questions,activities,materials]=await Promise.all([
        db.getLessons(null,null),db.getHomework(null),db.getChapters(null),
        db.getSavedResources(),db.getQuestions(),db.getActivities(),db.getMaterials(null),
      ]);
      // If any single piece failed to fetch, say so plainly rather than
      // silently shipping a backup file that's missing a whole category
      // of data — a backup you can't trust is worse than no backup.
      const failed=[["पाठहरू",lessons],["गृहकार्य",homework],["अध्याय",chapters],["सुरक्षित स्रोत",resources],["प्रश्न",questions],["क्रियाकलाप",activities],["सामग्री",materials]]
        .filter(([,r])=>r.error).map(([label])=>label);
      const payload={
        exported_at:new Date().toISOString(),
        teacher_name:teacherName||null,
        lessons:lessons.data||[],homework:homework.data||[],chapters:chapters.data||[],
        saved_resources:resources.data||[],questions:questions.data||[],activities:activities.data||[],materials:materials.data||[],
      };
      const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=`sikshya-sathi-backup-${new Date().toISOString().slice(0,10)}.json`;
      document.body.appendChild(a);a.click();a.remove();
      URL.revokeObjectURL(url);
      setExportMsg(failed.length?`त्रुटि: ${failed.join(", ")} डाउनलोड हुन सकेन — फेरि प्रयास गर्नुहोस्।`:"✓ डाउनलोड सम्पन्न भयो।");
    }catch(e){
      setExportMsg("त्रुटि: "+(e.message||"डाउनलोड असफल भयो।"));
    }finally{
      setExportBusy(false);
    }
  };

  // NEW — the "मर्मत उपकरण" (repair tools) panel that used to live here
  // (merge duplicate chapters / reconnect orphaned tags / fix file content
  // types) was a one-off cleanup tool for data problems from before the
  // DataContext rewrite. Now that chapters/lessons/materials all go through
  // one shared door (see src/context/DataContext.jsx) those problems can't
  // recur, so the panel was removed — the underlying db.js functions
  // (repairDuplicateChapters etc.) are left in place, unused, in case a
  // one-time cleanup is ever needed again.

  useEffect(()=>{
    gemini.getTextbookPart(classLabel).then((part)=>setPdfLoaded(!!part));
  },[classLabel]);

  const saveName=()=>{
    onTeacherNameChange(nameDraft.trim());
    setNameMsg("सुरक्षित भयो!");
    setTimeout(()=>setNameMsg(""),2000);
  };

  const saveClassSubject=()=>{
    onClassChange(classDraft.trim()||"कक्षा ५");
    onSubjectChange(subjectDraft.trim()||"सामाजिक अध्ययन");
    setClassMsg("सुरक्षित भयो!");
    setTimeout(()=>setClassMsg(""),2000);
  };

  const addSection=async()=>{
    if(!name.trim())return;
    // NEW — nothing previously stopped adding the same section twice
    // (easy to do by accident on a slow connection with a double-tap).
    if(sections.some((s)=>s.name.trim().toLowerCase()===name.trim().toLowerCase())){
      setSectionMsg("यो नामको सेक्सन पहिल्यै छ।");setTimeout(()=>setSectionMsg(""),2500);return;
    }
    setSaving(true);
    const{data,error}=await db.createSection(name.trim());
    setSaving(false);
    if(error){setSectionMsg("त्रुटि: "+error.message);return;}
    onSectionAdded(data);setName("");setSectionMsg(`"${data.name}" थपियो!`);
    setTimeout(()=>setSectionMsg(""),2000);
  };

  // NEW — sections could only ever be added, never renamed or deleted
  // (same gap chapters had before that got fixed). Deleting un-assigns
  // rather than deletes any lesson/homework scoped to it — see
  // deleteSection in db.js.
  const [editingSectionId,setEditingSectionId]=useState(null);
  const [sectionEditValue,setSectionEditValue]=useState("");
  const [sectionBusy,setSectionBusy]=useState(null);
  const renameSection=async(s)=>{
    const newName=sectionEditValue.trim();
    if(!newName||newName===s.name){setEditingSectionId(null);return;}
    setSectionBusy(s.id);
    const{data,error}=await db.renameSection(s.id,newName);
    setSectionBusy(null);setEditingSectionId(null);
    if(!error)onSectionUpdated(data);
  };
  const deleteSectionHandler=async(s)=>{
    if(!confirm(`"${s.name}" सेक्सन मेटाउने? यसमा भएका पाठ/गृहकार्य कुनै सेक्सनमा नराखिने छन् (मेटिने छैनन्)।`))return;
    setSectionBusy(s.id);
    const{error}=await db.deleteSection(s.id);
    setSectionBusy(null);
    if(!error)onSectionDeleted(s.id);
  };

  const uploadTextbook=async(e)=>{
    const file=e.target.files[0];
    if(!file||file.type!=="application/pdf"){setMsg("PDF फाइल मात्र।");return;}
    setUploading(true);setMsg("पाठ्यपुस्तक लोड गर्दै... (ठूलो फाइलका लागि केही समय लाग्छ)");
    try{
      const b64=await gemini.fileToBase64(file);
      await gemini.saveTextbook(b64,classLabel);
      gemini.invalidateTextbookCache(classLabel); // drop any stale cached reference so the new PDF gets (re-)uploaded next time it's needed
      db.clearTextbookChapterTextCache(classLabel); // NEW — old cached chapter text was extracted from the previous book; a new upload invalidates it
      setPdfLoaded(true);
      setMsg(`"${file.name}" सफलतापूर्वक लोड भयो! अब AI ले यसबाट उत्तर दिनेछ।`);
    }catch(e){setMsg("त्रुटि: "+e.message);}
    setUploading(false);e.target.value="";
  };

  const clearTextbookHandler=async()=>{
    if(!confirm("पाठ्यपुस्तक PDF हटाउने? यसपछि AI ले यो पाठ्यपुस्तकबाट सामग्री बनाउन सक्दैन (छुट्टै ट्याग गरिएका सामग्री फाइलमा भने असर पर्दैन)।"))return;
    await gemini.clearTextbook(classLabel);
    gemini.invalidateTextbookCache(classLabel);
    db.clearTextbookChapterTextCache(classLabel); // NEW — no textbook left, so no cached extract from it should linger either
    setPdfLoaded(false);
    setMsg("पाठ्यपुस्तक हटाइयो।");setTimeout(()=>setMsg(""),2000);
  };

  return(
    <div className="ss-page-read" style={{padding:"20px 20px 130px",maxWidth:680,margin:"0 auto"}}>
      <PageHeader icon={SettingsIcon} title="सेटिङ" color={VIOLET}/>

      {!isStandalone&&(
        <Card accentColor={TEAL} style={{marginBottom:14,background:`linear-gradient(135deg, ${tint(TEAL,10)} 0%, ${tint(ACCENT,5)} 100%)`,border:`1.5px solid ${ACCENT_LIGHT}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
            <div style={{width:46,height:46,borderRadius:14,background:`linear-gradient(160deg, ${TEAL} 0%, color-mix(in srgb, ${TEAL} 70%, black) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:`0 3px 10px color-mix(in srgb, ${TEAL} 32%, transparent)`}}><Zap size={21} color="#fff"/></div>
            <div>
              <div style={{fontWeight:800,fontSize:17,color:INK}}>फोन र कम्प्युटरमा एप झैं इन्स्टल गर्नुहोस्</div>
              <div style={{fontSize:15,color:INK_SOFT,marginTop:1}}>ब्राउजर बिना, होम स्क्रिनबाट सिधै खोल्नुहोस्</div>
            </div>
          </div>
          {isIOS?(
            <div style={{fontSize:15.5,color:INK,lineHeight:1.7,background:SURFACE,borderRadius:12,padding:"12px 14px"}}>
              iPhone/iPad मा: तल्लो Share बटन थिच्नुहोस् (वर्गाकार + माथितिरको बाण) → <b>"Add to Home Screen"</b> छान्नुहोस् → <b>"Add"</b> थिच्नुहोस्।
            </div>
          ):installPrompt?(
            <Button variant="primary" icon={Zap} onClick={onInstall} style={{width:"100%"}}>अहिले इन्स्टल गर्नुहोस्</Button>
          ):(
            <div style={{fontSize:15,color:INK_SOFT,lineHeight:1.6}}>तपाईंको ब्राउजरको एड्रेस बार वा मेनुमा रहेको "इन्स्टल" वा "Add to Home Screen" विकल्प प्रयोग गर्नुहोस्।</div>
          )}
        </Card>
      )}

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={BookOpen}>कक्षा र विषय</SectionLabel>
        <div style={{fontSize:15,color:INK_SOFT,marginBottom:12,lineHeight:1.6}}>यहाँ बदल्दा एपभर (होम स्क्रिन, AI उत्पन्न सामग्री, पाठ योजना, प्रश्न, कार्यपत्र...) सोही कक्षा र विषय अनुसार लागू हुन्छ।</div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <div style={{flex:1}}>
            <div style={{fontSize:14,color:INK_SOFT,fontWeight:600,marginBottom:5}}>कक्षा</div>
            <input value={classDraft} onChange={(e)=>setClassDraft(e.target.value)} placeholder="जस्तै: कक्षा ६" className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:14,color:INK_SOFT,fontWeight:600,marginBottom:5}}>विषय</div>
            <input value={subjectDraft} onChange={(e)=>setSubjectDraft(e.target.value)} placeholder="जस्तै: विज्ञान" className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          </div>
        </div>
        <Button variant="primary" size="sm" onClick={saveClassSubject}>सुरक्षित गर्नुहोस्</Button>
        {classMsg&&<div style={{marginTop:8,fontSize:15,color:ACCENT,fontWeight:600}}>{classMsg}</div>}
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={Sun} color={MARIGOLD_DARK}>देखावट (उज्यालो / गाढा)</SectionLabel>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>theme!=="light"&&onToggleTheme()} className="ss-chip" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:12,border:`2px solid ${theme==="light"?ACCENT:BORDER}`,background:theme==="light"?ACCENT_LIGHT:SURFACE,color:theme==="light"?ACCENT:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer"}}><Sun size={17}/>उज्यालो</button>
          <button onClick={()=>theme!=="dark"&&onToggleTheme()} className="ss-chip" style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",gap:8,padding:"13px",borderRadius:12,border:`2px solid ${theme==="dark"?ACCENT:BORDER}`,background:theme==="dark"?ACCENT_LIGHT:SURFACE,color:theme==="dark"?ACCENT:INK_SOFT,fontWeight:700,fontSize:16,cursor:"pointer"}}><Moon size={17}/>गाढा</button>
        </div>
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={BookMarked} color={TEAL}>पाठ्यपुस्तक PDF</SectionLabel>
        <div style={{fontSize:16,color:INK_SOFT,marginBottom:12,lineHeight:1.6}}>एकपटक PDF अपलोड गर्नुहोस् — AI ले सबैतिर यसबाट स्वतः सामग्री बनाउनेछ, साथै सामग्री खण्डमा अध्याय अनुसार ट्याग गरिएका फाइलहरू पनि प्रयोग हुन्छन्।</div>
        {pdfLoaded?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:ACCENT_LIGHT,borderRadius:10,padding:"10px 14px"}}>
              <BookMarked size={18} color={ACCENT}/>
              <div style={{fontSize:16.5,color:ACCENT,fontWeight:700}}>पाठ्यपुस्तक लोड भएको छ ✓</div>
            </div>
            <button className="ss-btn" onClick={clearTextbookHandler} style={{display:"flex",alignItems:"center",gap:6,background:DANGER_BG,color:DANGER,border:"none",borderRadius:10,padding:"10px 14px",fontWeight:700,fontSize:16,cursor:"pointer"}}><Trash2 size={15}/>पाठ्यपुस्तक हटाउनुहोस्</button>
          </div>
        ):(
          <label style={{display:"flex",alignItems:"center",gap:8,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"12px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer"}}>
            <BookMarked size={17}/>{uploading?"लोड गर्दै...":"पाठ्यपुस्तक PDF अपलोड गर्नुहोस्"}
            <input type="file" accept="application/pdf" onChange={uploadTextbook} style={{display:"none"}}/>
          </label>
        )}
        {msg&&<div style={{marginTop:10,fontSize:16,color:pdfLoaded?ACCENT:DANGER,fontWeight:600}}>{msg}</div>}
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={FileText} color={TEAL}>विद्यार्थी मूल्याङ्कन मार्गदर्शन</SectionLabel>
        <div style={{fontSize:16,color:INK_SOFT,marginBottom:12,lineHeight:1.6}}>धेरै कक्षा समेटिएको विद्यार्थी मूल्याङ्कन मार्गदर्शन अपलोड गर्नुहोस् — AI ले यसैबाट "{classLabel}" को भाग मात्र छानेर पाठ योजना र रुब्रिक्स मस्यौदा बनाउनेछ। मार्गदर्शन फेरिँदा जुनसुकै बेला फेरि अपलोड गर्न सकिन्छ, पुरानो स्वतः बदलिन्छ।</div>
        {teacherGuide?(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:ACCENT_LIGHT,borderRadius:10,padding:"10px 14px"}}>
              <FileText size={18} color={ACCENT}/>
              <div style={{fontSize:16,color:ACCENT,fontWeight:700,overflowWrap:"break-word",wordBreak:"break-word"}}>{teacherGuide.label}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <label style={{display:"flex",alignItems:"center",gap:6,background:SURFACE_2,color:INK,border:`1.5px solid ${BORDER}`,borderRadius:10,padding:"10px 14px",fontWeight:700,fontSize:15,cursor:"pointer"}}>
                <Upload size={15}/>{guideBusy?"...":"नयाँ अपलोड"}
                <input type="file" accept="application/pdf,.docx,image/*" onChange={uploadGuideHandler} style={{display:"none"}}/>
              </label>
              <button className="ss-btn" onClick={deleteGuideHandler} disabled={guideBusy} style={{display:"flex",alignItems:"center",gap:6,background:DANGER_BG,color:DANGER,border:"none",borderRadius:10,padding:"10px 14px",fontWeight:700,fontSize:15,cursor:"pointer"}}><Trash2 size={15}/>हटाउनुहोस्</button>
            </div>
          </div>
        ):(
          <label style={{display:"flex",alignItems:"center",gap:8,background:ACCENT,color:"#fff",border:"none",borderRadius:10,padding:"12px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer"}}>
            <FileText size={17}/>{guideBusy?"लोड गर्दै...":"विद्यार्थी मूल्याङ्कन मार्गदर्शन अपलोड गर्नुहोस्"}
            <input type="file" accept="application/pdf,.docx,image/*" onChange={uploadGuideHandler} style={{display:"none"}}/>
          </label>
        )}
        {guideMsg&&<div style={{marginTop:10,fontSize:15.5,color:teacherGuide?ACCENT:DANGER,fontWeight:600}}>{guideMsg}</div>}
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={ClipboardList} color={VIOLET}>यस वर्षको पाठ योजना / रुब्रिक्स ढाँचा</SectionLabel>
        <div style={{fontSize:16,color:INK_SOFT,marginBottom:12,lineHeight:1.6}}>"{classLabel}" का लागि यो वर्ष विद्यालयले प्रयोग गर्ने ढाँचाको नमूना फाइल अपलोड गर्नुहोस् — AI ले तयार पार्ने हरेक पाठ योजना/रुब्रिक्स ठ्याक्कै यही ढाँचामा हुनेछ। ढाँचा फेरिएको वर्ष, नयाँ नमूना अपलोड गरे पुरानो स्वतः बदलिन्छ।</div>
        {formatTemplate&&(
          <div style={{display:"flex",alignItems:"center",gap:8,background:ACCENT_LIGHT,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
            <ClipboardList size={18} color={ACCENT}/>
            <div style={{fontSize:16,color:ACCENT,fontWeight:700}}>हाल सक्रिय ढाँचा: {formatTemplate.year_label} ({classLabel})</div>
          </div>
        )}
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div>
            <div style={{fontSize:14,color:INK_SOFT,fontWeight:600,marginBottom:5}}>वर्ष</div>
            <input value={templateYearDraft} onChange={(e)=>setTemplateYearDraft(e.target.value)} placeholder="जस्तै: २०८२" className="ss-field" style={{width:"100%",borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none",boxSizing:"border-box"}}/>
          </div>
          <label style={{display:"flex",alignItems:"center",gap:8,background:SURFACE_2,color:INK,border:`1.5px solid ${BORDER}`,borderRadius:10,padding:"11px 14px",fontWeight:700,fontSize:15.5,cursor:"pointer"}}>
            <Upload size={16}/>{templateLPFile?templateLPFile.name:(formatTemplate?.lesson_plan_storage_path?"पाठ योजनाको नमूना (हालको ढाँचा प्रयोगमा — बदल्न फाइल छान्नुहोस्)":"पाठ योजनाको नमूना फाइल (Word)")}
            <input type="file" accept=".docx" onChange={(e)=>setTemplateLPFile(e.target.files[0]||null)} style={{display:"none"}}/>
          </label>
          <label style={{display:"flex",alignItems:"center",gap:8,background:SURFACE_2,color:INK,border:`1.5px solid ${BORDER}`,borderRadius:10,padding:"11px 14px",fontWeight:700,fontSize:15.5,cursor:"pointer"}}>
            <Upload size={16}/>{templateRubricFile?templateRubricFile.name:(formatTemplate?.rubric_storage_path?"रुब्रिक्सको नमूना (हालको ढाँचा प्रयोगमा — बदल्न फाइल छान्नुहोस्)":"रुब्रिक्सको नमूना फाइल (Word उत्तम, फोटो पनि मान्य)")}
            <input type="file" accept=".docx,image/*" onChange={(e)=>setTemplateRubricFile(e.target.files[0]||null)} style={{display:"none"}}/>
          </label>
          <Button variant="primary" onClick={saveFormatTemplate} disabled={templateBusy}>{templateBusy?"सुरक्षित हुँदै...":"यो वर्षको ढाँचा सुरक्षित गर्नुहोस्"}</Button>
        </div>
        {templateMsg&&<div style={{marginTop:10,fontSize:15.5,color:formatTemplate?ACCENT:DANGER,fontWeight:600}}>{templateMsg}</div>}
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={User} color={VIOLET}>खाता</SectionLabel>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
          <div style={{width:46,height:46,borderRadius:"50%",background:ACCENT,color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:18.5,fontWeight:700,flexShrink:0}}>{(teacherName?.[0]||session?.user?.email?.[0]||"श").toUpperCase()}</div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,color:INK,fontSize:16.5,overflowWrap:"break-word",wordBreak:"break-word"}}>{teacherName||session?.user?.email||""}</div>
            <div style={{fontSize:15,color:INK_SOFT,overflowWrap:"break-word",wordBreak:"break-word"}}>{teacherName?session?.user?.email:`${classLabel} · ${subjectLabel}`}</div>
          </div>
        </div>
        <div style={{display:"flex",gap:8,marginBottom:8}}>
          <input value={nameDraft} onChange={(e)=>setNameDraft(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&saveName()} placeholder="तपाईंको नाम" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          <button className="ss-btn" onClick={saveName} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer",boxShadow:SHADOW.accent}}>सुरक्षित</button>
        </div>
        {nameMsg&&<div style={{marginBottom:10,fontSize:15,color:ACCENT,fontWeight:600}}>{nameMsg}</div>}
        <button className="ss-btn" onClick={()=>{if(confirm("लगआउट गर्ने?"))db.signOut();}} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"10px",borderRadius:10,border:`1px solid ${DANGER_BG}`,background:DANGER_BG,color:DANGER,fontWeight:700,fontSize:16.5,cursor:"pointer"}}><LogOut size={15}/>लगआउट</button>
      </Card>

      <Card style={{marginBottom:14}}>
        <SectionLabel icon={Layers} color={BLUE}>सेक्सनहरू</SectionLabel>
        <div style={{display:"flex",flexDirection:"column",gap:7,marginBottom:12}}>
          {sections.length===0?<div style={{fontSize:16,color:INK_SOFT}}>कुनै सेक्सन छैन।</div>:sections.map((s,i)=>(
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"9px 12px",background:SURFACE_2,borderRadius:8,borderLeft:`3px solid ${PALETTE[i%PALETTE.length]}`}}>
              {editingSectionId===s.id?(
                <>
                  <input autoFocus value={sectionEditValue} onChange={(e)=>setSectionEditValue(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&renameSection(s)} className="ss-field" style={{flex:1,minWidth:0,borderRadius:8,padding:"7px 10px",fontSize:15.5,border:`1.5px solid ${BORDER}`,background:SURFACE}}/>
                  <button className="ss-btn" onClick={()=>renameSection(s)} disabled={sectionBusy===s.id} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:8,padding:"7px 11px",fontWeight:700,fontSize:14.5,cursor:"pointer",flexShrink:0,boxShadow:SHADOW.accent}}>✓</button>
                  <button className="ss-icon-btn" onClick={()=>setEditingSectionId(null)} style={{color:INK_SOFT,fontSize:14.5,cursor:"pointer",flexShrink:0,padding:"7px 10px"}}>✕</button>
                </>
              ):(
                <>
                  <div style={{width:8,height:8,borderRadius:"50%",background:PALETTE[i%PALETTE.length],flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",fontSize:16.5,fontWeight:600,color:INK}}>{s.name}</div>
                  {currentSection?.id===s.id&&<span style={{fontSize:13,background:ACCENT_LIGHT,color:ACCENT,padding:"2px 8px",borderRadius:999,fontWeight:700,flexShrink:0}}>सक्रिय</span>}
                  <button className="ss-icon-btn" onClick={()=>{setEditingSectionId(s.id);setSectionEditValue(s.name);}} disabled={sectionBusy===s.id} style={{color:INK_SOFT,cursor:"pointer",padding:4,flexShrink:0,display:"flex"}} title="नाम बदल्नुहोस्"><PenSquare size={15}/></button>
                  <button className="ss-icon-btn" onClick={()=>deleteSectionHandler(s)} disabled={sectionBusy===s.id} style={{color:DANGER,cursor:"pointer",padding:4,flexShrink:0,display:"flex"}} title="मेटाउनुहोस्"><Trash2 size={15}/></button>
                </>
              )}
            </div>
          ))}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input value={name} onChange={(e)=>setName(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&addSection()} placeholder="नयाँ सेक्सन (जस्तै: कक्षा ५ ख)" className="ss-field" style={{flex:1,minWidth:0,borderRadius:12,padding:"11px 14px",fontSize:16.5,border:`1.5px solid ${BORDER}`,background:SURFACE_2,outline:"none"}}/>
          <button className="ss-btn" onClick={addSection} disabled={saving} style={{background:`linear-gradient(180deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`,color:"#fff",border:"none",borderRadius:10,padding:"10px 16px",fontWeight:700,fontSize:16.5,cursor:"pointer",boxShadow:SHADOW.accent}}>{saving?"...":"थप"}</button>
        </div>
        {sectionMsg&&<div style={{marginTop:8,fontSize:15,color:sectionMsg.startsWith("त्रुटि")||sectionMsg.includes("पहिल्यै")?DANGER:ACCENT,fontWeight:600}}>{sectionMsg}</div>}
      </Card>

      {/* NEW — दोहोरिएका अध्याय मिलाउनुहोस्/पुराना ट्याग मिलाउनुहोस्/फाइल
          प्रकार मिलाउनुहोस् (the repair-tools panel) was removed from
          here — see the note above runRepair's old location for why. */}

      {/* NEW — there was no way to get your data out of the app at all.
          Everything lives in one Supabase project with no export button
          anywhere — if that account ever gets locked out or something
          goes wrong server-side, there's no local copy of a year's worth
          of lesson plans. This pulls everything (lessons, homework,
          chapters, saved AI resources) into one JSON file the browser
          downloads directly — nothing is deleted or changed, and it works
          even if you never touch it, just as a safety net. */}
      <Card style={{marginBottom:14}}>
        <SectionLabel icon={Download} color={TEAL}>डाटा ब्याकअप</SectionLabel>
        <div style={{fontSize:15,color:INK_SOFT,marginBottom:12,lineHeight:1.5}}>
          तपाईंका सबै पाठ योजना, गृहकार्य, अध्याय र सुरक्षित AI स्रोतहरू एउटै फाइलमा डाउनलोड गर्नुहोस्। सर्भरमा भएको डाटा जस्ताको तस्तै रहन्छ — यो केवल एक प्रति (copy) मात्र हो।
        </div>
        <button className="ss-btn" disabled={exportBusy} onClick={exportAllData} style={{background:SURFACE_2,border:`1px solid ${BORDER}`,borderRadius:10,padding:"9px 14px",fontWeight:700,fontSize:15,cursor:"pointer",color:INK,boxShadow:SHADOW.sm,display:"flex",alignItems:"center",gap:8}}>
          <Download size={16}/>{exportBusy?"तयार हुँदैछ...":"सबै डाटा डाउनलोड गर्नुहोस्"}
        </button>
        {exportMsg&&<div style={{fontSize:14.5,color:exportMsg.startsWith("त्रुटि")?DANGER:ACCENT,fontWeight:600,marginTop:8}}>{exportMsg}</div>}
      </Card>

      <Card>
        <SectionLabel icon={SettingsIcon}>एपको बारेमा</SectionLabel>
        {[["नाम","शिक्षा साथी"],["संस्करण","3.1"],["AI","Google Gemini (निःशुल्क)"],["डाटाबेस","Supabase (निःशुल्क)"],["होस्टिङ","Vercel (निःशुल्क)"]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",padding:"8px 0",borderBottom:`1px solid ${BORDER}`}}><div style={{fontSize:16,color:INK_SOFT}}>{l}</div><div style={{fontSize:16,fontWeight:600,color:INK}}>{v}</div></div>)}
      </Card>
    </div>
  );
}

export default function App() {
  const [session,setSession]=useState(null);
  const [authLoading,setAuthLoading]=useState(true);
  const [screen,setScreen]=useState("dashboard");
  // FIX — screens used to be rendered as `{screen==="x"&&<X/>}`, which fully
  // unmounts a screen the moment you navigate away from it. Coming back
  // remounted it from scratch, re-running every one of its data-fetching
  // useEffects — this is the other big contributor to "every page/section
  // change feels slow", alongside the textbook fix. Now a screen is added to
  // this set the first time it's visited and never removed, so later
  // renders below just toggle CSS visibility instead of destroying and
  // rebuilding the component (and its already-loaded data) each time. The
  // very first app load still only mounts the Dashboard, same as before —
  // other screens still only mount (and fetch) the first time you actually
  // open them.
  const [visitedScreens,setVisitedScreens]=useState(()=>new Set(["dashboard"]));
  useEffect(()=>{
    setVisitedScreens((prev)=>prev.has(screen)?prev:new Set(prev).add(screen));
  },[screen]);
  const [activeLesson,setActiveLesson]=useState(null);
  const [activeLessonAutoPrint,setActiveLessonAutoPrint]=useState(false);
  // NEW — lets Search jump into a specific lesson's मूल्याङ्कन tab
  // directly, now that rubrics are created there instead of a separate
  // screen.
  const [activeLessonTab,setActiveLessonTab]=useState(null);
  // FIX — this used to close whatever the teacher was looking at and
  // force-navigate to the Planner screen just to edit one lesson. Now it
  // opens the edit form as a popup on top of wherever they already were
  // (see LessonEditModal) and closes right back to it.
  const [editingLessonPopup,setEditingLessonPopup]=useState(null);
  const editLessonFromViewer=useCallback((l)=>{setEditingLessonPopup(l);},[]);
  // NEW — lets a lesson be opened for editing from OUTSIDE the Planner
  // screen (e.g. the "सम्पादन गर्नुहोस्" button inside the full-screen lesson
  // viewer): we switch to the Planner tab and hand it this id, and Planner
  // picks up editing from there. This is part of the interconnection fix —
  // screens now hand off to each other instead of being dead ends.
  const [editLessonId,setEditLessonId]=useState(null);
  // NEW — lets the Dashboard's "chapter prepared" card jump straight to the
  // Planner with that chapter already selected, instead of landing on an
  // empty Planner and making the teacher re-pick/re-type the same chapter
  // they just worked with.
  const [prefillChapter,setPrefillChapter]=useState(null);
  const goPlanner=useCallback((chapter)=>{setPrefillChapter(typeof chapter==="string"?chapter:null);setScreen("planner");},[]);
  // NEW — lets Search results jump straight into the right AI Sahayak
  // sub-tab instead of always landing on च्याट and making the teacher
  // click around to find what they searched for.
  const [aiToolsTab,setAiToolsTab]=useState(null);
  const goAITools=useCallback((tab)=>{setAiToolsTab(typeof tab==="string"?tab:null);setScreen("aitools");},[]);
  // NEW — गृहकार्य/डायरी now live on आज (Home) instead of a separate थप
  // tab. Same jump-straight-to-panel pattern as AI Sahayak above.
  const [homePanel,setHomePanel]=useState(null);
  const goHomePanel=useCallback((tab)=>{setHomePanel(typeof tab==="string"?tab:null);setScreen("dashboard");},[]);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [searchOpen,setSearchOpen]=useState(false);
  // NEW — one-click print from the Planner list: open the lesson AND print
  // it immediately, no second tap required.
  const openLesson=useCallback((l,opts)=>{setActiveLesson(l);setActiveLessonAutoPrint(!!opts?.autoPrint);setActiveLessonTab(opts?.tab||null);},[]);
  const [sections,setSections]=useState([]);
  const [currentSection,setCurrentSection]=useState(null);
  const [lessons,setLessons]=useState([]);
  const [homework,setHomework]=useState([]);
  const [lessonsLoading,setLessonsLoading]=useState(true);
  const [hwLoading,setHwLoading]=useState(true);
  const [synced,setSynced]=useState(false);
  // NEW — see loadLessons/loadHomework/loadChapters below: this tracks a
  // failed sync so the topbar can say so, instead of the old behavior of
  // silently wiping lessons/homework to an empty list on any fetch error
  // (which looked exactly like "all my lesson plans just disappeared").
  const [syncError,setSyncError]=useState("");
  // NEW — the badge only ever said "सिंक भयो" (just synced, for 2s) or
  // "सिंक भएको" (synced, no indication of when) — no way to tell a fresh
  // sync from one that's actually hours stale, which matters most exactly
  // when it'd be useful: patchy classroom wifi where syncs quietly stop
  // succeeding. `tick` just forces a re-render every 30s so the relative
  // time text stays current without needing a fresh sync to update it.
  const [lastSyncedAt,setLastSyncedAt]=useState(null);
  const [tick,setTick]=useState(0);
  useEffect(()=>{const id=setInterval(()=>setTick((t)=>t+1),30000);return()=>clearInterval(id);},[]);
  const [chapters,setChapters]=useState([]);

  // NEW — installability. Chrome/Edge on both desktop and Android fire
  // "beforeinstallprompt" instead of showing their own UI automatically once
  // a PWA qualifies (valid manifest + service worker); we catch it, hold onto
  // it, and trigger it ourselves from a real "एप इन्स्टल गर्नुहोस्" button so
  // the option is actually visible instead of hiding in a browser menu.
  // iOS Safari never fires this event at all — there is no programmatic
  // install API there — so it gets manual "Add to Home Screen" steps instead.
  const [installPrompt,setInstallPrompt]=useState(null);
  const [isStandalone,setIsStandalone]=useState(false);
  const isIOS = typeof navigator!=="undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
  useEffect(()=>{
    const checkStandalone=()=>setIsStandalone(window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone===true);
    checkStandalone();
    const onBIP=(e)=>{ e.preventDefault(); setInstallPrompt(e); };
    const onInstalled=()=>{ setInstallPrompt(null); setIsStandalone(true); };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", onInstalled);
    return()=>{ window.removeEventListener("beforeinstallprompt", onBIP); window.removeEventListener("appinstalled", onInstalled); };
  },[]);
  const promptInstall=async()=>{
    if(!installPrompt)return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  // NEW — dark/light mode. The actual color values live in CSS variables
  // (see the <style> block below); this just toggles which set applies,
  // and remembers the choice for next time.
  const [theme,setTheme]=useState(()=>{
    try{ return localStorage.getItem("ss-theme")||"dark"; }catch{ return "dark"; }
  });
  useEffect(()=>{ try{ localStorage.setItem("ss-theme", theme); }catch{} },[theme]);
  const toggleTheme=()=>setTheme((t)=>t==="light"?"dark":"light");
  useEffect(()=>{ document.documentElement.setAttribute("data-theme", theme); },[theme]);

  // FIX — class, subject, and teacher name used to live in localStorage
  // ONLY (see the old comment below), which is why the PC and phone could
  // silently show completely different data: each device had its own
  // separate "which class am I on" value, and since the uploaded textbook
  // and every chapter/lesson/material are looked up BY that class label,
  // a mismatch there is exactly what makes materials — and the whole
  // dashboard — look like "different content" or "my PDF disappeared"
  // between devices, even though everything was actually uploaded fine.
  // Now the account (Supabase user_metadata) is the source of truth, and
  // it's applied here as soon as a session is available; localStorage is
  // kept only as a same-device fallback for the instant before that
  // happens (and for fully offline use).
  const [classLabel,setClassLabelState]=useState(()=>{
    try{ return localStorage.getItem("ss-class")||"कक्षा ५"; }catch{ return "कक्षा ५"; }
  });
  const [subjectLabel,setSubjectLabelState]=useState(()=>{
    try{ return localStorage.getItem("ss-subject")||"सामाजिक अध्ययन"; }catch{ return "सामाजिक अध्ययन"; }
  });
  const setClassLabel=(v)=>{
    setClassLabelState(v);
    try{localStorage.setItem("ss-class",v);}catch{}
    supabase.auth.updateUser({data:{class_label:v}}).catch(()=>{});
  };
  const setSubjectLabel=(v)=>{
    setSubjectLabelState(v);
    try{localStorage.setItem("ss-subject",v);}catch{}
    supabase.auth.updateUser({data:{subject_label:v}}).catch(()=>{});
  };
  const classContext=`${classLabel} ${subjectLabel}`.trim();

  // NEW — teacher's display name, used in Settings and the dashboard greeting
  // instead of a generic label / the account's raw email.
  const [teacherName,setTeacherNameState]=useState(()=>{
    try{ return localStorage.getItem("ss-teacher-name")||""; }catch{ return ""; }
  });
  const setTeacherName=(v)=>{
    setTeacherNameState(v);
    try{localStorage.setItem("ss-teacher-name",v);}catch{}
    supabase.auth.updateUser({data:{teacher_name:v}}).catch(()=>{});
  };

  // FIX — this is the other half of the class/subject/name sync fix above:
  // as soon as the account's session is available, pull class/subject/name
  // FROM it and apply them here, so a second device (or a fresh browser
  // profile on the same PC) immediately shows the same class/subject/name
  // as every other device signed into this account, instead of quietly
  // falling back to this device's own separate localStorage copy (or the
  // hardcoded "कक्षा ५" default) and looking like a different account's
  // worth of data. Only applied when the account actually has a saved
  // value, so a brand-new account still gets the ordinary defaults.
  useEffect(()=>{
    const meta=session?.user?.user_metadata;
    if(!meta)return;
    if(meta.class_label&&meta.class_label!==classLabel){setClassLabelState(meta.class_label);try{localStorage.setItem("ss-class",meta.class_label);}catch{}}
    if(meta.subject_label&&meta.subject_label!==subjectLabel){setSubjectLabelState(meta.subject_label);try{localStorage.setItem("ss-subject",meta.subject_label);}catch{}}
    if(meta.teacher_name&&meta.teacher_name!==teacherName){setTeacherNameState(meta.teacher_name);try{localStorage.setItem("ss-teacher-name",meta.teacher_name);}catch{}}
  },[session]);

  // NEW — inject the theme's CSS variables directly, once, on first mount.
  // This runs before the login screen or spinner ever renders (hooks always
  // run before the early `return`s below), so colors exist immediately no
  // matter what — it doesn't depend on index.html having been updated too.
  useEffect(()=>{
    if(document.getElementById("ss-theme-vars"))return;
    const style=document.createElement("style");
    style.id="ss-theme-vars";
    style.textContent=`
      [data-theme="light"]{--bg:#FFF7EA;--bg-grad:#FFE7BE;--surface:#FFFFFF;--surface-2:#FFF2DC;--ink:#2B1A0E;--ink-soft:#8A6D4E;--border:#F2DCB0;--accent:#E8590C;--accent-dark:#C2470A;--accent-light:#FFE3CC;--marigold:#F0A500;--marigold-dark:#C6870A;--teal:#0E9384;--teal-light:#D6F3EC;--violet:#7C3AED;--violet-light:#EDE3FE;--blue:#2563EB;--blue-light:#DDE7FE;--rose:#E11D74;--rose-light:#FCE0EC;--danger:#DC2626;--danger-bg:#FCE1DE;--warn:#D97706;--warn-bg:#FCEED0;--shadow-rgb:43,27,14;--card-sheen:rgba(255,255,255,0.85);}
      [data-theme="dark"]{--bg:#1C1006;--bg-grad:#2B1A0B;--surface:#241505;--surface-2:#301C0C;--ink:#FBEEDD;--ink-soft:#CBA97C;--border:#4A311A;--accent:#C96A35;--accent-dark:#A8501F;--accent-light:#3C2410;--marigold:#CBA054;--marigold-dark:#AD8434;--teal:#4C9C90;--teal-light:#0D332D;--violet:#8D7BC4;--violet-light:#2B1F49;--blue:#6C8CB8;--blue-light:#152A4A;--rose:#C97690;--rose-light:#3A1526;--danger:#C97060;--danger-bg:#3A1512;--warn:#C9A054;--warn-bg:#3A2A0A;--shadow-rgb:10,6,2;--card-sheen:rgba(255,255,255,0.05);}
      html,body{background:radial-gradient(1100px 620px at 12% -8%, var(--bg-grad), var(--bg) 55%);}
    `;
    document.head.appendChild(style);
    document.documentElement.setAttribute("data-theme", theme);
  },[]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session:s}})=>{setSession(s);setAuthLoading(false);});
    const{data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s));
    return()=>subscription.unsubscribe();
  },[]);

  // NEW — reloads whenever classLabel changes (not just once on mount), so
  // switching from "कक्षा ५" to "कक्षा ६" in Settings swaps in that class's
  // own textbook right away instead of keeping last year's in memory.
  // FIX — this used to download and base64-encode the WHOLE textbook PDF
  // on every app load and every class switch, even if nothing was about to
  // use it. Now it just kicks off the (cached, upload-once) resolution in
  // the background so it's ready by the time an AI button is actually
  // pressed — gemini.getTextbookPart() itself skips the work entirely if
  // it already has a valid cached reference.
  useEffect(()=>{ gemini.getTextbookPart(classLabel); },[classLabel]);

  useEffect(()=>{
    if(!session)return;
    db.getSections().then(({data})=>{if(data?.length){setSections(data);setCurrentSection(data[0]);}});
  },[session]);

  // NEW — one shared list of real chapters, loaded once and passed down to
  // every screen that needs a chapter picker (Materials, Planner, Question
  // Bank, Activities, Assessment). This is what powers the dropdown instead
  // of everyone typing chapter names separately.
  const loadChapters=useCallback(async()=>{
    const{data,error}=await db.getChapters(classLabel);
    // FIX — on error this used to run setChapters(data||[]) same as
    // success, so a network blip made every chapter in Materials vanish
    // from screen until the next successful load. Now a failed fetch
    // leaves whatever was already loaded on screen untouched.
    if(error){setSyncError("सामग्री लोड गर्न सकिएन — इन्टरनेट जाँच्नुहोस्।");return;}
    setChapters(data||[]);
  },[classLabel]);
  useEffect(()=>{ if(session) loadChapters(); },[session,loadChapters]);

  const addChapter=useCallback(async(title)=>{
    await db.getOrCreateChapterId(title,classLabel);
    await loadChapters();
  },[loadChapters,classLabel]);

  const loadLessons=useCallback(async()=>{
    setLessonsLoading(true);
    const{data,error}=await db.getLessons(currentSection?.id||null,classLabel);
    if(error){
      setSyncError("पाठहरू लोड गर्न सकिएन — इन्टरनेट/सर्भर जाँच्नुहोस्। देखिएको सूची पुरानो हुन सक्छ।");
      setLessonsLoading(false);
      return;
    }
    setSyncError("");
    setLessons(data||[]);setLessonsLoading(false);setSynced(true);setLastSyncedAt(Date.now());
    setTimeout(()=>setSynced(false),2000);
  },[currentSection,classLabel]);

  const loadHomework=useCallback(async()=>{
    setHwLoading(true);
    // FIX — no classLabel here: गृहकार्य from every class showed up
    // together. Requires add_class_scoping_homework_resources.sql to be
    // run first (see that file) — the class_label column doesn't exist
    // until then.
    const{data,error}=await db.getHomework(currentSection?.id||null,classLabel);
    if(error){setSyncError("गृहकार्य लोड गर्न सकिएन — इन्टरनेट जाँच्नुहोस्।");setHwLoading(false);return;}
    setHomework(data||[]);setHwLoading(false);
  },[currentSection,classLabel]);

  // FIX — materials used to be fetched independently in three places
  // (Materials tab's own list, Home's material count, and every "attach a
  // material" button in Planner/Question Bank/Activities/Assessment
  // creating rows nobody else knew to refresh for). Now it's one shared
  // list, like chapters and lessons: uploading or tagging a file from
  // ANYWHERE refreshes it everywhere it's shown, and Materials no longer
  // needs its own separate copy that could fall out of sync.
  const [materials,setMaterials]=useState([]);
  const [materialsLoading,setMaterialsLoading]=useState(true);
  const loadMaterials=useCallback(async()=>{
    setMaterialsLoading(true);
    const{data,error}=await db.getMaterials(classLabel);
    if(error){setSyncError("सामग्री लोड गर्न सकिएन — इन्टरनेट जाँच्नुहोस्।");setMaterialsLoading(false);return;}
    setMaterials(data||[]);setMaterialsLoading(false);
  },[classLabel]);
  useEffect(()=>{ if(session) loadMaterials(); },[session,loadMaterials]);

  // ─── THE single data layer for अध्याय/पाठ/सामग्री ────────────────────────
  // Everything below wraps the loaders/mutators above into one object handed
  // to <DataProvider>. Every screen (Home, Planner, Materials, Question
  // Bank, Activities, Assessment, and the LessonEditModal/ChapterPicker/
  // PathPicker/MaterialAttach pieces they're built from) reads and mutates
  // chapters/lessons/materials through this ONE object via useData() —
  // never through props, never through a locally-passed refresh callback.
  // That's what makes "created/uploaded/tagged in one place, shows up
  // everywhere" actually guaranteed instead of something each screen has to
  // remember to wire up correctly on its own.
  const addLesson=useCallback(async(chapterTitle,pathTitle,excludeId=null)=>{
    const lesson=await getOrCreateLesson({lessons,chapterTitle,pathTitle,classLabel,sectionId:currentSection?.id||null,excludeId});
    if(lesson)await loadLessons();
    return lesson;
  },[lessons,classLabel,currentSection,loadLessons]);

  const renameChapterCtx=useCallback(async(chapter,title)=>{
    await db.renameChapter(chapter.id,title);
    await loadChapters();
  },[loadChapters]);

  // THE single delete confirmation + implementation, shared by Materials
  // and Planner — see describeChapterDeletion above for why this always
  // shows the full picture (materials + paths + questions + activities +
  // assessments) no matter which screen the delete was started from.
  const deleteChapterCtx=useCallback(async(chapter)=>{
    const msg=await describeChapterDeletion(chapter,lessons);
    if(!window.confirm(msg))return false;
    await db.deleteChapter(chapter.id);
    await Promise.all([loadChapters(),loadLessons(),loadMaterials()]);
    return true;
  },[lessons,loadChapters,loadLessons,loadMaterials]);

  // Uploading a file can implicitly create a brand-new chapter (typed/
  // detected chapter name that doesn't exist yet) via resolveChapterId, so
  // this refreshes both chapters and materials — not materials alone.
  const uploadMaterialCtx=useCallback(async(args)=>{
    const res=await uploadOneMaterial({...args,classLabel});
    if(res.data)await Promise.all([loadChapters(),loadMaterials()]);
    return res;
  },[classLabel,loadChapters,loadMaterials]);

  const retagMaterialCtx=useCallback(async(args)=>{
    const res=await retagMaterial({...args,classLabel});
    await Promise.all([loadChapters(),loadMaterials()]);
    return res;
  },[classLabel,loadChapters,loadMaterials]);

  const deleteMaterialCtx=useCallback(async(material)=>{
    await db.deleteMaterial(material.id,material.storage_path);
    await loadMaterials();
  },[loadMaterials]);

  const dataValue=useMemo(()=>({
    chapters,lessons,materials,lessonsLoading,materialsLoading,classLabel,
    addChapter,addLesson,
    renameChapter:renameChapterCtx,deleteChapter:deleteChapterCtx,
    refreshChapters:loadChapters,refreshLessons:loadLessons,refreshMaterials:loadMaterials,
    uploadMaterial:uploadMaterialCtx,retagMaterial:retagMaterialCtx,deleteMaterial:deleteMaterialCtx,
  }),[chapters,lessons,materials,lessonsLoading,materialsLoading,classLabel,addChapter,addLesson,renameChapterCtx,deleteChapterCtx,loadChapters,loadLessons,loadMaterials,uploadMaterialCtx,retagMaterialCtx,deleteMaterialCtx]);

  useEffect(()=>{if(session){loadLessons();loadHomework();}},[session,loadLessons,loadHomework]);

  // FIX — UI/nav overhaul: "AI च्याट" (chat) and "AI उपकरण" (question
  // bank/activities/assessment/resources) used to be two separate screens
  // reached two different ways — chat sat directly in the bottom row while
  // everything else AI-related was one tap further, hidden behind a "थप"
  // sheet. A teacher generating a question bank had no way to know it
  // wasn't under the visible "AI च्याट" icon. They're now one screen
  // ("AI सहायक", chat is just its first tab — see AITools) reached one way.
  // FIX — थप itself is gone now too: it only ever held गृहकार्य, डायरी,
  // and पात्रो — three things with no shared identity, and a whole nav
  // slot for a screen that was mostly empty space above the calendar.
  // They're on आज (Home) now, the screen that's already the daily-glance
  // dashboard. Four flat destinations, each one worth its own tap.
  const nav=[
    {id:"dashboard",label:"आज",icon:Home,color:ACCENT},
    {id:"planner",label:"योजना",icon:CalendarDays,color:TEAL},
    {id:"materials",label:"सामग्री",icon:BookOpen,color:MARIGOLD_DARK},
    {id:"aitools",label:"AI सहायक",icon:Wand2,color:VIOLET},
  ];

  if(authLoading)return<div style={{minHeight:"100vh",background:"var(--bg,#F7F4EC)",display:"flex",alignItems:"center",justifyContent:"center"}}><Spinner/></div>;
  if(!session)return<LoginScreen onLogin={setSession}/>;

  return(
    <DataProvider value={dataValue}>
    <div data-theme={theme} style={{fontFamily:"'SSText','Kalimati','Times New Roman',serif",background:PAPER,minHeight:"100vh",color:INK,fontSize:17,transition:"background .2s ease, color .2s ease",overflowX:"hidden"}}>
      <style>{`
        *{box-sizing:border-box;}body{margin:0;-webkit-font-smoothing:antialiased;}
        @font-face{
          /* Devanagari (Nepali) text — Kalimati. Uses the copy already
             installed on this computer (the standard Nepali-government
             Unicode font); since it's Unicode, whatever you copy out of
             the app and paste elsewhere carries the real Devanagari
             characters, and Kalimati is just how they're drawn here. */
          font-family:'SSText';
          src:local('Kalimati'),local('Kalimati Regular');
          unicode-range:U+0900-097F,U+0980-09FF,U+1CD0-1CFF,U+A8E0-A8FF,U+11B00-11B5F;
          font-display:swap;
        }
        @font-face{
          /* Latin (English) text — Times New Roman, with the closest
             cross-platform serif as a fallback for computers that only
             have the Linux/older-Mac substitute installed. */
          font-family:'SSText';
          src:local('Times New Roman'),local('Times'),local('Liberation Serif'),local('Nimbus Roman');
          unicode-range:U+0000-024F,U+0300-036F,U+2000-206F,U+2070-209F;
          font-display:swap;
        }
        .ss-display{font-family:'SSText','Kalimati','Times New Roman',serif;}

        /* NEW — light/dark color tokens. Everything in the component tree
           reads these via var(--x), so toggling data-theme instantly
           re-colors the whole app with no per-component logic needed. */
        [data-theme="light"]{
          --bg:#FFF7EA; --bg-grad:#FFE7BE; --surface:#FFFFFF; --surface-2:#FFF2DC;
          --ink:#2B1A0E; --ink-soft:#8A6D4E; --border:#F2DCB0;
          --accent:#E8590C; --accent-dark:#C2470A; --accent-light:#FFE3CC;
          --marigold:#F0A500; --marigold-dark:#C6870A;
          --teal:#0E9384; --teal-light:#D6F3EC;
          --violet:#7C3AED; --violet-light:#EDE3FE;
          --blue:#2563EB; --blue-light:#DDE7FE;
          --rose:#E11D74; --rose-light:#FCE0EC;
          --danger:#DC2626; --danger-bg:#FCE1DE;
          --warn:#D97706; --warn-bg:#FCEED0;
          --shadow-rgb:43,27,14;
          --card-sheen:rgba(255,255,255,0.85);
        }
        [data-theme="dark"]{
          --bg:#1C1006; --bg-grad:#2B1A0B; --surface:#241505; --surface-2:#301C0C;
          --ink:#FBEEDD; --ink-soft:#CBA97C; --border:#4A311A;
          --accent:#C96A35; --accent-dark:#A8501F; --accent-light:#3C2410;
          --marigold:#CBA054; --marigold-dark:#AD8434;
          --teal:#4C9C90; --teal-light:#0D332D;
          --violet:#8D7BC4; --violet-light:#2B1F49;
          --blue:#6C8CB8; --blue-light:#152A4A;
          --rose:#C97690; --rose-light:#3A1526;
          --danger:#C97060; --danger-bg:#3A1512;
          --warn:#C9A054; --warn-bg:#3A2A0A;
          --shadow-rgb:10,6,2;
          --card-sheen:rgba(255,255,255,0.05);
        }

        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        @keyframes ss-fade-up{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
        .main-content > *{animation:ss-fade-up .32s cubic-bezier(.2,.7,.2,1) both;}

        /* Devanagari script needs more breathing room than Latin text to read
           well — matras and conjuncts clip against tight leading. */
        body,[data-theme]{line-height:1.55;}

        /* Elevated card + hover lift */
        .ss-card{transition:box-shadow .2s ease, transform .2s ease, background .2s ease, border-color .2s ease;}
        .ss-card-hover:hover{box-shadow:${SHADOW.raisedHover};transform:translateY(-3px);border-color:color-mix(in srgb, ${ACCENT} 25%, var(--border));}
        .ss-card-hover:active{transform:translateY(1px) scale(0.99);box-shadow:${SHADOW.sm};}
        .ss-btn{transition:transform .15s ease, box-shadow .15s ease, filter .15s ease;}
        .ss-btn:hover{filter:brightness(1.04);}
        .ss-btn:active{transform:translateY(1px) scale(0.98);}

        /* Buttons — real hover/active feedback via CSS, not just JS */
        .ss-btn{transition:transform .12s ease, box-shadow .12s ease, filter .12s ease; -webkit-tap-highlight-color:transparent;}
        .ss-btn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.05);}
        .ss-btn:active:not(:disabled){transform:translateY(0px) scale(0.97);filter:brightness(0.98);}
        .ss-btn:focus-visible{outline:2px solid ${MARIGOLD};outline-offset:2px;}

        /* Icon-only utility buttons (edit/delete/print/close on cards) —
           these previously had zero feedback at all: same pixel before and
           after a tap. A soft round hover/press background makes them read
           as interactive instead of static glyphs. */
        {/* FIX — this class previously had NO background at rest, only on
            hover/active — fine with a mouse, but on a touchscreen (no
            hover state) every icon-only button using this class rendered
            as a bare colored glyph with nothing anchoring it visually.
            Against a gradient hero header or a dark-theme card, that made
            back/edit/delete/expand buttons hard to spot (reported: back
            chevron and the edit/delete/dropdown cluster both "not
            prominent"). A subtle permanent pill + border now gives every
            such button a visible boundary on any background, in both
            themes, with or without hover. */}
        .ss-icon-btn{border-radius:8px;padding:6px;transition:background .15s ease, transform .12s ease, border-color .15s ease; -webkit-tap-highlight-color:transparent; display:inline-flex; background:color-mix(in srgb, var(--ink) 6%, transparent); border:1px solid color-mix(in srgb, var(--ink) 10%, transparent);}
        .ss-icon-btn:hover:not(:disabled){background:var(--surface-2);border-color:var(--border);}
        .ss-icon-btn:active:not(:disabled){transform:scale(0.92);background:var(--border);}

        /* NEW — every screen (Home, AI chat, Homework, Diary, Search,
           Settings, question/activity/assessment builders...) was wrapped
           in a fixed maxWidth meant for a phone, centered on the page.
           On a phone that's correct. On a desktop monitor, with the
           sidebar already handling navigation, that left a huge dead
           strip of empty screen on the right of every single page. This
           lets each screen keep its comfortable reading width up to a
           point, then actually grow to use a real desktop's space instead
           of floating in the middle of it. */
        .ss-page{width:100%;box-sizing:border-box;}
        .ss-page-read{width:100%;box-sizing:border-box;}
        @media(min-width:860px){
          .ss-page{max-width:1180px !important;}
          .ss-page-read{max-width:860px !important;}
        }

        /* Inputs — consistent, modern resting + focus appearance across the
           whole app: rounded, softly bordered, with a visible focus ring
           instead of the harsh default browser outline. Scoped with
           :not([type=file]) so hidden upload inputs are untouched, and the
           handful of deliberately-borderless search/chat/calendar fields
           (which set background:transparent inline) are left alone since
           inline styles win over these defaults anyway. */
        input:not([type=file]),select,textarea{
          transition:border-color .15s ease, box-shadow .15s ease, background .15s ease;
          font-family:'SSText','Kalimati','Times New Roman',serif;
        }
        input::placeholder,textarea::placeholder{color:${INK_SOFT};opacity:0.75;}
        input:focus,select:focus,textarea:focus{outline:none;border-color:${ACCENT} !important;box-shadow:0 0 0 3px ${ACCENT_LIGHT};}
        input:hover:not(:focus):not(:disabled),textarea:hover:not(:focus):not(:disabled){border-color:${INK_SOFT};}

        /* Native <select> — replace the default OS arrow with a themed
           chevron and give it room to breathe; the stock browser arrow next
           to hand-styled borders/radii is what made dropdowns look cheap. */
        select{
          appearance:none; -webkit-appearance:none; -moz-appearance:none;
          background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236B6557' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat:no-repeat; background-position:right 12px center;
          padding-right:34px !important; cursor:pointer;
        }

        /* Shared "field" look for standard form inputs/selects/textareas —
           a soft tinted fill (instead of stark white-on-white) makes it
           obvious at a glance where to type, which was missing before. */
        .ss-field{background:var(--surface-2);color:var(--ink);}
        .ss-field:focus{background:var(--surface);}

        /* Chips / filter pills */
        .ss-chip{transition:transform .12s ease, background .15s ease, color .15s ease, border-color .15s ease;}
        .ss-chip:hover{transform:translateY(-1px);}
        .ss-chip:active{transform:translateY(0) scale(0.96);}

        /* NEW — sidebar items were flat with no hover feedback at all on
           desktop (mouse) use. A soft tint on hover for inactive items. */
        .ss-nav-item{transition:background .15s ease, color .15s ease;}
        .ss-nav-item:hover{background:var(--surface-2) !important;color:var(--ink) !important;}

        ::-webkit-scrollbar{height:9px;width:9px;}
        ::-webkit-scrollbar-track{background:transparent;}

        /* NEW — printing. Anything with class "no-print" (header, nav,
           buttons) disappears on paper; "ss-print-area" content expands to
           fill the page cleanly, in plain black-on-white regardless of
           dark mode. */
        /* NEW — .print-only is the reverse of .no-print: invisible on
           screen, and the ONLY thing shown for elements that use it once
           printing actually starts. This is what makes "print the whole
           plan" work — see the print-only block in LessonMode. */
        .print-only{display:none;}
        @media print{
          @page{margin:1.6cm 1.4cm;}
          .no-print{display:none !important;}
          .print-only{display:block !important;}
          /* FIX — this was the actual cause of stray content (the lesson
             list, its status pills, edit/print/delete icons) appearing
             ABOVE the real printed page. LessonMode/PrintableSheet use
             position:fixed to sit on top of the screen visually, but
             print rendering does not reliably respect that the same way —
             many browsers print the fixed overlay AND the normal page
             flow behind it, stacked one after another. Hiding the
             underlying screen entirely during print is what actually
             prevents that, instead of only hoping position:fixed covers
             it visually. */
          .main-content,.desktop-sidebar,.mobile-bottom-nav{display:none !important;}
          body,[data-theme]{background:#fff !important;color:#000 !important;}
          .ss-print-area{box-shadow:none !important;border:none !important;}
        }
        ::-webkit-scrollbar-thumb{background:${INK_SOFT};opacity:0.35;border-radius:99px;}
        ::-webkit-scrollbar-thumb:hover{background:${INK_SOFT};}

        .desktop-sidebar{display:none;}
        .mobile-bottom-nav{display:flex;}
        .main-content{margin-left:0;padding-bottom:76px;}
        .ss-topbar{padding:13px 18px;}
        @media(min-width:860px){
          .desktop-sidebar{display:flex;}
          .mobile-bottom-nav{display:none !important;}
          .main-content{margin-left:232px;padding-bottom:24px;}
          /* FIX — this bar was rendering full-width in normal document
             flow while the sidebar sits fixed on top of its left 232px,
             so on desktop its content started underneath the sidebar —
             that's the "empty patch" under the topbar. Offsetting it to
             match .main-content fixes both the overlap and the dead space. */
          .ss-section-bar{margin-left:232px;}
          /* FIX — same vertical padding was used at every width; on a
             wide desktop window that reads as needless extra height. */
          .ss-topbar{padding:9px 22px;}
        }
      `}</style>

      <div className="no-print ss-topbar" style={{background:`linear-gradient(120deg, color-mix(in srgb, color-mix(in srgb, ${ACCENT} 8%, ${SURFACE}) 88%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, ${TEAL} 7%, ${SURFACE}) 88%, transparent) 100%)`,backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",borderBottom:`1px solid ${BORDER}`,display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:10,boxShadow:"0 4px 16px rgba(var(--shadow-rgb),0.09)"}}>
        <img src="/icons/icon-64.png" alt="शिक्षा साथी" width={40} height={40} style={{borderRadius:14,boxShadow:SHADOW.marigold,flexShrink:0,transform:"rotate(-4deg)"}}/>
        <div style={{minWidth:0,overflow:"hidden"}}><div style={{fontWeight:800,fontSize:19,letterSpacing:"-0.01em",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",fontFamily:"'SSText','Kalimati','Times New Roman',serif",background:`linear-gradient(100deg, ${MARIGOLD_DARK} 0%, ${ACCENT} 100%)`,WebkitBackgroundClip:"text",backgroundClip:"text",color:"transparent"}}>शिक्षा साथी</div><div style={{fontSize:14.5,color:`color-mix(in srgb, ${ACCENT} 35%, ${INK_SOFT})`,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{classLabel} · {subjectLabel}</div></div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
          {/* FIX — this used to be a plain text pill ("सिंक भयो ✓") sitting
              oddly next to three proper icon buttons (search/theme/
              settings) — visually it read as leftover debug text, not a
              designed control. It's a matching circular icon button now,
              with a small corner status dot (green=synced, amber=syncing,
              red=error) doing the job the text used to — full detail
              still lives in the tooltip and the ss-sync-label caption. */}
          <div title={syncError?syncError:lessonsLoading?"सिंक हुँदैछ...":synced?"सिंक भयो":"सिंक भएको"} onClick={syncError?()=>{setSyncError("");loadLessons();loadHomework();loadChapters();}:undefined} style={{display:"flex",alignItems:"center",gap:6,cursor:syncError?"pointer":"default"}}>
            <div className="ss-btn ss-topbar-icon" style={{position:"relative",background:syncError?`linear-gradient(160deg, color-mix(in srgb, ${DANGER} 16%, ${SURFACE}) 0%, color-mix(in srgb, ${DANGER} 8%, ${SURFACE}) 100%)`:`linear-gradient(160deg, color-mix(in srgb, ${TEAL} 16%, ${SURFACE}) 0%, color-mix(in srgb, ${TEAL} 8%, ${SURFACE}) 100%)`,border:`1px solid ${BORDER}`,color:syncError?DANGER:TEAL}}>
              {syncError?<AlertTriangle size={16}/>:<RefreshCw size={16} style={{animation:lessonsLoading?"spin 1s linear infinite":"none"}}/>}
              <div style={{position:"absolute",bottom:2,right:2,width:9,height:9,borderRadius:"50%",background:syncError?DANGER:lessonsLoading?MARIGOLD:TEAL,border:`1.5px solid ${SURFACE}`}}/>
            </div>
            <span className="ss-sync-label" style={{fontSize:13.5,color:syncError?DANGER:INK_SOFT,fontWeight:700,whiteSpace:"nowrap"}}>{syncError?"सिंक असफल":lessonsLoading?"सिंक...":synced?"सिंक भयो":relativeSyncLabel(lastSyncedAt)}</span>
          </div>
          <button onClick={()=>setSearchOpen(true)} title="खोज" className="ss-btn ss-topbar-icon" style={{background:searchOpen?`linear-gradient(160deg, ${TEAL} 0%, color-mix(in srgb, ${TEAL} 70%, black) 100%)`:`linear-gradient(160deg, color-mix(in srgb, ${TEAL} 16%, ${SURFACE}) 0%, color-mix(in srgb, ${TEAL} 8%, ${SURFACE}) 100%)`,border:searchOpen?"none":`1px solid ${BORDER}`,color:searchOpen?"#fff":TEAL,boxShadow:searchOpen?`0 3px 10px color-mix(in srgb, ${TEAL} 40%, transparent)`:"none"}}><Search size={18}/></button>
          <button onClick={toggleTheme} title={theme==="light"?"गाढा मोडमा जानुहोस्":"उज्यालो मोडमा जानुहोस्"} className="ss-btn ss-topbar-icon" style={{background:`linear-gradient(160deg, ${MARIGOLD} 0%, ${MARIGOLD_DARK} 100%)`,border:"none",color:"#fff",boxShadow:`0 3px 10px color-mix(in srgb, ${MARIGOLD} 40%, transparent)`}}>
            {theme==="light"?<Moon size={17}/>:<Sun size={17}/>}
          </button>
          {/* FIX — this used to navigate to a whole separate screen (losing
              your place wherever you were) just to change one setting. Now
              it pops open on top of whatever you're doing and closes back
              to exactly where you were. */}
          <button onClick={()=>setSettingsOpen(true)} title="सेटिङ" className="ss-btn ss-topbar-icon" style={{background:settingsOpen?`linear-gradient(160deg, ${ACCENT} 0%, ${ACCENT_DARK} 100%)`:`linear-gradient(160deg, color-mix(in srgb, ${ACCENT} 16%, ${SURFACE}) 0%, color-mix(in srgb, ${ACCENT} 8%, ${SURFACE}) 100%)`,border:settingsOpen?"none":`1px solid ${BORDER}`,color:settingsOpen?"#fff":ACCENT,boxShadow:settingsOpen?SHADOW.accent:"none"}}><SettingsIcon size={19}/></button>
        </div>
      </div>

      {/* FIX — topbar icons looked flat/plain (solid tint square, no depth)
          next to the rest of the app's glossy "raised" card look. Added the
          same top sheen + layered drop shadow used elsewhere (SHADOW.raised)
          via ::before, plus a pressed/inset state on :active, so these read
          as chunky, tappable 3D buttons instead of flat color swatches. */}
      <style>{`.ss-topbar-icon{width:38px;height:38px;border-radius:13px;display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;position:relative;isolation:isolate;transition:transform .15s ease, box-shadow .15s ease;box-shadow:0 1px 1px rgba(var(--shadow-rgb),0.07), 0 5px 12px rgba(var(--shadow-rgb),0.16), 0 1.5px 3px rgba(var(--shadow-rgb),0.12);}
      .ss-topbar-icon::before{content:"";position:absolute;inset:0;border-radius:inherit;background:linear-gradient(165deg, rgba(255,255,255,0.38) 0%, rgba(255,255,255,0.08) 35%, rgba(255,255,255,0) 55%);pointer-events:none;mix-blend-mode:overlay;}
      .ss-topbar-icon svg{position:relative;z-index:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,0.12));}
      .ss-topbar-icon:hover{transform:translateY(-2px) rotate(-3deg);box-shadow:0 2px 3px rgba(var(--shadow-rgb),0.10), 0 8px 18px rgba(var(--shadow-rgb),0.22), 0 2px 5px rgba(var(--shadow-rgb),0.14);}
      .ss-topbar-icon:active{transform:translateY(0) scale(0.94);box-shadow:inset 0 2px 4px rgba(0,0,0,0.18);}
      @media(min-width:860px){.ss-topbar-icon{width:42px;height:42px;border-radius:14px;}}`}</style>

      <style>{`@media (max-width:420px){.ss-sync-label{display:none;}}`}</style>

      <div className="no-print ss-section-bar"><SectionSelector sections={sections} current={currentSection} onChange={setCurrentSection} onAdd={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}}/></div>

      <div className="desktop-sidebar no-print" style={{position:"fixed",top:0,left:0,bottom:0,width:232,background:`linear-gradient(170deg, color-mix(in srgb, color-mix(in srgb, ${ACCENT} 6%, ${SURFACE}) 90%, transparent) 0%, color-mix(in srgb, color-mix(in srgb, ${TEAL} 5%, ${SURFACE}) 90%, transparent) 100%)`,backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderRight:`1px solid ${BORDER}`,flexDirection:"column",paddingTop:118,paddingLeft:12,paddingRight:12,zIndex:5,overflowY:"auto",gap:2}}>
        <div style={{fontSize:12.5,fontWeight:700,letterSpacing:"0.08em",textTransform:"uppercase",color:INK_SOFT,padding:"0 14px",marginBottom:6}}>मुख्य</div>
        {nav.map((n,i)=>{const Icon=n.icon;const active=screen===n.id;return(
          <button key={n.id} onClick={()=>setScreen(n.id)} className={`ss-btn${active?"":" ss-nav-item"}`} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"none",background:active?`linear-gradient(135deg, ${n.color} 0%, color-mix(in srgb, ${n.color} 65%, black) 100%)`:(i%2===0?"transparent":`color-mix(in srgb, ${n.color} 5%, transparent)`),color:active?"#fff":INK,fontWeight:active?700:600,fontSize:15.5,letterSpacing:"0.01em",cursor:"pointer",textAlign:"left",width:"100%",borderRadius:999,boxShadow:active?`0 4px 12px color-mix(in srgb, ${n.color} 45%, transparent)`:"none"}}>
            <div style={{width:28,height:28,borderRadius:9,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",background:active?"rgba(255,255,255,0.22)":`color-mix(in srgb, ${n.color} 16%, transparent)`,transform:active?"rotate(-4deg)":"none"}}><Icon size={16} color={active?"#fff":n.color} style={active?{transform:"rotate(4deg)"}:undefined}/></div>
            {n.label}
          </button>
        );})}
      </div>

      <div className="main-content">
        {visitedScreens.has("dashboard")&&<div style={{display:screen==="dashboard"?undefined:"none"}}>
          <HomeScreen onOpenLesson={openLesson} onGoPlanner={goPlanner} onGoMaterials={()=>setScreen("materials")} onGoAITools={goAITools} onGoSettings={()=>setSettingsOpen(true)} section={currentSection} homework={homework} hwLoading={hwLoading} onRefreshHomework={loadHomework} loading={lessonsLoading} teacherName={teacherName} classContext={classContext} classLabel={classLabel} initialPanel={homePanel} onInitialPanelConsumed={()=>setHomePanel(null)} active={screen==="dashboard"}/>
        </div>}
        {visitedScreens.has("planner")&&<div style={{display:screen==="planner"?undefined:"none"}}>
          <Planner onOpenLesson={openLesson} section={currentSection} loading={lessonsLoading} onRefresh={loadLessons} classContext={classContext} classLabel={classLabel} editLessonId={editLessonId} onEditConsumed={()=>setEditLessonId(null)} prefillChapter={prefillChapter} onPrefillConsumed={()=>setPrefillChapter(null)}/>
        </div>}
        {visitedScreens.has("materials")&&<div style={{display:screen==="materials"?undefined:"none"}}>
          <Materials classLabel={classLabel}/>
        </div>}
        {visitedScreens.has("aitools")&&<div style={{display:screen==="aitools"?undefined:"none"}}>
          <AITools lessons={lessons} classContext={classContext} classLabel={classLabel} initialTab={aiToolsTab} onInitialTabConsumed={()=>setAiToolsTab(null)}/>
        </div>}
      </div>

      {/* NEW — search used to navigate to a whole separate screen just to
          type a query. It's a popup now, opens on top of wherever you
          are, and its result actions (open a lesson, jump to Materials/AI
          tools) close the popup first so you land on a clean screen. */}
      {searchOpen&&(
        <div className="no-print" onClick={()=>setSearchOpen(false)} style={{position:"fixed",inset:0,zIndex:89,display:"flex",alignItems:"flex-start",justifyContent:"center",background:"rgba(20,18,14,0.55)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:"8vh 16px 16px"}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:PAPER,borderRadius:24,width:"100%",maxWidth:"min(94vw, 900px)",maxHeight:"92vh",overflowY:"auto",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`,position:"relative",fontSize:"clamp(15px, 1.6vw, 17px)"}}>
            <div style={{position:"sticky",top:0,zIndex:2,display:"flex",justifyContent:"flex-end",padding:"10px 10px 0",background:PAPER}}>
              <IconButton icon={X} onClick={()=>setSearchOpen(false)} variant="surface"/>
            </div>
            <DocumentSearch lessons={lessons} homework={homework} classLabel={classLabel}
              onOpenLesson={(l,opts)=>{setSearchOpen(false);openLesson(l,opts);}}
              onGoMaterials={()=>{setSearchOpen(false);setScreen("materials");}}
              onGoHomework={()=>{setSearchOpen(false);goHomePanel("homework");}}
            />
          </div>
        </div>
      )}

      {/* NEW — Settings as a popup instead of a full screen: opens on top
          of whatever screen you're already on, closes right back to it. */}
      {settingsOpen&&(
        <div className="no-print" onClick={()=>setSettingsOpen(false)} style={{position:"fixed",inset:0,zIndex:90,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(20,18,14,0.55)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",padding:20}}>
          <div onClick={(e)=>e.stopPropagation()} style={{background:PAPER,borderRadius:24,width:"100%",maxWidth:"min(94vw, 980px)",maxHeight:"94vh",overflowY:"auto",boxShadow:SHADOW.lg,border:`1px solid ${BORDER}`,position:"relative",fontSize:"clamp(15px, 1.6vw, 17px)"}}>
            <div style={{position:"sticky",top:0,zIndex:2,display:"flex",justifyContent:"flex-end",padding:"14px 14px 0",background:PAPER}}>
              <IconButton icon={X} onClick={()=>setSettingsOpen(false)} variant="surface"/>
            </div>
            <div style={{padding:"0 4px 10px"}}>
              <Settings session={session} sections={sections} currentSection={currentSection}
                onSectionAdded={(s)=>{setSections((prev)=>[...prev,s]);setCurrentSection(s);}}
                onSectionUpdated={(s)=>{setSections((prev)=>prev.map((x)=>x.id===s.id?s:x));if(currentSection?.id===s.id)setCurrentSection(s);}}
                onSectionDeleted={(id)=>{setSections((prev)=>prev.filter((x)=>x.id!==id));if(currentSection?.id===id)setCurrentSection(sections.find((x)=>x.id!==id)||null);}}
                theme={theme} onToggleTheme={toggleTheme} installPrompt={installPrompt} isStandalone={isStandalone} isIOS={isIOS} onInstall={promptInstall}
                classLabel={classLabel} subjectLabel={subjectLabel} onClassChange={setClassLabel} onSubjectChange={setSubjectLabel} teacherName={teacherName} onTeacherNameChange={setTeacherName}
              />
            </div>
          </div>
        </div>
      )}

      <div className="mobile-bottom-nav no-print" style={{position:"fixed",bottom:0,left:0,right:0,background:`color-mix(in srgb, ${SURFACE} 94%, transparent)`,backdropFilter:"blur(10px)",WebkitBackdropFilter:"blur(10px)",borderTop:`1px solid ${BORDER}`,justifyContent:"space-around",padding:"7px 6px calc(7px + env(safe-area-inset-bottom))",zIndex:10,boxShadow:"0 -6px 20px rgba(0,0,0,0.07)"}}>
        {/* FIX — this used to be 4 direct icons plus a 5th "थप" icon that
            opened a bottom sheet, and that sheet was the ONLY way to reach
            AI Tools or More — two taps for two of the app's most-used
            screens. All five destinations are flat, direct taps now. */}
        {nav.map((n)=>{const Icon=n.icon;const active=screen===n.id;return(
          <button key={n.id} onClick={()=>setScreen(n.id)} className="ss-btn" style={{background:"none",border:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:2,color:active?n.color:INK_SOFT,fontSize:12.5,fontWeight:700,cursor:"pointer",padding:"5px 8px 3px",flex:1,borderRadius:14}}>
            <div style={{width:46,height:32,borderRadius:16,background:active?`linear-gradient(155deg, ${n.color} 0%, color-mix(in srgb, ${n.color} 65%, black) 100%)`:`linear-gradient(160deg, color-mix(in srgb, ${n.color} 18%, transparent) 0%, color-mix(in srgb, ${n.color} 7%, transparent) 100%)`,display:"flex",alignItems:"center",justifyContent:"center",boxShadow:active?`inset 0 1px 0 rgba(255,255,255,0.35), 0 4px 10px color-mix(in srgb, ${n.color} 45%, transparent)`:"none",transition:"all .18s ease",transform:active?"rotate(-3deg) translateY(-1px)":"none"}}><Icon size={19} color={active?"#fff":n.color} style={active?{transform:"rotate(3deg)"}:undefined}/></div>
            {n.label}
          </button>
        );})}
      </div>

      {activeLesson&&<LessonMode lesson={activeLesson} onClose={()=>{setActiveLesson(null);setActiveLessonAutoPrint(false);setActiveLessonTab(null);}} onEdit={editLessonFromViewer} autoPrint={activeLessonAutoPrint} classLabel={classLabel} classContext={classContext} teacherName={teacherName} initialTab={activeLessonTab}/>}
      {editingLessonPopup&&<LessonEditModal lesson={editingLessonPopup} classContext={classContext} classLabel={classLabel}
        onClose={()=>setEditingLessonPopup(null)}
        onSaved={(updated,deleted)=>{
          loadLessons();
          if(deleted&&activeLesson?.id===editingLessonPopup.id){setActiveLesson(null);}
          else if(updated&&activeLesson?.id===updated.id){setActiveLesson(updated);}
        }}
      />}
    </div>
    </DataProvider>
  );
}
