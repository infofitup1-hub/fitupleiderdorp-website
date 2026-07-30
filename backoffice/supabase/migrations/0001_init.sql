-- =============================================================================
-- FIT UP Backoffice — initial schema
-- Tables: profiles, gmail_connections, import_runs, invoices
-- Row Level Security is enabled on every table; a user only ever sees own rows.
-- =============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null default 'owner',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- gmail_connections (up to three linked mailboxes per user)
-- ---------------------------------------------------------------------------
create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  email_address text not null,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expiry timestamptz,
  scopes text[] not null default '{}',
  status text not null default 'connected'
    check (status in ('connected', 'disconnected', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, email_address)
);

create index if not exists gmail_connections_user_idx
  on public.gmail_connections (user_id);

-- ---------------------------------------------------------------------------
-- import_runs (history)
-- ---------------------------------------------------------------------------
create table if not exists public.import_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  year integer not null,
  quarter integer not null check (quarter between 1 and 4),
  mailbox_selection text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  new_files integer not null default 0,
  duplicate_files integer not null default 0,
  skipped_files integer not null default 0,
  error_count integer not null default 0,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed'))
);

create index if not exists import_runs_user_started_idx
  on public.import_runs (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- invoices (stored PDFs)
-- ---------------------------------------------------------------------------
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  gmail_connection_id uuid not null
    references public.gmail_connections (id) on delete cascade,
  gmail_message_id text not null,
  attachment_id text not null,
  email_subject text,
  sender_name text,
  sender_email text,
  email_date timestamptz,
  original_filename text not null,
  stored_filename text not null,
  storage_path text not null,
  sha256_hash text not null,
  mime_type text not null default 'application/pdf',
  file_size integer not null default 0,
  status text not null default 'stored'
    check (status in ('stored', 'duplicate', 'skipped', 'error')),
  skip_reason text,
  created_at timestamptz not null default now(),
  -- No duplicate PDFs per user, and no re-import of the same attachment.
  constraint invoices_user_hash_unique unique (user_id, sha256_hash),
  constraint invoices_message_attachment_unique
    unique (gmail_connection_id, gmail_message_id, attachment_id)
);

create index if not exists invoices_user_created_idx
  on public.invoices (user_id, created_at desc);
create index if not exists invoices_user_conn_idx
  on public.invoices (user_id, gmail_connection_id);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists gmail_connections_set_updated_at on public.gmail_connections;
create trigger gmail_connections_set_updated_at
  before update on public.gmail_connections
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a new auth user signs up.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', null))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security
-- =============================================================================
alter table public.profiles enable row level security;
alter table public.gmail_connections enable row level security;
alter table public.import_runs enable row level security;
alter table public.invoices enable row level security;

-- profiles: a user manages only their own profile row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert with check (auth.uid() = id);

-- gmail_connections: full CRUD on own rows only.
drop policy if exists gmail_connections_all_own on public.gmail_connections;
create policy gmail_connections_all_own on public.gmail_connections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- import_runs: read own; writes happen via the service role (import pipeline).
drop policy if exists import_runs_select_own on public.import_runs;
create policy import_runs_select_own on public.import_runs
  for select using (auth.uid() = user_id);

-- invoices: read own; writes happen via the service role (import pipeline).
drop policy if exists invoices_select_own on public.invoices;
create policy invoices_select_own on public.invoices
  for select using (auth.uid() = user_id);

-- NOTE: the service-role key bypasses RLS, so the import pipeline (server-only)
-- can insert import_runs/invoices rows. We intentionally do NOT grant anon/
-- authenticated write policies on these two tables so the browser can never
-- forge rows.
