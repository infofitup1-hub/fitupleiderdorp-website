// UX-tests: afgelopen lessen verbergen, vrije plekken/Vol, morgen vanaf 20:00.
// Draai met: node --test netlify/lib/wdem-ux.test.mjs
import test from "node:test";
import assert from "node:assert/strict";

globalThis.Netlify = {
  env: { get: (k) => (k === "VIRTUAGYM_API_KEY" ? "TESTKEY-111" : k === "VIRTUAGYM_CLUB_SECRET" ? "TESTSECRET-222" : undefined) },
  context: { deploy: { context: "dev" } },
};
const lib = await import("./wdem.mjs");
lib._hooks.sleep = async () => {};
const realFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = realFetch; });

function memStore() {
  const m = {};
  return { m, get: async (k) => (k in m ? JSON.parse(JSON.stringify(m[k])) : null), setJSON: async (k, v) => { m[k] = JSON.parse(JSON.stringify(v)); } };
}
const resp = (body, status = 200) => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => body });
const ok = (result, st = {}) => resp({ status: { statuscode: 200, result_count: result.length, results_remaining: 0, ...st }, result });
function mockApi(handlers) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url));
    const path = u.pathname.replace(/^\/api\/v1\/club\/\d+\//, "");
    const params = Object.fromEntries(u.searchParams);
    calls.push({ path, params });
    const key = Object.keys(handlers).find((k) => path.startsWith(k));
    if (!key) throw new Error("unmocked " + path);
    return handlers[key]({ path, params });
  };
  return calls;
}
const L = (start, end, extra = {}) => ({ start, end, title: "HIIT", namen: ["Anouk K."], aantal: 1, max: 12, onbekend: 0, namenBeschikbaar: true, ...extra });
const ev = (id, start, end, extra = {}) => ({ event_id: id, title: "HIIT", start, end, canceled: false, max_places: 12, attendees: 1, ...extra });
const part = (id, mid) => ({ event_participant_id: id, member_id: mid, user_name: "" });
const member = (f, l) => ok([{ firstname: f, lastname: l, email: "x@y.z" }]);
const render = (data, iso) => lib.buildHtml(data, new Date(iso));

// ---------- 1. afgelopen lessen (Europe/Amsterdam) ----------

test("les vóór start / tijdens / exact op einde / ná einde (zomertijd)", () => {
  const data = { today: "2026-07-15", lessen: [L("2026-07-15 09:00:00", "2026-07-15 10:00:00")] };
  assert.match(render(data, "2026-07-15T06:59:00Z"), /Anouk K\./); // 08:59 CEST: vóór start
  assert.match(render(data, "2026-07-15T07:30:00Z"), /Anouk K\./); // 09:30: bezig
  assert.match(render(data, "2026-07-15T07:59:59Z"), /Anouk K\./); // 09:59:59: nog bezig
  assert.doesNotMatch(render(data, "2026-07-15T08:00:00Z"), /Anouk K\./); // 10:00:00 exact einde: weg
  assert.doesNotMatch(render(data, "2026-07-15T08:01:00Z"), /Anouk K\./); // erna: weg
});

test("les vóór start / tijdens / exact op einde / ná einde (wintertijd)", () => {
  const data = { today: "2026-01-15", lessen: [L("2026-01-15 09:00:00", "2026-01-15 10:00:00")] };
  assert.match(render(data, "2026-01-15T07:59:00Z"), /Anouk K\./); // 08:59 CET
  assert.match(render(data, "2026-01-15T08:30:00Z"), /Anouk K\./); // 09:30
  assert.doesNotMatch(render(data, "2026-01-15T09:00:00Z"), /Anouk K\./); // 10:00 exact
  assert.doesNotMatch(render(data, "2026-01-15T09:01:00Z"), /Anouk K\./);
});

test("omschakeldagen: vergelijking blijft op Amsterdamse wandklok", () => {
  const spring = { today: "2026-03-29", lessen: [L("2026-03-29 09:00:00", "2026-03-29 10:00:00")] };
  assert.match(render(spring, "2026-03-29T07:30:00Z"), /Anouk K\./); // 09:30 CEST
  assert.doesNotMatch(render(spring, "2026-03-29T08:00:00Z"), /Anouk K\./); // 10:00 CEST
  const fall = { today: "2026-10-25", lessen: [L("2026-10-25 09:00:00", "2026-10-25 10:00:00")] };
  assert.match(render(fall, "2026-10-25T08:30:00Z"), /Anouk K\./); // 09:30 CET
  assert.doesNotMatch(render(fall, "2026-10-25T09:00:00Z"), /Anouk K\./); // 10:00 CET
});

