# CLAUDE.md — Fit Up Leiderdorp (productiesite)

Bestaande productiesite. Geen redesign vanaf nul: SEO, routes, content, formulieren, tracking en conversieflow blijven behouden. Niets live deployen zonder expliciet akkoord. Grote visuele wijzigingen incrementeel met checkpoint, niet in één keer over veel pagina's.

## Vaste designrichting (geldt voor ALLE pagina's)

Premium boutique fitness: krachtig maar rustig, echte FitUP-fotografie, cinematic waar passend, asymmetrische/editorial composities waar logisch, minder generieke grids/cards, geen AI-template-uitstraling. Mobiel heeft dezelfde premium kwaliteit als desktop.

### Kleurtokens (doel-waarden)
| Token | Waarde |
|---|---|
| Primary black | `#080A09` |
| Soft black | `#101311` |
| Graphite | `#191D1A` |
| Warm white | `#F4F5F1` |
| Secondary text (donker) | `#A7ADA8` |
| Dark text | `#121512` |
| Muted text (licht vlak) | `#606660` |
| FitUP lime | `#B7F229` |
| Lime hover | `#9EDB20` |

### Achtergronden
- Donkere vlakken: egaal zwart/off-black uit bovenstaande tokens. Geen prints, patronen, grain, decoratieve textures of willekeurige zwarttinten.
- Lichte secties: warm white (`#F4F5F1`) in plaats van hard wit waar passend.

### Lime
Alleen als gecontroleerd accent: CTA's, highlights, kleine lijnen, cijfers, badges, actieve states. Nooit dominante paginakleur, geen grote lime vlakken.

### Typografie
Krachtige editorial hiërarchie, consistente H1/H2/H3/body-stijlen. Body en informatieve tekst minimaal 16px. Geen kleine-lettertjeslook.

### Buttons (max. twee hoofdvarianten sitebreed)
1. Primary: lime + donkere tekst (hover `#9EDB20`).
2. Secondary: transparant/donker + witte tekst + subtiele border.

### Borders / radii
- Donkere border: `rgba(255,255,255,0.10)`; lichte border: `rgba(0,0,0,0.08)`.
- Consistente radii, geen overdreven SaaS/rounded-card look.

## Technische context
- Statische HTML op Netlify. Pagina-CSS grotendeels inline per pagina; gedeeld: `assets/css/seo.css` (landingspagina's, bevat het `:root`-designsysteem), `assets/css/conversion-layer.css`, `assets/css/style.css` (klein). Homepage `index.html` heeft een eigen inline `:root`.
- Fonts: Barlow Condensed (koppen), DM Sans (body).
- Nieuwe tokens/wijzigingen eerst centraal (seo.css `:root` + homepage `:root`), daarna pagina's laten verwijzen naar tokens in plaats van hardcoded hex.

## Implementatiestatus designsysteem (Fase 1, sep 2026)
- Tokens staan als `--color-*`, `--border-*`, `--radius-*` in `index.html` `:root` en in `assets/css/seo.css` (onderaan, blok "DESIGN SYSTEM v2"). Afgeleide tokens buiten de vaste set: `--color-white-warm-alt: #ECEEE8` (afwisselende lichte sectie, zodat kaarten in warm white zichtbaar blijven), `--color-lime-ink: #4a5900` (leesbare limetint voor tekst op licht), `--border-dark-strong: rgba(255,255,255,.24)` (secundaire buttons), `--radius-btn: 6px`, `--radius-card: 10px`.
- Homepage: volledig omgezet (legacy variabelen zijn aliassen naar de tokens).
- `seo.css` is gedeeld door ~33 pagina's. Het v2-blok werkt alleen op `<body class="ds2">`; alleen `/personal-training-leiderdorp/` heeft die class. Sitebrede uitrol = class op alle pagina's + `.ds2`-prefixen opruimen.
- Bewust behouden: WhatsApp-groen (#25D366), semantisch groen/rood van check/kruis-icoontjes, `#d92d20` foutrood.
- Fase 2: `conversion-layer.css` (widget staat uit: `enabled:false`) en `style.css` omgezet naar tokens met fallbacks.
- Gemigreerd (class `ds2` op body): `/personal-training-leiderdorp/`, `/small-group-personal-training-leiderdorp/`, `/nieuws/` (via seo.css v2-blok), `/tarieven/` en `/trainingsaanbod/groepslessen/` (eigen inline CSS: tokens in `:root` + blok "DS2 harmonisatie" onderaan de laatste `<style>`).
- Tarieven: alle kaarten `.tc` met `<details open>`; de "Meer informatie"-summary is verborgen zodat alle kenmerken standaard zichtbaar zijn.
- Pagina's met eigen CSS migreren = `:root` legacy-variabelen aliassen naar tokens + regex-mapping van oude kleuren/radii + harmonisatieblok (buttons, nav, footer, 16px-tekst).
- Lokaal 404 op `/.netlify/functions/schedule` is normaal (statische dev-server draait geen Netlify Functions).
- Fase 3: 8 pure-seo.css pagina's op `ds2` (sportschool, fitnessclub, fitness-40-plus, vrouwen-fitness, hyrox-training, afvallen, personal-trainer, fitness-voor-beginners). Alle ds2-pagina's laden `seo.css?v=20260927`; bij elke seo.css-wijziging één nieuwe versie voor alle ds2-pagina's tegelijk.
- Inline `style=""`-attributen op pagina's (promokaart 'Lees ook', Google-regel, lokale alinea) zijn per pagina naar tokens/16px gezet.
- Fase 4A: 6 pure seo.css-pagina's op `ds2` (spiermassa, krachttraining, PT Leiden/Oegstgeest/Voorschoten, voedingscoach). Bewust overgeslagen: personal-trainer-alphen-aan-den-rijn, sportschool-zoeterwoude, beste-personal-trainer-leiderdorp (50-65 inline design-styles, o.a. lime vlakken en eigen buttons) plus alle pagina's met eigen `<style>`.
- Fase 4B: 6 artikelpagina's (afvallen-na-40, afvallen-tijdens-overgang, hyrox-voorbereiding-schema, kosten-personal-trainer, krachttraining-vrouwen-40-plus, spieropbouw-na-40) op `ds2`. Inline design-styles vervangen door `.art-*`-klassen in de lokale `<style>` (tokens); lichte artikelbody, donkere hero/kaarten, geen lime vlakken. Ontbrekende Google Fonts-link toegevoegd (deze pagina's renderden in Arial) en nav krijgt een vaste donkere achtergrond (geen scroll-script op deze pagina's).
