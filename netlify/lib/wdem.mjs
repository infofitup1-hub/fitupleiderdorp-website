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
const MAX_CALLS = 40; // harde bovengrens per refresh (voorkomt API-storms)
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

// Vanaf 20:00 (Europe/Amsterdam) tonen we ook de lessen van morgen.
export const TOMORROW_FROM_HOUR = 20;
export function showsTomorrow(now = new Date()) {
  return amsterdamHour(now) >= TOMORROW_FROM_HOUR;
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
  await Promise.all(missing.map(async (id) => {
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
  }));
  // Verlopen entries waarvan de vernieuwing mislukte, blijven bruikbaar (tot de prune-grens).
  const prune = Object.entries(cache).filter(([, v]) => !v || typeof v.n !== "string" || nowMs - v.t > NAME_PRUNE_MS);
  for (const [k] of prune) { delete cache[k]; changed = true; }
  if (changed) {
    const clean = Object.fromEntries(Object.entries(cache).map(([k, v]) => [k, { n: v.n, t: v.t }]));
    try { await s.setJSON("names", clean); } catch { /* niet fataal */ }
  }
  return (id) => (cache[id] ? cache[id].n : null);
}

function buildLesson(e, p) {
  const namen = [];
  let onbekend = 0;
  for (const x of p.list) {
    if (x.member_id) {
      const n = p.nameOf(String(x.member_id));
      if (n) namen.push(n); else onbekend += 1;
    } else {
      namen.push(x.user_name ? guestName(x.user_name) : "Lid");
    }
  }
  namen.sort((a, b) => a.localeCompare(b, "nl"));
  const max = Number(e.max_places) > 0 ? Number(e.max_places) : 0;
  const total = namen.length + onbekend;
  const att = Number.isFinite(Number(e.attendees)) && e.attendees !== null && e.attendees !== "" ? Number(e.attendees) : null;
  let aantal = total;
  // Lijst onbetrouwbaar of onvolledig: val terug op het aantal dat Virtuagym zelf meldt.
  if ((!p.ok || p.incomplete) && att !== null) aantal = att;
  if (p.incomplete && aantal > total) onbekend += aantal - total;
  // Geen lijst en ook geen betrouwbaar aantal: niets verzinnen.
  if (!p.ok && att === null) aantal = null;
  return {
    start: e.start, end: e.end, title: String(e.title || ""),
    namen, aantal, max, onbekend, namenBeschikbaar: p.ok,
  };
}

export async function fetchToday(s, now, ctx) {
  const apiKey = Netlify.env.get("VIRTUAGYM_API_KEY");
  const clubSecret = Netlify.env.get("VIRTUAGYM_CLUB_SECRET");
  const clubId = Netlify.env.get("VIRTUAGYM_CLUB_ID") || "104091";
  if (!apiKey || !clubSecret) throw fail("not_configured");
  const creds = { apiKey, clubSecret, clubId };

  const today = amsterdamDate(now);
  const wantTomorrow = showsTomorrow(now);
  const tomorrow = addDaysYmd(today, 1);
  const wall = amsterdamWall(now);

  // Vandaag (en vanaf 20:00 ook morgen) in EEN events-call (zelfde paginering).
  const evAll = await paginate("events/", {
    timestamp_start: String(Math.floor(startOfYmdMs(today) / 1000)),
    timestamp_end: String(Math.floor(startOfYmdMs(addDaysYmd(today, wantTomorrow ? 2 : 1)) / 1000)),
  }, "event_id", null, creds, ctx);

  const sorted = evAll.records
    .filter((e) => typeof e.start === "string" && e.canceled !== true)
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.title).localeCompare(String(b.title)));
  const todayEv = sorted.filter((e) => e.start.slice(0, 10) === today);
  const tomorrowEv = wantTomorrow ? sorted.filter((e) => e.start.slice(0, 10) === tomorrow) : [];

  // Deelnemers alleen voor lessen die nog getoond worden (afgelopen lessen zijn verborgen,
  // dus daar sparen we de call). Mislukte les = "namen niet beschikbaar", geen crash.
  const todayLive = todayEv.filter((e) => !isFinished(e, wall));
  const fetchParts = async (e) => {
    try {
      const r = await paginate("eventparticipants/", { event_id: e.event_id, fill_guestname: "1" },
        "event_participant_id", "event_participant_id", creds, ctx);
      return { ok: true, list: r.records, incomplete: r.incomplete };
    } catch {
      ctx.partFail += 1;
      return { ok: false, list: [], incomplete: false };
    }
  };
  const liveEv = [...todayLive, ...tomorrowEv];
  const liveParts = await Promise.all(liveEv.map(fetchParts));
  const partOf = new Map(liveEv.map((e, i) => [e, liveParts[i]]));

  const ids = [...new Set(liveParts.flatMap((p) => p.list).filter((p) => p.member_id).map((p) => String(p.member_id)))];
  const nameOf = ids.length ? await resolveNames(ids, s, creds, ctx, now.getTime()) : () => null;

  const finishedLesson = (e) => {
    const att = Number(e.attendees);
    return {
      start: e.start, end: e.end, title: String(e.title || ""), namen: [],
      aantal: Number.isFinite(att) ? att : null, max: Number(e.max_places) > 0 ? Number(e.max_places) : 0,
      onbekend: 0, namenBeschikbaar: true, done: true,
    };
  };
  const lessen = todayEv.map((e) => (partOf.has(e) ? buildLesson(e, { ...partOf.get(e), nameOf }) : finishedLesson(e)));

  let tomorrowData = null;
  if (wantTomorrow) {
    try {
      tomorrowData = { date: tomorrow, lessen: tomorrowEv.map((e) => buildLesson(e, { ...partOf.get(e), nameOf })) };
    } catch {
      tomorrowData = null; // morgen mislukt: vandaag blijft gewoon werken
    }
  }
  return { today, lessen, tomorrow: tomorrowData, incomplete: liveParts.some((p) => p.incomplete) };
}

