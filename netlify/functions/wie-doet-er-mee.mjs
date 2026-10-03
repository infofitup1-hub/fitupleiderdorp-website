// "Wie doet er mee?" - toont de laatst gepubliceerde deelnemerspagina.
//
// Het lokale PowerShell-script haalt de Virtuagym-data op, bouwt het HTML-bestand
// (alleen voornaam + initiaal) en POST het hierheen. Deze functie doet zelf GEEN
// Virtuagym-call en kent geen Virtuagym-geheimen; alleen een apart upload-token
// (env var WDEM_PUBLISH_TOKEN) dat uitsluitend dat script gebruikt.
//
//   GET  /wie-doet-er-mee/      -> laatste HTML
//   POST /api/wie-doet-er-mee   -> nieuwe HTML opslaan (Authorization: Bearer <token>)

import { getStore, getDeployStore } from "@netlify/blobs";
import { timingSafeEqual } from "node:crypto";

const MAX_BYTES = 256 * 1024;

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
};

const FALLBACK_HTML = `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex,nofollow">
<title>Wie doet er mee? - Fit Up</title>
<style>body{margin:0;background:#080A09;color:#F4F5F1;font:16px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:32px 16px}main{max-width:560px;margin:0 auto}h1{font-size:30px;margin:0 0 8px}p{color:#A7ADA8;margin:0}</style>
</head><body><main><h1>Wie doet er mee?</h1><p>De inschrijvingen worden zo geladen. Probeer het over enkele minuten opnieuw.</p></main></body></html>`;

function store() {
  // Productiedata blijft gescheiden van previews/branch-deploys.
  if (Netlify.context?.deploy?.context === "production") {
    return getStore({ name: "wie-doet-er-mee", consistency: "strong" });
  }
  return getDeployStore("wie-doet-er-mee");
}

function tokenOk(header, expected) {
  if (!expected || expected.length < 24) return false;
  const given = (header || "").replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method === "GET" || req.method === "HEAD") {
    let html = null;
    try {
      html = await store().get("latest");
    } catch {
      html = null;
    }
    return new Response(req.method === "HEAD" ? null : html || FALLBACK_HTML, {
      status: 200,
      headers: PAGE_HEADERS,
    });
  }

  if (req.method === "POST") {
    const expected = Netlify.env.get("WDEM_PUBLISH_TOKEN");
    if (!tokenOk(req.headers.get("authorization"), expected)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.text();
    if (!body || Buffer.byteLength(body) > MAX_BYTES) {
      return new Response("Bad request", { status: 400 });
    }
    // Vangnet: alleen een volledige HTML-pagina, nooit iets met API-geheimen.
    if (!/^\s*<!DOCTYPE html>/i.test(body) || /club_secret|api_key/i.test(body)) {
      return new Response("Rejected", { status: 422 });
    }

    await store().set("latest", body);
    return new Response("ok", { status: 200, headers: { "Cache-Control": "no-store" } });
  }

  return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD, POST" } });
};

export const config = {
  path: ["/wie-doet-er-mee", "/wie-doet-er-mee/", "/api/wie-doet-er-mee"],
};
