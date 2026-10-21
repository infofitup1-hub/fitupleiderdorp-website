# BuddyCheck – Tijdelijk Inschrijfrooster
Status: **code gereed voor review; niet live; standaard gesloten**.

## Onderdelen
- `tijdelijk-inschrijfrooster/index.html`: mobiele ledenpagina, Fit Up dark/lime.
- `netlify/functions/buddycheck-temporary.mjs`: rooster en reserveringsendpoint, standaard uit.
- `buddycheck-temporary/schema.sql`: Postgres schema met transactionele reserveringen.

## Activering (niet automatisch)
1. Kies een afzonderlijk, beveiligd Supabase-project (niet het productiecoachproject zonder expliciete goedkeuring).
2. Voer `schema.sql` uit in SQL editor en controleer rechten.
3. Maak een volledige, actuele en toegestane ledenexport: email, actief product, begin-/einddatum en recht per lestype. Controleren op dubbelingen en beëindigde abonnementen. Geen export aanwezig? Systeem blijft uit.
4. Importeer handmatig de **bevestigde** lessen in `buddycheck_temp_lessons`, inclusief capaciteit, en activeer alleen gecontroleerde lessen.
5. Genereer voor ieder lid een willekeurige persoonlijke code van minimaal 16 tekens; bewaar uitsluitend SHA-256 in `code_hash`. Verstrek codes veilig persoonlijk. Geen Virtuagym-wachtwoorden hergebruiken.
6. Verifieer de rechten in `allowed_kinds` (bijv. `GROUP`, `SGPT`); test met Fitness Only, All Inclusive, SGPT, verlopen product, volgeboekte en dubbele inschrijving.
7. Zet Netlify omgevingsvariabelen `BUDDYCHECK_SUPABASE_URL`, `BUDDYCHECK_SUPABASE_SERVICE_ROLE_KEY`; service-role key nooit in frontend of Git.
8. Na end-to-end en load/concurrentietest: zet **beide** `BUDDYCHECK_BOOKING_ENABLED=true` en `BUDDYCHECK_BOOKING_VERIFIED=true`. Vooraf blijven POSTs geblokkeerd.
9. Check Deploy Preview, pas daarna merge. Publiceer URL naar leden pas na daadwerkelijke boekingstest. Bestaande BuddyCheck `/wie-doet-er-mee/` blijft ongewijzigd.
10. Bij herstel Virtuagym: exporteer `buddycheck_temp_reservations` en synchroniseer handmatig na controle; zet beide switches eerst uit.

## Beperkingen
- Annuleren, automatische e-mailbevestiging, zelfservice code-reset en beheerportaal zijn nog niet gerealiseerd.
- Geen actuele Virtuagym-lessen of abonneegegevens zolang Virtuagym offline is.
- Iedere boeking wordt realtime transactioneel tegen geverifieerde lokale ledenrechten gecontroleerd; wijzigingen in abonnementen na import zijn niet automatisch verwerkt.
- Tarieven/producten alleen koppelen aan lesrechten na zakelijke controle, niet op een naam-prefix.
