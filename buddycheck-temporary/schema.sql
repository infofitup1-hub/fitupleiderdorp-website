-- Additive, transactional migration. Existing BuddyCheck storage is untouched.
-- Run only in a separate temporary Supabase project. No members or lessons are seeded.
begin;
create extension if not exists pgcrypto;
create table if not exists public.buddycheck_temp_members (
 id uuid primary key default gen_random_uuid(), email text not null unique check(email=lower(trim(email))),
 code_hash text, active boolean not null default false, allowed_kinds text[] not null default '{}',
 created_at timestamptz not null default now()
);
-- Legacy fields remain for compatibility but never authorize a reservation.
alter table public.buddycheck_temp_members alter column code_hash drop not null;
alter table public.buddycheck_temp_members add column if not exists auth_user_id uuid unique references auth.users(id);
alter table public.buddycheck_temp_members add column if not exists verified_until timestamptz;
create table if not exists public.buddycheck_temp_lessons (
 id uuid primary key default gen_random_uuid(), name text not null, kind text not null,
 date date not null, start_time time not null, end_time time not null, room text,
 capacity integer not null check(capacity between 1 and 100), active boolean not null default false,
 created_at timestamptz not null default now(), check(end_time>start_time)
);
alter table public.buddycheck_temp_lessons add column if not exists verified_until timestamptz;
create table if not exists public.buddycheck_temp_reservations (
 id uuid primary key default gen_random_uuid(), member_id uuid not null references public.buddycheck_temp_members(id),
 lesson_id uuid not null references public.buddycheck_temp_lessons(id),
 created_at timestamptz not null default now(), unique(member_id,lesson_id)
);
create index if not exists buddycheck_res_lesson_idx on public.buddycheck_temp_reservations(lesson_id);
create table if not exists public.buddycheck_temp_entitlements (
 id uuid primary key default gen_random_uuid(),
 member_id uuid not null references public.buddycheck_temp_members(id),
 product_reference text not null check(length(trim(product_reference))>0),
 kind text not null check(length(trim(kind))>0),
 valid_from timestamptz not null, valid_until timestamptz not null,
 verified_until timestamptz not null, active boolean not null default false,
 check(valid_until>valid_from)
);
create index if not exists buddycheck_ent_member_idx on public.buddycheck_temp_entitlements(member_id);
create table if not exists public.buddycheck_temp_control (
 id boolean primary key default true check(id),
 booking_enabled boolean not null default false,
 verified_until timestamptz,
 source_reference text not null default '',
 reviewed_by text not null default ''
);
insert into public.buddycheck_temp_control(id) values(true) on conflict do nothing;
-- Migrations always close the database gate; re-open only after verification.
update public.buddycheck_temp_control set booking_enabled=false where id;
alter table public.buddycheck_temp_members enable row level security;
alter table public.buddycheck_temp_lessons enable row level security;
alter table public.buddycheck_temp_reservations enable row level security;
alter table public.buddycheck_temp_entitlements enable row level security;
alter table public.buddycheck_temp_control enable row level security;
revoke all on public.buddycheck_temp_members, public.buddycheck_temp_lessons, public.buddycheck_temp_reservations,
 public.buddycheck_temp_entitlements, public.buddycheck_temp_control from public, anon, authenticated;
grant all on public.buddycheck_temp_members, public.buddycheck_temp_lessons, public.buddycheck_temp_reservations,
 public.buddycheck_temp_entitlements, public.buddycheck_temp_control to service_role;
drop function if exists public.buddycheck_temp_book(text,text,uuid);
create or replace function public.buddycheck_temp_ready()
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.buddycheck_temp_control where id and booking_enabled
 and verified_until>now() and verified_until<=now()+interval '24 hours'
 and length(trim(source_reference))>0 and length(trim(reviewed_by))>0)
