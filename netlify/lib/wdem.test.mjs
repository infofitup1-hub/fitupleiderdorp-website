// Tests voor netlify/lib/wdem.mjs. Draai met: node --test netlify/lib/
// Geen netwerk, geen Netlify: fetch, store, tijd en sleep worden gemockt.

import test from "node:test";
import assert from "node:assert/strict";

globalThis.Netlify = {
  env: { get: (k) => (k === "VIRTUAGYM_API_KEY" ? "TESTKEY-111" : k === "VIRTUAGYM_CLUB_SECRET" ? "TESTSECRET-222" : undefined) },
  context: { deploy: { context: "dev" } },
};

const lib = await import("./wdem.mjs");
lib._hooks.sleep = async () => {}; // geen echte wachttijd in tests

const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

// ---------- hulpmiddelen ----------

function memStore() {
  const m = {};
  return {
    m,
    get: async (k) => (k in m ? JSON.parse(JSON.stringify(m[k])) : null),
    setJSON: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); },
  };
}

function resp(body, { status = 200, headers = {} } = {}) {
  return { ok: status >= 200 && status < 300, status, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body };
}
const ok = (result, status = {}) => resp({ status: { statuscode: 200, result_count: result.length, results_remaining: 0, ...status }, result });

// Mock-Virtuagym: routes per pad; alles wat gevraagd wordt, wordt gelogd (zonder geheimen).
function mockApi(handlers) {
  const calls = [];
  globalThis.fetch = async (url, opts) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/api\/v1\/club\/\d+\//, "");
    const params = Object.fromEntries(u.searchParams);
    delete params.api_key; delete params.club_secret;
    calls.push({ path, params });
    const key = Object.keys(handlers).find((k) => path.startsWith(k));
    if (!key) throw new Error("unmocked " + path);
    return handlers[key]({ path, params, signal: opts?.signal, n: calls.filter((c) => c.path.startsWith(key)).length });
  };
  return calls;
}

const D = new Date("2026-10-04T08:00:00Z"); // 10:00 Amsterdam (CEST), zondag
const ev = (id, start, extra = {}) => ({ event_id: id, title: "HIIT", start, end: start.replace(/\d\d:\d\d:00$/, "11:00:00"), canceled: false, max_places: 16, attendees: 2, ...extra });
const part = (id, mid, extra = {}) => ({ event_participant_id: id, member_id: mid, user_name: "", ...extra });
const member = (first, last) => ok([{ member_id: 1, firstname: first, lastname: last, email: "geheim@example.com", mobile: "0612345678" }]);

// ---------- 1. paginering ----------

