// "Wie doet er mee?" - server-side ophalen en opbouwen van de deelnemerspagina.
//
// Haalt via de Virtuagym Club API de lessen van vandaag + deelnemers op en bouwt
// daar een HTML-pagina van (alleen voornaam + initiaal). De Virtuagym-geheimen komen
// uitsluitend uit Netlify environment variables en staan nooit in de HTML of Git.
//
// Env vars (bestaan al voor /.netlify/functions/schedule):
//   VIRTUAGYM_API_KEY, VIRTUAGYM_CLUB_SECRET, VIRTUAGYM_CLUB_ID (optioneel, default 104091)

import { getStore, getDeployStore } from "@netlify/blobs";

const API_BASE = "https://api.virtuagym.com/api/v1/club";
const TZ = "Europe/Amsterdam";
const FETCH_TIMEOUT_MS = 6000;
const NAME_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const STALE_AFTER_MS = 12 * 60 * 1000;
const LOCK_MS = 45 * 1000;

// ---------- opslag ----------

export function store() {
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

// ---------- tijd (Europe/Amsterdam; Netlify draait in UTC) ----------

function ymd(d) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(d);
}

function tzOffsetMs(d) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUTC - Math.floor(d.getTime() / 1000) * 1000;
}

function startOfDayMs(now) {
  const [y, m, d] = ymd(now).split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const off1 = tzOffsetMs(new Date(guess));
  const off2 = tzOffsetMs(new Date(guess - off1));
  return guess - off2;
}

export function amsterdamHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: TZ, hourCycle: "h23", hour: "2-digit" }).format(now));
}

