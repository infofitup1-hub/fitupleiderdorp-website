import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { inspectHtml, selectUrls, parsePageSpeed, markDuplicates, isRedundantAddition, findRedundantBlocks, collectTechnical, technicalActions, providerHooks } from './autoseo-v4-technical.mjs';
const site = 'https://example.com/';
const html = '<title>One &amp; two</title><meta content="Description" name="description"><link href="/" rel="canonical"><h1>Hello</h1><a href="/next">Next</a>';
const psi = { lighthouseResult: { categories: { performance: { score: 0.6 }, seo: { score: 1 } }, audits: {
  'largest-contentful-paint': { numericValue: 3000 }, 'cumulative-layout-shift': { numericValue: 0 },
  'total-blocking-time': { numericValue: 250 }, 'first-contentful-paint': { numericValue: 1200 },
} }, loadingExperience: { metrics: { INTERACTION_TO_NEXT_PAINT: { percentile: 220 } } } };
test('HTML parsing, noindex, multiple/missing tags and link basics', () => {
  const good = inspectHtml(html, site);
  assert.deepEqual(good.issues, []); assert.equal(good.titles[0], 'One & two');
  const bad = inspectHtml(`<!-- <h1>fake</h1> --><script>"<h1>fake</h1>"</script><title>A</title><title>B</title><meta name=robots content=noindex><a href="">X</a>`, site);
  for (const code of ['multiple_title', 'missing_meta_description', 'missing_canonical', 'noindex', 'h1_count', 'no_internal_links', 'invalid_internal_link_basics']) assert.ok(bad.issues.includes(code));
  assert.ok(inspectHtml(html, site, 'googlebot: noindex').noindex);
  assert.ok(inspectHtml(html + '<link rel=canonical href="javascript:void(0)">', site).issues.includes('invalid_canonical'));
});
test('selection is bounded, same-origin and deterministic; duplicate scope is separate', () => {
  assert.deepEqual(selectUrls(site, [{ path: '/a', impressions: 1 }], [], { AUTOSEO_IMPORTANT_URLS: '/b,https://evil.test/,/b?x=1' }), [site, site + 'b', site + 'a']);
  assert.equal(selectUrls(site, [], [], { AUTOSEO_TECHNICAL_MAX_URLS: '-1' }).length, 1);
  const pages = ['a', 'b'].map(path => ({ technical: { status: 'ok', finalUrl: site + path, ...inspectHtml(html, site + path) } }));
  markDuplicates(pages);
  assert.deepEqual(pages[0].technical.issues, ['duplicate_title', 'duplicate_meta_description', 'duplicate_canonical']);
});
test('PSI zero vs missing; field INP stays distinct from lab TBT and origin data', () => {
  const p = parsePageSpeed(psi);
  assert.equal(p.scores.performance, 60); assert.equal(p.scores.accessibility, null);
  assert.equal(p.lab.cls, 0); assert.equal(p.field.inpMs, 220);
  assert.equal(parsePageSpeed({ lighthouseResult: {}, originLoadingExperience: psi.loadingExperience }).field.inpMs, null);
  assert.throws(() => parsePageSpeed({ lighthouseResult: { runtimeError: {} } }));
  assert.throws(() => parsePageSpeed({}));
});
test('collection handles redirects, resource errors, quota and unavailable data without leaking keys', async () => {
  const seen = [];
  const fake = async (url, options) => {
    seen.push({ url, options });
    if (url.includes('googleapis')) return new Response('quota SECRET', { status: 429 });
    if (url.endsWith('robots.txt')) return new Response('missing', { status: 404 });
    if (url.endsWith('sitemap.xml')) return new Response('<urlset/>');
    if (url === site) return new Response('', { status: 301, headers: { location: '/home' } });
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  };
  const data = await collectTechnical({ siteUrl: site, env: { PAGESPEED_API_KEY: 'SECRET' }, fetchImpl: fake });
  assert.equal(data.pages[0].technical.redirects[0].status, 301);
  assert.equal(data.pages[0].pagespeed.error, 'http_429');
  assert.ok(!JSON.stringify(data).includes('SECRET'));
  assert.ok(seen.every(r => !r.options.headers.Authorization));
  assert.ok(technicalActions(data).some(a => a.scope === 'site'));
  assert.ok(!technicalActions(data).some(a => a.signals.includes('pagespeed_issue')));
  const missing = await collectTechnical({ siteUrl: site, env: {}, fetchImpl: async () => { throw new DOMException('secret', 'TimeoutError'); } });
  assert.equal(missing.pages[0].technical.error, 'timeout');
  assert.deepEqual(technicalActions(missing), []);
});
test('valid PSI produces page-only actions and providers never activate', async () => {
  const data = await collectTechnical({ siteUrl: site, env: {}, fetchImpl: async url => {
    if (url.includes('googleapis')) return Response.json(psi);
    return new Response(url.endsWith('robots.txt') ? 'User-agent: *' : url.endsWith('sitemap.xml') ? '<urlset/>' : html, { headers: { 'content-type': 'text/html' } });
  } });
  const actions = technicalActions(data);
  assert.equal(actions.length, 1); assert.deepEqual(actions[0].signals, ['pagespeed_issue']);
  assert.equal(actions[0].query, undefined); assert.equal(actions[0].score, undefined);
  const hooks = providerHooks({ AUTOSEO_RANKING_PROVIDER: 'future', AUTOSEO_RANKING_API_KEY: 'SECRET' });
  assert.equal(hooks.ranking.enabled, false); assert.equal(hooks.ranking.credentialsPresent, true);
  assert.ok(!JSON.stringify(hooks).includes('SECRET'));
});
test('workflow engine end-to-end writes additive schema and preserves opportunity output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'autoseo-v4-'));
  try {
    const fixture = join(dir, 'fetch.mjs');
    await writeFile(fixture, `globalThis.fetch = async (url) => {
      if (url.includes('webmasters')) return Response.json({rows:[{keys:['fitness','https://example.com/'],clicks:1,impressions:1000,ctr:0.001,position:6}]});
      if (url.includes('analyticsdata')) return Response.json({metricHeaders:[],rows:[]});
      if (url.includes('pagespeedonline')) return new Response('quota', {status:429});
      return new Response(url.endsWith('robots.txt') ? 'User-agent: *' : url.endsWith('sitemap.xml') ? '<urlset/>' : ${JSON.stringify(html)}, {headers:{'content-type':'text/html'}});
    };`);
    const run = spawnSync(process.execPath, ['--import', pathToFileURL(fixture).href, '.github/autoseo-v4-intelligence.mjs'], {
      encoding: 'utf8', env: { ...process.env, ACCESS_TOKEN: 'fixture', GSC_SITE_URL: site, AUTOSEO_OUTPUT_DIR: dir, AUTOSEO_IMPORTANT_URLS: '', AUTOSEO_TECHNICAL_MAX_URLS: '1' },
    });
    assert.equal(run.status, 0, run.stderr);
    const payload = JSON.parse(await readFile(join(dir, 'intelligence-input.json')));
    assert.equal(payload.schemaVersion, '2.1.0');
    assert.equal(payload.metadata.scoringModel, 'autoseo-v4-heuristic-2');
    assert.deepEqual(payload.opportunities, JSON.parse(await readFile(join(dir, 'opportunities.json'))));
    assert.deepEqual(payload.technicalActions, JSON.parse(await readFile(join(dir, 'technical-actions.json'))));
    assert.ok(payload.opportunities.every(a => !a.signals.includes('pagespeed_issue')));
    assert.ok((await readFile(join(dir, 'summary.md'), 'utf8')).includes('http_429'));
    const workflow = await readFile('.github/workflows/seo-intelligence-v4.yml', 'utf8');
    for (const required of ['node --test .github/autoseo-v4-technical.test.mjs', 'secrets.PAGESPEED_API_KEY', 'artifacts/autoseo-v4/', 'steps.auth.outputs.access_token']) assert.ok(workflow.includes(required));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
test('redundante tekst: herhaling wordt gesignaleerd, nieuw onderwerp niet', () => {
  const page = '<h1>Fit Up</h1><p>Kleinschalige sportschool in Leiderdorp met 24/7 fitness, personal training en groepslessen. Gratis parkeren voor de deur.</p>';
  assert.equal(isRedundantAddition(page, 'Fit Up is een kleinschalige sportschool in Leiderdorp met gratis parkeren, 24/7 fitness en personal training.').redundant, true);
  assert.equal(isRedundantAddition(page, 'EMS-training duurt twintig minuten en gebruikt elektrostimulatie via speciale pakken.').redundant, false);
  const twice = '<p>Kleinschalige sportschool in Leiderdorp met 24/7 fitness en personal training voor iedereen.</p><p>Kleinschalige sportschool in Leiderdorp met 24/7 fitness en personal training voor iedereen.</p>';
  assert.equal(findRedundantBlocks(twice).length, 1);
  assert.ok(inspectHtml(html + twice, site).issues.includes('redundant_text'));
});