test("events: 1 pagina is genoeg, geen extra calls", async () => {
  const calls = mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00")]),
    "eventparticipants/": () => ok([part(1, 11)]),
    "member/": () => member("anouk", "kok"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.equal(calls.filter((c) => c.path === "events/").length, 1);
});

test("events: 2+ pagina's via next_page, duplicaten gefilterd", async () => {
  const calls = mockApi({
    "events/": ({ params }) => params.sync_from === "999"
      ? ok([ev("e2", "2026-10-04 11:00:00"), ev("e1", "2026-10-04 10:00:00")]) // e1 dubbel
      : ok([ev("e1", "2026-10-04 10:00:00")], { results_remaining: 1, next_page: "sync_from=999" }),
    "eventparticipants/": () => ok([]),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.equal(calls.filter((c) => c.path === "events/").length, 2);
  assert.equal(calls.filter((c) => c.path === "eventparticipants/").length, 2); // e1 en e2, niet 3
  assert.match(r.rec.html, /11:00/);
});

test("participants: remaining>0 zonder next_page -> from_id fallback, daarna klaar", async () => {
  const calls = mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00", { attendees: 3 })]),
    "eventparticipants/": ({ params }) => params.from_id === "2"
      ? ok([part(3, 13)])
      : ok([part(1, 11), part(2, 12)], { results_remaining: 1 }),
    "member/": ({ path }) => member("Piet", "Pol"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
  const pc = calls.filter((c) => c.path === "eventparticipants/");
  assert.equal(pc.length, 2);
  assert.equal(pc[1].params.from_id, "2");
  assert.match(r.rec.html, /3 \/ 16 deelnemers/);
});

test("results_remaining inconsistent (remaining>0 maar lege pagina): stopt, markeert onvolledig, geen eindeloze lus", async () => {
  const calls = mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00", { attendees: 5 })]),
    "eventparticipants/": ({ n }) => (n === 1 ? ok([part(1, 11)], { results_remaining: 4 }) : ok([], { results_remaining: 4 })),
    "member/": () => member("Anouk", "Kok"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.ok(calls.filter((c) => c.path === "eventparticipants/").length <= 3);
  assert.match(r.rec.html, /5 \/ 16 deelnemers/); // terugval op Virtuagym attendees
  assert.match(r.rec.html, /4 namen tijdelijk niet beschikbaar/); // nooit stilzwijgend deelnemers missen
});

test("herhaalde cursor stopt de lus", async () => {
  const calls = mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00")]),
    "eventparticipants/": ({ n }) => ok([part(n, 10 + n)], { results_remaining: 9, next_page: "sync_from=5" }),
    "member/": () => member("A", "B"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.ok(calls.filter((c) => c.path === "eventparticipants/").length <= 3);
});

test("MAX_PAGES en MAX_CALLS begrenzen altijd", async () => {
  const calls = mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00")]),
    "eventparticipants/": ({ n }) => ok([part(n, 100 + n)], { results_remaining: 9999, next_page: `sync_from=${n}` }),
    "member/": () => member("A", "B"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.ok(calls.filter((c) => c.path === "eventparticipants/").length <= 5);
  assert.ok(calls.length <= 40);
});

// ---------- 2. venster 05:00-23:00 Europe/Amsterdam, zomer + winter ----------

test("venster: zomertijd (CEST, UTC+2)", () => {
  const w = (iso) => lib.isActiveWindow(new Date(iso));
  assert.equal(w("2026-07-15T02:59:00Z"), false); // 04:59
  assert.equal(w("2026-07-15T03:00:00Z"), true); // 05:00
  assert.equal(w("2026-07-15T20:59:00Z"), true); // 22:59
  assert.equal(w("2026-07-15T21:00:00Z"), false); // 23:00
});

test("venster: wintertijd (CET, UTC+1)", () => {
  const w = (iso) => lib.isActiveWindow(new Date(iso));
  assert.equal(w("2026-01-15T03:59:00Z"), false); // 04:59
  assert.equal(w("2026-01-15T04:00:00Z"), true); // 05:00
  assert.equal(w("2026-01-15T21:59:00Z"), true); // 22:59
  assert.equal(w("2026-01-15T22:00:00Z"), false); // 23:00
});

test("venster: omschakeldagen (29 maart 2026 -> zomertijd, 25 oktober 2026 -> wintertijd)", () => {
  const w = (iso) => lib.isActiveWindow(new Date(iso));
  assert.equal(w("2026-03-29T02:59:00Z"), false); // 04:59 CEST
  assert.equal(w("2026-03-29T03:00:00Z"), true); // 05:00 CEST
  assert.equal(w("2026-03-29T20:59:00Z"), true);
  assert.equal(w("2026-03-29T21:00:00Z"), false);
  assert.equal(w("2026-10-25T03:59:00Z"), false); // 04:59 CET
  assert.equal(w("2026-10-25T04:00:00Z"), true); // 05:00 CET
  assert.equal(w("2026-10-25T21:59:00Z"), true);
  assert.equal(w("2026-10-25T22:00:00Z"), false);
});

test("buiten het venster: geen API-calls, succesvolle no-op, bestaande blob blijft", async () => {
  const calls = mockApi({});
  const s = memStore();
  s.m.page = { html: "OUD", updatedAt: 1, date: "2026-10-03" };
  const r = await lib.refresh(s, { force: true, now: new Date("2026-10-04T21:30:00Z") }); // 23:30 CEST
  assert.equal(r.status, "skipped");
  assert.equal(calls.length, 0);
  assert.equal(s.m.page.html, "OUD");
  const r2 = await lib.refresh(s, { force: true, now: new Date("2026-01-15T03:00:00Z") }); // 04:00 CET
  assert.equal(r2.status, "skipped");
  assert.equal(calls.length, 0);
});

test("startOfDay: zomer/winter/omschakeldagen zonder vaste offset", () => {
  assert.equal(new Date(lib.startOfDayMs(new Date("2026-07-15T10:00:00Z"))).toISOString(), "2026-07-14T22:00:00.000Z");
  assert.equal(new Date(lib.startOfDayMs(new Date("2026-01-15T10:00:00Z"))).toISOString(), "2026-01-14T23:00:00.000Z");
  assert.equal(new Date(lib.startOfDayMs(new Date("2026-03-29T10:00:00Z"))).toISOString(), "2026-03-28T23:00:00.000Z");
  assert.equal(new Date(lib.startOfDayMs(new Date("2026-10-25T10:00:00Z"))).toISOString(), "2026-10-24T22:00:00.000Z");
});

// ---------- 3. datumwisseling ----------

test("middernacht: vlak voor 00:00 geldig, vlak erna nooit oude namen", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 22:30:00", { end: "2026-10-04 23:59:59" })]),
    "eventparticipants/": () => ok([part(1, 11)]),
    "member/": () => member("Anouk", "Kok"),
  });
  const s = memStore();
  const late = new Date("2026-10-04T21:59:30Z"); // 23:59:30 CEST: buiten venster -> skipped
  const early = new Date("2026-10-04T20:55:00Z"); // 22:55 CEST: binnen venster
  const r = await lib.refresh(s, { force: true, now: early });
  assert.equal(r.status, "ok");
  assert.match(lib.pageFor(s.m.page, late), /Anouk K\./); // 23:59:30 zelfde dag: nog geldig
  const after = new Date("2026-10-04T22:00:30Z"); // 00:00:30 5 oktober CEST
  const html = lib.pageFor(s.m.page, after);
  assert.doesNotMatch(html, /Anouk/);
  assert.match(html, /Nog geen actuele gegevens/);
});

test("stale blob van gisteren: neutrale pagina, ook na de eerste run zonder lessen", async () => {
  const s = memStore();
  s.m.page = { html: "<li>Anouk K.</li>", updatedAt: D.getTime() - 20 * 3600e3, date: "2026-10-03" };
  assert.doesNotMatch(lib.pageFor(s.m.page, D), /Anouk/);
  mockApi({ "events/": () => ok([]) }); // lege eerste run van een nieuwe dag
  const r = await lib.refresh(s, { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.match(lib.pageFor(s.m.page, D), /Vandaag geen groepslessen/);
  assert.doesNotMatch(lib.pageFor(s.m.page, D), /Anouk/);
});

test("te oude data van vandaag (> 2 uur) wordt niet meer getoond", () => {
  const rec = { html: "<li>Anouk K.</li>", updatedAt: D.getTime() - 3 * 3600e3, date: "2026-10-04" };
  assert.doesNotMatch(lib.pageFor(rec, D), /Anouk/);
  rec.updatedAt = D.getTime() - 3600e3;
  assert.match(lib.pageFor(rec, D), /Anouk/);
});

test("Amsterdamse datum rond midnight bij zomer- en wintertijd", () => {
  assert.equal(lib.amsterdamDate(new Date("2026-07-14T21:59:59Z")), "2026-07-14");
  assert.equal(lib.amsterdamDate(new Date("2026-07-14T22:00:00Z")), "2026-07-15");
  assert.equal(lib.amsterdamDate(new Date("2026-01-14T22:59:59Z")), "2026-01-14");
  assert.equal(lib.amsterdamDate(new Date("2026-01-14T23:00:00Z")), "2026-01-15");
});

// ---------- 4. API-fouten ----------

const base = { "events/": () => ok([ev("e1", "2026-10-04 10:00:00")]), "eventparticipants/": () => ok([part(1, 11)]), "member/": () => member("Anouk", "Kok") };

for (const [naam, mk, cat, calls] of [
  ["500", () => resp({}, { status: 500 }), "http_5xx", 3],
  ["502", () => resp({}, { status: 502 }), "http_5xx", 3],
  ["429", () => resp({}, { status: 429, headers: { "retry-after": "1" } }), "http_429", 3],
  ["kapotte JSON", () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => { throw new SyntaxError("x"); } }), "bad_json", 3],
  ["rate limit in status (421)", () => resp({ status: { statuscode: 421 }, result: [] }), "rate_limited", 1],
]) {
  test(`events-call faalt: ${naam} -> retries/geen crash, vorige pagina blijft, geen geheimen in log`, async () => {
    const logs = [];
    const origLog = console.log; console.log = (x) => logs.push(String(x));
    try {
      const c = mockApi({ ...base, "events/": mk });
      const s = memStore();
      s.m.page = { html: "<li>Piet P.</li>", updatedAt: D.getTime() - 5 * 60e3, date: "2026-10-04" };
      const r = await lib.refresh(s, { force: true, now: D });
      assert.equal(r.status, "error");
      assert.equal(r.category, cat);
      assert.equal(c.length, calls);
      assert.equal(s.m.page.html, "<li>Piet P.</li>"); // niet overschreven
      assert.match(lib.pageFor(s.m.page, D), /Piet P\./); // van vandaag: mag blijven
      assert.ok(s.m.lock.ttl >= 120000); // afkoelen: geen API-storm
      assert.doesNotMatch(logs.join("\n"), /TESTKEY|TESTSECRET|api_key|club_secret/);
    } finally { console.log = origLog; }
  });
}

test("timeout: fetch hangt tot abort -> categorie timeout, retries, geen crash", async () => {
  const c = mockApi({
    ...base,
    "events/": ({ signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => { const e = new Error("a"); e.name = "AbortError"; rej(e); })),
  });
  const orig = globalThis.setTimeout;
  globalThis.setTimeout = (fn, ms, ...a) => orig(fn, Math.min(ms, 5), ...a); // timeouts versnellen
  try {
    const r = await lib.refresh(memStore(), { force: true, now: D });
    assert.equal(r.status, "error");
    assert.equal(r.category, "timeout");
    assert.equal(c.length, 3);
  } finally { globalThis.setTimeout = orig; }
});

test("429 daarna succes: retry herstelt", async () => {
  mockApi({ ...base, "events/": ({ n }) => (n === 1 ? resp({}, { status: 429 }) : ok([ev("e1", "2026-10-04 10:00:00")])) });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
});

test("lock voorkomt storm: tweede (niet-geforceerde) refresh direct na fout doet geen calls", async () => {
  const c = mockApi({ ...base, "events/": () => resp({}, { status: 500 }) });
  const s = memStore();
  await lib.refresh(s, { force: true, now: D });
  const before = c.length;
  const r = await lib.refresh(s, { trigger: "lazy", now: new Date(D.getTime() + 20e3) });
  assert.equal(r.status, "locked");
  assert.equal(c.length, before);
});

test("een participants-call faalt: les toont 'Namen tijdelijk niet beschikbaar' met attendees", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00", { attendees: 7 }), ev("e2", "2026-10-04 11:00:00", { attendees: 1 })]),
    "eventparticipants/": ({ params }) => (params.event_id === "e1" ? resp({}, { status: 500 }) : ok([part(1, 11)])),
    "member/": () => member("Anouk", "Kok"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.match(r.rec.html, /7 \/ 16 deelnemers/);
  assert.match(r.rec.html, /Namen tijdelijk niet beschikbaar/);
  assert.match(r.rec.html, /Anouk K\./); // andere les blijft normaal
});

test("member-call faalt: naam 'tijdelijk niet beschikbaar', niet gecachet, geen 'Lid' verzinsel", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00")]),
    "eventparticipants/": () => ok([part(1, 11), part(2, 12)]),
    "member/": ({ path }) => (path.endsWith("/11") ? member("Anouk", "Kok") : resp({}, { status: 500 })),
  });
  const s = memStore();
  const r = await lib.refresh(s, { force: true, now: D });
  assert.equal(r.status, "ok");
  assert.match(r.rec.html, /Anouk K\./);
  assert.match(r.rec.html, /\+ 1 naam tijdelijk niet beschikbaar/);
  assert.match(r.rec.html, /2 \/ 16 deelnemers/);
  assert.equal(s.m.names["12"], undefined); // fout niet gecachet
});

test("member niet gevonden (420) wordt neutraal 'Lid' en eenmalig gecachet", async () => {
  const c = mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00")]),
    "eventparticipants/": () => ok([part(1, 11)]),
    "member/": () => resp({ status: { statuscode: 420 } }),
  });
  const s = memStore();
  await lib.refresh(s, { force: true, now: D });
  assert.equal(s.m.names["11"].n, "Lid");
  c.length = 0;
  await lib.refresh(s, { force: true, now: new Date(D.getTime() + 600e3) });
  assert.equal(c.filter((x) => x.path.startsWith("member/")).length, 0);
});

