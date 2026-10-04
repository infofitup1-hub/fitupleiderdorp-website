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

// ---------- 4. BuddyCheck: weekoverzicht (7 dagen) ----------

const DATES = ["2026-07-15", "2026-07-16", "2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21"];
const weekData = (over = {}) => ({
  today: "2026-07-15",
  days: DATES.map((date, i) => ({
    date,
    lessen: i === 0 ? [L("2026-07-15 20:30:00", "2026-07-15 21:30:00", { title: "NACHT" })]
      : i === 1 ? [L("2026-07-16 07:00:00", "2026-07-16 08:00:00", { title: "OCHTEND", namen: ["Piet P."], aantal: 1, max: 12 })]
      : i === 3 ? [L("2026-07-18 10:00:00", "2026-07-18 11:00:00", { title: "ZATERDAGSPECIAL", namen: ["Jan B."], aantal: 12, max: 12 })]
      : [],
  })),
  ...over,
});
const body = (h) => h.split("</head>")[1];
const MID = "2026-07-15T10:00:00Z"; // 12:00 CEST

test("weekoverzicht: 7 dagsecties in volgorde Vandaag, Morgen, dan de overige dagen", () => {
  const h = body(render(weekData(), MID));
  const heads = [...h.matchAll(/<h2 class="day-h[^"]*">([^<]*)<span>([^<]*)<\/span>/g)].map((m) => `${m[1]}|${m[2]}`);
  assert.deepEqual(heads, [
    "Vandaag|woensdag 15 juli", "Morgen|donderdag 16 juli", "vrijdag|17 juli", "zaterdag|18 juli",
    "zondag|19 juli", "maandag|20 juli", "dinsdag|21 juli",
  ]);
  assert.equal((h.match(/<section class="day/g) || []).length, 7);
  assert.ok(h.indexOf("NACHT") < h.indexOf("OCHTEND") && h.indexOf("OCHTEND") < h.indexOf("ZATERDAGSPECIAL"));
});

test("dagen zonder lessen: compacte regel 'Geen lessen.', geen lege kaarten", () => {
  const h = body(render(weekData(), MID));
  assert.equal((h.match(/class="note">Geen lessen\.<\/p>/g) || []).length, 4); // vr, zo, ma, di
  assert.equal((h.match(/<article/g) || []).length, 3); // NACHT, OCHTEND, ZATERDAGSPECIAL
});

test("vandaag: lopende en toekomstige lessen zichtbaar, afgelopen verborgen; andere dagen onaangetast", () => {
  const data = weekData();
  data.days[0].lessen = [
    L("2026-07-15 09:00:00", "2026-07-15 10:00:00", { title: "AFGELOPEN" }),
    L("2026-07-15 11:30:00", "2026-07-15 12:30:00", { title: "LOPEND" }), // 12:00 = bezig
    L("2026-07-15 18:00:00", "2026-07-15 19:00:00", { title: "TOEKOMST" }),
  ];
  const h = body(render(data, MID));
  assert.doesNotMatch(h, /AFGELOPEN/);
  assert.match(h, /LOPEND/);
  assert.match(h, /TOEKOMST/);
  assert.match(h, /OCHTEND/); // morgen ongemoeid
});

test("vandaag alles voorbij: 'Geen lessen meer vandaag.'; vandaag zonder lessen: 'Vandaag geen groepslessen.'", () => {
  assert.match(body(render(weekData(), "2026-07-15T20:00:00Z")), /Geen lessen meer vandaag\./); // 22:00 CEST
  const leeg = weekData();
  leeg.days[0].lessen = [];
  assert.match(body(render(leeg, MID)), /Vandaag geen groepslessen\./);
});

test("vrije plekken en Vol per kaart in het weekoverzicht", () => {
  const h = body(render(weekData(), MID));
  assert.match(h, /OCHTEND[\s\S]*?1 \/ 12 deelnemers &middot; <span class="free">11 plekken vrij/);
  assert.match(h, /<h3>ZATERDAGSPECIAL<\/h3><span class="badge">Vol<\/span>/);
});

test("lange lesnamen en lange namen breken af (geen horizontale scroll)", () => {
  const data = weekData();
  data.days[1].lessen[0] = L("2026-07-16 07:00:00", "2026-07-16 08:00:00", {
    title: "SUPERLANGELESNAAMZONDERSPATIESDIEOPMOBIELNIETPAST EN NOG EEN HEEL LANG VERVOLG",
    namen: ["Maximiliaanvanderheijdenstein-Oosterhuis Z."],
  });
  const h = render(data, MID);
  const css = h.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.match(css, /\.card h3\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /li\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /ul\{[^}]*flex-wrap:wrap/);
  assert.match(h, /SUPERLANGELESNAAMZONDERSPATIES/);
});

test("branding: overal BuddyCheck met subtitel; geen 'Wie doet er mee' meer", () => {
  for (const h of [render(weekData(), MID), lib.STALE_HTML]) {
    assert.match(h, /<title>BuddyCheck - Fit Up<\/title>/);
    assert.match(h, /<h1>Buddy<em>Check<\/em><\/h1>/);
    assert.match(h, /Check wie er bij jouw groepsles staat ingeschreven\./);
    assert.doesNotMatch(h, /Wie doet er mee/);
  }
});

test("huisstijl: Barlow Condensed + DM Sans, Fit Up-tokens, 16px basis", () => {
  const h = render(weekData(), MID);
  assert.match(h, /fonts\.googleapis\.com\/css2\?family=Barlow\+Condensed[^"]*DM\+Sans[^"]*display=swap/);
  assert.match(h, /--black:#080A09/);
  assert.match(h, /--soft:#101311/);
  assert.match(h, /--lime:#B7F229/);
  assert.match(h, /--fd:'Barlow Condensed'/);
  assert.match(h, /--fb:'DM Sans'/);
  assert.match(h, /font:400 16px\/1\.55 var\(--fb\)/);
  assert.doesNotMatch(h.replace(/\.foot\{[^}]*\}/, ""), /font-size:\s*1[0-5]px/); // geen informatieve tekst onder 16px (alleen de voettekst is 14px)
});

test("record van voor de weekweergave ({today, lessen}) blijft renderbaar als 1 dag", () => {
  const h = body(lib.buildHtml({ today: "2026-07-15", lessen: [L("2026-07-15 18:00:00", "2026-07-15 19:00:00", { title: "OUD" })] }, new Date(MID)));
  assert.match(h, /OUD/);
  assert.equal((h.match(/<section class="day/g) || []).length, 1);
});

test("mobiele render: geen vaste breedtes, geen nowrap, viewport, flex-wrap", () => {
  const h = render(weekData(), MID);
  assert.match(h, /name="viewport" content="width=device-width,initial-scale=1/);
  const css = h.match(/<style>([\s\S]*?)<\/style>/)[1];
  assert.doesNotMatch(css, /min-width:\s*[1-9]|white-space:\s*nowrap|[^-]width:\s*\d{3,}px/);
  assert.match(css, /main\{max-width:560px/);
  assert.match(css, /\.card header\{[^}]*min-width:0/);
});

// ---------- 5. API: 7 dagen in 1 call, hergebruik, foutisolatie ----------

const WEEK_EVENTS = [
  ev("t1", "2026-07-15 18:00:00", "2026-07-15 19:00:00", { attendees: 2 }), // vandaag, live
  ev("t2", "2026-07-15 20:00:00", "2026-07-15 21:00:00", { attendees: 0 }), // vandaag: altijd vers, ook zonder aanmeldingen
  ev("m1", "2026-07-16 07:00:00", "2026-07-16 08:00:00", { attendees: 3 }),
  ev("m2", "2026-07-16 09:00:00", "2026-07-16 10:00:00", { attendees: 0 }), // morgen, leeg -> geen call
  ev("d3", "2026-07-18 10:00:00", "2026-07-18 11:00:00", { attendees: 1 }),
  ev("d7", "2026-07-21 10:00:00", "2026-07-21 11:00:00", { attendees: 1 }),
  ev("x8", "2026-07-22 10:00:00", "2026-07-22 11:00:00", { attendees: 1 }), // dag 8: buiten venster
];
const WEEK_H = (over = {}) => ({
  "events/": () => ok(WEEK_EVENTS),
  "eventparticipants/": () => ok([part(1, 11)]),
  "member/": () => member("anouk", "kok"),
  ...over,
});
const T0 = new Date("2026-07-15T14:00:00Z"); // 16:00 CEST

test("events-call dekt exact 7 kalenderdagen (zomertijd) en er is er maar 1", async () => {
  const c = mockApi(WEEK_H());
  await lib.refresh(memStore(), { force: true, now: T0 });
  const evc = c.filter((x) => x.path === "events/");
  assert.equal(evc.length, 1);
  assert.equal(new Date(Number(evc[0].params.timestamp_start) * 1000).toISOString(), "2026-07-14T22:00:00.000Z"); // 00:00 CEST 15 juli
  assert.equal(new Date(Number(evc[0].params.timestamp_end) * 1000).toISOString(), "2026-07-21T22:00:00.000Z"); // 00:00 CEST 22 juli
});

test("venster in wintertijd en over de omschakeldag blijft 7 kalenderdagen", async () => {
  const c = mockApi({ ...WEEK_H(), "events/": () => ok([]) });
  await lib.refresh(memStore(), { force: true, now: new Date("2026-10-22T10:00:00Z") }); // loopt over 25 okt (CEST -> CET)
  const p = c.find((x) => x.path === "events/").params;
  assert.equal(new Date(Number(p.timestamp_start) * 1000).toISOString(), "2026-10-21T22:00:00.000Z");
  assert.equal(new Date(Number(p.timestamp_end) * 1000).toISOString(), "2026-10-28T23:00:00.000Z"); // 7 dagen, 25u dag erin
});

test("week: dag 8 genegeerd; lege toekomstige lessen zonder call; vandaag altijd vers", async () => {
  const c = mockApi(WEEK_H());
  const r = await lib.refresh(memStore(), { force: true, now: T0 });
  assert.equal(r.status, "ok");
  const ids = c.filter((x) => x.path === "eventparticipants/").map((x) => x.params.event_id).sort();
  assert.deepEqual(ids, ["d3", "d7", "m1", "t1", "t2"]); // m2 (0 aanmeldingen, morgen) en x8 (dag 8) niet
  assert.equal((r.rec.html.match(/<section class="day/g) || []).length, 7);
});

test("hergebruik: tweede run direct erna haalt alleen vandaag opnieuw op; wijziging aantal => opnieuw", async () => {
  const s = memStore();
  const c = mockApi(WEEK_H());
  await lib.refresh(s, { force: true, now: T0 }); // koude run
  c.length = 0;
  const r2 = await lib.refresh(s, { force: true, now: new Date(T0.getTime() + 600e3) }); // +10 min
  const ids = c.filter((x) => x.path === "eventparticipants/").map((x) => x.params.event_id).sort();
  assert.deepEqual(ids, ["t1", "t2"]); // alleen vandaag; morgen en later uit cache
  assert.equal(c.filter((x) => x.path.startsWith("member/")).length, 0);
  assert.equal(r2.calls, 3); // 1 events + 2 vandaag
  // aantal aanmeldingen wijzigt (gratis zichtbaar in events): die les wordt opnieuw opgehaald
  c.length = 0;
  WEEK_EVENTS.find((e) => e.event_id === "d3").attendees = 2;
  await lib.refresh(s, { force: true, now: new Date(T0.getTime() + 1200e3) });
  assert.ok(c.some((x) => x.params.event_id === "d3"));
  WEEK_EVENTS.find((e) => e.event_id === "d3").attendees = 1;
});

test("TTL: morgen na 20 min, latere dagen na 90 min opnieuw", async () => {
  const s = memStore();
  const c = mockApi(WEEK_H());
  await lib.refresh(s, { force: true, now: T0 });
  c.length = 0;
  await lib.refresh(s, { force: true, now: new Date(T0.getTime() + 21 * 60e3) });
  const ids21 = c.filter((x) => x.path === "eventparticipants/").map((x) => x.params.event_id);
  assert.ok(ids21.includes("m1") && !ids21.includes("d3"));
  c.length = 0;
  await lib.refresh(s, { force: true, now: new Date(T0.getTime() + 91 * 60e3) });
  const ids91 = c.filter((x) => x.path === "eventparticipants/").map((x) => x.params.event_id);
  assert.ok(ids91.includes("d3") && ids91.includes("d7"));
});

test("een les (morgen) faalt: alleen die les toont 'Namen tijdelijk niet beschikbaar', rest en vandaag normaal", async () => {
  mockApi(WEEK_H({ "eventparticipants/": ({ params }) => (params.event_id === "m1" ? resp({}, 500) : ok([part(1, 11)])) }));
  const s = memStore();
  const r = await lib.refresh(s, { force: true, now: T0 });
  assert.equal(r.status, "ok");
  const h = r.rec.html;
  assert.match(h, /Namen tijdelijk niet beschikbaar/);
  assert.match(h, /3 \/ 12 deelnemers/); // aantal van Virtuagym
  assert.match(h, /Anouk K\./); // andere lessen
  assert.equal(Boolean(s.m.lessons?.m1?.ok), false); // mislukte les wordt niet als goed gecachet
});

test("hele events-call faalt: vorige pagina van vandaag blijft, geen crash", async () => {
  mockApi(WEEK_H({ "events/": () => resp({}, 502) }));
  const s = memStore();
  s.m.page = { html: "<li>Piet P.</li>", data: weekData(), updatedAt: T0.getTime() - 5 * 60e3, date: "2026-07-15" };
  const r = await lib.refresh(s, { force: true, now: T0 });
  assert.equal(r.status, "error");
  assert.match(lib.pageFor(s.m.page, new Date(T0.getTime() + 60e3)), /NACHT|OCHTEND/);
});

test("koude week-start blijft binnen het call-budget; gecachete week-run is klein", async () => {
  const many = [];
  for (let d = 0; d < 7; d++) for (let k = 0; k < 6; k++) many.push(ev(`e${d}${k}`, `2026-07-${15 + d} 1${k}:00:00`, `2026-07-${15 + d} 1${k}:50:00`, { attendees: 5 }));
  mockApi({
    "events/": () => ok(many),
    "eventparticipants/": ({ params }) => ok([1, 2, 3, 4, 5].map((n) => part(Number(params.event_id.slice(1)) * 10 + n, 100 + n))),
    "member/": () => member("anouk", "kok"),
  });
  const s = memStore();
  const cold = await lib.refresh(s, { force: true, now: new Date("2026-07-15T05:00:00Z") }); // 07:00 CEST, alles nog komend
  assert.equal(cold.status, "ok");
  assert.ok(cold.calls <= 250, `koud: ${cold.calls}`);
  const warm = await lib.refresh(s, { force: true, now: new Date("2026-07-15T05:10:00Z") });
  assert.equal(warm.calls, 1 + 6); // 1 events + 6 lessen van vandaag; rest uit cache
});

test("per-les cache bevat alleen afgeschermde namen (geen ids, volledige namen, e-mail)", async () => {
  mockApi(WEEK_H({ "member/": () => member("anouk", "Kokkelmans") }));
  const s = memStore();
  await lib.refresh(s, { force: true, now: T0 });
  const dump = JSON.stringify(s.m.lessons);
  assert.doesNotMatch(dump, /Kokkelmans|x@y\.z|member_id/);
  assert.match(dump, /Anouk K\./);
});

// ---------- 6. privacy ----------

test("privacy: geen lid-id, volledige naam, JSON of API-data in de HTML; noindex", async () => {
  mockApi({
    "events/": () => ok([ev("e1", "2026-07-15 18:00:00", "2026-07-15 19:00:00"), ev("m1", "2026-07-16 07:00:00", "2026-07-16 08:00:00")]),
    "eventparticipants/": () => ok([part(1, 59200112)]),
    "member/": () => member("anouk", "Kokkelmans"),
  });
  const r = await lib.refresh(memStore(), { force: true, now: T0 });
  assert.doesNotMatch(r.rec.html, /59200112|Kokkelmans|x@y\.z|TESTKEY|TESTSECRET|member_id|api_key|club_secret|"result"|<!--/);
  assert.match(r.rec.html, /Anouk K\./);
  assert.match(r.rec.html, /noindex,nofollow/);
});
