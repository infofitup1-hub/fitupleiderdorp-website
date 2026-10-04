// "Wie doet er mee?" - server-side ophalen en opbouwen van de deelnemerspagina.
//
// Haalt via de Virtuagym Club API de lessen van vandaag + deelnemers op en bouwt
// daar een HTML-pagina van (alleen voornaam + initiaal). De Virtuagym-geheimen komen
// uitsluitend uit Netlify environment variables en staan nooit in de HTML of Git.
//
// Env vars (bestaan al voor /.netlify/functions/schedule):
//   VIRTUAGYM_API_KEY, VIRTUAGYM_CLUB_SECRET, VIRTUAGYM_CLUB_ID (optioneel, default 104091)

const API_BASE = "https://api.virtuagym.com/api/v1/club";
const TZ = "Europe/Amsterdam";

// Actief venster (Europe/Amsterdam): 05:00 <= tijd < 23:00. Buiten dit venster doen we
// GEEN Virtuagym-calls (cron mag 24/7 vuren; de afdwinging zit hier, niet in de cron).
const ACTIVE_FROM_HOUR = 5;
const ACTIVE_UNTIL_HOUR = 23;

const FETCH_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 3; // 1 poging + 2 retries
const BACKOFF_MS = [300, 900];
const MAX_PAGES = 5; // 5 x 500 records: ruim boven elke realistische dag
const MAX_CALLS = 250; // harde bovengrens per refresh (koude start van een week ~150)
const DEADLINE_CRON_MS = 25000; // geplande functie mag 30s
const DEADLINE_LAZY_MS = 8000; // bezoekersverzoek: netjes binnen de 10s

const NAME_TTL_MS = 24 * 60 * 60 * 1000; // gewijzigde namen worden binnen 24u overgenomen
const NAME_PRUNE_MS = 14 * 24 * 60 * 60 * 1000; // ongebruikte entries verdwijnen na 14 dagen
const LOCK_MS = 45 * 1000;
const FAIL_LOCK_MS = 2 * 60 * 1000;
const RATE_LIMIT_LOCK_MS = 5 * 60 * 1000;

export const STALE_AFTER_MS = 12 * 60 * 1000; // ouder dan dit: bij bezoek verversen
export const MAX_SERVE_AGE_MS = 2 * 60 * 60 * 1000; // ouder dan dit: nooit meer tonen

