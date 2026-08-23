// db.js — all Supabase database calls in one place
import { supabase } from "./lib/supabase";

// ─── OFFLINE CACHE ──────────────────────────────────────────────────────────
// NEW — the app shell (JS/CSS/icons) was already precached by sw.js, so it
// opened offline, but every screen was still empty: चयाट history aside,
// every list (chapters, lessons, materials, homework, calendar, diary...)
// comes from Supabase over the network, and a failed fetch offline just
// returned {data:null,error}, which every screen already renders as "कुनै
// ... छैन" — indistinguishable from "you genuinely have nothing yet". A
// teacher who'd already built out their materials would open the app on a
// bus/in a village with no signal and see a blank slate.
// cachedFetch wraps a Supabase read: on success it mirrors the result into
// localStorage (last-known-good, per class/scope via `key`); on failure —
// network down, request thrown/timed out — it serves that mirror instead of
// surfacing the error, so "offline" degrades to "showing what was last
// synced" instead of "showing nothing". Writes (upsert/delete) still need a
// connection, same as before — this only covers reading what's already
// there, which is what "not even showing already-created content" was about.
const CACHE_PREFIX = "ss-cache:";
const cacheRead = (key) => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
};
const cacheWrite = (key, data) => {
  try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(data)); }
  catch { /* storage full or unavailable — fetch still worked, just skip mirroring */ }
};
async function cachedFetch(key, fetcher) {
  try {
    const { data, error } = await fetcher();
    if (error) throw error;
    cacheWrite(key, data);
    return { data, error: null };
  } catch (error) {
    const cached = cacheRead(key);
    if (cached !== null) return { data: cached, error: null, fromCache: true };
    return { data: null, error };
  }
}

// ─── AUTH ────────────────────────────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp = (email, password, options) =>
  supabase.auth.signUp({ email, password, options });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

// ─── SECTIONS ────────────────────────────────────────────────────────────────
export const getSections = async () => cachedFetch("sections", async () => {
  const { data, error } = await supabase
    .from("sections")
    .select("*")
    .order("name");
  return { data, error };
});

