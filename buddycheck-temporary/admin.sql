-- Run from the authenticated Supabase SQL editor only, never from a member browser.
-- FIRST ACTION before importing, changing products, or recovering Virtuagym:
update public.buddycheck_temp_control set booking_enabled=false where id;

-- Inspection (no personal data selected):
select booking_enabled,verified_until,source_reference,reviewed_by from public.buddycheck_temp_control;
select count(*) as members, count(auth_user_id) as linked_accounts,
 count(*) filter(where active and verified_until>now()) as recently_verified
from public.buddycheck_temp_members;
select kind,count(*) from public.buddycheck_temp_entitlements where active group by kind;
select l.id,l.name,l.date,l.start_time,l.capacity,l.active,l.verified_until,count(r.id) as reserved
from public.buddycheck_temp_lessons l left join public.buddycheck_temp_reservations r on r.lesson_id=l.id
group by l.id order by l.date,l.start_time;

-- Import verified records using the dashboard while closed:
-- members: id, lower(trim(email)), auth_user_id, active, verified_until.
-- entitlements: member_id, product_reference, kind, valid_from, valid_until, verified_until, active.
-- lessons: id, name, kind, date, start_time, end_time, room, capacity, active, verified_until.
-- Preserve stable IDs on subsequent imports; never truncate reservations.
-- Deactivate removed records/rights explicitly. A partial import is not a complete snapshot.
-- verified_until must be a reviewed deadline <= now()+24 hours, not automatically renewed.
-- Actual subscription validity is independent of this review deadline.

-- After real staging tests and a complete verified import, activate explicitly:
-- update public.buddycheck_temp_control set booking_enabled=true,
-- verified_until=<reviewed deadline>, source_reference=<actual source>, reviewed_by=<actual reviewer> where id;
-- Both Netlify switches must ALSO be true. There are no default activation values.

-- Revocation: close first, set member active=false and entitlement active=false.
-- Keep existing reservations for reconciliation; export them privately if needed.
-- Cancellation remains possible for the authenticated owner while booking is closed.
