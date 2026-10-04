// Geplande functie: ververst elke 10 minuten de "Wie doet er mee?"-pagina server-side.
// Draait alleen op de gepubliceerde (productie-)deploy. 's Nachts (23:00-05:00) geen calls:
// er zijn dan geen lessen, en de pagina ververst zichzelf bij het eerste bezoek.

import { store, refresh, amsterdamHour } from "../lib/wdem.mjs";

export default async () => {
  const h = amsterdamHour();
  if (h >= 23 || h < 5) return;
  try {
    await refresh(store(), { force: true });
  } catch (err) {
    console.error("wdem-refresh mislukt:", err?.message || err);
  }
};

export const config = {
  schedule: "*/10 * * * *",
};