// ---------- HTML ----------

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const STYLE = `<style>
:root{--bg:#080A09;--card:#101311;--line:rgba(255,255,255,.10);--txt:#F4F5F1;--mute:#A7ADA8;--lime:#B7F229}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--txt);font:16px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:max(20px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
main{max-width:560px;margin:0 auto}
.top{padding:8px 0 20px}
.eyebrow{margin:0 0 6px;color:var(--lime);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
h1{margin:0;font-size:32px;line-height:1.1;font-weight:800;letter-spacing:-.01em}
.sub{margin:8px 0 0;color:var(--mute)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px 18px 18px;margin:0 0 12px}
.card header{display:flex;align-items:baseline;gap:12px}
.card time{font-size:22px;font-weight:800;color:var(--lime);font-variant-numeric:tabular-nums}
.card h2{margin:0;font-size:19px;line-height:1.25;font-weight:700;text-transform:uppercase;letter-spacing:.02em}
.count{margin:10px 0 8px;color:var(--mute);font-size:16px}
.count.full{color:var(--txt)}
.bar{height:3px;border-radius:2px;background:rgba(255,255,255,.10);overflow:hidden;margin:0 0 14px}
.bar span{display:block;height:100%;background:var(--lime)}
ul{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:8px}
li{padding:6px 12px;border:1px solid var(--line);border-radius:6px;background:rgba(255,255,255,.04);font-size:16px}
.empty{margin:6px 0 0;color:var(--mute)}
.card header{min-width:0}
.card h2,li{overflow-wrap:anywhere}
.badge{margin-left:auto;align-self:center;flex:none;padding:2px 10px;border:1px solid rgba(244,245,241,.28);border-radius:999px;background:rgba(255,255,255,.06);color:var(--txt);font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
.free{color:var(--txt)}
.card.is-full .bar span{background:rgba(244,245,241,.45)}
.sec{display:flex;align-items:baseline;gap:10px;margin:28px 0 12px;color:var(--mute);font-size:13px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.sec span{font-size:14px;font-weight:500;letter-spacing:.02em;text-transform:none}
.sec.first{margin-top:0}
ul+.empty{margin-top:10px}
.none,.stale{border:1px solid var(--line);border-radius:10px;padding:20px;background:var(--card);color:var(--mute)}
.none h2,.stale h2{margin:0 0 6px;color:var(--txt);font-size:19px}
.none p,.stale p{margin:0}
.foot{margin:20px 0 0;color:var(--mute);font-size:14px;text-align:center}
[hidden]{display:none!important}
</style>`;