// ---------- 5. cache + privacy ----------

test("cache bevat alleen afgeschermde naam + tijd; TTL, naamswijziging en prune", async () => {
  let achternaam = "kok";
  let dag = "2026-10-04";
  const c = mockApi({
    "events/": () => ok([ev("e1", `${dag} 10:00:00`, { end: `${dag} 23:30:00` })]),
    "eventparticipants/": () => ok([part(1, 11)]),
    "member/": () => member("anouk", achternaam),
  });
  const s = memStore();
  await lib.refresh(s, { force: true, now: D });
  assert.deepEqual(Object.keys(s.m.names["11"]).sort(), ["n", "t"]);
  assert.equal(s.m.names["11"].n, "Anouk K.");
  const dump = JSON.stringify(s.m);
  assert.doesNotMatch(dump, /kok|geheim@example|0612345678/i);
  // gecachet: geen member-call
  c.length = 0;
  await lib.refresh(s, { force: true, now: new Date(D.getTime() + 3600e3) });
  assert.equal(c.filter((x) => x.path.startsWith("member/")).length, 0);
  // na TTL (24u) + naamswijziging: opnieuw opgehaald en bijgewerkt
  achternaam = "Maas";
  dag = "2026-10-05";
  c.length = 0;
  await lib.refresh(s, { force: true, now: new Date(D.getTime() + 25 * 3600e3) });
  assert.equal(c.filter((x) => x.path.startsWith("member/")).length, 1);
  assert.equal(s.m.names["11"].n, "Anouk M.");
  // ongebruikte oude entries verdwijnen (> 14 dagen)
  s.m.names["999"] = { n: "Oud O.", t: D.getTime() - 20 * 86400e3 };
  await lib.refresh(s, { force: true, now: new Date(D.getTime() + 26 * 3600e3) });
  assert.equal(s.m.names["999"], undefined);
});

