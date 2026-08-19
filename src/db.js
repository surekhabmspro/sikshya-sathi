// db.js — all Supabase database calls in one place
import { supabase } from "./lib/supabase";

// ─── AUTH ────────────────────────────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp = (email, password, options) =>
  supabase.auth.signUp({ email, password, options });

export const signOut = () => supabase.auth.signOut();

export const getSession = () => supabase.auth.getSession();

// ─── SECTIONS ────────────────────────────────────────────────────────────────
export const getSections = async () => {
  const { data, error } = await supabase
    .from("sections")
    .select("*")
    .order("name");
  return { data, error };
};

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
export const getChapters = async (classLabel = null) => {
  let query = supabase.from("chapters").select("*").order("order_index");
  if (classLabel) query = query.eq("class_label", classLabel);
  const { data, error } = await query;
  return { data, error };
};

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
export const getLessons = async (sectionId = null, classLabel = null) => {
  let query = supabase
    .from("lessons")
    .select("*, chapters(title)")
    .order("scheduled_date", { ascending: true });
  if (sectionId) query = query.eq("section_id", sectionId);
  if (classLabel) query = query.eq("class_label", classLabel);
  const { data, error } = await query;
  return { data, error };
};

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
export const getMaterials = async (classLabel = null) => {
  let query = supabase.from("materials").select("*, chapters(title), lessons(title)").order("created_at", { ascending: false });
  if (classLabel) query = query.eq("class_label", classLabel);
  const { data, error } = await query;
  return { data, error };
};

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
export const getCalendarEvents = async (classLabel = null) => {
  let query = supabase.from("calendar_events").select("*").order("start_date", { ascending: true });
  if (classLabel) query = query.or(`class_label.eq.${classLabel},class_label.is.null`);
  const { data, error } = await query;
  return { data, error };
};

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

  const tables = ["materials", "lessons", "questions", "activities"];
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
export const getQuestions = async () => {
  const { data, error } = await supabase
    .from("questions")
    .select("*, chapters(title)")
    .order("created_at", { ascending: false });
  return { data, error };
};

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
export const getAssessments = async () => {
  const { data, error } = await supabase
    .from("assessments")
    .select("*, lessons(title)")
    .order("created_at", { ascending: false });
  return { data, error };
};

export const upsertAssessment = async (assessment) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("assessments")
    .upsert({ ...assessment, teacher_id: user.id })
    .select()
    .single();
  return { data, error };
};

// ─── HOMEWORK ─────────────────────────────────────────────────────────────────
export const getHomework = async (sectionId = null) => {
  let query = supabase
    .from("homework")
    .select("*, lessons(title)")
    .order("assigned_date", { ascending: false });
  if (sectionId) query = query.eq("section_id", sectionId);
  const { data, error } = await query;
  return { data, error };
};

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
export const getJournalEntries = async () => {
  const { data, error } = await supabase
    .from("journal_entries")
    .select("*, lessons(title)")
    .order("entry_date", { ascending: false });
  return { data, error };
};

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
export const getActivities = async () => {
  const { data, error } = await supabase
    .from("activities")
    .select("*, chapters(title)")
    .order("created_at", { ascending: false });
  return { data, error };
};

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
export const getSavedResources = async () => {
  const { data, error } = await supabase
    .from("saved_resources")
    .select("*")
    .order("created_at", { ascending: false });
  return { data, error };
};

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