test("les zonder eindtijd: 60 minuten na start", () => {
  assert.equal(lib.lessonEnd({ start: "2026-07-15 09:00:00" }), "2026-07-15 10:00:00");
  assert.equal(lib.lessonEnd({ start: "2026-07-15 23:30:00" }), "2026-07-16 00:30:00");
});

test("alle lessen afgelopen: nette melding, andere melding dan 'geen lessen vandaag'", () => {
  const data = { today: "2026-07-15", lessen: [L("2026-07-15 09:00:00", "2026-07-15 10:00:00")] };
  const h = render(data, "2026-07-15T12:00:00Z");
  assert.match(h, /Geen lessen meer vandaag/);
  assert.doesNotMatch(h, /Anouk/);
  assert.match(render({ today: "2026-07-15", lessen: [] }, "2026-07-15T12:00:00Z"), /Vandaag geen groepslessen/);
});

test("verbergen gebeurt per bezoek: record van 10:00 toont de les om 10:30, niet meer om 11:30", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00", "2026-10-04 11:00:00")]),
    "eventparticipants/": () => ok([part(1, 11)]),
    "member/": () => member("anouk", "kok"),
  });
  const s = memStore();
  const D = new Date("2026-10-04T08:00:00Z"); // 10:00 CEST
  await lib.refresh(s, { force: true, now: D });
  assert.match(lib.pageFor(s.m.page, new Date("2026-10-04T08:30:00Z")), /Anouk K\./);
  assert.doesNotMatch(lib.pageFor(s.m.page, new Date("2026-10-04T09:30:00Z")), /Anouk K\./);
});

// ---------- 2/3. vrije plekken en Vol ----------

// Alleen de body (zonder <style>), zodat CSS-klassenamen geen valse treffers geven.
const card = (l) => render({ today: "2026-07-15", lessen: [L("2026-07-15 18:00:00", "2026-07-15 19:00:00", l)] }, "2026-07-15T10:00:00Z").split("</head>")[1];

test("plekken vrij: meervoud, enkelvoud, vol, nooit negatief", () => {
  assert.match(card({ aantal: 6, max: 12 }), /6 \/ 12 deelnemers &middot; <span class="free">6 plekken vrij<\/span>/);
  assert.match(card({ aantal: 11, max: 12 }), /1 plek vrij/);
  assert.doesNotMatch(card({ aantal: 11, max: 12 }), /1 plekken/);
  const vol = card({ aantal: 12, max: 12 });
  assert.match(vol, /<span class="badge">Vol<\/span>/);
  assert.match(vol, /card is-full/);
  assert.doesNotMatch(vol, /plekken? vrij/);
  const over = card({ aantal: 14, max: 12 });
  assert.match(over, /<span class="badge">Vol<\/span>/);
  assert.doesNotMatch(over, />-\d|\s-\d|plekken? vrij/);
});

test("max_places ontbreekt: geen plekken/Vol verzinnen", () => {
  const h = card({ aantal: 4, max: 0 });
  assert.match(h, /4 deelnemers/);
  assert.doesNotMatch(h, /plekken? vrij|badge|class="bar"|\/ 0/);
});

test("onbetrouwbaar aantal (geen lijst, geen attendees): niets verzinnen", () => {
  const h = card({ aantal: null, max: 12, namenBeschikbaar: false, namen: [] });
  assert.match(h, /Aantal tijdelijk niet beschikbaar/);
  assert.doesNotMatch(h, /plekken? vrij|badge|\/ 12/);
});

test("onvolledige deelnemerslijst: vrije plekken op basis van Virtuagym attendees", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-10-04 10:00:00", "2026-10-04 11:00:00", { attendees: 9 })]),
    "eventparticipants/": () => ok([part(1, 11)], { results_remaining: 8 }), // geen cursor -> from_id; daarna leeg
    "member/": () => member("anouk", "kok"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: new Date("2026-10-04T08:00:00Z") });
  assert.match(r.rec.html, /9 \/ 12 deelnemers/);
  assert.match(r.rec.html, /3 plekken vrij/);
});

// ---------- 4. morgen vanaf 20:00 ----------

test("20:00-grens Europe/Amsterdam (zomer + winter)", () => {
  assert.equal(lib.showsTomorrow(new Date("2026-07-15T17:59:00Z")), false); // 19:59 CEST
  assert.equal(lib.showsTomorrow(new Date("2026-07-15T18:00:00Z")), true); // 20:00 CEST
  assert.equal(lib.showsTomorrow(new Date("2026-01-15T18:59:00Z")), false); // 19:59 CET
  assert.equal(lib.showsTomorrow(new Date("2026-01-15T19:00:00Z")), true); // 20:00 CET
});

