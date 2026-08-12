# PROJECT STATUS — Fit Up Leiderdorp website

Branch: `refresh-refined-athletic` (lokaal, NIET gepusht, NIET gedeployed).
Werkbestand: `index.html` (homepage). Repo: infofitup1-hub/fitupleiderdorp-website.

## Doel & positionering
- Herpositioneren van "24/7 sportschool" naar **persoonlijke trainings- & coachingclub**.
- Personal Training en Small Group PT zijn de hoofddiensten; 24/7 fitness is ondersteunend.
- Doelgroep: volwassenen (±35-65) die persoonlijke begeleiding, structuur en duurzaam
  resultaat zoeken; niet het jonge/hardcore/goedkoopste-publiek.
- Kernboodschap: "Geen drukke sportschool. Wel persoonlijke begeleiding die werkt."
- Belangrijkste conversie: **vrijblijvende kennismaking plannen** (niet abonnement).

## Belangrijkste ontwerpbeslissingen
- Richting A "Refined Athletic": bestaande donkere huisstijl verfijnen, niet vervangen.
- Huisstijl: zwart/charcoal, wit, lime #d4ff00. Lime SUBTIEL (CTA, accentwoord, labels, lijnen).
- Fonts: Barlow Condensed (koppen) + DM Sans (body) — Fit Up-huisstijl behouden.
- Type-schaal getemd (hero-kop van 116px terug naar ±58-62px).
- Hero = split-layout: rustige tekst links + grote coaching-foto rechts, charcoal achtergrond.
- Minder tekst in de hero; één primaire CTA-pad naar het on-page formulier (#intake-plannen).
- Echte content only — geen verzonnen namen, reviews, cijfers.

## Aangepaste bestanden
- `index.html` — hoofdwerkbestand (homepage, inline CSS/JS).
- `PROJECT_STATUS.md` — dit bestand.
- Sinds de deploy-audit (2026-08-06, zie onder) zijn ook meerdere subpagina's en
  generator-templates aangeraakt — zie die sectie voor het volledige overzicht.

## Wat al klaar is (homepage)
- Hero volledig herzien: nieuwe H1 "Sterker, fitter en gezonder met persoonlijke coaching",
  coaching-subtekst, kennismakings-CTA + "Bekijk onze coachingstrajecten", split-foto
  (ad-sgpt-lunges.webp), charcoal, Barlow Condensed terug, USP-/drempelregel verwijderd.
- Scrollende marquee en context-loze gele proofbar verwijderd.
- "Voor wie is Fit Up (en voor wie niet)"-sectie toegevoegd.
- Teamsectie met 4 echte coaches (Patrick, Benjamin, Mendy, Pepijn).
- Dubbele koppen ontdubbeld; intake-CTA's op homepage geconsolideerd.
- Actuele cijfers doorgevoerd: 4,9 / 65 Google-reviews (tekst + structured data).
- Feitfout gecorrigeerd: sportvloer 600 -> 800 m².
- "Leiderdorp" in hero teruggebracht van 3x naar 1x.

## Fitcheck/Blueprint-funnel verwijderd (2026-07-31)
Beslissing 1a genomen: de Fitcheck/Blueprint-funnel is volledig verwijderd, niet ondergeschikt
gemaakt. Opgeschoond:
- Pagina `/fitcheck/` verwijderd.
- Nav-, drawer- en footerlinks "Fitcheck" verwijderd op homepage + alle subpagina's en
  lokale SEO-pagina's.
- CTA-blokken/homepageblokken (o.a. "FITCHECK BAR" op tarieven, CTA-sectie op
  trainingsaanbod, kaartje op bedankt-pagina, linklist-items) verwijderd.
- FAQ-teksten en bijbehorende JSON-LD structured data herschreven zonder Fitcheck-verwijzing.
- Sitemapvermelding verwijderd.
- Privacybeleid opgeschoond (gegevensverwerkingstabel, doelenlijst, bewaartermijnen).
- Generator-/automatiseringsscripts (`_seo_engine.js`, `.github/autoseo.js`,
  `.github/autoblog.js`) bijgewerkt zodat nieuw gegenereerde pagina's geen Fitcheck-links
  meer bevatten.
- Gecontroleerd op dode links: geen gevonden.
- `.btn-dark`-CSS is gecontroleerd en blijft staan: wordt nog actief gebruikt als stijl voor
  de "Plan gratis intake"-knoppen op 20+ pagina's.

## Visuele kwaliteitsronde homepage (2026-08-01)
Volledige visuele QA op desktop (~1200-1440px), tablet (768px) en mobiel (390px). Gevonden en
gecorrigeerd (alleen CSS/layout, geen tekst/tarieven/links gewijzigd tenzij noodzakelijk):
- Services-kaart "Voedings- en leefstijlcoaching": lange woord liep buiten de kaart
  (overflow:hidden knipte "-ING" af) -> zachte afbreekstreep toegevoegd (`&shy;`).
- "Herken jij dit?"-sectie: foto (gym-sfeer-2.jpg) stond maar half zo breed als zijn kolom
  en werd door zijn eigen (portret) beeldverhouding abnormaal hoog (~910px) -> volle breedte
  + vaste aspect-ratio 1:1 ingesteld, nu in balans met de tekstkolom.
- "Mijn verhaal" (Patrick): CSS-classnaam-typo (`.p-second` i.p.v. `.p-side`) zorgde dat de
  tweede foto op tablet geen hoogte/uitsnede kreeg -> flink groter dan de eerste foto.
  Typo gefixt; foto's staan nu op tablet én mobiel gestapeld, gelijke hoogte (280px/220px)
  en gelijke beeldverhouding. Op desktop waren beide foto's al gelijkwaardig (ongewijzigd).
- Teamsectie: Patrick en Benjamin gebruiken al dezelfde kaart-/fotoverhouding (4:5, consistent
  op alle breedtes) — geen layoutfix nodig. Functietitel Benjamin gewijzigd naar "Headcoach"
  (kaart + alt-tekst).
- Geen dode-linkregressies, geen horizontale overflow op 1200/768/390px aangetroffen.
- Volledige 1440px-schermbreedte is niet 1-op-1 als screenshot geverifieerd (tool-beperking
  in deze sessie boven ~1250px); wel geverifieerd via DOM/CSS-metingen op 1440px (er bestaat
  geen breakpoint tussen 981-1440px, dus het layoutgedrag is identiek) en visueel via
  screenshots tot ~1200px.

**Homepage-visuele kwaliteitsronde: afgerond.**

## Final-CTA naar coaching-first herschreven (2026-08-01)
Laatste inhoudelijke correctie van de homepage-herpositionering. Kop, tekst en primaire
CTA-knop van de final-cta-sectie herschreven van algemene "sportschool"-taal naar
coaching-first taal:
- Kop: "Klaar voor een sportschool die werkt?" -> "Klaar om gericht sterker, fitter en
  gezonder te worden?"
- Tekst: "Plan een gratis intake..." -> "Tijdens een vrijblijvende kennismaking bespreken
  we je doelen en bekijken we welke vorm van persoonlijke begeleiding het beste bij je past."
- Primaire CTA-knop: "Plan gratis intake via WhatsApp" -> "Plan een vrijblijvende
  kennismaking" (link ongewijzigd: `#intake-plannen`, het bestaande intake-formulier).
- Ondersteunende regel toegevoegd: "Personal training, small-group training en coaching
  afgestemd op jouw niveau."
- Secundaire link "Bekijk tarieven", layout, styling en responsive gedrag ongewijzigd.

**Coaching-first positionering op de homepage: afgerond.** (Rollout naar subpagina's en
lokale SEO-pagina's staat nog open, zie "Wat nog moet gebeuren".)

## Homepage hero-foto vervangen (2026-08-06)
Hero-foto op de homepage vervangen door een nieuwe, door de klant aangeleverde (echte, zelf
bewerkte) foto van coach + klant tijdens uitvalspassen. Bijgesneden naar een vierkante
verhouding (860×840) die past bij de bestaande `.hero-media`-box (object-fit:cover), opgeslagen
als `assets/images/hero-lunges-coaching.webp`. Origineel bestand (`ad-sgpt-lunges.webp`) is
NIET verwijderd, blijft als ongebruikt asset staan voor het geval van terugdraaien.

## Site-brede deploy-readiness audit (2026-08-06)
Volledige controle van alle 41 HTML-pagina's vóór livegang: 1669 interne links/afbeeldingen
gecontroleerd op kapotte verwijzingen, plus sitemap.xml en robots.txt geverifieerd.

Gevonden en opgelost:
- **Kapot favicon-pad op 9 pagina's** (`afvallen-na-40`, `afvallen-tijdens-overgang`,
  `beste-personal-trainer-leiderdorp`, `hyrox-voorbereiding-schema`, `kosten-personal-trainer`,
  `krachttraining-vrouwen-40-plus`, `personal-trainer-alphen-aan-den-rijn`, `spieropbouw-na-40`,
  `sportschool-zoeterwoude`): verwezen naar niet-bestaand `/assets/images/favicon.ico` i.p.v.
  het echte `/favicon.png`. Ook gefixt in de bron-template `.github/autoblog.js` zodat nieuwe
  auto-gegenereerde blogpagina's de fout niet overerven.
- **3 kapotte content-afbeeldingen** vervangen door bestaande, passende foto's uit de
  mediabibliotheek (geen nieuwe content, in overleg goedgekeurd):
  - `hyrox-voorbereiding-schema`: `hyrox-training-hero.jpg` → `les-hiit-hyrox.jpg`;
    `ad-hyrox.webp` → `ad-gym-kracht.webp`.
  - `kosten-personal-trainer`: `personal-training-hero.jpg` → `coach-portret.jpg`.
- **4 losse/verweesde bestanden verwijderd** (in overleg): `landingspagina.html` (niet in
  sitemap, geen noindex, 4 kapotte navlinks — SEO-risico als concurrerende duplicaatpagina),
  `ad-landing (1).html` en `ad-landing-backup.html` (duplicaten van `ad-landing.html`, backup
  verwees naar niet meer bestaande coach "Loyd"), `preview-fase2.html` (interne designpreview).
  `ad-landing.html` zelf (actieve advertentie-landingspagina) is behouden en ongewijzigd.
- Sitemap.xml: alle 33 live pagina's correct aanwezig, `bedankt`/`privacybeleid` terecht
  uitgesloten. Robots.txt: correct geconfigureerd. Geen wijzigingen nodig.

**Resultaat: 0 kapotte links/afbeeldingen over de hele site.**

## Wat nog moet gebeuren
- Sectievolgorde homepage naar nieuwe hiërarchie; nieuwe secties "Hoe het traject werkt"
  (3 stappen) en "Voeding & leefstijl".
- Resultaten-sectie (wacht op akkoord/toestemming per klant + resultaatcijfers).
- Positioneringszin "Geen drukke sportschool..." op logische plek plaatsen.
- Metadata (title/description) naar PT/coaching-first.
- OPEN BESLISSING: "warme witte/lichtgrijze vervolgsecties" — grote lichtomslag van alle
  secties; nog niet doorgevoerd (site is nu nog donker onder de hero).
- Rollout naar subpagina's (SGPT, PT, 24/7, groepslessen, online-coaching, tarieven, contact)
  en de 17 lokale SEO-pagina's: toon, CTA's, metadata gelijktrekken.
- Fotografie-rollout richting coach<->klant-interactie; ideale hero-shoot nog wenselijk.

## Bekende fouten / aandachtspunten
- ONGECOMMITTE WIJZIGING: laatste hero-revisie (Barlow Condensed terug + USP/drempelregel weg)
  staat in `index.html` maar is nog niet gecommit (commit werd afgebroken).
- Hero-accent "persoonlijke coaching" is nu een volledige lime regel; check of dit subtiel
  genoeg is (evt. terug naar één accentwoord).
- Hero-foto fade-in (opacity) kan bij een snelle screenshot leeg lijken; is puur timing.
- Deze wijzigingen staan alleen lokaal op de branch — nog niets live.
- Andere pagina's gebruiken deels een eigen stylesheet (assets/css/seo.css); homepage heeft
  inline CSS. Design-system nog niet gedeeld over alle pagina's.
- Deploy-pad (Netlify?) nog niet geverifieerd; vóór livegang controleren.

## Design-system rollout — ACTUELE STAAT (2026-08-07)
Homepage is de **design source of truth**. Ritme overal: **Dark hero → Light body → Dark CTA/footer.**

**Al omgezet naar licht premium (op branch, NIET gecommit):**
- `index.html` (homepage) — al eerder gecommit.
- `trainingsaanbod/index.html` (hub) — donkere centered hero.
- `trainingsaanbod/personal-training/index.html` — donkere split-hero + echte foto.
- `trainingsaanbod/24-7-fitness/index.html` — donkere split-hero.

**Nog NIET omgezet (nog volledig donker) — batch 1 restant:**
- `trainingsaanbod/groepslessen/index.html`
- `trainingsaanbod/sgpt-small-group-personal-training/index.html`
- `tarieven/index.html`
- `contact/index.html`
- `online-coaching/index.html` (later; koppelt aan Virtuagym)
- De ~18 SEO-landingspagina's via `assets/css/seo.css` (seo.css is nog donker; transformeren
  van dat ene bestand zet alle landingspagina's in één keer om — grote hefboom, nog te doen).

**Conversie-recept per bespoke pagina (inline `<style>`):**
- Voeg aan `:root` toe: `--charcoal:#18191b;--paper:#fff;--paper2:#f3f4f0;--ink:#141611;`
  `--ink-soft:#3c3f37;--ink-mute:#575b4e;--line:rgba(20,22,17,.08);--accent-ink:#4a5900;`
  `--r-btn:10px;--r-card:18px;--sh-2:0 1px 2px rgba(20,22,17,.04),0 24px 50px -22px rgba(20,22,17,.18);`
  `--sh-hover:0 2px 6px rgba(20,22,17,.05),0 40px 80px -28px rgba(20,22,17,.28);`
- `body` → `background:var(--paper);color:var(--ink)`.
- Hero (`.page-hero`) blijft **donker**: `background:var(--charcoal)`, tekst wit, `h1` sentence-case
  Barlow `clamp(40px,5vw,66px)`, `h1 em` lime, `ph-stat-num` wit, `ph-stat-label` rgba(255,255,255,.5).
  Split-variant met echte foto rechts; centered-variant voor tarieven/contact.
- Knoppen: `padding:15px 30px;font-size:15px;letter-spacing:1.5px;border-radius:10px`.
- `h2 em` → lime-highlight `background:linear-gradient(transparent 58%,rgba(212,255,0,.5) 58%)`,
  MAAR op donkere secties (`.page-hero h1 em,.final-cta h2 em`) → gewoon `color:var(--accent)`.
- `.sec-label` → `color:var(--ink-mute)`. Body/muted tekst → `--ink-soft`. Lime-op-licht (labels,
  iconen, `svg`, inline links, `?::before`, `em` in stats) → **`--accent-ink`** (niet lime).
- Cards (svc/for/gear/tarief/faq/step/result/access) → `background:#fff;border:1px solid var(--line);`
  `border-radius:18px;box-shadow:var(--sh-2)`, hover `translateY(-6px)+var(--sh-hover)`, grid-gap 16–20px.
  Featured servicekaart → charcoal; featured tariefkaart (`.hot`) → blijft lime (zwarte tekst).
- CTA-sectie onderaan (`.final-cta`/`.cta`) → **donker** (charcoal/`--dark`) houden.
- Footer → **donker** houden; `.f-brand .f-logo` moet `color:var(--white)` krijgen (anders onzichtbaar);
  `.f-bottom p` → rgba(255,255,255,.4).
- **Let op valkuilen:** (1) inline `style="background:var(--black|mid)"` op `<section>`-tags → naar
  `var(--paper)`/`var(--paper2)`; (2) inline `style="color:var(--accent)"` links → `--accent-ink`;
  (3) `ph-stat-num` erft anders donker-op-donker in de hero.
- **Verificatie per pagina:** lokale server `python -m http.server 3210` in de repo, dan de
  contrast-scan (zoekt tekst met contrast <2.6 = onleesbaar) + check horizontale overflow. Foto-hero
  fade-in kan bij snelle screenshot even leeg lijken (puur timing).

**Open contentvragen (niet zelf gokken):**
- **m²-inconsistentie:** homepage zegt 800 m², 24/7-pagina zegt 400 m². Patrick moet bevestigen
  welk getal klopt (mogelijk 400 = fitnessvloer, 800 = totale club) → daarna gelijktrekken.
- Fotografie: hero's gebruiken bestaande foto's; ideale "coach + volwassen klant"-shoot nog wenselijk.

**Instructies / niet doen:** niet committen en niet deployen tot Patrick het zegt. Werk vanuit dit
design system (geen pagina's los "opnieuw creëren"). Na batch 1: kwaliteitsrapport, dan pas batch 2 (blogs).

**Resume in nieuwe chat:** "Lees CLAUDE.md (bestaat niet) + PROJECT_STATUS.md. Ga verder met batch 1
van de design-system rollout: Groepslessen, dan SGPT, Tarieven, Contact — volgens het conversie-recept.
Niet committen/deployen."
