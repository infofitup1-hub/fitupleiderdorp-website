// Geplande functie: ververst elke 10 minuten de "Wie doet er mee?"-pagina server-side.
// De cron triggert 24/7; refresh() dwingt zelf het venster 05:00-23:00 Europe/Amsterdam af
// (zomer- en wintertijd via Intl, geen vaste UTC-offset) en doet daarbuiten een succesvolle
// no-op: geen Virtuagym-calls, bestaande pagina blijft staan, geen foutstatus.

import { store, refresh } from "../lib/wdem.mjs";

export default async () => {
  try {
    await refresh(await store(), { force: true, trigger: "cron" });
  } catch (err) {
    // refresh() gooit niet; dit vangt alleen een store-initialisatiefout af.
    console.log(JSON.stringify({ ev: "wdem_refresh", trigger: "cron", status: "error", category: "store" }));
  }
};

export const config = {
  schedule: "*/10 * * * *",
};