const dayData = (extra = {}) => ({
  today: "2026-07-15",
  lessen: [L("2026-07-15 20:30:00", "2026-07-15 21:30:00", { title: "NACHT" })],
  tomorrow: { date: "2026-07-16", lessen: [L("2026-07-16 07:00:00", "2026-07-16 08:00:00", { title: "OCHTEND", namen: ["Piet P."] })] },
  ...extra,
});

test("vóór 20:00 geen morgen-sectie, vanaf 20:00 wel (met zelfde info + privacynamen)", () => {
  const before = render(dayData(), "2026-07-15T17:59:00Z");
  assert.doesNotMatch(before, /Morgen|OCHTEND|Piet/);
  const after = render(dayData(), "2026-07-15T18:00:00Z");
  assert.match(after, /<h2 class="sec">Morgen<span>donderdag 16 juli<\/span><\/h2>/);
  assert.match(after, /OCHTEND/);
  assert.match(after, /Piet P\./);
  assert.match(after, /1 \/ 12 deelnemers &middot; <span class="free">11 plekken vrij/);
  assert.ok(after.indexOf("NACHT") < after.indexOf("Morgen")); // vandaag eerst
});

test("morgen zonder lessen of zonder data: geen lege Morgen-sectie", () => {
  assert.doesNotMatch(render(dayData({ tomorrow: { date: "2026-07-16", lessen: [] } }), "2026-07-15T18:30:00Z"), /Morgen/);
  assert.doesNotMatch(render(dayData({ tomorrow: null }), "2026-07-15T18:30:00Z"), /Morgen/);
});

test("alles van vandaag voorbij, morgen wel: melding + morgen-sectie", () => {
  const h = render(dayData(), "2026-07-15T20:00:00Z"); // 22:00 CEST, NACHT 20:30-21:30 voorbij
  assert.match(h, /Geen lessen meer vandaag/);
  assert.match(h, /Hieronder staan de lessen van morgen/);
  assert.match(h, /OCHTEND/);
  assert.doesNotMatch(h, /NACHT/);
});

test("pagina van vóór 20:00 wordt na 20:00 ververst (needsRefresh), niet na 20:00-record", () => {
  const rec = { date: "2026-07-15", updatedAt: Date.parse("2026-07-15T17:55:00Z"), html: "x", withTomorrow: false };
  assert.equal(lib.needsRefresh(rec, new Date("2026-07-15T17:58:00Z")), false);
  assert.equal(lib.needsRefresh(rec, new Date("2026-07-15T18:01:00Z")), true);
  assert.equal(lib.needsRefresh({ ...rec, withTomorrow: true, updatedAt: Date.parse("2026-07-15T18:00:00Z") }, new Date("2026-07-15T18:05:00Z")), false);
});

// ---------- 7/8. API-efficiëntie en foutgedrag ----------

const HANDLERS = (tomorrowPartsFail = false) => ({
  "events/": ({ params }) => ok([
    ev("t1", "2026-07-15 20:30:00", "2026-07-15 21:30:00"),
    ev("m1", "2026-07-16 07:00:00", "2026-07-16 08:00:00"),
    ev("m2", "2026-07-16 18:00:00", "2026-07-16 19:00:00"),
  ]),
  "eventparticipants/": ({ params }) => (tomorrowPartsFail && params.event_id.startsWith("m") ? resp({}, 500) : ok([part(1, 11)])),
  "member/": () => member("anouk", "kok"),
});

test("calls vóór 20:00: 1 events + 1 participants per komende les; na 20:00: 1 events + vandaag-live + morgen", async () => {
  const s = memStore();
  const c = mockApi(HANDLERS());
  await lib.refresh(s, { force: true, now: new Date("2026-07-15T16:00:00Z") }); // 18:00 CEST: koude cache vullen
  c.length = 0;
  const before = await lib.refresh(s, { force: true, now: new Date("2026-07-15T16:10:00Z") }); // 18:10
  // vóór 20:00 zijn alleen de lessen van vandaag (1) relevant (morgen-events worden niet opgevraagd)
  assert.equal(before.calls, 2);
  assert.equal(c.filter((x) => x.path === "events/").length, 1);
  assert.equal(c.filter((x) => x.path.startsWith("member/")).length, 0);
  const win = c.find((x) => x.path === "events/").params;
  assert.equal(Number(win.timestamp_end) - Number(win.timestamp_start), 24 * 3600); // 1 dag

  c.length = 0;
  const after = await lib.refresh(s, { force: true, now: new Date("2026-07-15T18:10:00Z") }); // 20:10
  const ev2 = c.filter((x) => x.path === "events/");
  assert.equal(ev2.length, 1); // vandaag + morgen in 1 call
  assert.equal(Number(ev2[0].params.timestamp_end) - Number(ev2[0].params.timestamp_start), 48 * 3600);
  assert.equal(c.filter((x) => x.path === "eventparticipants/").length, 3); // t1 + m1 + m2
  assert.equal(c.filter((x) => x.path.startsWith("member/")).length, 0); // member-cache
  assert.equal(after.calls, 4);
  assert.match(after.rec.html, /Morgen/);
});

