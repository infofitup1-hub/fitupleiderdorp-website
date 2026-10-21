# BuddyCheck – Tijdelijk Inschrijfrooster

This route is safe to publish CLOSED. Existing BuddyCheck functions and pages are unchanged.
No real member or timetable records are included. No production booking E2E has run without a configured isolated Supabase project and verified records.

## Security and behavior
- Supabase Auth email/password authentication; server validates every access token against /auth/v1/user. No legacy access codes and no Virtuagym passwords.
- No public signup or admin API. A verified member must be linked to an Auth user by auth_user_id. Login alone grants no lesson rights.
- Browser access token is kept only in memory, cleared on logout/expiry. No refresh token is returned; a reload requires login. Logout revokes the Supabase session.
- Booking checks active membership, active lesson, fresh verified records, and a specific product entitlement covering BOTH now and the lesson start. Product names never imply rights.
- Three gates: both Netlify switches AND the database control row. Missing configuration, unavailable database, stale review or missing rights deny booking.
- Verification deadlines may be at most 24 hours in the future. Recheck against the authoritative source daily; never renew deadlines without checking changes.
- PostgreSQL locks serialize capacity and duplicate checks. Repeated booking is idempotent; one unique member/lesson reservation.
- Owners can view and cancel existing future bookings even while booking is closed or their rights expire. A closed system still allows linked accounts to log in for this purpose.
- Public schedule reveals only lesson details and available counts, never names/emails. Browser output uses textContent and a restrictive CSP. Netlify IP/domain rate limit: 30 requests/minute; Supabase Auth also applies throttling.

## Provisioning and controlled activation
1. Use a separate temporary Supabase project. Never repurpose the coaching database. Disable public signup, enable email confirmation, use short token expiry (<=1 hour), and configure Auth rate limits.
2. Apply schema.sql using the SQL editor. The migration is transactional, additive and repeatable; it always closes the database gate, removes the old code-based booking RPC, and blocks anon/authenticated access to all temporary tables and RPCs.
3. Fit Up verifies each member identity and current full membership export. Create the matching Auth account through trusted administration and deliver initial credentials personally over an approved channel. Password reset is handled by staff; this page does not implement invitation/reset-link callbacks. Do not send invitations pointing to this page.
4. Link auth_user_id to the correct member ID and normalized unique email. An unlinked account has no access. Legacy code_hash/allowed_kinds remain only for compatibility and are never authorization inputs.
5. Import only actual confirmed lessons with capacity, date/time in Europe/Amsterdam, kind and reviewed deadline. Import authoritative product references, actual validity intervals and individually checked lesson kinds into entitlements. End timestamps are exclusive. Do not extend product validity to fit a booking.
6. Invalidate members, entitlements and lessons removed from the source. Preserve existing IDs and reservations. Keep gates closed throughout the import. See admin.sql for inspection, closure and activation workflow.
7. Configure BUDDYCHECK_SUPABASE_URL and BUDDYCHECK_SUPABASE_SERVICE_ROLE_KEY in Netlify Functions scope. Keep secrets out of Git, browser code and logs. Give previews a separate test project; never real-member credentials.
8. Run local tests, then real staging E2E with staff-controlled accounts: valid Group/SGPT rights, Fitness Only denied, expired/suspended membership denied, future lesson beyond product expiry denied, full lesson, concurrent final-place requests, retries, own/other cancellation, session expiry, outage and all closure gates.
9. ONLY after those checks, set the database control's booking_enabled, actual source_reference, reviewed_by and reviewed deadline. Set both BUDDYCHECK_BOOKING_ENABLED=true and BUDDYCHECK_BOOKING_VERIFIED=true in the intended Netlify context. A fresh deployment is required for deployment-scoped variable updates.
10. Verify live GET and a controlled staff reservation/cancellation, then communicate the URL. Existing Virtuagym reservations need explicit reconciliation; they are not automatically imported.

## Repeatable local verification
Run npm ci then node --test buddycheck-temporary/booking.test.mjs.
The tests use a disposable PostgreSQL WASM engine (PGlite); synthetic data never reaches Netlify or Supabase.
They exercise the actual SQL through the real HTTP handler, with only the Auth/upstream transport simulated. They verify RLS and RPC privileges too.
This does not prove real Supabase Auth, multi-connection PostgreSQL concurrency, email delivery or production configuration. Real staging tests in step 8 remain required before opening.

## Operations / rollback
Close immediately with either Netlify switch=false, or update buddycheck_temp_control set booking_enabled=false where id.
The database gate can close without a deploy. Freshness expiry closes automatically. Do not delete the old BuddyCheck.
Use the protected SQL editor/dashboard for import, review, suspension, private reservation export and recovery; no public management portal exists.
When Virtuagym returns: close first, privately export reservations, reconcile cancellations and duplicates, and only then resume the normal planner. Retain or erase temporary personal data under Fit Up's retention policy.
No email confirmations, waitlist, recurring subscription quotas or automatic Virtuagym synchronization are implemented. If a product limits visits, do not grant an unlimited kind entitlement; keep that product closed until its actual quota rules are implemented.

## References
- [Netlify Functions rate limits](https://docs.netlify.com/manage/security/secure-access-to-sites/rate-limiting/)
- [Supabase server identity validation](https://supabase.com/docs/guides/auth/jwts)
