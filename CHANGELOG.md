# Changelog — Fit Up Leiderdorp website

Logboek van de 99,9%-productie-optimalisatie. Elke wijziging heeft een **waarom** en de
**impact**-categorie (UX, SEO, GEO, Performance, CRO, Accessibility). Prijzen worden nooit
gewijzigd. Afbeeldingen: bestaande echte foto's blijven staan; placeholders alleen voor
secties waar nog geen beeld beschikbaar is (bv. resultaten-sectie i.a.w. klantgoedkeuring).

## 2026-08-06 — Trainingsaanbod hub (`trainingsaanbod/index.html`)

- **Metadata (title/description/OG/Twitter) herschreven** — was afgekapt ("...PT, Fitness &")
  en feature-first. Nu coaching-first en volledig.
  _Impact: SEO, GEO, CRO (betere klikbaarheid in zoekresultaten)._
- **Hero-subtekst herschreven** — van "Vijf manieren om te trainen" (transactioneel,
  apparaat-first) naar "Geen standaard schema van de plank... vorm van persoonlijke
  begeleiding die bij jouw doel, ervaring en agenda past" (coaching-first, consistent met
  homepage-positionering).
  _Impact: UX, CRO, copy-consistentie met homepage._
- **CTA-sectie hersteld** — na verwijdering van de Fitcheck-funnel stond hier een lege
  ruimte. Nieuwe sectie "Niet zeker wat bij je past?" toegevoegd met dezelfde
  kennismakings-taal als de homepage-CTA, linkend naar de contactpagina.
  _Impact: CRO (ontbrekend conversiepunt hersteld), UX (geen dode ruimte in de pagina)._
- **Servicenamen van `<div>` naar `<h2>`** — de 5 kaarten (SGPT, PT, 24/7, Groepslessen,
  Online Coaching) hadden geen echte heading-structuur; alleen het H1 en het CTA-kopje waren
  semantische headings.
  _Impact: SEO (paginastructuur voor Google), Accessibility (screenreader-navigatie per sectie)._
