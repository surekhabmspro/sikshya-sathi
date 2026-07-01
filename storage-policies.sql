-- ============================================================================
-- Owner-only access policies for the "materials" Storage bucket
-- Run this in Supabase SQL Editor AFTER creating the "materials" bucket
-- (Storage > New bucket > name: materials > Public: OFF)
-- ============================================================================

-- Convention: every file must be uploaded to a path starting with the
-- uploader's own user id, e.g.  materials/<teacher_id>/worksheet14.pdf
-- storage.foldername(name) splits the path into an array of folder parts,
-- so [1] is the first folder — the teacher_id folder.

-- 1. SELECT (view / download / preview a file)
create policy "owner_select_materials"
on storage.objects for select
using (
  bucket_id = 'materials'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 2. INSERT (upload a new file)
create policy "owner_insert_materials"
on storage.objects for insert
with check (
  bucket_id = 'materials'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 3. UPDATE (e.g. overwrite / rename a file)
create policy "owner_update_materials"
on storage.objects for update
using (
  bucket_id = 'materials'
  and auth.uid()::text = (storage.foldername(name))[1]
)
with check (
  bucket_id = 'materials'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- 4. DELETE (remove a file)
create policy "owner_delete_materials"
on storage.objects for delete
using (
  bucket_id = 'materials'
  and auth.uid()::text = (storage.foldername(name))[1]
);

-- ============================================================================
-- That's it. Now a logged-in teacher can only see, upload, update, and
-- delete files inside their own folder (materials/<their-own-uid>/...).
-- Trying to access another teacher's folder returns "permission denied".
-- ============================================================================