export const createSection = async (name) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("sections")
    .insert({ name, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// NEW — sections were add-only (no rename/delete), the same gap chapters
// had before that was fixed. Deleting a section un-assigns (does not
// delete) any lessons/homework that were scoped to it, same "clear the
// tag, don't destroy the data" approach used when deleting a chapter.
export const renameSection = async (id, name) => {
  const { data, error } = await supabase.from("sections").update({ name }).eq("id", id).select().single();
  return { data, error };
};

export const deleteSection = async (id) => {
  await supabase.from("lessons").update({ section_id: null }).eq("section_id", id);
  await supabase.from("homework").update({ section_id: null }).eq("section_id", id);
  const { error } = await supabase.from("sections").delete().eq("id", id);
  return { error };
};

// ─── CHAPTERS ────────────────────────────────────────────────────────────────
// NEW — chapters are now scoped to `class_label` (e.g. "कक्षा ५" vs "कक्षा ६").
// You teach one subject across all sections of a class, but the class itself
// changes year to year — so chapters/textbook need to key off the class, not
// be one shared pool forever. classLabel is optional so nothing breaks for
// any code path that hasn't been updated yet, but always pass it going forward.
export const getChapters = async (classLabel = null) => cachedFetch(`chapters:${classLabel || "all"}`, async () => {
  let query = supabase.from("chapters").select("*").order("order_index");
  if (classLabel) query = query.eq("class_label", classLabel);
  return await query;
});

export const upsertChapter = async (chapter) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("chapters")
    .upsert({ ...chapter, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// NEW — look up a chapter's id by its title (case-insensitive), without
// creating anything. Used when fetching materials for a chapter someone
// typed into Lessons/Questions/Activities/Assessments.
export const getChapterIdByTitle = async (title, classLabel = null) => {
  const clean = normalizeChapterTitle(title);
  if (!clean) return null;
  let query = supabase.from("chapters").select("id").ilike("title", clean);
  if (classLabel) query = query.eq("class_label", classLabel);
  const { data } = await query.limit(1).maybeSingle();
  return data?.id || null;
};

// FIX — root cause of tagging a file successfully but it not consistently
// showing up under its chapter afterward: getOrCreateChapterId used to be
// "look it up, and if nothing's there, insert" with no protection between
// those two steps. If a chapter got resolved from two places close together
// (e.g. adding a chapter from the tag dialog, then the save button
// re-resolving the same title a moment later), both calls could find
// nothing yet and both insert — leaving TWO chapter rows with the identical
// title but different ids. Every material tagged to that title afterward
// silently splits across whichever duplicate a given lookup happens to
// match, so the same chapter title stops reliably grouping its materials.
// Also normalizes whitespace (collapsing double spaces, trimming) the same
// way everywhere a title is compared or stored, so "जान्ने रुख" and
// "जान्ने  रुख" (extra space) can never be treated as different chapters.
function normalizeChapterTitle(title) {
  return (title || "").trim().replace(/\s+/g, " ");
}

export const getOrCreateChapterId = async (title, classLabel = null) => {
  const clean = normalizeChapterTitle(title);
  if (!clean) return null;
  const existingId = await getChapterIdByTitle(clean, classLabel);
  if (existingId) return existingId;
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("chapters")
    .insert({ title: clean, teacher_id: user.id, class_label: classLabel })
    .select("id")
    .single();
  if (error) {
    // Someone else (another tab, another quick call) won the race and
    // inserted this exact title between our lookup and our insert. Re-check
    // instead of surfacing the error or creating a duplicate.
    const retryId = await getChapterIdByTitle(clean, classLabel);
    if (retryId) return retryId;
    throw error;
  }
  return data.id;
};

// NEW — rename/delete, THE single door for both. Previously Planner and
// Materials each had their own copy of this (raw supabase calls straight in
// the component, two slightly different implementations that could drift).
// Every screen that lets a teacher rename or delete an अध्याय now calls these
// two functions — nothing else touches the chapters table directly.
export const renameChapter = async (id, title) => {
  const clean = normalizeChapterTitle(title);
  const { data, error } = await supabase.from("chapters").update({ title: clean }).eq("id", id).select().single();
  return { data, error };
};

// Deleting a chapter never deletes what's tagged to it — lessons/questions/
// activities/assessments all have ON DELETE SET NULL on chapter_id at the
// database level, so those un-tag themselves automatically. materials does
// not have that constraint, so it's cleared explicitly here first.
export const deleteChapter = async (id) => {
  await supabase.from("materials").update({ chapter_id: null }).eq("chapter_id", id);
  const { error } = await supabase.from("chapters").delete().eq("id", id);
  return { error };
};

// NEW — the textbook-token-savings cache: once a chapter's plain text has
// been pulled out of the textbook PDF, it's kept here (keyed by chapter_id,
// so no title-matching fuzziness) and reused on every later AI call for
// that chapter instead of re-attaching the whole book.
export const getTextbookChapterText = async (chapterId) => {
  if (!chapterId) return null;
  const { data } = await supabase.from("textbook_chapter_text").select("extracted_text").eq("chapter_id", chapterId).maybeSingle();
  return data?.extracted_text || null;
};
export const saveTextbookChapterText = async (chapterId, text) => {
  if (!chapterId || !text) return;
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("textbook_chapter_text").upsert({ chapter_id: chapterId, teacher_id: user.id, extracted_text: text }, { onConflict: "chapter_id" });
};
// Wipes the cache — call this whenever a class's textbook PDF is replaced
// or removed, since cached text extracted from the OLD book would silently
// keep being served as if it were still accurate otherwise.
export const clearTextbookChapterTextCache = async (classLabel = null) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  if (!classLabel) { await supabase.from("textbook_chapter_text").delete().eq("teacher_id", user.id); return; }
  const { data: chaps } = await supabase.from("chapters").select("id").eq("class_label", classLabel).eq("teacher_id", user.id);
  const ids = (chaps || []).map((c) => c.id);
  if (ids.length) await supabase.from("textbook_chapter_text").delete().in("chapter_id", ids);
};

// ─── LESSONS ─────────────────────────────────────────────────────────────────
// NEW — scoped to class_label, same reasoning as chapters/materials: a
// Class 5 lesson plan shouldn't show up while a teacher is looking at
// Class 6. classLabel is optional so nothing breaks if it's ever called
// without one.
export const getLessons = async (sectionId = null, classLabel = null) => cachedFetch(`lessons:${sectionId || "all"}:${classLabel || "all"}`, async () => {
  let query = supabase
    .from("lessons")
    .select("*, chapters(title)")
    .order("scheduled_date", { ascending: true });
  if (sectionId) query = query.eq("section_id", sectionId);
  if (classLabel) query = query.eq("class_label", classLabel);
  return await query;
});

export const upsertLesson = async (lesson) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("lessons")
    .upsert({ ...lesson, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// NEW — for patching just one or two fields on an EXISTING lesson (e.g.
// saving a single class-discussion answer). upsertLesson always does a
// full-row upsert, which requires every NOT NULL column (title, etc.) to
// be present in the payload — passing only {id, key_questions} to it was
// silently failing with a "null value in column title" constraint error
// every time, surfaced to the teacher as "उत्तर देखियो तर सुरक्षित हुन
// सकेन". A plain .update() only ever touches the columns you give it.
export const updateLesson = async (id, patch) => {
  const { data, error } = await supabase
    .from("lessons")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};

export const deleteLesson = async (id) => {
  const { error } = await supabase.from("lessons").delete().eq("id", id);
  return { error };
};

// ─── MATERIALS ───────────────────────────────────────────────────────────────
// NEW — scoped to class_label, same reasoning as chapters: a Class 5 file
// shouldn't clutter the list once you've moved on to teaching Class 6.
export const getMaterials = async (classLabel = null) => cachedFetch(`materials:${classLabel || "all"}`, async () => {
  let query = supabase.from("materials").select("*, chapters(title), lessons(title)").order("created_at", { ascending: false });
  if (classLabel) query = query.eq("class_label", classLabel);
  return await query;
});

// NEW — fetch only the materials linked to one chapter (by chapter_id).
// This is the piece that lets an AI button pull in just the right files
// instead of nothing at all.
export const getMaterialsByChapter = async (chapterId) => {
  if (!chapterId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("chapter_id", chapterId);
  return { data, error };
};

// NEW — materials scoped to one पाठ (Path), not the whole अध्याय. Used by
// the Planner Path form and by AI generation so a file uploaded for one
// Path doesn't bleed into another Path's context.
export const getMaterialsByLesson = async (lessonId) => {
  if (!lessonId) return { data: [], error: null };
  const { data, error } = await supabase
    .from("materials")
    .select("*")
    .eq("lesson_id", lessonId);
  return { data, error };
};

export const insertMaterial = async (material) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("materials")
    .insert({ ...material, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// NEW — update an existing material row (used to add/fix chapter_id,
// extracted_text, or extraction_status after the fact).
export const updateMaterial = async (id, patch) => {
  const { data, error } = await supabase
    .from("materials")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};

export const deleteMaterial = async (id, storagePath) => {
  await supabase.storage.from("materials").remove([storagePath]);
  const { error } = await supabase.from("materials").delete().eq("id", id);
  return { error };
};

export const getMaterialUrl = async (storagePath) => {
  const { data } = await supabase.storage
    .from("materials")
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl;
};

export const uploadMaterialFile = async (file, teacherId) => {
  const ext = file.name.split(".").pop();
  const fileName = `${Date.now()}.${ext}`;
  const path = `${teacherId}/${fileName}`;
  const { error } = await supabase.storage
    .from("materials")
    // NEW — contentType must be set explicitly; supabase-js does NOT infer
    // it from the File object, so it was defaulting to a generic type.
    // That's why opening a material downloaded it instead of previewing
    // inline (browsers only render PDFs/images/video in an <iframe>/<img>
    // when the server reports the right Content-Type) and why it felt slow
    // (no inline streaming/rendering, just a raw byte dump).
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  return { path, error };
};

// NEW — one-time repair for materials uploaded before the contentType fix
// above. Re-uploads each existing file to its same storage path with the
// correct MIME type so old materials start previewing inline too, instead
// of requiring the teacher to delete and re-upload everything by hand.
export const repairMaterialContentTypes = async (onProgress) => {
  const { data: materials, error } = await supabase
    .from("materials")
    .select("id, name, storage_path, file_type");
  if (error) return { fixed: 0, failed: 0, error };
  const guessType = (name, fileType) => {
    const ext = (name.split(".").pop() || "").toLowerCase();
    const map = {
      pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png",
      gif: "image/gif", webp: "image/webp", mp4: "video/mp4", mp3: "audio/mpeg",
      doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      csv: "text/csv",
    };
    return map[ext] || "application/octet-stream";
  };
  let fixed = 0, failed = 0;
  for (const m of materials || []) {
    try {
      const { data: blob, error: dlErr } = await supabase.storage.from("materials").download(m.storage_path);
      if (dlErr || !blob) { failed++; onProgress?.({ fixed, failed, total: materials.length, current: m.name }); continue; }
      // Bug fix: blob.type here just echoes back whatever content-type is
      // ALREADY stored (that's the very thing we're repairing) — Supabase's
      // own upload default is "text/plain;charset=UTF-8", not literally
      // "application/octet-stream", so the old check let it slip through
      // unchanged every time. Always trust the file extension instead.
      const contentType = guessType(m.name, m.file_type);
      const { error: upErr } = await supabase.storage.from("materials").upload(m.storage_path, blob, { contentType, upsert: true });
      if (upErr) failed++; else fixed++;
    } catch { failed++; }
    onProgress?.({ fixed, failed, total: materials.length, current: m.name });
  }
  return { fixed, failed, error: null };
};

// NEW — download a stored file back as a Blob, so a PDF/image material can
// be handed to Gemini as inline_data at generation time.
export const downloadMaterialFile = async (storagePath) => {
  const { data, error } = await supabase.storage
    .from("materials")
    .download(storagePath);
  if (error) throw error;
  return data; // Blob
};

// NEW — one-time repair for lessons/questions/activities saved before the
// chapter tagging fix: those forms used to save only a free-typed
// `chapter_title` and never set the real `chapter_id` foreign key, so old
// rows are invisible to every chapter-based lookup (materials matching, AI
// context, the chapter link counts). This walks each table, and for any
// row that still has no chapter_id but does have a chapter_title, resolves
// (or creates) the matching chapter and fills it in — same idea as
// repairMaterialContentTypes above, just for tagging instead of file
// previews. New/edited rows already save chapter_id correctly on their
// own; this is only needed to backfill what's already in the database.
export const repairChapterTagging = async (onProgress) => {
  const tables = ["lessons", "questions", "activities"];
  let fixed = 0, failed = 0, total = 0;
  const cache = {}; // "title::classLabel" -> chapter_id, avoids re-resolving the same chapter repeatedly
  for (const table of tables) {
    const { data: rows, error } = await supabase
      .from(table)
      .select("id, chapter_title, chapter_id, class_label")
      .is("chapter_id", null)
      .not("chapter_title", "is", null);
    if (error) { failed++; onProgress?.({ fixed, failed, total, current: `${table}: ${error.message}` }); continue; }
    total += (rows || []).length;
    for (const row of rows || []) {
      const title = (row.chapter_title || "").trim();
      if (!title) continue;
      const key = `${title}::${row.class_label || ""}`;
      try {
        if (!(key in cache)) cache[key] = await getOrCreateChapterId(title, row.class_label || null);
        const chapterId = cache[key];
        if (!chapterId) { failed++; onProgress?.({ fixed, failed, total, current: `${table}: ${title}` }); continue; }
        const { error: upErr } = await supabase.from(table).update({ chapter_id: chapterId }).eq("id", row.id);
        if (upErr) failed++; else fixed++;
      } catch { failed++; }
      onProgress?.({ fixed, failed, total, current: `${table}: ${title}` });
    }
  }
  return { fixed, failed, total, error: null };
};

// ─── CALENDAR EVENTS ─────────────────────────────────────────────────────────
// NEW — Phase 3: the Calendar tab used to just be a month grid with no real
// data behind it — "आजका कार्यहरू" was a hardcoded splice of the first 3
// lessons and first 2 pending homework, never actually matched to the
// selected date. This is a real events table: school events, holidays,
// exam schedules, training/programs, and reminders, each with a category
// and color, optionally scoped to one class (class_label = null means
// "applies to every class", e.g. a school-wide holiday).
//
// Sync-ready by design: `source` distinguishes events a teacher typed in
// ("manual") from ones brought in later from an official school calendar
// ("imported"), and `external_id` is reserved for whatever stable id/UID
// that external calendar uses per event (e.g. an ICS UID or a school
// system's row id). A future import routine can upsert on
// (teacher_id, external_id) to avoid ever creating duplicates on re-sync,
// without any change needed here. See the migration note at the bottom of
// this file for the table definition.
export const getCalendarEvents = async (classLabel = null) => cachedFetch(`calendar_events:${classLabel || "all"}`, async () => {
  let query = supabase.from("calendar_events").select("*").order("start_date", { ascending: true });
  if (classLabel) query = query.or(`class_label.eq.${classLabel},class_label.is.null`);
  return await query;
});

export const upsertCalendarEvent = async (event) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("calendar_events")
    .upsert({ source: "manual", ...event, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

export const deleteCalendarEvent = async (id) => {
  const { error } = await supabase.from("calendar_events").delete().eq("id", id);
  return { error };
};

// NEW — inserts many events at once, used after a teacher uploads a school
// calendar (PDF/photo) and confirms which AI-extracted events to keep.
// Each row gets source:"imported" unless the caller already set one.
export const bulkInsertCalendarEvents = async (events) => {
  if (!events?.length) return { data: [], error: null };
  const { data: { user } } = await supabase.auth.getUser();
  const rows = events.map((e) => ({ source: "imported", ...e, teacher_id: user.id }));
  const { data, error } = await supabase.from("calendar_events").insert(rows).select();
  return { data, error };
};

// The one-time Supabase table setup for calendar_events lives in its own
// file, calendar_events.sql — run that in Supabase's SQL Editor, not this
// file. This file (db.js) only ever goes into your app/GitHub deployment.

// check-then-insert race in getOrCreateChapterId (fixed above, but this
// repairs whatever it already produced). Groups chapters by normalized
// title + class_label; where more than one row exists for the same chapter,
// keeps the oldest one and re-points every material/lesson/question/
// activity that referenced a duplicate onto the surviving chapter, then
// deletes the duplicates. Safe to run more than once — a class with no
// duplicates just reports 0 merged.
export const repairDuplicateChapters = async (onProgress) => {
  const { data: chapters, error } = await supabase
    .from("chapters")
    .select("id, title, class_label, created_at")
    .order("created_at", { ascending: true });
  if (error) return { merged: 0, rowsUpdated: 0, error };

  const groups = {};
  for (const c of chapters || []) {
    const key = `${(c.title || "").trim().toLowerCase()}::${c.class_label || ""}`;
    (groups[key] ||= []).push(c);
  }

  // FIX — assessments link to a chapter via chapter_id too (see the FIX
  // comment on getAssessments/AssessmentBuilder's save() — it switched
  // from lesson_id to chapter_id), but was missing from this list. Any
  // assessment tagged to a chapter that turned out to be a duplicate
  // would get silently orphaned the moment the duplicate was deleted
  // below — its chapter_id pointing at a row that no longer exists,
  // making it fall out of "यो अध्यायसँग जोडिएको" counts everywhere.
  const tables = ["materials", "lessons", "questions", "activities", "assessments"];
  let merged = 0, rowsUpdated = 0;

  for (const key in groups) {
    const group = groups[key];
    if (group.length < 2) continue; // no duplicates for this chapter
    const [keep, ...dupes] = group; // oldest first (created_at ascending)
    for (const dupe of dupes) {
      for (const table of tables) {
        const { data: rows, error: selErr } = await supabase
          .from(table).select("id").eq("chapter_id", dupe.id);
        if (selErr || !rows?.length) continue;
        const { error: upErr } = await supabase
          .from(table).update({ chapter_id: keep.id }).eq("chapter_id", dupe.id);
        if (!upErr) rowsUpdated += rows.length;
        onProgress?.({ merged, rowsUpdated, current: `${keep.title} ← ${table} (${rows.length})` });
      }
      await supabase.from("chapters").delete().eq("id", dupe.id);
      merged++;
      onProgress?.({ merged, rowsUpdated, current: `हटाइयो: ${dupe.title}` });
    }
  }
  return { merged, rowsUpdated, error: null };
};

// ─── QUESTIONS ───────────────────────────────────────────────────────────────
// FIX — this never filtered by class at all: every question ever created,
// across every class the teacher has ever taught, showed up mixed together
// in Question Bank, Document Search, and AI generation's "already have
// materials for this chapter" checks. The `class_label` column already
// exists on this table (repairChapterTagging above has always read it) —
// upsertQuestion just never set it and this never filtered on it. Uses the
// same "null = applies everywhere" convention as calendar_events, so
// existing rows saved before this fix (class_label still null) stay
// visible instead of silently disappearing.
export const getQuestions = async (classLabel = null) => cachedFetch(`questions:${classLabel || "all"}`, async () => {
  let query = supabase
    .from("questions")
    .select("*, chapters(title)")
    .order("created_at", { ascending: false });
  if (classLabel) query = query.or(`class_label.eq.${classLabel},class_label.is.null`);
  return await query;
});

export const upsertQuestion = async (question) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("questions")
    .upsert({ ...question, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

export const deleteQuestion = async (id) => {
  const { error } = await supabase.from("questions").delete().eq("id", id);
  return { error };
};

// ─── QUESTION SETS ───────────────────────────────────────────────────────────
export const getQuestionSets = async () => {
  const { data, error } = await supabase
    .from("question_sets")
    .select("*")
    .order("created_at", { ascending: false });
  return { data, error };
};

export const upsertQuestionSet = async (set) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("question_sets")
    .upsert({ ...set, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

export const deleteQuestionSet = async (id) => {
  const { error } = await supabase
    .from("question_sets")
    .delete()
    .eq("id", id);
  return { error };
};

// ─── ASSESSMENTS ─────────────────────────────────────────────────────────────
// FIX — two bugs at once. (1) The join here was still `lessons(title)`,
// left over from before Assessment Builder switched to saving chapter_id
// instead of lesson_id (see the FIX comment on AssessmentBuilder's save()
// in App.jsx) — so this embed matched nothing an assessment actually has,
// and was silently unused. (2) No class filtering at all: every
// assessment ever created, from every class, showed up together here and
// bled into the शिक्षा साथी calendar's exam-date markers too. Filtered via
// the chapter's own class_label (assessments has no class_label column of
// its own) — an assessment with no chapter attached still shows
// everywhere, same "unlinked = visible always" rule used across the app.
export const getAssessments = async (classLabel = null) => cachedFetch(`assessments:${classLabel || "all"}`, async () => {
  const { data, error } = await supabase
    .from("assessments")
    .select("*, chapters(title, class_label)")
    .order("created_at", { ascending: false });
  if (error || !classLabel) return { data, error };
  const filtered = (data || []).filter((a) => !a.chapters || a.chapters.class_label === classLabel);
  return { data: filtered, error: null };
});

export const upsertAssessment = async (assessment) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("assessments")
    .upsert({ ...assessment, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// NEW — matches the deleteSimulation pattern below: lets LessonMode's
// मूल्याङ्कन tab actually remove a rubric instead of only ever being able
// to overwrite it, since until now nothing in the app ever deleted an
// assessments row.
export const deleteAssessment = async (id) => {
  const { error } = await supabase.from("assessments").delete().eq("id", id);
  return { error };
};

// FIX — the actual root cause behind LessonMode's "मूल्याङ्कन" tab always
// showing empty: the lesson row has its own `rubric` column, but nothing
// in the app has ever written to it — preparePath() (the main "AI ले यो
// पाठ बनाओस्" flow) generates a rubric and saves it, but only into the
// separate `assessments` table (tagged with this lesson's id), never back
// onto lesson.rubric. So a teacher could generate a full bundle,
// including a rubric, and LessonMode would still say "मूल्याङ्कन मापदण्ड
// थपिएको छैन" — the rubric existed the whole time, just in a different
// table LessonMode never looked at. This fetches it from where it
// actually lives.
export const getAssessmentsByLesson = async (lessonId) => {
  if (!lessonId) return { data: [], error: null };
  return cachedFetch(`assessments_by_lesson:${lessonId}`, async () => {
    const { data, error } = await supabase
      .from("assessments")
      .select("*")
      .eq("lesson_id", lessonId)
      .order("created_at", { ascending: false });
    return { data, error };
  });
};

// ─── HOMEWORK ─────────────────────────────────────────────────────────────────
// FIX — no class scoping at all (only section_id, and sections aren't tied
// to a class). Requires the migration in add_class_scoping_homework_resources.sql
// to be run first — see that file for why. Same "null = every class"
// convention as calendar_events/questions/activities.
export const getHomework = async (sectionId = null, classLabel = null) => cachedFetch(`homework:${sectionId || "all"}:${classLabel || "all"}`, async () => {
  let query = supabase
    .from("homework")
    .select("*, lessons(title)")
    .order("assigned_date", { ascending: false });
  if (sectionId) query = query.eq("section_id", sectionId);
  if (classLabel) query = query.or(`class_label.eq.${classLabel},class_label.is.null`);
  return await query;
});

export const upsertHomework = async (hw) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("homework")
    .upsert({ ...hw, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// ─── JOURNAL ─────────────────────────────────────────────────────────────────
// FIX — no class filtering: डायरी entries from every class a teacher has
// ever taught piled up together forever, with the oldest ones never aging
// out even after moving to a new class. Filtered via the linked lesson's
// class_label; an entry with no lesson attached (the "आजको पाठ" field is
// optional) still shows everywhere, same rule as elsewhere in the app.
export const getJournalEntries = async (classLabel = null) => cachedFetch(`journal_entries:${classLabel || "all"}`, async () => {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*, lessons(title, class_label)")
    .order("entry_date", { ascending: false });
  if (error || !classLabel) return { data, error };
  const filtered = (data || []).filter((e) => !e.lessons || e.lessons.class_label === classLabel);
  return { data: filtered, error: null };
});

export const upsertJournalEntry = async (entry) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("journal_entries")
    .upsert({ ...entry, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// ─── ACTIVITIES ──────────────────────────────────────────────────────────────
// FIX — same class-leak as questions above: class_label already exists on
// this table (repairChapterTagging has always read it) but nothing wrote
// or filtered on it, so क्रियाकलाप from every class showed up together.
export const getActivities = async (classLabel = null) => cachedFetch(`activities:${classLabel || "all"}`, async () => {
  let query = supabase
    .from("activities")
    .select("*, chapters(title)")
    .order("created_at", { ascending: false });
  if (classLabel) query = query.or(`class_label.eq.${classLabel},class_label.is.null`);
  return await query;
});

export const upsertActivity = async (activity) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("activities")
    .upsert({ ...activity, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// ─── SIMULATIONS (AI-generated interactive lesson exercises) ─────────────────
// Each row is one self-contained interactive simulation (HTML+CSS+JS) tied
// to a lesson, so a teacher can build up several attempts for the same
// lesson and pick whichever works best in class, instead of only ever
// having the latest one.
export const getSimulationsByLesson = async (lessonId) => {
  const { data, error } = await supabase
    .from("simulations")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false });
  return { data, error };
};

// NEW — recent simulation TYPES across ALL of this teacher's lessons, not
// just one lesson. gemini.pickNextSimulationType() round-robins across
// mechanics (drag/tap/type/slider) using whatever history it's given —
// but a teacher who generates one simulation per lesson (the common case)
// was always passing an empty per-lesson history, so every single lesson
// got an independent fresh 25%-per-mechanic draw with no memory of "we
// just did three drag ones in a row across the last three lessons". Using
// the teacher's global recent history instead means the round-robin
// actually corrects for that streak, so mechanics genuinely alternate
// lesson-to-lesson rather than only within repeated generations on the
// same lesson.
export const getRecentSimulationTypes = async (limit = 12) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("simulations")
    .select("type")
    .eq("teacher_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return { data: (data || []).map((r) => r.type).filter(Boolean), error };
};

export const saveSimulation = async (simulation) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("simulations")
    .insert({ ...simulation, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

export const renameSimulation = async (id, title) => {
  const { data, error } = await supabase.from("simulations").update({ title }).eq("id", id).select().single();
  return { data, error };
};

// NEW — updates an EXISTING simulation's generated content in place
// (used by "पुनरावलोकन" regenerate: same row, same type, just fresh
// content) instead of always inserting a brand-new row via saveSimulation.
export const updateSimulationContent = async (id, { title, html_content, discussion_tips }) => {
  const { data, error } = await supabase
    .from("simulations")
    .update({ title, html_content, discussion_tips })
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};

export const deleteSimulation = async (id) => {
  const { error } = await supabase.from("simulations").delete().eq("id", id);
  return { error };
};

// ─── AI MESSAGES ─────────────────────────────────────────────────────────────
export const getAIMessages = async (lessonId) => {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at");
  return { data, error };
};

export const saveAIMessage = async (lessonId, role, content) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from("ai_messages")
    .insert({ lesson_id: lessonId, role, content, teacher_id: user.id });
  return { error };
};

// ─── SAVED RESOURCES ─────────────────────────────────────────────────────────
// NEW — persists AI-generated resources (worksheets, flashcards, revision
// pages, etc. from the Resource Creator) so they survive navigating away
// instead of only living in local component state.
// FIX — no class scoping at all. Requires the migration in
// add_class_scoping_homework_resources.sql to be run first.
export const getSavedResources = async (classLabel = null) => cachedFetch(`saved_resources:${classLabel || "all"}`, async () => {
  let query = supabase
    .from("saved_resources")
    .select("*")
    .order("created_at", { ascending: false });
  if (classLabel) query = query.or(`class_label.eq.${classLabel},class_label.is.null`);
  return await query;
});

export const saveResource = async (resource) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("saved_resources")
    .insert({ ...resource, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

export const deleteSavedResource = async (id) => {
  const { error } = await supabase
    .from("saved_resources")
    .delete()
    .eq("id", id);
  return { error };
};

// ─── VOCAB IMAGES (शब्दचित्र) ────────────────────────────────────────────────
// Cross-device replacement for the old IndexedDB-only cache: one row per
// (teacher, word) in "vocab_images", actual bytes in the "vocab-images"
// storage bucket — same shape as materials. See vocab_images_migration.sql.
export const getVocabImage = async (word) => {
  const { data, error } = await supabase
    .from("vocab_images")
    .select("*")
    .eq("word", word)
    .maybeSingle();
  return { data, error };
};

// FIX — the storage path used to embed the word itself
// (encodeURIComponent(word)), but Supabase Storage rejects keys
// containing non-ASCII characters (Devanagari) and spaces outright with
// "Invalid key" — encodeURIComponent doesn't help because the object key
// Supabase validates is the same either way. The word doesn't need to be
// in the file path at all: the vocab_images TABLE already links
// (teacher_id, word) → storage_path, so the path itself just needs to be
// unique and ASCII-safe. A random id does that with no encoding games.
export const uploadVocabImageFile = async (word, blob, teacherId) => {
  const rand = Math.random().toString(36).slice(2, 10);
  const path = `${teacherId}/${Date.now()}-${rand}.jpg`;
  const { error } = await supabase.storage
    .from("vocab-images")
    .upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: false });
  return { path, error };
};

export const getVocabImageUrl = async (storagePath) => {
  const { data } = await supabase.storage
    .from("vocab-images")
    .createSignedUrl(storagePath, 3600);
  return data?.signedUrl;
};

// Upserts the (teacher, word) row. Pass { rejected: true } to mark a
// picture as not appropriate (also removes its old file from storage, if
// any, so the bucket doesn't accumulate rejected images).
export const upsertVocabImage = async (word, patch, oldStoragePath) => {
  const { data: { user } } = await supabase.auth.getUser();
  if (oldStoragePath) {
    await supabase.storage.from("vocab-images").remove([oldStoragePath]);
  }
  const { data, error } = await supabase
    .from("vocab_images")
    .upsert(
      { teacher_id: user.id, word, updated_at: new Date().toISOString(), ...patch },
      { onConflict: "teacher_id,word" }
    )
    .select()
    .single();
  return { data, error };
};

// ─── TEACHER'S GUIDE ─────────────────────────────────────────────────────────
// NEW — the guide covers multiple classes and is re-uploaded whenever it
// changes (new edition, mid-year revision). Only one is "active" at a time;
// older ones stay in the table for history rather than being deleted, in
// case a lesson drafted under a previous edition needs to be checked later.
export const getTeacherGuides = async () => cachedFetch("teacher_guides", async () =>
  await supabase.from("teacher_guides").select("*").order("created_at", { ascending: false })
);

export const getActiveTeacherGuide = async () => {
  const { data, error } = await supabase
    .from("teacher_guides")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
};

export const uploadTeacherGuideFile = async (file, teacherId) => {
  const ext = file.name.split(".").pop();
  const path = `${teacherId}/teacher-guide/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("materials")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  return { path, error };
};

// Marks every other guide inactive, then inserts the new one as active —
// so uploading a fresh guide always replaces which one drafting reads from,
// without deleting the old file.
export const insertTeacherGuide = async (guide) => {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("teacher_guides").update({ is_active: false }).eq("teacher_id", user.id);
  const { data, error } = await supabase
    .from("teacher_guides")
    .insert({ ...guide, teacher_id: user.id, is_active: true })
    .select()
    .single();
  return { data, error };
};

export const setActiveTeacherGuide = async (id) => {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("teacher_guides").update({ is_active: false }).eq("teacher_id", user.id);
  const { data, error } = await supabase
    .from("teacher_guides")
    .update({ is_active: true })
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};

export const deleteTeacherGuide = async (id, storagePath) => {
  await supabase.storage.from("materials").remove([storagePath]);
  const { error } = await supabase.from("teacher_guides").delete().eq("id", id);
  return { error };
};

// ─── YEARLY FORMAT TEMPLATES ─────────────────────────────────────────────────
// NEW — one active Lesson Plan + Rubric format per class_label. Scoped by
// class only (never by section — same class always shares one template).
export const getFormatTemplates = async (classLabel = null) => cachedFetch(`format_templates:${classLabel || "all"}`, async () => {
  let query = supabase.from("format_templates").select("*").order("created_at", { ascending: false });
  if (classLabel) query = query.eq("class_label", classLabel);
  return await query;
});

export const getActiveFormatTemplate = async (classLabel) => {
  const { data, error } = await supabase
    .from("format_templates")
    .select("*")
    .eq("class_label", classLabel)
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return { data, error };
};

export const uploadFormatTemplateFile = async (file, teacherId, classLabel, kind) => {
  // kind: "lesson-plan" or "rubric"
  const ext = file.name.split(".").pop();
  const safeClass = classLabel.replace(/[^a-zA-Z0-9\u0900-\u097F]+/g, "_");
  const path = `${teacherId}/format-template/${safeClass}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from("materials")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  return { path, error };
};

// Replaces the active template for this class_label (deactivates the old
// one, inserts the new one active) — mirrors setActiveTeacherGuide's pattern.
export const insertFormatTemplate = async (template) => {
  const { data: { user } } = await supabase.auth.getUser();
  await supabase.from("format_templates")
    .update({ is_active: false })
    .eq("teacher_id", user.id)
    .eq("class_label", template.class_label);
  const { data, error } = await supabase
    .from("format_templates")
    .insert({ ...template, teacher_id: user.id, is_active: true })
    .select()
    .single();
  return { data, error };
};

export const deleteFormatTemplate = async (id, storagePaths = []) => {
  const paths = storagePaths.filter(Boolean);
  if (paths.length) await supabase.storage.from("materials").remove(paths);
  const { error } = await supabase.from("format_templates").delete().eq("id", id);
  return { error };
};

// ─── PLAN GROUPS (shared Lesson Plan + Rubric, per class) ───────────────────
// NEW — the single saved record both the formatted PDF export and Yojana
// generation read from. Normally one chapter per group; a merged group (the
// Teacher's Guide grouping several chapters under one outcome) covers
// several chapter_ids sharing one Plan Group.
export const getPlanGroupsByClass = async (classLabel) => cachedFetch(`plan_groups:${classLabel}`, async () =>
  await supabase.from("plan_groups").select("*").eq("class_label", classLabel).order("created_at", { ascending: false })
);

export const getPlanGroupForChapter = async (chapterId) => {
  const { data, error } = await supabase
    .from("plan_groups")
    .select("*")
    .contains("chapter_ids", [chapterId])
    .maybeSingle();
  return { data, error };
};

export const insertPlanGroup = async (group) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("plan_groups")
    .insert({ ...group, teacher_id: user.id })
    .select()
    .single();
  if (data) {
    // Link every covered chapter's lesson row(s) to this group so Yojana
    // generation and the formatted export can find it from either side.
    await supabase.from("lessons").update({ plan_group_id: data.id }).in("chapter_id", data.chapter_ids || []);
  }
  return { data, error };
};

export const updatePlanGroup = async (id, patch) => {
  const { data, error } = await supabase
    .from("plan_groups")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();
  return { data, error };
};

export const deletePlanGroup = async (id) => {
  await supabase.from("lessons").update({ plan_group_id: null }).eq("plan_group_id", id);
  const { error } = await supabase.from("plan_groups").delete().eq("id", id);
  return { error };
};

// ─── YOJANA (per-chapter day-wise teaching plan, generated from a Plan Group) ─
// NEW — stored on the lesson row itself (one Yojana per chapter, always,
// even when several chapters share one merged Plan Group).
export const saveLessonYojana = async (lessonId, yojana) => {
  const { data, error } = await supabase
    .from("lessons")
    .update({ yojana, updated_at: new Date().toISOString() })
    .eq("id", lessonId)
    .select()
    .single();
  return { data, error };
};
