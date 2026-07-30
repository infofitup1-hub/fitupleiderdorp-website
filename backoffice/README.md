# FIT UP Backoffice — Factuur Importer

Een productieklare, responsive web-app / PWA die zakelijke **PDF-facturen**
automatisch uit maximaal **drie Gmail-accounts** haalt en centraal en veilig
opslaat in Supabase. Bruikbaar op desktop, laptop, tablet en telefoon — overal
dezelfde gegevens.

> Scope: **uitsluitend de factuurmodule.** Geen CRM, agenda, btw-berekeningen of
> boekhouding. Geen OCR, geen bedragen/btw uitlezen, geen boekingen.

---

## Inhoud

- [Functionaliteit](#functionaliteit)
- [Tech stack](#tech-stack)
- [Projectstructuur](#projectstructuur)
- [1. Vereisten](#1-vereisten)
- [2. Environment variables](#2-environment-variables)
- [3. Supabase instellen](#3-supabase-instellen)
- [4. Google Cloud OAuth instellen](#4-google-cloud-oauth-instellen)
- [5. Lokaal ontwikkelen](#5-lokaal-ontwikkelen)
- [6. Testen](#6-testen)
- [7. Deployen](#7-deployen)
- [Beveiliging](#beveiliging)
- [Nog in te vullen door de eigenaar](#nog-in-te-vullen-door-de-eigenaar)

---

## Functionaliteit

De gebruiker kiest **mailbox** (één of alle), **jaar** en **kwartaal** en klikt
op **“Facturen ophalen”**. De app:

1. leest de gekoppelde Gmail-accounts via de Gmail API (read-only);
2. zoekt e-mails met bijlagen binnen het gekozen kwartaal;
3. downloadt alleen PDF-bijlagen die waarschijnlijk echte facturen zijn;
4. sluit orderbevestigingen, verzendbevestigingen, offertes en creditnota’s uit;
5. herkent dubbele PDF’s met een **SHA-256-hash**;
6. bewaart goedgekeurde bestanden in een **privé Supabase Storage-bucket**;
7. toont het importresultaat (nieuw / dubbel / overgeslagen / fouten);
8. bewaart een importhistorie die na herstart blijft bestaan.

De import is **idempotent**: een tweede import van hetzelfde kwartaal maakt geen
duplicaten aan. Eén fout stopt de hele import niet — fouten worden per bericht
geteld.

## Tech stack

- **Next.js 14** (App Router) + **TypeScript**
- **Tailwind CSS** (donkere premium FIT UP-stijl: zwart/charcoal, limegroen, wit)
- **Supabase**: PostgreSQL, Auth, Storage
- **Gmail API** + **Google OAuth 2.0** (server-side, offline access, PKCE)
- **Zod** voor validatie
- **Vitest** (unit) + **Playwright** (e2e)
- **PWA**: manifest, service worker, offline- en loading-pagina

## Projectstructuur

```
backoffice/
├─ app/
│  ├─ login/                # inlogpagina (wachtwoord + magic link)
│  ├─ dashboard/            # overzicht + importhistorie
│  ├─ facturen/             # mailbox/jaar/kwartaal + ophalen + lijst
│  ├─ instellingen/         # mailboxen koppelen/loskoppelen, account
│  ├─ auth/                 # supabase auth callback + signout
│  └─ api/
│     ├─ gmail/connect/     # start OAuth (state + PKCE)
│     ├─ gmail/callback/    # OAuth callback (state validatie, token-exchange)
│     ├─ gmail/import/      # draait de import
│     ├─ gmail/disconnect/  # mailbox loskoppelen
│     └─ invoices/signed-url/  # korte signed URL voor bekijken/downloaden
├─ components/{layout,invoices,ui,auth}/
├─ lib/
│  ├─ supabase/  (browser/server/admin/middleware clients)
│  ├─ gmail/     (oauth, client, messages)
│  ├─ invoices/  (quarter, filters, filename, hash, pipeline, import, suppliers)
│  ├─ auth/      (crypto = tokenversleuteling, session)
│  └─ validation/(zod schemas)
├─ supabase/migrations/     # SQL: schema + RLS + storage
├─ tests/                   # vitest unit + tests/e2e (playwright)
└─ public/                  # manifest, sw.js, icons
```

## 1. Vereisten

- **Node.js ≥ 20**
- Een **Supabase**-project
- Een **Google Cloud**-project met de Gmail API ingeschakeld

## 2. Environment variables

Kopieer `.env.example` naar `.env.local` en vul de waarden in:

```bash
cp .env.example .env.local
```

| Variabele | Omschrijving |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project-URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (browser, RLS beschermt data) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server-only** service-role key (import-pipeline) |
| `SUPABASE_STORAGE_BUCKET` | Bucketnaam, standaard `invoices` |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID (Web application) |
| `GOOGLE_CLIENT_SECRET` | **Server-only** OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Exact gelijk aan de Authorized redirect URI |
| `TOKEN_ENCRYPTION_KEY` | 32-byte base64 sleutel: `openssl rand -base64 32` |
| `NEXT_PUBLIC_APP_URL` | Publieke basis-URL van de app |

> Secrets staan **uitsluitend** in environment variables en komen nooit in Git
> (`.env*` is gitignored). Tokens worden nooit gelogd of naar de browser gestuurd.

## 3. Supabase instellen

1. Maak een project op <https://supabase.com>.
2. Voer de SQL-migraties uit (Dashboard → SQL Editor, of via de CLI):

   ```bash
   # Optie A — Supabase CLI (aanbevolen)
   supabase link --project-ref <jouw-ref>
   supabase db push        # voert supabase/migrations/*.sql uit

   # Optie B — handmatig
   # Plak de inhoud van beide bestanden in de SQL Editor en run ze op volgorde:
   #   supabase/migrations/0001_init.sql
   #   supabase/migrations/0002_storage.sql
   ```

   Dit maakt de tabellen `profiles`, `gmail_connections`, `import_runs`,
   `invoices` aan, activeert **Row Level Security** op alle tabellen, zet de
   unieke constraints (`user_id + sha256_hash` en
   `gmail_connection_id + gmail_message_id + attachment_id`), en maakt de
   **privé** Storage-bucket `invoices` met eigenaar-gebaseerde policies.

3. **Gebruiker aanmaken.** Auth → Users → *Add user* (e-mail + wachtwoord), of
   laat inloggen via magic link (Auth → Providers → Email → *Enable*). Bij de
   eerste login wordt automatisch een `profiles`-rij aangemaakt.

4. Zet in Auth → URL Configuration de **Site URL** en **Redirect URLs** op je
   app-URL (bijv. `http://localhost:3000` en je productie-URL).

## 4. Google Cloud OAuth instellen

1. Ga naar <https://console.cloud.google.com> → maak/kies een project.
2. **APIs & Services → Library** → schakel **Gmail API** in.
3. **OAuth consent screen**:
   - User type: *External* (of *Internal* bij Google Workspace);
   - vul app-naam en support-e-mail in;
   - **Scopes**: voeg uitsluitend toe:
     `https://www.googleapis.com/auth/gmail.readonly` en
     `https://www.googleapis.com/auth/userinfo.email`;
   - voeg bij *External* de drie mailboxen toe als **Test users** (zolang de app
     in testmodus staat).
4. **Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**;
   - **Authorized redirect URIs** → voeg exact toe:
     - `http://localhost:3000/api/gmail/callback` (lokaal)
     - `https://<jouw-domein>/api/gmail/callback` (productie)
   - Kopieer **Client ID** en **Client secret** naar je env.
5. Zet dezelfde redirect-URI in `GOOGLE_REDIRECT_URI`.

> **Refresh tokens.** De app vraagt `access_type=offline` en toont het
> consent-scherm alleen wanneer er nog geen geldig refresh token is. Bestaande
> refresh tokens worden hergebruikt en de access token wordt automatisch
> ververst — je hoeft dus niet elke keer opnieuw toestemming te geven.

## 5. Lokaal ontwikkelen

```bash
npm install
npm run dev          # http://localhost:3000
```

Andere commando’s:

```bash
npm run build        # productie-build
npm run start        # productie-server (na build)
npm run lint         # ESLint
npm run typecheck    # TypeScript zonder emit
```

## 6. Testen

```bash
npm test                 # Vitest unit-tests (headless, snel)
npm run test:watch       # Vitest in watch-modus

# End-to-end (Playwright). Eenmalig de browser installeren:
npm run test:e2e:install
npm run test:e2e         # bouwt + start de app en draait de e2e-tests
```

De unit-tests dekken onder andere: **kwartaalgrenzen**, **bestandsnaam­opschoning**,
**factuurfilter**, **uitsluitingsfilter**, **SHA-256 duplicaatcontrole**,
**OAuth-statevalidatie**, **RLS-invarianten** (statisch op de migratie) en
**import met gedeeltelijke fouten**.

> Draait je omgeving met een vooraf geïnstalleerde Chromium waarvan de build
> afwijkt van de gepinde `@playwright/test`? Zet dan
> `PLAYWRIGHT_CHROMIUM_PATH=/pad/naar/chrome` vóór `npm run test:e2e`.

## 7. Deployen

De app draait op elke host die Next.js 14 (Node runtime) ondersteunt, bijv.
**Vercel**:

1. Importeer de repo; zet **Root Directory** op `backoffice/`.
2. Vul alle environment variables in (zie tabel hierboven) — gebruik de
   **productie**-waarden voor `GOOGLE_REDIRECT_URI` en `NEXT_PUBLIC_APP_URL`.
3. Voeg de productie-redirect-URI toe in Google Cloud én de productie-URL in de
   Supabase Auth-instellingen.
4. Deploy. Draai de SQL-migraties op je Supabase-project (zie stap 3).

> De import kan lang duren; de route zet `maxDuration = 300`. Op serverless-hosts
> met kortere limieten kun je grote kwartalen per mailbox importeren.

## Beveiliging

- Alle pagina’s behalve `/login` vereisen authenticatie (middleware-guard).
- **RLS** staat aan op alle tabellen; een gebruiker ziet enkel eigen data.
- De Storage-bucket is **privé**; bestanden worden alleen via korte **signed
  URLs** getoond/gedownload.
- Google access/refresh tokens worden **AES-256-GCM versleuteld** opgeslagen en
  **nooit** naar de browser gestuurd of gelogd.
- Uitsluitend de **Gmail read-only** scope wordt gebruikt.
- OAuth is **server-side** met **state (CSRF)** en **PKCE**.
- Secrets staan alleen in environment variables en zijn gitignored.

## Nog in te vullen door de eigenaar

Deze waarden/keuzes moet je zelf zetten voordat alles werkt:

- [ ] `.env.local` invullen met echte Supabase- en Google-waarden.
- [ ] `TOKEN_ENCRYPTION_KEY` genereren (`openssl rand -base64 32`).
- [ ] SQL-migraties uitvoeren op je Supabase-project.
- [ ] Google OAuth-client + redirect-URIs aanmaken; Gmail API inschakelen.
- [ ] De drie mailboxen als test-users toevoegen (bij External consent screen).
- [ ] Minimaal één app-gebruiker aanmaken in Supabase Auth.
- [ ] Optioneel: **vertrouwde leveranciers** en filterwoorden bijwerken in
      [`lib/invoices/suppliers.ts`](lib/invoices/suppliers.ts) — dit is het enige
      configuratiebestand dat je hiervoor hoeft aan te passen.
- [ ] Optioneel: de placeholder-app-icons in `public/icons/` vervangen door
      echte FIT UP-iconen (192/512 + maskable). Regenereren kan met
      `node scripts/gen-icons.mjs`.
