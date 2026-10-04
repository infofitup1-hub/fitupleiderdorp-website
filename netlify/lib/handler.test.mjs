// Security-tests voor de publieke handler. Draai met: node --test netlify/lib/handler.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const TOKEN = "t".repeat(64);
const HASH = createHash("sha256").update(TOKEN).digest("hex");

globalThis.Netlify = {
  env: { get: (k) => (k === "WDEM_VIEW_TOKEN_SHA256" ? HASH : undefined) },
  context: { deploy: { context: "dev" } },
};

const { default: handler, config } = await import("../functions/wie-doet-er-mee.mjs");
const get = (qs = "", method = "GET") => handler(new Request(`https://x.test/wie-doet-er-mee/${qs}`, { method }));

test("zonder token: 403, geen gegevens", async () => {
  const r = await get();
  assert.equal(r.status, 403);
  assert.match(await r.text(), /Geen toegang/);
});

test("verkeerd / leeg / te kort token: 403", async () => {
  for (const q of ["?access=nope", "?access=", `?access=${"x".repeat(64)}`, `?access=${TOKEN}x`, `?access=${TOKEN.slice(1)}`]) {
    assert.equal((await get(q)).status, 403, q);
  }
});

test("correct token: 200, text/html, noindex, no-store, geen stacktrace (store niet beschikbaar -> neutrale pagina)", async () => {
  const r = await get(`?access=${TOKEN}`);
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /^text\/html; charset=utf-8$/);
  assert.match(r.headers.get("x-robots-tag"), /noindex/);
  assert.match(r.headers.get("cache-control"), /no-store/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  const t = await r.text();
  assert.doesNotMatch(t, /Error|at .*\.mjs|node_modules|Cannot find|stack/i);
  assert.match(t, /Nog geen actuele gegevens/);
});

test("schrijven kan niet: POST/PUT/DELETE -> 405, ook met geldig view-token", async () => {
  for (const m of ["POST", "PUT", "DELETE", "PATCH"]) {
    const r = await handler(new Request(`https://x.test/wie-doet-er-mee/?access=${TOKEN}`, { method: m, body: "<!DOCTYPE html>x" }));
    assert.equal(r.status, 405, m);
  }
});

test("HEAD zonder token 403, met token 200 en zonder body", async () => {
  assert.equal((await get("", "HEAD")).status, 403);
  const r = await get(`?access=${TOKEN}`, "HEAD");
  assert.equal(r.status, 200);
  assert.equal(await r.text(), "");
});

test("alleen de twee publieke paden; geen upload-route", () => {
  assert.deepEqual(config.path, ["/wie-doet-er-mee", "/wie-doet-er-mee/"]);
});