// Neutrale pagina zonder enige deelnemersdata: gebruikt als er geen actuele gegevens zijn
// (nieuwe dag, data te oud, fout). Server-side, dus oude namen staan nooit in de bron.
export const STALE_HTML = `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="dark">
<title>Wie doet er mee? - Fit Up</title>
${STYLE}
</head>
<body>
<main>
<div class="top">
<p class="eyebrow">Fit Up Leiderdorp</p>
<h1>Wie doet er mee?</h1>
</div>
<div class="stale"><h2>Nog geen actuele gegevens</h2><p>De inschrijvingen van vandaag worden zo bijgewerkt. Probeer het over enkele minuten opnieuw.</p></div>
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
    `<header><time>${esc(l.start.slice(11, 16))}</time><h2>${esc(l.title)}</h2>${vol ? `<span class="badge">Vol</span>` : ""}</header>`,
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

// Rendert de pagina voor het moment `now` (bij elk bezoek opnieuw, vanuit de opgeslagen data):
// zo verdwijnen afgelopen lessen precies op tijd, zonder extra API-calls.
export function buildHtml({ today, lessen, tomorrow }, now = new Date(), updatedAt = now) {
  const vis = visibleToday(lessen, now);
  const morgen = tomorrow && showsTomorrow(now) && tomorrow.lessen.length ? tomorrow : null;
  let totaal = 0;
  for (const l of vis) totaal += l.aantal || 0;

  const todayCards = vis.map(cardHtml);
  if (!lessen.length) {
    todayCards.push(`<div class="none"><h2>Vandaag geen groepslessen</h2><p>Kijk morgen weer of bekijk het lesrooster in de app.</p></div>`);
  } else if (!vis.length) {
    todayCards.push(`<div class="none"><h2>Geen lessen meer vandaag</h2><p>${morgen ? "Hieronder staan de lessen van morgen." : "Kijk morgen weer of bekijk het lesrooster in de app."}</p></div>`);
  }
  const heading = (t, date, first) => `<h2 class="sec${first ? " first" : ""}">${t}<span>${esc(datumTekst(date))}</span></h2>`;
  const sections = morgen
    ? [heading("Vandaag", today, true), ...todayCards, heading("Morgen", morgen.date, false), ...morgen.lessen.map(cardHtml)]
    : todayCards;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="dark">
<title>Wie doet er mee? - Fit Up</title>
${STYLE}
</head>
<body data-date="${esc(today)}">
<main>
<div class="top">
<p class="eyebrow">Fit Up Leiderdorp</p>
<h1>Wie doet er mee?</h1>
<p class="sub">${esc(datumTekst(today))} &middot; ${vis.length} ${vis.length === 1 ? "groepsles" : "groepslessen"} &middot; ${totaal} inschrijvingen</p>
</div>
<div id="stale" class="stale" hidden><h2>Nog geen actuele gegevens</h2><p>De inschrijvingen van vandaag worden zo bijgewerkt. Probeer het over enkele minuten opnieuw.</p></div>
<div id="lessen">
${sections.join("\n")}
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
  // Nieuwe records bevatten de data: render voor dit moment (verbergt afgelopen lessen).
  if (rec.data) return buildHtml(rec.data, now, new Date(rec.updatedAt));
  return rec.html;
}

export function needsRefresh(rec, now = new Date()) {
  if (!rec || rec.date !== amsterdamDate(now) || now.getTime() - rec.updatedAt > STALE_AFTER_MS) return true;
  // Vanaf 20:00 moet morgen erbij zitten; ontbreekt dat (pagina van voor 20:00): verversen.
  return showsTomorrow(now) && !rec.withTomorrow;
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
    calls: 0, cacheHit: 0, cacheMiss: 0, memberFail: 0, partFail: 0,
    deadline: Date.now() + (trigger === "cron" ? DEADLINE_CRON_MS : DEADLINE_LAZY_MS),
  };
  try {
    const data = await fetchToday(s, now, ctx);
    const rec = {
      html: buildHtml(data, now), data, updatedAt: nowMs, date: data.today,
      lessen: data.lessen.length, withTomorrow: showsTomorrow(now),
    };
    await s.setJSON("page", rec);
    const deelnemers = visibleToday(data.lessen, now).reduce((a, l) => a + (l.aantal || 0), 0);
    log({
      trigger, ams: stamp, status: "ok", lessen: data.lessen.length, morgen: data.tomorrow ? data.tomorrow.lessen.length : null,
      deelnemers, calls: ctx.calls,
      cacheHit: ctx.cacheHit, cacheMiss: ctx.cacheMiss, partFail: ctx.partFail, memberFail: ctx.memberFail,
      incomplete: data.incomplete, ms: Date.now() - t0,
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