$$;
create or replace function public.buddycheck_temp_member(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('ok',exists(select 1 from public.buddycheck_temp_members
 where auth_user_id=p_user_id))
$$;
create or replace function public.buddycheck_temp_schedule()
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare lessons jsonb;
begin
 if not public.buddycheck_temp_ready() then
 return jsonb_build_object('bookingOpen',false,'days','[]'::jsonb,'lessons','[]'::jsonb); end if;
 select coalesce(jsonb_agg(row_to_json(x) order by x.date,x.start),'[]'::jsonb) into lessons from (
 select l.id,l.name,l.kind,l.date,to_char(l.start_time,'HH24:MI') as start,
 to_char(l.end_time,'HH24:MI') as "end",coalesce(l.room,'') as room,l.capacity,
 greatest(0,l.capacity-(select count(*) from public.buddycheck_temp_reservations r where r.lesson_id=l.id)) as available
 from public.buddycheck_temp_lessons l where l.active and l.verified_until>now()
 and l.verified_until<=now()+interval '24 hours'
 and (l.date+l.start_time) at time zone 'Europe/Amsterdam'>now()
 order by l.date,l.start_time limit 200
 ) x;
 return jsonb_build_object('bookingOpen',jsonb_array_length(lessons)>0,'lessons',lessons,
 'days',(select coalesce(jsonb_agg(d order by d),'[]'::jsonb) from (select distinct v->>'date' d from jsonb_array_elements(lessons) v) q));
end $$;
create or replace function public.buddycheck_temp_mine(p_user_id uuid)
returns jsonb language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('ok',true,'reservations',coalesce(jsonb_agg(jsonb_build_object(
 'lessonId',l.id,'name',l.name,'date',l.date,'start',to_char(l.start_time,'HH24:MI'),
 'end',to_char(l.end_time,'HH24:MI'),'active',l.active) order by l.date,l.start_time),'[]'::jsonb))
 from public.buddycheck_temp_reservations r join public.buddycheck_temp_members m on m.id=r.member_id
 join public.buddycheck_temp_lessons l on l.id=r.lesson_id
 where m.auth_user_id=p_user_id and l.date >= (now() at time zone 'Europe/Amsterdam')::date
$$;
create or replace function public.buddycheck_temp_book(p_user_id uuid,p_lesson_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare m public.buddycheck_temp_members%rowtype; l public.buddycheck_temp_lessons%rowtype; starts timestamptz;
begin
 -- Shared control lock prevents activation/closure racing a transaction.
 perform 1 from public.buddycheck_temp_control where id for share;
 if not public.buddycheck_temp_ready() then return jsonb_build_object('ok',false,'message','Reserveren is gesloten: gegevenscontrole ontbreekt of is verlopen.'); end if;
 select * into m from public.buddycheck_temp_members where auth_user_id=p_user_id for update;
 if not found or not m.active or m.verified_until is null or m.verified_until<=now() or m.verified_until>now()+interval '24 hours'
 then return jsonb_build_object('ok',false,'message','Geen gecontroleerd actief lidmaatschap beschikbaar.'); end if;
 select * into l from public.buddycheck_temp_lessons where id=p_lesson_id for update;
 if not found or not l.active or l.verified_until is null or l.verified_until<=now() or l.verified_until>now()+interval '24 hours'
 then return jsonb_build_object('ok',false,'message','Les niet beschikbaar.'); end if;
 starts := (l.date+l.start_time) at time zone 'Europe/Amsterdam';
 if starts<=now() then return jsonb_build_object('ok',false,'message','Deze les is al begonnen.'); end if;
 -- Lock applicable rights, so revocation cannot race an accepted reservation.
 perform 1 from public.buddycheck_temp_entitlements e where e.member_id=m.id and e.kind=l.kind and e.active
 and e.valid_from<=now() and e.valid_until>now() and e.valid_from<=starts and e.valid_until>starts
 and e.verified_until>now() and e.verified_until<=now()+interval '24 hours' for share;
 if not found then return jsonb_build_object('ok',false,'message','Je abonnement geeft geen gecontroleerd recht op deze lesdatum.'); end if;
 if exists(select 1 from public.buddycheck_temp_reservations where member_id=m.id and lesson_id=l.id)
 then return jsonb_build_object('ok',true,'message','Je reservering is bevestigd.'); end if;
 if (select count(*) from public.buddycheck_temp_reservations where lesson_id=l.id)>=l.capacity
 then return jsonb_build_object('ok',false,'message','Deze les is vol.'); end if;
 insert into public.buddycheck_temp_reservations(member_id,lesson_id) values(m.id,l.id);
 return jsonb_build_object('ok',true,'message','Je reservering is bevestigd.');
end $$;
create or replace function public.buddycheck_temp_cancel(p_user_id uuid,p_lesson_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare mid uuid; starts timestamptz;
begin
 select id into mid from public.buddycheck_temp_members where auth_user_id=p_user_id for update;
 if mid is null then return jsonb_build_object('ok',false,'message','Log opnieuw in.'); end if;
 select (date+start_time) at time zone 'Europe/Amsterdam' into starts
 from public.buddycheck_temp_lessons where id=p_lesson_id for update;
 if starts is null or starts<=now() then return jsonb_build_object('ok',false,'message','Deze les kan niet meer worden geannuleerd.'); end if;
 delete from public.buddycheck_temp_reservations where member_id=mid and lesson_id=p_lesson_id;
 return jsonb_build_object('ok',true,'message','Je reservering is geannuleerd.');
end $$;
revoke all on function public.buddycheck_temp_ready(), public.buddycheck_temp_member(uuid),
 public.buddycheck_temp_schedule(), public.buddycheck_temp_mine(uuid),
 public.buddycheck_temp_book(uuid,uuid), public.buddycheck_temp_cancel(uuid,uuid) from public,anon,authenticated;
grant execute on function public.buddycheck_temp_ready(), public.buddycheck_temp_member(uuid),
 public.buddycheck_temp_schedule(), public.buddycheck_temp_mine(uuid),
 public.buddycheck_temp_book(uuid,uuid), public.buddycheck_temp_cancel(uuid,uuid) to service_role;
commit;
