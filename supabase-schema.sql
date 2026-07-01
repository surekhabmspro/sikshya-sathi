-- ============================================================================
-- Sikshya Sathi — Teacher Teaching Assistant
-- Supabase (Postgres) schema — free tier
-- ============================================================================
-- How to use:
-- 1. Create a free project at https://supabase.com
-- 2. Open the SQL Editor in your project dashboard
-- 3. Paste this whole file and click "Run"
-- 4. Go to Authentication > Providers and enable Email (or Phone) sign-in
-- 5. Go to Storage and create a bucket named "materials" (private)
-- ============================================================================

-- Every table has a teacher_id so the database is ready for multiple
-- teachers later, even though v1 is single-teacher. RLS policies make sure
-- each teacher only ever sees their own data.

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- CHAPTERS
-- ----------------------------------------------------------------------------
create table chapters (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  title text not null,
  order_index int default 0,
  progress int default 0, -- 0-100, calculated from lessons completed
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- LESSONS
-- ----------------------------------------------------------------------------
create table lessons (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  chapter_id uuid references chapters(id) on delete set null,
  title text not null,
  scheduled_date date,
  period int,
  status text default 'missing' check (status in ('ready', 'prep', 'missing')),
  objectives text[] default '{}',
  vocabulary text[] default '{}',
  sequence text[] default '{}',
  key_questions text[] default '{}',
  activities text[] default '{}',
  homework text,
  rubric jsonb default '[]', -- [{level, desc}]
  notes text,
  material_ids uuid[] default '{}', -- linked materials
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- MATERIALS (metadata only — actual files live in Supabase Storage)
-- ----------------------------------------------------------------------------
create table materials (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  chapter_id uuid references chapters(id) on delete set null,
  name text not null,
  storage_path text not null, -- path inside the "materials" storage bucket
  file_type text not null, -- pdf, pptx, doc, image, video, audio, sheet
  tags text[] default '{}',
  size_bytes bigint,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- QUESTION BANK
-- ----------------------------------------------------------------------------
create table questions (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  chapter_id uuid references chapters(id) on delete set null,
  text text not null,
  type text not null, -- mcq, short_answer, true_false, matching, map_based, scenario, fill_blank, analytical
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  bloom_level text,
  options text[], -- for MCQ
  correct_option int, -- index into options
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- QUESTION SETS (a saved selection of questions, e.g. a model test)
-- ----------------------------------------------------------------------------
create table question_sets (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  title text not null,
  question_ids uuid[] default '{}',
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- ASSESSMENT TEMPLATES + RECORDS (competency-based assessment)
-- ----------------------------------------------------------------------------
create table assessments (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  lesson_id uuid references lessons(id) on delete set null,
  title text not null,
  type text not null, -- observation, oral, practical, project, activity, portfolio
  rubric jsonb default '[]',
  due_date date,
  status text default 'pending' check (status in ('pending', 'done')),
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- HOMEWORK
-- ----------------------------------------------------------------------------
create table homework (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  lesson_id uuid references lessons(id) on delete set null,
  title text not null,
  assigned_date date default current_date,
  total_students int default 0,
  checked_count int default 0,
  remark text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- TEACHING ACTIVITIES LIBRARY
-- ----------------------------------------------------------------------------
create table activities (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  chapter_id uuid references chapters(id) on delete set null,
  title text not null,
  type text not null, -- game, roleplay, project, map, debate, presentation
  competency text,
  duration text,
  description text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- TEACHING JOURNAL
-- ----------------------------------------------------------------------------
create table journal_entries (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  lesson_id uuid references lessons(id) on delete set null,
  entry_date date default current_date,
  mood text check (mood in ('good', 'okay', 'hard')),
  taught text,
  difficulty text,
  idea text,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- SAVED AI PROMPTS (future AI improvements — teacher's preferred prompts)
-- ----------------------------------------------------------------------------
create table saved_prompts (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  label text not null,
  prompt_text text not null,
  created_at timestamptz default now()
);

-- ----------------------------------------------------------------------------
-- AI CHAT HISTORY (per lesson, so the assistant has continuity)
-- ----------------------------------------------------------------------------
create table ai_messages (
  id uuid primary key default uuid_generate_v4(),
  teacher_id uuid references auth.users(id) not null,
  lesson_id uuid references lessons(id) on delete set null,
  role text not null check (role in ('user', 'ai')),
  content text not null,
  created_at timestamptz default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY — every teacher only sees their own data.
-- ============================================================================

alter table chapters enable row level security;
alter table lessons enable row level security;
alter table materials enable row level security;
alter table questions enable row level security;
alter table question_sets enable row level security;
alter table assessments enable row level security;
alter table homework enable row level security;
alter table activities enable row level security;
alter table journal_entries enable row level security;
alter table saved_prompts enable row level security;
alter table ai_messages enable row level security;

-- One generic policy pattern repeated per table: owner-only access.
do $$
declare
  t text;
begin
  foreach t in array array[
    'chapters','lessons','materials','questions','question_sets',
    'assessments','homework','activities','journal_entries',
    'saved_prompts','ai_messages'
  ]
  loop
    execute format('
      create policy "%I_owner_select" on %I for select using (auth.uid() = teacher_id);
      create policy "%I_owner_insert" on %I for insert with check (auth.uid() = teacher_id);
      create policy "%I_owner_update" on %I for update using (auth.uid() = teacher_id);
      create policy "%I_owner_delete" on %I for delete using (auth.uid() = teacher_id);
    ', t, t, t, t, t, t, t, t);
  end loop;
end $$;

-- ============================================================================
-- INDEXES for fast search (used by Document Search across the app)
-- ============================================================================
create index idx_lessons_teacher on lessons(teacher_id);
create index idx_materials_teacher on materials(teacher_id);
create index idx_materials_tags on materials using gin(tags);
create index idx_questions_teacher on questions(teacher_id);
create index idx_questions_chapter on questions(chapter_id);
create index idx_activities_chapter on activities(chapter_id);
create index idx_journal_teacher on journal_entries(teacher_id);

-- Full text search index across lesson titles + chapters (extend as needed)
create index idx_lessons_search on lessons using gin (to_tsvector('simple', title));
create index idx_materials_search on materials using gin (to_tsvector('simple', name));
create index idx_questions_search on questions using gin (to_tsvector('simple', text));

-- ============================================================================
-- Done. Next: enable Realtime on the tables you want to sync instantly
-- (Database > Replication in the Supabase dashboard) — recommended for
-- lessons, homework, and journal_entries so multi-device sync feels instant.
-- ============================================================================