test("HTML bevat geen member-id, volledige naam, e-mail, telefoon, secrets of JSON; geen commentaar", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00")]),
    "eventparticipants/": () => ok([part(1, 59200112), part(2, 0, { user_name: "jan van der berg" })]),
    "member/": () => member("anouk", "Kokkelmans"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  const h = r.rec.html;
  assert.doesNotMatch(h, /59200112|Kokkelmans|kokkelmans|geheim@|0612345678|TESTKEY|TESTSECRET|member_id|api_key|club_secret|"result"|event_participant/);
  assert.doesNotMatch(h, /<!--/);
  assert.match(h, /Anouk K\./);
  assert.match(h, /Jan B\./); // gast: voornaam + initiaal van laatste deel
  assert.match(h, /noindex,nofollow/);
});

test("HTML-escaping van titels en namen", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00", { title: "<img src=x onerror=alert(1)>" })]),
    "eventparticipants/": () => ok([part(1, 11)]),
    "member/": () => member("<b>x", "y"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.doesNotMatch(r.rec.html, /<img src=x|<b>x/);
});

// ---------- 8. logging + 9. performance ----------

test("normale gecachete run: 1 events-call + 1 participants-call per les, 0 member-calls; log zonder namen/ids/geheimen", async () => {
  const c = mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00"), ev("e2", "2026-10-04 19:00:00")]),
    "eventparticipants/": () => ok([part(1, 11), part(2, 12)]),
    "member/": ({ path }) => member(path.endsWith("/11") ? "Anouk" : "Piet", "Kok"),
  });
  const s = memStore();
  await lib.refresh(s, { force: true, now: D }); // koude run vult cache
  c.length = 0;
  const logs = [];
  const origLog = console.log; console.log = (x) => logs.push(String(x));
  try {
    const r = await lib.refresh(s, { force: true, now: new Date(D.getTime() + 600e3) });
    assert.equal(r.calls, 3);
    assert.equal(c.filter((x) => x.path === "events/").length, 1);
    assert.equal(c.filter((x) => x.path === "eventparticipants/").length, 2);
    assert.equal(c.filter((x) => x.path.startsWith("member/")).length, 0);
  } finally { console.log = origLog; }
  const line = JSON.parse(logs.find((l) => l.includes("wdem_refresh")));
  assert.equal(line.status, "ok");
  assert.equal(line.lessen, 2);
  assert.equal(line.deelnemers, 4);
  assert.equal(line.calls, 3);
  assert.equal(line.cacheHit, 2);
  assert.equal(line.cacheMiss, 0);
  assert.ok(typeof line.ms === "number" && /^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(line.ams));
  assert.doesNotMatch(logs.join("\n"), /Anouk|Piet|Kok|"11"|"12"|TESTKEY|TESTSECRET|api_key|club_secret/);
});

test("geannuleerde lessen en lessen van andere dagen worden uitgesloten", async () => {
  mockApi({
    "events/": () => ok([
      ev("e1", "2026-10-04 10:00:00", { canceled: true }),
      ev("e2", "2026-10-05 10:00:00"),
      ev("e3", "2026-10-04 12:00:00"),
    ]),
    "eventparticipants/": () => ok([]),
  });
  const r = await lib.refresh(memStore(), { force: true, now: D });
  assert.equal(r.rec.lessen, 1);
  assert.match(r.rec.html, /12:00/);
  assert.match(r.rec.html, /Nog niemand ingeschreven/);
});
