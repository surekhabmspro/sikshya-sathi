-- ============================================================================
-- Sikshya Sathi — textbook_chapter_text table
-- ============================================================================
-- This is the "read the book once, reuse it from then on" cache. The app
-- already avoided re-uploading the textbook PDF's bytes on every AI call
-- (it reuses a Gemini file_uri reference for 47h), but Gemini still counts
-- the WHOLE book's tokens on every single call that includes that
-- reference, whether the question was about chapter 1 or chapter 12.
--
-- With this table: the first time a chapter's textbook content is needed,
-- the app asks Gemini to pull out just that chapter's plain text (one
-- full-book read, same cost as before) and saves it here. Every AI call
-- for that chapter after that sends only this small cached text instead of
-- referencing the whole book — a large, permanent drop in tokens used per
-- call for chapters that get reused often.
--
-- How to use:
-- 1. Open your Supabase project → SQL Editor
-- 2. Paste this whole file and click "Run"
-- ============================================================================

create table if not exists textbook_chapter_text (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  chapter_id uuid references chapters(id) on delete cascade not null unique,
  extracted_text text not null,
  created_at timestamptz default now()
);

alter table textbook_chapter_text enable row level security;

create policy "textbook_chapter_text_owner_select" on textbook_chapter_text
  for select using (auth.uid() = teacher_id);
create policy "textbook_chapter_text_owner_insert" on textbook_chapter_text
  for insert with check (auth.uid() = teacher_id);
create policy "textbook_chapter_text_owner_update" on textbook_chapter_text
  for update using (auth.uid() = teacher_id);
create policy "textbook_chapter_text_owner_delete" on textbook_chapter_text
  for delete using (auth.uid() = teacher_id);

create index if not exists idx_textbook_chapter_text_teacher on textbook_chapter_text(teacher_id);
