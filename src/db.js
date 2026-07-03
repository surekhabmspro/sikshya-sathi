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

export const insertMaterial = async (material) => {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("materials")
    .insert({ ...material, teacher_id: user.id })
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
    .createSignedUrl(storagePath, 3600); // 1 hour
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
