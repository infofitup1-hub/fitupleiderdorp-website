-- BuddyCheck tijdelijk inschrijfrooster | uit te voeren in EEN afzonderlijk Supabase project
-- Alleen na goedgekeurde ledenexport, rechtentoewijzing, test en handmatige activering live zetten.
create extension if not exists pgcrypto;
create table if not exists public.buddycheck_temp_members (
 id uuid primary key default gen_random_uuid(),
 email text not null unique check(email=lower(email)),
 code_hash text not null check(code_hash ~ '^[a-f0-9]{64}$'),
 active boolean not null default false,
 allowed_kinds text[] not null default '{}',
 created_at timestamptz not null default now()
);
create table if not exists public.buddycheck_temp_lessons (
 id uuid primary key default gen_random_uuid(),
 name text not null,
 kind text not null,
 date date not null,
 start_time time not null,
 end_time time not null,
 room text,
 capacity integer not null check(capacity between 1 and 100),
 active boolean not null default false,
 created_at timestamptz not null default now(),
 check(end_time > start_time)
);
create table if not exists public.buddycheck_temp_reservations (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.buddycheck_temp_members(id),
 lesson_id uuid not null references public.buddycheck_temp_lessons(id),
 created_at timestamptz not null default now(),
 unique(member_id,lesson_id)
);
create index if not exists buddycheck_res_lesson_idx on public.buddycheck_temp_reservations(lesson_id);
alter table public.buddycheck_temp_members enable row level security;
alter table public.buddycheck_temp_lessons enable row level security;
alter table public.buddycheck_temp_reservations enable row level security;
revoke all on public.buddycheck_temp_members,public.buddycheck_temp_lessons,public.buddycheck_temp_reservations from anon,authenticated;
-- Transactionele capaciteitscheck: elke inschrijving lockt eerst de gekozen les.
create or replace function public.buddycheck_temp_book(
 p_email text, p_code_hash text, p_lesson_id uuid
) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
 l public.buddycheck_temp_lessons%rowtype;
 m public.buddycheck_temp_members%rowtype;
 filled integer;
begin
 select * into l from public.buddycheck_temp_lessons
 where id=p_lesson_id and active=true for update;
 if not found then return jsonb_build_object('ok',false,'message','Les niet beschikbaar.');end if;
 if l.date < (now() at time zone 'Europe/Amsterdam')::date
 or (l.date = (now() at time zone 'Europe/Amsterdam')::date
 and l.start_time <= (now() at time zone 'Europe/Amsterdam')::time)
 then return jsonb_build_object('ok',false,'message','Deze les is al begonnen.');end if;
 select * into m from public.buddycheck_temp_members
 where email=lower(trim(p_email)) and active=true and code_hash=p_code_hash;
 if not found then return jsonb_build_object('ok',false,'message','Lidmaatschap of toegangscode niet geldig.');end if;
 if not (l.kind=any(m.allowed_kinds)) then
 return jsonb_build_object('ok',false,'message','Je abonnement geeft geen toegang tot deze les.');end if;
 if exists(select 1 from public.buddycheck_temp_reservations where member_id=m.id and lesson_id=l.id)
 then return jsonb_build_object('ok',false,'message','Je bent al ingeschreven voor deze les.');end if;
 select count(*) into filled from public.buddycheck_temp_reservations where lesson_id=l.id;
 if filled>=l.capacity then return jsonb_build_object('ok',false,'message','Deze les is vol.');end if;
 insert into public.buddycheck_temp_reservations(member_id,lesson_id) values(m.id,l.id);
 return jsonb_build_object('ok',true,'message','Je reservering is bevestigd.');
end $$;
revoke all on function public.buddycheck_temp_book(text,text,uuid) from public,anon,authenticated;
grant execute on function public.buddycheck_temp_book(text,text,uuid) to service_role;
-- Voor productie: eigen access-codes cryptografisch willekeurig genereren;
-- alleen SHA-256 hash in code_hash bewaren. Geen Virtuagym-wachtwoorden gebruiken.
-- Om uit te schakelen: BUDDYCHECK_BOOKING_ENABLED=false.
