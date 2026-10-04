// "Wie doet er mee?" - toont de deelnemerspagina; alleen met geldig view-token.
//
//   GET /wie-doet-er-mee/?access=<view-token>
//
// De data wordt volledig server-side opgehaald (netlify/lib/wdem.mjs): door de geplande
// functie wdem-refresh elke 10 minuten en - als vangnet - hier als de opgeslagen pagina
// te oud is (alleen binnen 05:00-23:00 Europe/Amsterdam). Oude data (andere dag, > 2 uur)
// wordt nooit getoond: dan staat er de neutrale pagina "Nog geen actuele gegevens". Geen upload meer, geen lokale pc nodig. Zonder of met een fout token: 403.
// Hier staat alleen de SHA-256-hash van het view-token (niet terug te rekenen);
// env var WDEM_VIEW_TOKEN_SHA256 overschrijft die hash.

import { createHash, timingSafeEqual } from "node:crypto";
import { store, readPage, refresh, pageFor, needsRefresh, isActiveWindow, STALE_HTML } from "../lib/wdem.mjs";

const VIEW_TOKEN_SHA256 = "60429446d0e46a6f2c69bf9bcf6fe9ec37ad423699c322c9eb41386bcb394d5a";

const PAGE_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
};

const SHELL = (title, text) => `<!DOCTYPE html>
<html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>${title} - Fit Up</title>
<style>body{margin:0;background:#080A09;color:#F4F5F1;font:16px/1.5 -apple-system,"Segoe UI",Roboto,Arial,sans-serif;padding:32px 16px}main{max-width:560px;margin:0 auto}h1{font-size:30px;margin:0 0 8px}p{color:#A7ADA8;margin:0}</style>
</head><body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;

const DENIED_HTML = SHELL("Geen toegang", "Open deze pagina via de Fit Up-app.");
function tokenOk(given, expectedHash) {
  given = String(given || "").trim();
  if (given.length < 32 || given.length > 256) return false;
  const a = Buffer.from(createHash("sha256").update(given).digest("hex"));
  const b = Buffer.from(String(expectedHash || ""));
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async (req) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD" } });
  }

  const viewHash = Netlify.env.get("WDEM_VIEW_TOKEN_SHA256") || VIEW_TOKEN_SHA256;
  if (!tokenOk(new URL(req.url).searchParams.get("access"), viewHash)) {
    return new Response(req.method === "HEAD" ? null : DENIED_HTML, { status: 403, headers: PAGE_HEADERS });
  }
  if (req.method === "HEAD") return new Response(null, { status: 200, headers: PAGE_HEADERS });

  // Nooit een stacktrace of foutdetail naar de bezoeker: bij een onverwachte fout de
  // neutrale pagina zonder gegevens.
  try {
    const s = await store();
    let rec = await readPage(s);
    const now = new Date();
    if (needsRefresh(rec, now) && isActiveWindow(now)) {
      const r = await refresh(s, { trigger: "lazy", now });
      if (r.status === "ok") rec = r.rec;
    }
    // pageFor toont alleen data van vandaag (Amsterdam); anders de neutrale pagina.
    return new Response(pageFor(rec, new Date()), { status: 200, headers: PAGE_HEADERS });
  } catch {
    return new Response(STALE_HTML, { status: 200, headers: PAGE_HEADERS });
  }
};

export const config = {
  path: ["/wie-doet-er-mee", "/wie-doet-er-mee/"],
};