- **`aria-hidden="true"` op decoratieve iconen** (svc-icon, svc-arrow) toegevoegd.
  _Impact: Accessibility (screenreaders slaan niet-informatieve SVG's nu over)._
- **BreadcrumbList + ItemList structured data toegevoegd** (Home > Trainingsaanbod, plus de 5
  diensten als Service-entiteiten met naam/omschrijving/URL, bewust zonder prijs om geen
  onnauwkeurige Offer-schema te riskeren).
  _Impact: SEO (rich results), GEO (AI-systemen kunnen het aanbod eenduidig herkennen)._
- **Trust-regel "4,9 uit 65 Google-reviews" toegevoegd onder de hero** — bestaand, geverifieerd
  cijfer (ook gebruikt op de homepage), nu ook zichtbaar op de trainingsaanbod-hub.
  _Impact: CRO (sociaal bewijs op een pagina die voorheen geen enkel vertrouwenselement had)._

## 2026-08-06 — Personal Training-pakketprijzen gecorrigeerd (klantopdracht)

Eigenaar gaf door: PT (los) = vanaf €300 per 4 weken, PT + 24/7 fitness + groepslessen
("PT Plus") = €350 per 4 weken. Doorgevoerd op alle plekken waar deze bedragen stonden:

- `trainingsaanbod/index.html` — hub-kaart toonde een verouderd/fout bedrag (€275 p/m i.p.v.
  €300/4wk) — gecorrigeerd.
- `index.html` — homepage-servicekaart (€75/week → €300/4 weken, zelfde bedrag, nu in
  4-wekelijkse eenheid voor consistentie met de overige kaarten).
- `online-coaching/index.html` — vergelijkingstabel PT-rij (€75/week → €300/4 weken, nu
  dezelfde eenheid als de Online Coaching-rij erboven, dus eerlijk vergelijkbaar).
- `trainingsaanbod/personal-training/index.html` — hero-stat, beide tariefkaarten (Alleen PT:
  €300/4wk; PT Plus: €350/4wk) en de FAQ-regel over de meerprijs (€43 → €50 extra, want
  350 − 300 = 50).
- `tarieven/index.html` — beide PT-pakketkaarten (bron-van-waarheid-pagina).

_Impact: CRO/vertrouwen (correcte prijzen voorkomen een vervelende verrassing bij de intake),
consistentie (alle PT-vermeldingen tonen nu dezelfde eenheid: per 4 weken)._

**Niet aangeraakt (mogelijk apart aandachtspunt):** de losse-sessieprijs voor PT staat als
€80/sessie op de PT-pagina, als €75/sessie op de tarievenpagina, en als "€75 per sessie" op
de lokale SEO-pagina `personal-trainer-alphen-aan-den-rijn`. Dit is een bestaande
inconsistentie die niets met de zojuist doorgevoerde correctie te maken heeft — gaarne even
bevestigen wat het juiste bedrag is voor een losse sessie.

## 2026-08-06 — Personal Training-pagina (volledige checklist)

- **BreadcrumbList + Service + FAQPage structured data toegevoegd** — de pagina had alleen de
  generieke LocalBusiness-schema. FAQPage markeert de 6 bestaande, echte vragen/antwoorden
  (geen nieuwe content verzonnen, alleen gestructureerd). Service-schema bevat beide
  PT-pakketten met de zojuist gecorrigeerde prijzen (€300 / €350).
  _Impact: SEO (rich results, FAQ in zoekresultaten), GEO (AI-systemen kunnen prijs/aanbod
  correct citeren)._
- **`width`/`height` toegevoegd aan alle 11 afbeeldingen** (echte pixelwaarden uitgelezen uit
  de bestanden zelf, geen schattingen), plus `decoding="async"`.
  _Impact: Performance (voorkomt layout shift / CLS tijdens laden)._
- **Hero-afbeelding krijgt `fetchpriority="high"`** (was zonder priority-hint).
  _Impact: Performance (snellere Largest Contentful Paint, want dit is de LCP-afbeelding)._
- **`aria-hidden="true"` op alle decoratieve iconen** (checkmarks, stap-iconen, CTA-pijltjes,
  highlight-band-icoon — in totaal ~24 SVG's).
  _Impact: Accessibility (screenreaders slaan puur decoratieve iconen over)._
- **Bevinding, niet gewijzigd:** de pagina heeft al een uitgewerkte resultaten-sectie met 5
  klantcases (Marja, Irene, Barbara, Mark, Karin) en bijbehorende foto's die daadwerkelijk op
  de server staan (reële bestandsgroottes, geen lege placeholders) — dit lijkt bestaande,
  eerder goedgekeurde content en is dus ongemoeid gelaten. Ter controle: kun je bevestigen dat
  dit legitieme, toestemming-gedekte klantresultaten zijn? Dat is een andere sectie dan de nog
  te bouwen resultaten-sectie op de homepage uit `PROJECT_STATUS.md`.

## 2026-08-06 — Small Group Personal Training-pagina (volledige checklist)

- Zelfde behandeling als de PT-pagina: BreadcrumbList + Service (3 pakketten: €149/€220/€285)
  + FAQPage structured data toegevoegd; `width`/`height` + `decoding="async"` op alle 5
  afbeeldingen; `aria-hidden` op decoratieve iconen.
  _Impact: SEO, GEO, Performance, Accessibility — zelfde redenen als hierboven._
- **Bugfix: hero-afbeelding had `loading="lazy"`** — dat vertraagt juist de above-the-fold
  hero-foto. Vervangen door `fetchpriority="high"` (de correcte behandeling voor een LCP-beeld).
  _Impact: Performance (Largest Contentful Paint)._
- **Bevinding, niet gewijzigd:** `interieur-2.png` is op bestandsniveau feitelijk een JPEG met
  een `.png`-extensie. Werkt prima in de browser (die kijkt naar de echte inhoud, niet de
  extensie), maar is technisch onjuist benoemd — vermeld voor de laatste opschoonronde.

## 2026-08-06 — 24/7 Fitness-pagina (volledige checklist)

- Zelfde behandeling: BreadcrumbList + Service (3 abonnementen: €53,50/6mnd, €48,50/12mnd,
  €53,50 All-Inclusive) + FAQPage structured data; `width`/`height` + `decoding="async"` op
  beide afbeeldingen; `aria-hidden` op alle decoratieve iconen (gear-cards, access-iconen,
  checkmarks, CTA-pijltjes, klok- en statusicoon).
- **Bugfix: zelfde LCP-probleem als op de SGPT-pagina** — hero-afbeelding had `loading="lazy"`,
  nu vervangen door `fetchpriority="high"`.
- **Eenheid gecorrigeerd:** de trainingsaanbod-hub toonde "vanaf €48,50 **p/m**" (per maand),
  terwijl het daadwerkelijke tarief "per 4 weken" is (bevestigd door de 24/7-pagina zelf en de
  tarievenpagina). Een maand is geen 4 weken, dus dit was een kleine feitelijke onnauwkeurigheid
  — gecorrigeerd naar "per 4 weken", zelfde bedrag.
  _Impact: CRO/vertrouwen (correcte facturatie-eenheid, voorkomt verwarring bij het eerste
  betaalmoment)._
- **Tariefkaarten opgeschoond op klantverzoek** — "Plate- en pin-loaded krachtapparatuur" en
  "Dumbbells tot 40kg" stonden dubbel vermeld (al uitgebreid beschreven in de
  Faciliteiten-sectie erboven). Vervangen door "Volledig uitgeruste sportschool" in beide
  kaarten (6 en 12 maanden).
  _Impact: Copy (geen dubbele content), CRO (kortere, scanbare features-lijst)._

## 2026-08-06 — Groepslessen-pagina (volledige checklist)

- **Title/meta hersteld** — was afgekapt ("...Fit Up Groepslessen voor Kracht &").
- Zelfde behandeling: BreadcrumbList + Service (All-Inclusive-abonnement) + FAQPage
  structured data (6 bestaande FAQ's); `width`/`height` + `decoding="async"` op alle 5
  afbeeldingen; hero kreeg `fetchpriority="high"` i.p.v. `loading="lazy"` (zelfde LCP-bugfix
  als op de andere subpagina's); `aria-hidden` op decoratieve iconen en de puur decoratieve
  "01/02/03/04"-cijfers per les (die informatie staat al toegankelijk in de "Les 0X"-eyebrow).
- **Intensiteit-balkjes toegankelijk gemaakt** — het intensiteitsniveau per les (bv. "4 van 5")
  werd alleen met kleur/gevulde balkjes getoond, zonder tekstalternatief. Toegevoegd:
  `role="img"` + `aria-label="Intensiteit: X van 5"`.
  _Impact: Accessibility (WCAG 1.1.1 — informatie mag niet uitsluitend via kleur/vorm)._
- **Rooster-tabs (Groepslessen/SGPT) correct verbonden** — `aria-controls` op de tabs,
  `aria-labelledby` op de panelen, en roving `tabindex` toegevoegd (JS bijgewerkt zodat de
  niet-actieve tab niet meer via Tab-toets bereikbaar blijft hangen).
  _Impact: Accessibility (correct ARIA-tabs-patroon voor toetsenbord- en schermlezergebruik)._

## 2026-08-06 — Titels vereenvoudigd op klantfeedback

Klant gaf aan dat gegenereerde `<title>`-tags te "AI-marketing" aanvoelden (opsommingen/tag
lines achter de pipe). Vereenvoudigd naar het patroon "[Wat de pagina is] | Fit Up
Leiderdorp" — direct, menselijk, zonder opgeplakte tagline:
- Trainingsaanbod-hub: "Trainingsaanbod Fit Up Leiderdorp | Personal Training & Coaching" →
  "Trainingsaanbod | Fit Up Leiderdorp".
- Groepslessen: "Groepslessen Leiderdorp | Bodypump, Boksfit, HIIT & Powerhour" →
  "Groepslessen | Fit Up Leiderdorp".
_Impact: Copy/merkstem — overige pagina's in dit traject volgen vanaf nu ditzelfde,
soberdere titelpatroon._

## 2026-08-06 — Online Coaching-pagina (volledige checklist)

- **Inhoudelijke bugfix:** de FAQ noemde een "Plus-pakket", terwijl het daadwerkelijke
  pakket "Hybride Coaching" heet (zo genoemd in de prijskaart en elders op de pagina).
  Gecorrigeerd naar "Hybride-pakket" voor interne consistentie.
  _Impact: Copy (geen tegenstrijdige productnamen op dezelfde pagina), CRO (voorkomt
  verwarring bij een bezoeker die net de tariefkaarten heeft gezien)._
- Zelfde technische behandeling: title/meta vereenvoudigd, BreadcrumbList + Service (2
  pakketten: Online €50, Hybride €75) + FAQPage structured data (6 bestaande FAQ's);
  `width`/`height` + `decoding="async"` op alle 4 afbeeldingen; hero kreeg
  `fetchpriority="high"`; `aria-hidden` op alle decoratieve iconen.
- **Bewust niet uitgebreid**: deze pagina wordt later vervangen door een Virtuagym/Fit
  Up App-integratie (zie klantinstructie). Geen nieuwe features, prijzen of teksten
  toegevoegd — alleen bestaande content technisch/toegankelijk gemaakt.

## 2026-08-06 — Tarievenpagina (volledige checklist)

- **Feitelijke fout gecorrigeerd in de hero-tekst**: "Kies een 6-maand abonnement voor het
  beste tarief" — maar de prijstabel én de FAQ eronder laten zien dat het 12-maanden
  abonnement juist goedkoper is (€48,50/€53,50 bij 12 mnd vs. €53,50/€58,50 bij 6 mnd).
  Gecorrigeerd naar "12-maands abonnement".
  _Impact: CRO/vertrouwen — de belangrijkste zin van de tarievenpagina sprak de eigen
  prijstabel tegen; dat is precies waar bezoekers op afhaken._
- Title/meta vereenvoudigd; BreadcrumbList + FAQPage (7 bestaande FAQ's) structured data
  toegevoegd; `aria-hidden` op alle decoratieve iconen (~50 SVG's: checkmarks, CTA-pijltjes,
  "altijd inbegrepen"-iconen, FAQ-plusjes).
- **SGPT-frequentietoggle toegankelijk gemaakt** — klikken op "1×/2×/3× per week" wijzigt de
  prijs dynamisch, maar dat werd niet aangekondigd voor screenreadergebruikers. Toegevoegd:
  `aria-live="polite"` op het prijsvak.
  _Impact: Accessibility (dynamische prijswijziging wordt nu voorgelezen)._
- Geen `<img>`-elementen op deze pagina (volledig icoon-gebaseerd) — geen CLS/LCP-werk nodig.

## 2026-08-06 — Contactpagina (volledige checklist)

- **Intakeformulier: functionele bugfix.** De "Aanvragen via WhatsApp"-knop werd al actief
  zodra alleen dag + tijdstip waren gekozen — naam en telefoon waren niet verplicht. Daardoor
  kon iemand een intake "aanvragen" zonder dat de zaak weet wíé het is of hoe die persoon te
  bereiken is. `required` toegevoegd aan de naam- en telefoonvelden en de knop-logica
  uitgebreid zodat die pas actief wordt als dag, tijd, naam én telefoon zijn ingevuld
  (e-mail blijft optioneel, zoals het label al aangaf).
  _Impact: CRO (bruikbare leads i.p.v. lege aanvragen), UX (formulier doet wat het belooft)._
- Title/meta vereenvoudigd; BreadcrumbList structured data toegevoegd; `aria-hidden` op de
  decoratieve contact-iconen (WhatsApp/bellen/e-mail/adres — de tekst ernaast zegt al
  hetzelfde).
- Geen `<img>`-elementen op deze pagina — geen CLS/LCP-werk nodig.

## 2026-08-06 — Homepage (volledige checklist)

- **Title/description hersteld én coaching-first gemaakt.** De title was afgekapt
  ("...Personal Training & 24/7") én begon met "sportschool" — precies de framing die het
  hele herpositioneringstraject probeert te verlaten ("Geen drukke sportschool..."). Nu:
  "Fit Up Leiderdorp | Personal Training & Coaching", description "coachingclub" i.p.v.
  "sportschool".
- **Foutieve GPS-coördinaten gecorrigeerd** in de `LocalBusiness`-structured data
  (52.1524/4.5123 → 52.1564/4.5252). Elke andere pagina op de site gebruikt al de correcte
  coördinaten; de homepage was hier — waarschijnlijk door een oude kopie — van afgeweken.
  Ook toegevoegd aan het eerste (`@graph`) schema-blok, dat `geo` volledig miste.
  _Impact: SEO/Local SEO — verkeerde coördinaten kunnen de kaartweergave in
  zoekresultaten beïnvloeden._
- **Verouderde/foutieve prijzen in de `hasOfferCatalog`-structured data gecorrigeerd**:
  "Personal Training" stond genoteerd als "€75 per sessie" — maar €75 is de losse-sessieprijs,
  niet het pakket (dat is nu €300 per 4 weken). Zou een AI-assistent of Google die dit leest
  het verkeerde bedrag laten citeren. Alle drie de OfferCatalog-items (SGPT, PT, 24/7 Fitness)
  omgezet naar de echte "per 4 weken"-bedragen (149 / 300 / 48,50) i.p.v. afgeleide
  "per week"-schattingen.
  _Impact: GEO (AI-antwoorden citeren nu het juiste bedrag), SEO (rich results kloppen)._
- **Zelfde prijs-eenheid-inconsistentie als eerder gevonden, nu ook op de homepage**: de
  services-kaarten toonden een mix van "per week" (met afrondingsfouten, bv. €13,40/week i.p.v.
  precies €53,50/4wk ÷ 4) naast "per 4 weken" in dezelfde rij kaarten. Alle 6 kaarten nu
  consistent "per 4 weken" met de exacte bedragen.
- **Twee losstaande `</div>`-tags verwijderd** (na de "Herken jij dit?"- en "Waarom Fit
  Up"-secties) — restanten van een eerdere contentwijziging die de HTML-nesting liet
  afwijken. Browsers negeerden de overtollige tags al stilzwijgend (geen zichtbare bug), maar
  het maakte de pagina HTML-ongeldig. Geverifieerd: na verwijdering is de volledige
  div-nesting weer in balans (205 open / 205 dicht).
- **Dubbel `style`-attribuut op één `<img>` verwijderd** (twee keer `style="..."` op
  hetzelfde element — ongeldige HTML, browser gebruikte alleen de eerste).
- `width`/`height` + `decoding="async"` toegevoegd aan 3 afbeeldingen die dit nog misten
  (Patrick-portret, Patrick bij Defensie, balie-foto).
- **Bevinding, niet gewijzigd:** de "prob-ticker" met herhaalde `<span>`-lijst (800m²
  sportvloer, kracht, cardio, ...) leek in eerste instantie dubbele content, maar is een
  bewust verdubbelde reeks voor een naadloos scrollende ticker-animatie — terecht ongemoeid
  gelaten na controle.
- **Bevinding, niet gewijzigd:** `patrick-defensie.png` is, net als eerder gevonden
  `interieur-2.png`, feitelijk een JPEG met een `.png`-extensie.

## 2026-08-06 — Site-brede geautomatiseerde scan (alle 39 pagina's)

Na de handmatige pagina's is de rest van de site (23 lokale SEO-pagina's + overige) gescand
op dezelfde bugklassen die handmatig al zijn gevonden, i.p.v. elke pagina losstaand
regel-voor-regel te lezen — sneller en net zo betrouwbaar voor deze mechanische controles:

- **Verouderde PT/SGPT/24-7-prijzen** ("PT vanaf 75 euro per sessie", "SGPT vanaf 37,25 per
  week", "24/7 vanaf 12,15 per week") stonden letterlijk herhaald in structured data én
  zichtbare tekst op **7 lokale SEO-pagina's** (afvallen-na-40, afvallen-tijdens-overgang,
  beste-personal-trainer-leiderdorp, kosten-personal-trainer, krachttraining-vrouwen-40-plus,
  personal-trainer-alphen-aan-den-rijn, sportschool-zoeterwoude). Overal gecorrigeerd naar
  €300 / €149 / €48,50 per 4 weken. Op `kosten-personal-trainer` bewust de generieke
  marktvergelijking ("40 tot 120 euro per sessie", niet Fit Up-specifiek) ongemoeid gelaten.
  _Impact: GEO/SEO — dit waren letterlijk dezelfde foutieve bedragen als op de homepage,
  maar dan verspreid over 7 losse pagina's die elk apart door Google/AI geïndexeerd worden._
- **Coördinaten site-breed gecontroleerd**: alle overige pagina's gebruiken al de correcte
  52.1564/4.5252 — alleen de homepage was afgeweken (al gecorrigeerd, zie hierboven).
- **Titels site-breed gecontroleerd** op afkapping (eindigend op "&"): geen andere gevallen
  gevonden buiten de 4 al gecorrigeerde.
- **41 afbeeldingen zonder `width`/`height` gevonden en gefixt op 22 pagina's** (echte
  pixelwaarden uitgelezen uit de bestanden, `decoding=\"async\"` toegevoegd, bestaande
  `loading=\"lazy\"` behouden). Dit was de grootste site-brede performance-omissie.
- **HTML-nesting (div-balans) op alle 39 pagina's geautomatiseerd gecontroleerd**: alleen de
  homepage had de 2 losstaande `</div>`-tags (al gefixt); verder nergens problemen.
- **Duplicate `style`-attributen op `<img>`-tags site-breed gecontroleerd**: alleen het al
  gevonden/gefixte geval op de homepage; verder nergens.

**Nog niet gedaan voor de 23 lokale SEO-pagina's** (bewust, gezien de omvang): individuele
`aria-hidden`-controle op decoratieve iconen en volledige copy-doorlezing per pagina. De
mechanische/feitelijke bugs (prijzen, coördinaten, HTML-validiteit, CLS) zijn wel site-breed
gedekt.

## 2026-08-06 — H1-koppen site-breed herschreven op klantfeedback

Klant gaf aan: veel zichtbare paginakoppen lazen als marketing-quotes ("Jouw eigen coach die
je vooruit duwt.", "Train wanneer jij wilt.", "Helder en eerlijk") in plaats van gewoon te
benoemen welk product/onderwerp de pagina behandelt. Patroon: elke pagina had al een correct,
feitelijk "kicker"-label (bv. "Personal Trainer Leiderdorp") vlak boven de H1, maar de grote
zichtbare H1-tekst zelf was een slogan. Herschreven naar het patroon dat de
Trainingsaanbod-hub al gebruikte: "[Product]<br>[Plaats/merk]" — direct, geen tagline.

Aangepast (25 pagina's):
- 16 lokale SEO-pagina's: sportschool-leiderdorp, personal-trainer-leiderdorp,
  krachttraining-leiderdorp, afvallen-leiderdorp, voedingscoach-leiderdorp,
  fitnessclub-leiderdorp, vrouwen-fitness-leiderdorp, spiermassa-opbouwen-leiderdorp,
  personal-trainer-voorschoten, personal-training-leiderdorp, personal-trainer-leiden,
  hyrox-training-leiderdorp, fitness-40-plus-leiderdorp, fitness-voor-beginners-leiderdorp,
  small-group-personal-training-leiderdorp, personal-trainer-oegstgeest.
- 4 trainingsaanbod-subpagina's (Personal Training, SGPT, 24/7 Fitness, Groepslessen),
  Online Coaching, Tarieven, Contact, Gratis Intake, Calorie Calculator.

**Bewust ongewijzigd gelaten** na controle — deze H1's noemden het onderwerp al direct, geen
quote-patroon: de "blog-stijl" artikelen (afvallen-na-40, afvallen-tijdens-overgang,
krachttraining-vrouwen-40-plus, spieropbouw-na-40, hyrox-voorbereiding-schema,
kosten-personal-trainer), de 3 landingspagina's met eigen opmaak
(beste-personal-trainer-leiderdorp, personal-trainer-alphen-aan-den-rijn,
sportschool-zoeterwoude), bedankt-pagina (transactionele bevestigingstekst, geen
paginatitel) en privacybeleid. Homepage-H1 ("Sterker, fitter en gezonder met persoonlijke
coaching") eerder al apart besproken met de klant en bewust ongewijzigd gelaten — dat is de
kernpositionering, geen losse pagina-quote.

_Impact: Copy/merkstem — consistente, feitelijke paginakoppen site-breed; CRO (bezoeker ziet
direct waar de pagina over gaat i.p.v. een vage tagline te moeten interpreteren)._

