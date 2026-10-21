-- Separate, additive migration. Existing reservation system remains unchanged.
begin;
create table if not exists public.buddycheck_class_requests (
 id uuid primary key default gen_random_uuid(),
 lesson_id uuid not null references public.buddycheck_temp_lessons(id),
 name text not null check(length(name) between 2 and 100),
 email text not null check(length(email)<=160),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 decided_at timestamptz,
 unique(lesson_id,email)
);
create index if not exists buddycheck_requests_lesson on public.buddycheck_class_requests(lesson_id,status);
alter table public.buddycheck_class_requests enable row level security;
revoke all on public.buddycheck_class_requests from public,anon,authenticated;
grant all on public.buddycheck_class_requests to service_role;
create or replace function public.buddycheck_request_schedule() returns jsonb
language sql security definer set search_path=pg_catalog,public as $$
select jsonb_build_object('open',true,'lessons',coalesce(jsonb_agg(jsonb_build_object(
'id',l.id,'name',l.name,'date',l.date,'start',to_char(l.start_time,'HH24:MI'),
'end',to_char(l.end_time,'HH24:MI'),'room',coalesce(l.room,''),'capacity',l.capacity,
'approved',(select count(*) from public.buddycheck_class_requests r where r.lesson_id=l.id and r.status='approved'))
order by l.date,l.start_time),'[]'::jsonb))
from public.buddycheck_temp_lessons l where l.active
and (l.date+l.start_time) at time zone 'Europe/Amsterdam'>now()
$$;
create or replace function public.buddycheck_request_submit(p_lesson_id uuid,p_name text,p_email text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare l public.buddycheck_temp_lessons%rowtype;
begin
 select * into l from public.buddycheck_temp_lessons where id=p_lesson_id and active for update;
 if not found or (l.date+l.start_time) at time zone 'Europe/Amsterdam'<=now()
 then return jsonb_build_object('ok',false,'message','Les niet beschikbaar.');end if;
 if length(trim(p_name)) not between 2 and 100 or length(p_email)>160 or p_email not like '%@%.%'
 then return jsonb_build_object('ok',false,'message','Ongeldige gegevens.');end if;
 insert into public.buddycheck_class_requests(lesson_id,name,email)
 values(p_lesson_id,trim(p_name),lower(trim(p_email)))
 on conflict(lesson_id,email) do nothing;
 return jsonb_build_object('ok',true,'message','Je aanvraag is ontvangen en wacht op goedkeuring door Fit Up. Je plek is nog niet bevestigd.');
end $$;
create or replace function public.buddycheck_request_admin_list() returns jsonb
language sql security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,'email',r.email,
 'status',r.status,'createdAt',r.created_at,'lessonId',l.id,
 'lesson',l.name,'date',l.date,'start',to_char(l.start_time,'HH24:MI'))
 order by r.created_at desc),'[]'::jsonb)
 from public.buddycheck_class_requests r join public.buddycheck_temp_lessons l on l.id=r.lesson_id
 where l.date>=(now() at time zone 'Europe/Amsterdam')::date
$$;
create or replace function public.buddycheck_request_decide(p_request_id uuid,p_decision text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare r public.buddycheck_class_requests%rowtype; l public.buddycheck_temp_lessons%rowtype; n bigint;
begin
 if p_decision not in ('approved','rejected') then return jsonb_build_object('ok',false,'message','Ongeldige status.');end if;
 select * into r from public.buddycheck_class_requests where id=p_request_id;
 if not found then return jsonb_build_object('ok',false,'message','Aanvraag onbekend.');end if;
 select * into l from public.buddycheck_temp_lessons where id=r.lesson_id for update;
 select * into r from public.buddycheck_class_requests where id=p_request_id for update;
 if r.status!='pending' then return jsonb_build_object('ok',false,'message','Aanvraag is al verwerkt.');end if;
 if not l.active or (l.date+l.start_time) at time zone 'Europe/Amsterdam'<=now()
 then return jsonb_build_object('ok',false,'message','Les is niet meer beschikbaar.');end if;
 if p_decision='approved' then
 select count(*) into n from public.buddycheck_class_requests where lesson_id=l.id and status='approved';
 if n>=l.capacity then return jsonb_build_object('ok',false,'message','Les is vol.');end if;
 end if;
 update public.buddycheck_class_requests set status=p_decision,decided_at=now() where id=r.id;
 return jsonb_build_object('ok',true,'message',case when p_decision='approved' then 'Aanvraag goedgekeurd.' else 'Aanvraag afgewezen.' end);
end $$;
revoke all on function public.buddycheck_request_schedule(),public.buddycheck_request_submit(uuid,text,text),public.buddycheck_request_admin_list(),public.buddycheck_request_decide(uuid,text) from public,anon,authenticated;
grant execute on function public.buddycheck_request_schedule(),public.buddycheck_request_submit(uuid,text,text),public.buddycheck_request_admin_list(),public.buddycheck_request_decide(uuid,text) to service_role;
commit;
