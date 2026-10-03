# AutoSEO v4 phase 3

The existing GSC/GA4 scoring model, query/page identity, conversion actions and
top-50 budget are unchanged. Schema `2.1.0` adds `technicalIntelligence`,
`technicalActions` and `providerHooks`. Existing `opportunities` and
`opportunities.json` retain their prior semantics. Page/site technical actions
are in `technical-actions.json` and a separate workflow summary section; they
have their own priority, no query attribution and no fabricated numeric score.

## Technical SEO and PageSpeed

Native Node fetch; no npm dependencies. Selection: homepage, configured important
URLs, then highest-impression GSC pages and GA4 landing pages. Same-origin URLs
only; query strings/fragments removed. Default five URLs, hard maximum ten.
Checks run sequentially with bounded request timeouts and five redirect hops.
HTML redirects outside the site origin are reported unavailable and not followed.

- HTML: missing/multiple title, description and canonical tags; duplicate values
  across the sample; invalid canonical URL; meta/X-Robots-Tag noindex; HTTP status,
  redirect chain, H1 count and unique internal link counts/empty/malformed hrefs.
- Site: robots.txt and sitemap.xml HTTP reachability and basic content recognition.
- PSI mobile: performance/SEO/accessibility/best-practices scores (0–100), lab
  LCP/FCP/TBT (ms), CLS (unitless), URL field INP p75 (ms) if supplied. Origin INP
  is stored separately and never attributed to a page. TBT is not INP.
- Signals: `technical_seo_issue`, `pagespeed_issue`. Speed review thresholds:
  performance/SEO <90, LCP >2500 ms, CLS >0.1, TBT >200 ms, FCP >1800 ms,
  URL INP >200 ms. These are review heuristics, not predictions or CWV certification.

Missing metrics are null. Quotas, API/runtime errors and timeouts are explicit
unavailable results; they do not zero-fill scores or abort GSC/GA4 output.
Failures are summarized without API keys or upstream error bodies. No OAuth
token is sent to public-site/PSI requests. No automatic page fixes are performed.

Configuration in workflow/environment:

| Variable | Default / meaning |
|---|---|
| `PAGESPEED_API_KEY` | Optional GitHub secret; public PSI endpoint used if absent |
| `AUTOSEO_IMPORTANT_URLS` | Comma-separated same-origin URLs/paths; workflow includes PT and pricing |
| `AUTOSEO_TECHNICAL_MAX_URLS` | 5, maximum 10 |
| `AUTOSEO_FETCH_TIMEOUT_MS` | HTML/resource timeout 15000, maximum 30000; PSI 45000 |

No retries are made in this compact phase. A public PSI quota rejection requires
a later run or an available API key. Duplicate detection is sample-only; HTML
parsing is static and intentionally lightweight, not a browser DOM. No JS render,
full broken-link crawl, robots rule evaluation, sitemap traversal, CrUX integration,
history store or desktop audit is included. PSI availability/fields depend on Google.
API contract: https://developers.google.com/speed/docs/insights/v5/reference/pagespeedapi/runpagespeed

## Reserved provider hooks

`AUTOSEO_RANKING_PROVIDER`, `AUTOSEO_BACKLINK_PROVIDER` are optional repository
variables. Corresponding `AUTOSEO_RANKING_API_KEY` and `AUTOSEO_BACKLINK_API_KEY`
are secret placeholders. Configuration never enables a provider in phase 3:
`enabled:false`, `status:not_integrated`, `records:[]`. Only credential presence
is recorded, never its value. There are no paid calls, adapters or dependencies.

A future explicitly implemented adapter should return the following records:

- Ranking: `query` (string), `url` (absolute URL), `position` (positive number or
  null for unranked), `country` (ISO country code), `device` (mobile/desktop),
  `observedAt` (ISO timestamp).
- Backlink: `sourceUrl`, `targetUrl` (absolute URLs), `anchorText` (string),
  `follow` (boolean or null), `firstSeen`, `lastSeen` (ISO timestamps or null).

Keep provider provenance and measurement time with results; do not mix provider
rank snapshots with GSC average position or use unknown backlinks as zero counts.
Future adapters require validation and tests before activation. No provider was
found in the existing workflow; repository secret names were inspected without
reading values and contained no ranking/backlink/PageSpeed credentials.

## Validation

Run from repository root:

```sh
node --check .github/autoseo-v4-intelligence.mjs
node --check .github/autoseo-v4-technical.mjs
node .github/autoseo-v4-intelligence.mjs --self-test
node --test .github/autoseo-v4-technical.test.mjs
```

Tests cover parsing, duplicates, URL selection, null/zero metrics, INP scope,
redirects, quotas, timeouts, credential isolation, disabled hooks and an engine
run with mocked GSC/GA4/PSI validating all output files and summary. The workflow
retains Google authentication and artifact upload; live API success requires a
real authenticated workflow run.
