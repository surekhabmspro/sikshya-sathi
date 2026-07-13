// db.js — all Supabase database calls in one place
import { supabase } from "./lib/supabase";

// ─── AUTH ────────────────────────────────────────────────────────────────────
export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password });

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password });

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

// ─── CHAPTERS ────────────────────────────────────────────────────────────────
export const getChapters = async () => {
  const { data, error } = await supabase
    .from("chapters")
    .select("*")
    .order("order_index");
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
export const getChapterIdByTitle = async (title) => {
  if (!title || !title.trim()) return null;
  const { data } = await supabase
    .from("chapters")
    .select("id")
    .ilike("title", title.trim())
    .limit(1)
    .maybeSingle();
  return data?.id || null;
};

// NEW — look up a chapter by title, or create it if it doesn't exist yet.
// Used when uploading/tagging a Material, so a freely-typed chapter name
// always resolves to a real row in the chapters table.
export const getOrCreateChapterId = async (title) => {
  const existingId = await getChapterIdByTitle(title);
  if (existingId) return existingId;
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("chapters")
    .insert({ title: title.trim(), teacher_id: user.id })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
};

// ─── LESSONS ─────────────────────────────────────────────────────────────────
export const getLessons = async (sectionId = null) => {
  let query = supabase
    .from("lessons")
    .select("*, chapters(title)")
    .order("scheduled_date", { ascending: true });
  if (sectionId) query = query.eq("section_id", sectionId);
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

export const deleteLesson = async (id) => {
  const { error } = await supabase.from("lessons").delete().eq("id", id);
  return { error };
};

// ─── MATERIALS ───────────────────────────────────────────────────────────────
export const getMaterials = async () => {
  const { data, error } = await supabase
    .from("materials")
    .select("*, chapters(title)")
    .order("created_at", { ascending: false });
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
    .upload(path, file);
  return { path, error };
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