export const _hooks = { sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

// ---------- opslag ----------

export async function store() {
  // Dynamische import: tests draaien zonder @netlify/blobs.
  const { getStore, getDeployStore } = await import("@netlify/blobs");
  // Productiedata blijft gescheiden van previews/branch-deploys.
  if (Netlify.context?.deploy?.context === "production") {
    return getStore({ name: "wie-doet-er-mee", consistency: "strong" });
  }
  return getDeployStore("wie-doet-er-mee");
}

export async function readPage(s) {
  try {
    return await s.get("page", { type: "json" });
  } catch {
    return null;
  }
}

// ---------- tijd (Europe/Amsterdam; nooit een vaste UTC-offset) ----------

const dtf = (opts) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", ...opts });

export function amsterdamDate(now = new Date()) {
  const p = Object.fromEntries(dtf({ year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

export function amsterdamHour(now = new Date()) {
  return Number(dtf({ hour: "2-digit" }).format(now));
}

export function amsterdamStamp(now = new Date()) {
  const p = Object.fromEntries(dtf({ hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${amsterdamDate(now)} ${p.hour}:${p.minute}`;
}

export function isActiveWindow(now = new Date()) {
  const h = amsterdamHour(now);
  return h >= ACTIVE_FROM_HOUR && h < ACTIVE_UNTIL_HOUR;
}

function tzOffsetMs(d) {
  const p = Object.fromEntries(
    dtf({ year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - Math.floor(d.getTime() / 1000) * 1000;
}

export function startOfYmdMs(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off1 = tzOffsetMs(new Date(guess));
  const off2 = tzOffsetMs(new Date(guess - off1));
  return guess - off2;
}

export function startOfDayMs(now) {
  return startOfYmdMs(amsterdamDate(now));
}

export function addDaysYmd(ymd, n) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Wandklok-tijd in Amsterdam als "YYYY-MM-DD HH:MM:SS": direct vergelijkbaar met de
// lokale tijdstempels van Virtuagym ("2026-10-04 10:00:00"), ook rond zomer-/wintertijd.
export function amsterdamWall(now = new Date()) {
  const p = Object.fromEntries(dtf({ hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${amsterdamDate(now)} ${p.hour}:${p.minute}:${p.second}`;
}

const wallOf = (t) => String(t || "").replace("T", " ").slice(0, 19);

// Een les is "afgelopen" zodra de eindtijd bereikt is (einde = afgelopen). Zonder
// eindtijd nemen we 60 minuten na de start aan.
export function lessonEnd(l) {
  const e = wallOf(l.end);
  if (e.length >= 16) return e;
  const st = wallOf(l.start);
  const [y, mo, d] = st.slice(0, 10).split("-").map(Number);
  const [h, mi] = st.slice(11, 16).split(":").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, mi + 60)).toISOString().slice(0, 19).replace("T", " ");
}

export function isFinished(l, wall) {
  return lessonEnd(l) <= wall;
}

function hhmm(now) {
  const p = Object.fromEntries(dtf({ hour: "2-digit", minute: "2-digit" }).formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}`;
}

const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function datumTekst(today) {
  const [y, m, d] = today.split("-").map(Number);
  return `${DAGEN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MAANDEN[m - 1]}`;
}

// ---------- Virtuagym-client (retries, backoff, paginering, budget) ----------

function fail(category) {
  const e = new Error(category);
  e.category = category;
  return e;
}

// Eén HTTP-call (geteld), met timeout. Gooit alleen Errors met een categorie; nooit met
// URL, body of geheimen in de melding.
async function once(path, params, creds, ctx) {
  if (ctx.calls >= MAX_CALLS) throw fail("call_budget");
  ctx.calls += 1;
  const url = `${API_BASE}/${creds.clubId}/${path}?` + new URLSearchParams({
    api_key: creds.apiKey, club_secret: creds.clubSecret, ...params,
  });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
  } catch (err) {
    clearTimeout(timer);
    throw fail(err?.name === "AbortError" ? "timeout" : "network");
  }
  try {
    if (res.status === 429) {
      const e = fail("http_429");
      e.retryAfterMs = Math.min(2000, (Number(res.headers.get("retry-after")) || 0) * 1000);
      throw e;
    }
    if (res.status >= 500) throw fail("http_5xx");
    if (res.status === 404) throw fail("not_found");
    if (!res.ok) throw fail("http_4xx");
    let data;
    try {
      data = await res.json();
    } catch (err) {
      throw err?.name === "AbortError" ? fail("timeout") : fail("bad_json");
    }
    // Virtuagym meldt fouten ook in het status-object (421 = rate limit, 420 = niet gevonden).
    const code = Number(data?.status?.statuscode);
    if (Number.isFinite(code) && code >= 400) {
      throw fail(code === 421 ? "rate_limited" : code === 420 ? "not_found" : "api_status");
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

const RETRYABLE = new Set(["timeout", "network", "http_429", "http_5xx", "bad_json"]);

async function vg(path, params, creds, ctx) {
  let last;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (Date.now() > ctx.deadline) throw last || fail("deadline");
    try {
      return await once(path, params, creds, ctx);
    } catch (err) {
      last = err;
      const cat = err.category || "unknown";
      if (!RETRYABLE.has(cat) || attempt === MAX_ATTEMPTS - 1) throw err;
      const wait = Math.max(BACKOFF_MS[attempt] || 900, err.retryAfterMs || 0);
      if (Date.now() + wait > ctx.deadline) throw err;
      await _hooks.sleep(wait);
    }
  }
  throw last || fail("unknown");
}

// Pagineren: Virtuagym levert max 500 records per call en meldt status.results_remaining
// (+ soms status.next_page = "sync_from=<ms>"). Volgende pagina: next_page als die er is,
// anders from_id = hoogste numerieke id. Dubbele records worden weggefilterd, herhaalde
// cursors en lege pagina's stoppen de lus, en MAX_PAGES begrenst alles. Is er daarna nog
// steeds "remaining" over, dan is het resultaat `incomplete` - dat tonen we nooit als compleet.
async function paginate(path, baseParams, keyField, numericField, creds, ctx) {
  const seen = new Map();
  const cursors = new Set();
  let params = { ...baseParams };
  let incomplete = false;
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await vg(path, params, creds, ctx);
    const list = Array.isArray(data?.result) ? data.result : [];
    let added = 0;
    for (const r of list) {
      const k = r?.[keyField];
      if (k === undefined || k === null) continue;
      if (!seen.has(String(k))) { seen.set(String(k), r); added += 1; }
    }
    const remaining = Number(data?.status?.results_remaining) || 0;
    if (remaining <= 0) return { records: [...seen.values()], incomplete: false };

    // Er is meer. Bepaal de volgende cursor.
    let next = null;
    const np = typeof data?.status?.next_page === "string" ? data.status.next_page.replace(/^\?/, "") : "";
    if (np) {
      const q = Object.fromEntries(new URLSearchParams(np));
      if (Object.keys(q).length) next = q;
    }
    if (!next && numericField) {
      const ids = list.map((r) => Number(r?.[numericField])).filter(Number.isFinite);
      if (ids.length) next = { from_id: String(Math.max(...ids)) };
    }
    const sig = next ? JSON.stringify(next) : "";
    if (!next || added === 0 || cursors.has(sig)) { incomplete = true; break; }
    cursors.add(sig);
    params = { ...baseParams, ...next };
    if (page === MAX_PAGES - 1) incomplete = true;
  }
  return { records: [...seen.values()], incomplete };
}

// ---------- namen ----------

const cap = (s) => {
  const a = Array.from(String(s || "").trim());
  return a.length ? a[0].toUpperCase() + a.slice(1).join("") : "";
};
const initial = (s) => {
  const a = Array.from(String(s || "").trim());
  return a.length ? a[0].toUpperCase() + "." : "";
};

function displayName(first, last) {
  const f = cap(first);
  const i = initial(last);
  return (i ? `${f} ${i}` : f).trim() || "Lid";
}

function guestName(userName) {
  const parts = String(userName || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Lid";
  if (parts.length === 1) return cap(parts[0]);
  return `${cap(parts[0])} ${initial(parts[parts.length - 1])}`;
}

// Cache: id -> { n: "Anouk K.", t: epoch-ms }. Alleen de afgeschermde weergavenaam; nooit
// volledige namen, e-mail, telefoon of member-objecten. Entries ouder dan NAME_TTL_MS worden
// opnieuw opgevraagd (naamswijziging), entries ouder dan NAME_PRUNE_MS verdwijnen.
// Mislukte lookups worden nooit gecachet.
async function resolveNames(ids, s, creds, ctx, nowMs) {
  let cache = {};
  try { cache = (await s.get("names", { type: "json" })) || {}; } catch { cache = {}; }
  const missing = ids.filter((id) => {
    const hit = cache[id] && typeof cache[id].n === "string" && nowMs - cache[id].t <= NAME_TTL_MS;
    if (hit) ctx.cacheHit += 1; else ctx.cacheMiss += 1;
    return !hit;
  });
  let changed = false;
  await pool(missing, 8, async (id) => {
    try {
      const data = await vg(`member/${encodeURIComponent(id)}`, {}, creds, ctx);
      const m = Array.isArray(data?.result) ? data.result[0] : null;
      cache[id] = { n: m ? displayName(m.firstname, m.lastname) : "Lid", t: nowMs };
      changed = true;
    } catch (err) {
      if (err.category === "not_found") {
        // Lid bestaat niet (meer): neutraal "Lid", niet eindeloos opnieuw proberen.
        cache[id] = { n: "Lid", t: nowMs };
        changed = true;
      } else {
        ctx.memberFail += 1; // verlopen entry blijft bruikbaar; geen entry = "niet beschikbaar"
      }
    }
  });
  // Verlopen entries waarvan de vernieuwing mislukte, blijven bruikbaar (tot de prune-grens).
  const prune = Object.entries(cache).filter(([, v]) => !v || typeof v.n !== "string" || nowMs - v.t > NAME_PRUNE_MS);
  for (const [k] of prune) { delete cache[k]; changed = true; }
  if (changed) {
    const clean = Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, { n: v.n, t: v.t }]));
    try { await s.setJSON("names", clean); } catch { /* niet fataal */ }
  }
  return (id) => (cache[id] ? cache[id].n : null);
}

// ---------- lessen (7 dagen) ----------

// Per les: namen + onbekend uit de ruwe deelnemerslijst (alleen afgeschermde weergavenamen).
function listToNames(list, nameOf) {
  const namen = [];
  let onbekend = 0;
  for (const x of list) {
    if (x.member_id) {
      const n = nameOf(String(x.member_id));
      if (n) namen.push(n); else onbekend += 1;
    } else {
      namen.push(x.user_name ? guestName(x.user_name) : "Lid");
    }
  }
  namen.sort((a, b) => a.localeCompare(b, "nl"));
  return { namen, onbekend };
}

const attOf = (e) => (e.attendees !== null && e.attendees !== "" && e.attendees !== undefined && Number.isFinite(Number(e.attendees)) ? Number(e.attendees) : null);

function makeLesson(e, { namen, onbekend, ok, incomplete }) {
  const max = Number(e.max_places) > 0 ? Number(e.max_places) : 0;
  const total = namen.length + onbekend;
  const att = attOf(e);
  let aantal = total;
  // Lijst onbetrouwbaar of onvolledig: val terug op het aantal dat Virtuagym zelf meldt.
  if ((!ok || incomplete) && att !== null) aantal = att;
  if (incomplete && aantal > total) onbekend += aantal - total;
  // Geen lijst en ook geen betrouwbaar aantal: niets verzinnen.
  if (!ok && att === null) aantal = null;
  return {
    start: e.start, end: e.end, title: String(e.title || ""),
    namen, aantal, max, onbekend, namenBeschikbaar: ok,
  };
}

function finishedLesson(e) {
  return {
    start: e.start, end: e.end, title: String(e.title || ""), namen: [], aantal: attOf(e),
    max: Number(e.max_places) > 0 ? Number(e.max_places) : 0, onbekend: 0, namenBeschikbaar: true, done: true,
  };
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k], k);
    }
  }));
  return out;
}

// Per-les cache (alleen afgeschermde namen): hergebruik zolang het aantal aanmeldingen
// (gratis uit de events-call) gelijk is en de les niet te oud is. Vandaag altijd vers.
const REUSE_TTL_MS = [0, 20 * 60 * 1000]; // dag 0: nooit hergebruiken; dag 1: 20 min
const REUSE_TTL_LATER_MS = 90 * 60 * 1000; // dag 2-6: 90 min
export const WEEK_DAYS = 7;

export async function fetchToday(s, now, ctx) {
  const apiKey = Netlify.env.get("VIRTUAGYM_API_KEY");
  const clubSecret = Netlify.env.get("VIRTUAGYM_CLUB_SECRET");
  const clubId = Netlify.env.get("VIRTUAGYM_CLUB_ID") || "104091";
  if (!apiKey || !clubSecret) throw fail("not_configured");
  const creds = { apiKey, clubSecret, clubId };

  const today = amsterdamDate(now);
  const dates = Array.from({ length: WEEK_DAYS }, (_, i) => addDaysYmd(today, i));
  const wall = amsterdamWall(now);
  const nowMs = now.getTime();

  // Alle 7 dagen in EEN events-call (zelfde paginering).
  const evAll = await paginate("events/", {
    timestamp_start: String(Math.floor(startOfYmdMs(today) / 1000)),
    timestamp_end: String(Math.floor(startOfYmdMs(addDaysYmd(today, WEEK_DAYS)) / 1000)),
  }, "event_id", null, creds, ctx);

  const sorted = evAll.records
    .filter((e) => typeof e.start === "string" && e.canceled !== true && dates.includes(e.start.slice(0, 10)))
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.title).localeCompare(String(b.title)));

  let cache = {};
  try { cache = (await s.get("lessons", { type: "json" })) || {}; } catch { cache = {}; }

  // Beslis per les: afgelopen / hergebruik / leeg (0 aanmeldingen) / ophalen.
  const plan = sorted.map((e) => {
    const d = dates.indexOf(e.start.slice(0, 10));
    const att = attOf(e);
    const id = String(e.event_id);
    if (d === 0 && isFinished(e, wall)) return { e, d, kind: "finished" };
    const c = cache[id];
    const ttl = d < REUSE_TTL_MS.length ? REUSE_TTL_MS[d] : REUSE_TTL_LATER_MS;
    if (d > 0 && att === 0) return { e, d, kind: "empty" };
    if (c && c.ok && !c.onbekend && !c.incomplete && att !== null && c.att === att && nowMs - c.t < ttl && Array.isArray(c.namen)) {
      return { e, d, kind: "reuse", c };
    }
    return { e, d, kind: "fetch" };
  });

  const toFetch = plan.filter((p) => p.kind === "fetch");
  const fetched = await pool(toFetch, 8, async ({ e }) => {
    try {
      const r = await paginate("eventparticipants/", { event_id: e.event_id, fill_guestname: "1" },
        "event_participant_id", "event_participant_id", creds, ctx);
      return { ok: true, list: r.records, incomplete: r.incomplete };
    } catch {
      ctx.partFail += 1;
      return { ok: false, list: [], incomplete: false };
    }
  });
  toFetch.forEach((p, i) => { p.res = fetched[i]; });

  const ids = [...new Set(fetched.flatMap((p) => p.list).filter((x) => x.member_id).map((x) => String(x.member_id)))];
  const nameOf = ids.length ? await resolveNames(ids, s, creds, ctx, nowMs) : () => null;

  const newCache = {};
  const days = dates.map((date) => ({ date, lessen: [] }));
  for (const p of plan) {
    let lesson;
    const id = String(p.e.event_id);
    if (p.kind === "finished") {
      lesson = finishedLesson(p.e);
    } else if (p.kind === "empty") {
      lesson = makeLesson(p.e, { namen: [], onbekend: 0, ok: true, incomplete: false });
    } else if (p.kind === "reuse") {
      lesson = makeLesson(p.e, { namen: p.c.namen, onbekend: 0, ok: true, incomplete: false });
      newCache[id] = p.c;
      ctx.reused += 1;
    } else {
      const { namen, onbekend } = listToNames(p.res.list, nameOf);
      lesson = makeLesson(p.e, { namen, onbekend, ok: p.res.ok, incomplete: p.res.incomplete });
      newCache[id] = { t: nowMs, att: attOf(p.e), namen, onbekend, ok: p.res.ok, incomplete: p.res.incomplete };
    }
    days[p.d].lessen.push(lesson);
  }
  if (JSON.stringify(newCache) !== JSON.stringify(cache)) {
    try { await s.setJSON("lessons", newCache); } catch { /* niet fataal */ }
  }
  return {
    today, days, lessen: days[0].lessen,
    incomplete: fetched.some((p) => p.incomplete),
  };
}

// ---------- HTML ----------

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const BRAND = "BuddyCheck";
export const SUBTITLE = "Check wie er bij jouw groepsles staat ingeschreven.";

// Zelfde fonts en tokens als fitupleiderdorp.nl: Barlow Condensed (koppen) + DM Sans (tekst).
const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;800;900&family=DM+Sans:wght@400;500;600&display=swap">`;

const STYLE = `<style>
:root{--black:#080A09;--soft:#101311;--graphite:#191D1A;--warm:#F4F5F1;--mute:#A7ADA8;--lime:#B7F229;--line:rgba(255,255,255,.10);--line-strong:rgba(255,255,255,.24);--fd:'Barlow Condensed','Arial Narrow',Arial,sans-serif;--fb:'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--black);color:var(--warm);font:400 16px/1.55 var(--fb);padding:max(24px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(32px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
main{max-width:560px;margin:0 auto}
.top{padding:6px 0 8px}
.eyebrow{display:flex;align-items:center;gap:10px;margin:0 0 14px;color:var(--lime);font:700 14px/1 var(--fd);letter-spacing:4px;text-transform:uppercase}
.eyebrow:before{content:"";width:24px;height:2px;background:var(--lime);flex:none}
h1{margin:0 0 12px;font:900 clamp(44px,14vw,60px)/.94 var(--fd);letter-spacing:.4px;text-transform:uppercase}
h1 em{font-style:normal;color:var(--lime)}
.sub{margin:0;color:var(--mute);font-size:16px}
.day-h{display:flex;align-items:baseline;gap:12px;margin:38px 0 14px;font:900 30px/1 var(--fd);letter-spacing:.5px;text-transform:uppercase}
.day-h span{color:var(--mute);font:500 16px/1.2 var(--fb);letter-spacing:.02em;text-transform:none}
.day-h.first{margin-top:30px}
.day-empty .day-h{margin:26px 0 4px}
.note{margin:0;color:var(--mute);font-size:16px}
.card{background:var(--soft);border:1px solid var(--line);border-radius:10px;padding:16px 18px 18px;margin:0 0 12px}
.card header{display:flex;align-items:baseline;gap:12px;min-width:0}
.card time{flex:none;color:var(--lime);font:900 30px/1 var(--fd);font-variant-numeric:tabular-nums;letter-spacing:.3px}
.card h3{margin:0;min-width:0;font:800 22px/1.1 var(--fd);letter-spacing:.5px;text-transform:uppercase;overflow-wrap:anywhere}
.badge{margin-left:auto;align-self:center;flex:none;padding:3px 10px;border:1px solid var(--line-strong);border-radius:6px;background:rgba(255,255,255,.06);color:var(--warm);font:700 14px/1.3 var(--fd);letter-spacing:2px;text-transform:uppercase}
.count{margin:10px 0 8px;color:var(--mute);font-size:16px}
.count.full{color:var(--warm)}
.free{color:var(--warm);font-weight:600}
.bar{height:3px;border-radius:2px;background:var(--line);overflow:hidden;margin:0 0 14px}
.bar span{display:block;height:100%;background:var(--lime)}
.card.is-full .bar span{background:rgba(244,245,241,.45)}
ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
li{padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:rgba(255,255,255,.04);font-size:16px;overflow-wrap:anywhere}
.empty{margin:6px 0 0;color:var(--mute)}
ul+.empty{margin-top:10px}
.none,.stale{border:1px solid var(--line);border-radius:10px;padding:20px;background:var(--soft);color:var(--mute)}
.none h3,.stale h2{margin:0 0 6px;color:var(--warm);font:800 22px/1.1 var(--fd);letter-spacing:.5px;text-transform:uppercase}
.none p,.stale p{margin:0}
.foot{margin:28px 0 0;color:var(--mute);font-size:14px;text-align:center}
[hidden]{display:none!important}
</style>`;

const HEAD = (title) => `<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="dark">
<title>${title}</title>
${FONT_LINKS}
${STYLE}`;

const TOP = `<div class="top">
<p class="eyebrow">Fit Up Leiderdorp</p>
<h1>Buddy<em>Check</em></h1>
<p class="sub">${SUBTITLE}</p>
</div>`;

// Neutrale pagina zonder enige deelnemersdata: gebruikt als er geen actuele gegevens zijn
// (nieuwe dag, data te oud, fout). Server-side, dus oude namen staan nooit in de bron.
export const STALE_HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
${HEAD(`${BRAND} - Fit Up`)}
</head>
<body>
<main>
${TOP}
<div class="stale" style="margin-top:28px"><h2>Nog geen actuele gegevens</h2><p>De inschrijvingen worden zo bijgewerkt. Probeer het over enkele minuten opnieuw.</p></div>
</main>
</body>
</html>
`;

function cardHtml(l) {
  const heeftAantal = l.aantal !== null && l.aantal !== undefined;
  const vol = l.max > 0 && heeftAantal && l.aantal >= l.max;
  const vrij = l.max > 0 && heeftAantal ? Math.max(0, l.max - l.aantal) : null; // nooit negatief
  let telling = "";
  if (heeftAantal) {
    telling = l.max > 0 ? `${l.aantal} / ${l.max} deelnemers` : l.aantal === 1 ? "1 deelnemer" : `${l.aantal} deelnemers`;
  } else {
    telling = "Aantal tijdelijk niet beschikbaar";
  }
  const vrijTekst = vrij !== null && vrij > 0 ? ` &middot; <span class="free">${vrij} ${vrij === 1 ? "plek" : "plekken"} vrij</span>` : "";
  const pct = l.max > 0 && heeftAantal ? Math.min(100, Math.round((100 * l.aantal) / l.max)) : 0;
  let body;
  if (!l.namenBeschikbaar) body = `<p class="empty">Namen tijdelijk niet beschikbaar.</p>`;
  else if (!l.namen.length && !l.onbekend) body = `<p class="empty">Nog niemand ingeschreven. Wees de eerste!</p>`;
  else {
    const lijst = l.namen.length ? `<ul>\n${l.namen.map((n) => `<li>${esc(n)}</li>`).join("\n")}\n</ul>` : "";
    const rest = l.onbekend ? `<p class="empty">${l.namen.length ? "+ " : ""}${l.onbekend} ${l.onbekend === 1 ? "naam" : "namen"} tijdelijk niet beschikbaar.</p>` : "";
    body = [lijst, rest].filter(Boolean).join("\n");
  }
  return [
    `<article class="card${vol ? " is-full" : ""}">`,
    `<header><time>${esc(l.start.slice(11, 16))}</time><h3>${esc(l.title)}</h3>${vol ? `<span class="badge">Vol</span>` : ""}</header>`,
    `<p class="count${vol ? " full" : ""}">${esc(telling)}${vrijTekst}</p>`,
    l.max > 0 && heeftAantal ? `<div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>` : "",
    body,
    `</article>`,
  ].filter(Boolean).join("\n");
}

// Lessen die al afgelopen zijn (Amsterdam-tijd, einde = afgelopen) worden niet getoond.
export function visibleToday(lessen, now = new Date()) {
  const wall = amsterdamWall(now);
  return lessen.filter((l) => !isFinished(l, wall));
}

// Oudere records (voor de weekweergave) hadden { today, lessen }: lees die als 1 dag.
function weekOf(data) {
  if (Array.isArray(data.days) && data.days.length) return data.days;
  return [{ date: data.today, lessen: data.lessen || [] }];
}

function shortDate(date) {
  const [y, m, d] = date.split("-").map(Number);
  return `${d} ${MAANDEN[m - 1]}`;
}

function dayLabels(i, date) {
  const [y, m, d] = date.split("-").map(Number);
  const weekday = DAGEN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (i === 0) return { name: "Vandaag", sub: datumTekst(date) };
  if (i === 1) return { name: "Morgen", sub: datumTekst(date) };
  return { name: weekday, sub: shortDate(date) };
}

// Rendert de pagina voor het moment `now` (bij elk bezoek opnieuw, vanuit de opgeslagen data):
// zo verdwijnen afgelopen lessen precies op tijd, zonder extra API-calls.
export function buildHtml(data, now = new Date(), updatedAt = now) {
  const { today } = data;
  const days = weekOf(data);
  const parts = days.map((day, i) => {
    const lessen = i === 0 ? visibleToday(day.lessen, now) : day.lessen;
    const { name, sub } = dayLabels(i, day.date);
    const h = `<h2 class="day-h${i === 0 ? " first" : ""}">${esc(name)}<span>${esc(sub)}</span></h2>`;
    if (lessen.length) return `<section class="day">\n${h}\n${lessen.map(cardHtml).join("\n")}\n</section>`;
    const note = i === 0 ? (day.lessen.length ? "Geen lessen meer vandaag." : "Vandaag geen groepslessen.") : "Geen lessen.";
    return `<section class="day day-empty">\n${h}\n<p class="note">${note}</p>\n</section>`;
  });

  return `<!DOCTYPE html>
<html lang="nl">
<head>
${HEAD(`${BRAND} - Fit Up`)}
</head>
<body data-date="${esc(today)}">
<main>
${TOP}
<div id="stale" class="stale" hidden style="margin-top:28px"><h2>Nog geen actuele gegevens</h2><p>De inschrijvingen worden zo bijgewerkt. Probeer het over enkele minuten opnieuw.</p></div>
<div id="lessen">
${parts.join("\n")}
</div>
<p class="foot">Bijgewerkt om ${esc(hhmm(updatedAt))} &middot; ververst automatisch</p>
</main>
<script>
(function(){
var d=new Date(),p=function(n){return(n<10?"0":"")+n},today=d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
if(document.body.getAttribute("data-date")!==today){document.getElementById("stale").hidden=false;document.getElementById("lessen").hidden=true}
})();
</script>
</body>
</html>
`;
}

// Welke pagina mag een bezoeker nu zien? Alleen data van VANDAAG (Amsterdam) en niet ouder
// dan MAX_SERVE_AGE_MS; anders de neutrale pagina - nooit oude namen.
export function pageFor(rec, now = new Date()) {
  if (!rec || typeof rec.html !== "string") return STALE_HTML;
  if (rec.date !== amsterdamDate(now)) return STALE_HTML;
  if (now.getTime() - rec.updatedAt > MAX_SERVE_AGE_MS) return STALE_HTML;
  // Records bevatten de data: render voor dit moment (verbergt afgelopen lessen).
  if (rec.data) return buildHtml(rec.data, now, new Date(rec.updatedAt));
  return rec.html;
}

export function needsRefresh(rec, now = new Date()) {
  return !rec || rec.date !== amsterdamDate(now) || now.getTime() - rec.updatedAt > STALE_AFTER_MS;
}

// ---------- verversen ----------

// Compacte logregel: alleen aantallen, tijden en foutcategorieen. Nooit namen, ids,
// tokens of geheimen.
function log(o) {
  try { console.log(JSON.stringify({ ev: "wdem_refresh", ...o })); } catch { /* geen logging = geen probleem */ }
}

// Haalt verse data op en slaat de pagina op. Gooit nooit: geeft {status} terug.
//   status "skipped": buiten 05:00-23:00 Amsterdam - geen API-calls, blob blijft staan
//   status "locked":  een andere refresh liep net of een recente fout is aan het afkoelen
//   status "error":   Virtuagym-fout; vorige pagina blijft staan
//   status "ok":      nieuwe pagina opgeslagen
export async function refresh(s, { force = false, trigger = "cron", now = new Date() } = {}) {
  const t0 = Date.now();
  const stamp = amsterdamStamp(now);
  if (!isActiveWindow(now)) {
    log({ trigger, ams: stamp, status: "skipped", reason: "outside_window" });
    return { status: "skipped" };
  }
  const nowMs = now.getTime();
  if (!force) {
    try {
      const lock = await s.get("lock", { type: "json" });
      if (lock && nowMs - lock.t < (lock.ttl || LOCK_MS)) {
        log({ trigger, ams: stamp, status: "locked" });
        return { status: "locked" };
      }
    } catch { /* geen lock = doorgaan */ }
  }
  try { await s.setJSON("lock", { t: nowMs, ttl: LOCK_MS }); } catch { /* niet fataal */ }

  const ctx = {
    calls: 0, cacheHit: 0, cacheMiss: 0, memberFail: 0, partFail: 0, reused: 0,
    deadline: Date.now() + (trigger === "cron" ? DEADLINE_CRON_MS : DEADLINE_LAZY_MS),
  };
  try {
    const data = await fetchToday(s, now, ctx);
    const rec = {
      html: buildHtml(data, now), data, updatedAt: nowMs, date: data.today,
      lessen: data.lessen.length,
    };
    await s.setJSON("page", rec);
    const week = data.days.reduce((a, d) => a + d.lessen.length, 0);
    log({
      trigger, ams: stamp, status: "ok", lessenVandaag: data.lessen.length, lessenWeek: week,
      deelnemersVandaag: visibleToday(data.lessen, now).reduce((a, l) => a + (l.aantal || 0), 0),
      calls: ctx.calls, hergebruikt: ctx.reused, cacheHit: ctx.cacheHit, cacheMiss: ctx.cacheMiss,
      partFail: ctx.partFail, memberFail: ctx.memberFail, incomplete: data.incomplete, ms: Date.now() - t0,
    });
    return { status: "ok", rec, calls: ctx.calls };
  } catch (err) {
    const category = err?.category || "unknown";
    // Fout: vorige pagina blijft staan; koel af zodat bezoekers geen API-storm veroorzaken.
    const ttl = category === "rate_limited" || category === "http_429" ? RATE_LIMIT_LOCK_MS : FAIL_LOCK_MS;
    try { await s.setJSON("lock", { t: nowMs, ttl }); } catch { /* niet fataal */ }
    log({ trigger, ams: stamp, status: "error", category, calls: ctx.calls, ms: Date.now() - t0 });
    return { status: "error", category, calls: ctx.calls };
  }
}