function hhmm(now) {
  return new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

const DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function datumTekst(today) {
  const [y, m, d] = today.split("-").map(Number);
  return `${DAGEN[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MAANDEN[m - 1]}`;
}

// ---------- Virtuagym ----------

async function vg(path, params, creds) {
  const url = `${API_BASE}/${creds.clubId}/${path}?` + new URLSearchParams({
    api_key: creds.apiKey, club_secret: creds.clubSecret, ...params,
  });
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { Accept: "application/json" }, signal: ctl.signal });
    if (!res.ok) throw new Error(`virtuagym_${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

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

// Alleen de benodigde leden opvragen (1 call per onbekend lid) en alleen de
// afgeschermde weergavenaam cachen - nooit volledige namen of member-gegevens.
async function resolveNames(ids, s, creds) {
  let cache = {};
  try { cache = (await s.get("names", { type: "json" })) || {}; } catch { cache = {}; }
  const now = Date.now();
  const missing = ids.filter((id) => !cache[id] || now - cache[id].t > NAME_TTL_MS);
  let changed = false;
  await Promise.all(missing.map(async (id) => {
    try {
      const data = await vg(`member/${encodeURIComponent(id)}`, {}, creds);
      const m = Array.isArray(data?.result) ? data.result[0] : null;
      if (m) {
        cache[id] = { n: displayName(m.firstname, m.lastname), t: now };
        changed = true;
      }
    } catch { /* val terug op cache of "Lid" */ }
  }));
  if (changed) {
    const keep = Object.fromEntries(Object.entries(cache).filter(([, v]) => now - v.t < 30 * 24 * 60 * 60 * 1000));
    try { await s.setJSON("names", keep); } catch { /* niet fataal */ }
  }
  return (id) => cache[id]?.n || "Lid";
}

export async function fetchToday(s, now = new Date()) {
  const apiKey = Netlify.env.get("VIRTUAGYM_API_KEY");
  const clubSecret = Netlify.env.get("VIRTUAGYM_CLUB_SECRET");
  const clubId = Netlify.env.get("VIRTUAGYM_CLUB_ID") || "104091";
  if (!apiKey || !clubSecret) throw new Error("not_configured");
  const creds = { apiKey, clubSecret, clubId };

  const today = ymd(now);
  const startMs = startOfDayMs(now);
  const ev = await vg("events/", {
    timestamp_start: String(Math.floor(startMs / 1000)),
    timestamp_end: String(Math.floor((startMs + 24 * 3600 * 1000) / 1000)),
  }, creds);

  const events = (Array.isArray(ev?.result) ? ev.result : [])
    .filter((e) => typeof e.start === "string" && e.start.slice(0, 10) === today && e.canceled !== true)
    .sort((a, b) => a.start.localeCompare(b.start) || String(a.title).localeCompare(String(b.title)));

  // Deelnemers per les (parallel). Mislukte les = "namen niet beschikbaar", geen crash.
  const parts = await Promise.all(events.map(async (e) => {
    try {
      const r = await vg("eventparticipants/", { event_id: e.event_id, fill_guestname: "1" }, creds);
      return { ok: true, list: Array.isArray(r?.result) ? r.result : [], more: Number(r?.status?.results_remaining) > 0 };
    } catch {
      return { ok: false, list: [], more: false };
    }
  }));

  const ids = [...new Set(parts.flatMap((p) => p.list).filter((p) => p.member_id).map((p) => String(p.member_id)))];
  const nameOf = ids.length ? await resolveNames(ids, s, creds) : () => "Lid";

  const lessen = events.map((e, i) => {
    const p = parts[i];
    const namen = p.list
      .map((x) => (x.member_id ? nameOf(String(x.member_id)) : x.user_name ? guestName(x.user_name) : "Lid"))
      .sort((a, b) => a.localeCompare(b, "nl"));
    const max = Number(e.max_places) > 0 ? Number(e.max_places) : 0;
    let aantal = namen.length;
    if ((!p.ok || p.more) && Number.isFinite(Number(e.attendees))) aantal = Number(e.attendees);
    return {
      start: e.start, end: e.end, title: String(e.title || ""),
      namen, aantal, max, namenBeschikbaar: p.ok,
    };
  });
  return { today, lessen };
}

// ---------- HTML ----------

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function buildHtml({ today, lessen }, now = new Date()) {
  let totaal = 0;
  const cards = lessen.map((l) => {
    totaal += l.aantal;
    const tijd = l.start.slice(11, 16);
    const eind = (l.end || "").replace(" ", "T") || `${l.start.replace(" ", "T")}`;
    const vol = l.max > 0 && l.aantal >= l.max;
    const telling = l.max > 0 ? `${l.aantal} / ${l.max} deelnemers` : l.aantal === 1 ? "1 deelnemer" : `${l.aantal} deelnemers`;
    const pct = l.max > 0 ? Math.min(100, Math.round((100 * l.aantal) / l.max)) : 0;
    let body;
    if (!l.namenBeschikbaar) body = `<p class="empty">Namen tijdelijk niet beschikbaar.</p>`;
    else if (!l.namen.length) body = `<p class="empty">Nog niemand ingeschreven. Wees de eerste!</p>`;
    else body = `<ul>\n${l.namen.map((n) => `<li>${esc(n)}</li>`).join("\n")}\n</ul>`;
    return [
      `<article class="card" data-end="${esc(eind)}">`,
      `<header><time>${esc(tijd)}</time><h2>${esc(l.title)}</h2></header>`,
      `<p class="count${vol ? " full" : ""}">${esc(telling)}${vol ? " &middot; vol" : ""}</p>`,
      l.max > 0 ? `<div class="bar" aria-hidden="true"><span style="width:${pct}%"></span></div>` : "",
      body,
      `</article>`,
    ].filter(Boolean).join("\n");
  });
  if (!lessen.length) {
    cards.push(`<div class="none"><h2>Vandaag geen groepslessen</h2><p>Kijk morgen weer of bekijk het lesrooster in de app.</p></div>`);
  }

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex,nofollow">
<meta name="color-scheme" content="dark">
<title>Wie doet er mee? - Fit Up</title>
<style>
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
.card.past{opacity:.55}
.none,.stale{border:1px solid var(--line);border-radius:10px;padding:20px;background:var(--card);color:var(--mute)}
.none h2,.stale h2{margin:0 0 6px;color:var(--txt);font-size:19px}
.none p,.stale p{margin:0}
.foot{margin:20px 0 0;color:var(--mute);font-size:14px;text-align:center}
[hidden]{display:none!important}
</style>
</head>
<body data-date="${esc(today)}">
<main>
<div class="top">
<p class="eyebrow">Fit Up Leiderdorp</p>
<h1>Wie doet er mee?</h1>
<p class="sub">${esc(datumTekst(today))} &middot; ${lessen.length} groepslessen &middot; ${totaal} inschrijvingen</p>
</div>
<div id="stale" class="stale" hidden><h2>Nog geen actuele gegevens</h2><p>De inschrijvingen van vandaag worden zo bijgewerkt. Probeer het over enkele minuten opnieuw.</p></div>
<div id="lessen">
${cards.join("\n")}
</div>
<p class="foot">Bijgewerkt om ${esc(hhmm(now))} &middot; ververst automatisch</p>
</main>
<script>
(function(){
var d=new Date(),p=function(n){return(n<10?"0":"")+n},today=d.getFullYear()+"-"+p(d.getMonth()+1)+"-"+p(d.getDate());
if(document.body.getAttribute("data-date")!==today){document.getElementById("stale").hidden=false;document.getElementById("lessen").hidden=true;return}
var now=d.getTime(),c=document.querySelectorAll(".card[data-end]");
for(var i=0;i<c.length;i++){if(new Date(c[i].getAttribute("data-end")).getTime()<now)c[i].className+=" past"}
})();
</script>
</body>
</html>
`;
}

// ---------- verversen ----------

// Haalt verse data op en slaat de pagina op. Bij een Virtuagym-fout blijft de vorige
// pagina staan. `force` negeert de lock (alleen voor de geplande run).
export async function refresh(s, { force = false } = {}) {
  const now = Date.now();
  if (!force) {
    try {
      const lock = await s.get("lock", { type: "json" });
      if (lock && now - lock.t < LOCK_MS) return null;
    } catch { /* geen lock = doorgaan */ }
  }
  try { await s.setJSON("lock", { t: now }); } catch { /* niet fataal */ }

  const data = await fetchToday(s, new Date(now));
  const rec = { html: buildHtml(data, new Date(now)), updatedAt: now, date: data.today, lessen: data.lessen.length };
  await s.setJSON("page", rec);
  return rec;
}
