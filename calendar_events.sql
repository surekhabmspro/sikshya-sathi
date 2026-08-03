-- ============================================================================
-- Sikshya Sathi — calendar_events table
-- ============================================================================
-- This is the missing piece behind "पात्रो अपलोड" (calendar upload) and
-- "कार्यक्रम थप्नुहोस्" (add event) not working. src/db.js already calls
-- supabase.from("calendar_events") for both features, but this table was
-- never created in the database — every save/upload against it was failing
-- silently. Run this once in Supabase → SQL Editor, then both features
-- start working immediately, no app code changes needed beyond what's
-- already in this update.
--
-- How to use:
-- 1. Open your Supabase project → SQL Editor
-- 2. Paste this whole file and click "Run"
-- ============================================================================

create table if not exists calendar_events (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  -- null = applies to every class ("सबै कक्षाका लागि"); otherwise scoped to
  -- one class the same way chapters/lessons/materials already are.
  class_label text,
  title text not null,
  -- event | holiday | exam | deadline | training | reminder
  category text not null default 'event',
  start_date date not null,
  end_date date,             -- null for a single-day item
  time text,                 -- "HH:MM", optional
  notes text,
  -- "manual" = teacher typed it in directly, "imported" = came from an
  -- uploaded calendar photo/PDF that the teacher reviewed and confirmed.
  source text not null default 'manual',
  -- reserved for a future sync routine to upsert on (teacher_id,
  -- external_id) instead of ever creating duplicates on re-import.
  external_id text,
  created_at timestamptz default now()
);

alter table calendar_events enable row level security;

create policy "calendar_events_owner_select" on calendar_events
  for select using (auth.uid() = teacher_id);
create policy "calendar_events_owner_insert" on calendar_events
  for insert with check (auth.uid() = teacher_id);
create policy "calendar_events_owner_update" on calendar_events
  for update using (auth.uid() = teacher_id);
create policy "calendar_events_owner_delete" on calendar_events
  for delete using (auth.uid() = teacher_id);

create index if not exists idx_calendar_events_teacher on calendar_events(teacher_id);
create index if not exists idx_calendar_events_dates on calendar_events(start_date, end_date);