test("afgelopen lessen van vandaag kosten geen participants-call meer", async () => {
  const s = memStore();
  const c = mockApi(HANDLERS());
  const r = await lib.refresh(s, { force: true, now: new Date("2026-07-15T20:00:00Z") }); // 22:00: t1 voorbij
  assert.equal(c.filter((x) => x.path === "eventparticipants/").length, 2); // alleen morgen
  assert.match(r.rec.html, /Geen lessen meer vandaag/);
});

test("morgen-deelnemers falen: vandaag werkt, morgen toont neutrale status per les", async () => {
  mockApi(HANDLERS(true));
  const r = await lib.refresh(memStore(), { force: true, now: new Date("2026-07-15T18:10:00Z") });
  assert.equal(r.status, "ok");
  assert.match(r.rec.html, /Anouk K\./); // vandaag
  assert.match(r.rec.html, /Morgen/);
  assert.match(r.rec.html, /Namen tijdelijk niet beschikbaar/);
});

test("morgen-events ontbreken: geen Morgen-sectie, vandaag normaal", async () => {
  mockApi({
    ...HANDLERS(),
    "events/": () => ok([ev("t1", "2026-07-15 20:30:00", "2026-07-15 21:30:00")]),
  });
  const r = await lib.refresh(memStore(), { force: true, now: new Date("2026-07-15T18:10:00Z") });
  assert.equal(r.status, "ok");
  assert.doesNotMatch(r.rec.html, /Morgen/);
  assert.match(r.rec.html, /Anouk K\./);
});

test("events-call faalt na 20:00: bestaand gedrag (vorige pagina blijft, geen crash)", async () => {
  mockApi({ ...HANDLERS(), "events/": () => resp({}, 502) });
  const s = memStore();
  s.m.page = { html: "<li>Piet P.</li>", data: { today: "2026-07-15", lessen: [L("2026-07-15 20:30:00", "2026-07-15 21:30:00", { namen: ["Piet P."] })], tomorrow: null }, updatedAt: Date.parse("2026-07-15T18:00:00Z"), date: "2026-07-15", withTomorrow: true };
  const r = await lib.refresh(s, { force: true, now: new Date("2026-07-15T18:10:00Z") });
  assert.equal(r.status, "error");
  assert.match(lib.pageFor(s.m.page, new Date("2026-07-15T18:11:00Z")), /Piet P\./);
});

// ---------- 5/6. mobiel + privacy ----------

test("mobiele output: viewport, geen vaste breedtes/nowrap/min-width, wrap voor lange namen en titels", () => {
  const h = render(dayData(), "2026-07-15T18:30:00Z");
  assert.match(h, /name="viewport" content="width=device-width,initial-scale=1/);
  const css = h.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.doesNotMatch(css, /min-width:\s*[1-9]|white-space:\s*nowrap|[^-]width:\s*\d{3,}px/);
  assert.match(css, /box-sizing:border-box/);
  assert.match(css, /ul\{[^}]*flex-wrap:wrap/);
  assert.match(css, /overflow-wrap:anywhere/);
  assert.match(css, /main\{max-width:560px/);
});

test("privacy: geen lid-id, volledige naam, JSON of API-data in de HTML; noindex", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-07-15 20:30:00", "2026-07-15 21:30:00"), ev("m1", "2026-07-16 07:00:00", "2026-07-16 08:00:00")]),
    "eventparticipants/": () => ok([part(1, 59200112)]),
    "member/": () => member("anouk", "Kokkelmans"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: new Date("2026-07-15T18:10:00Z") });
  assert.doesNotMatch(r.rec.html, /59200112|Kokkelmans|x@y\.z|TESTKEY|TESTSECRET|member_id|api_key|club_secret|"result"|<!--/);
  assert.match(r.rec.html, /Anouk K\./);
  assert.match(r.rec.html, /noindex,nofollow/);
});
