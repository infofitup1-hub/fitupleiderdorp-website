-- =============================================================================
-- FIT UP Backoffice — private Storage bucket for invoice PDFs
-- Path layout: invoices/{user_id}/{year}/Q{quarter}/{stored_filename}
-- =============================================================================

-- Create a PRIVATE bucket (public = false). If it already exists this is a
-- no-op update keeping it private.
insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do update set public = false;

-- RLS on storage.objects: a user may read/manage only files under their own
-- {user_id}/ prefix. The service-role key (import pipeline) bypasses these.
-- The first path segment of an object name is the user's uuid.

drop policy if exists "invoices read own" on storage.objects;
create policy "invoices read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "invoices insert own" on storage.objects;
create policy "invoices insert own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "invoices delete own" on storage.objects;
create policy "invoices delete own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'invoices'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
