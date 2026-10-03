// Dependency-free, bounded page-level intelligence. Never uses the Google OAuth token.
const number = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
const limit = (v, fallback, max) => Number.isInteger(Number(v)) && Number(v) > 0 ? Math.min(Number(v), max) : fallback;
const clean = (s) => s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const decode = (s) => s.replace(/&(?:amp|quot|apos|lt|gt|#(\d+)|#x([\da-f]+));/gi, (m, d, h) => {
  if (d || h) { const n = parseInt(d || h, d ? 10 : 16); return n <= 0x10ffff ? String.fromCodePoint(n) : m; }
  return ({ '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' })[m.toLowerCase()] || m;
});
function attributes(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
  return attrs;
}
export function selectUrls(siteUrl, gscPages = [], ga4Pages = [], env = {}) {
  const origin = new URL(siteUrl).origin;
  const candidates = [siteUrl, ...(env.AUTOSEO_IMPORTANT_URLS || '').split(','),
    ...[...gscPages].sort((a, b) => b.impressions - a.impressions).map(r => r.path),
    ...[...ga4Pages].sort((a, b) => b.sessions - a.sessions).map(r => r.path)];
  const urls = new Set();
  for (const value of candidates) {
    if (!value?.trim()) continue;
    try {
      const url = new URL(value.trim(), siteUrl);
      if (url.origin !== origin || !/^https?:$/.test(url.protocol) || url.username || url.password) continue;
      url.search = ''; url.hash = '';
      urls.add(url.href);
    } catch { /* Invalid candidates do not abort the existing intelligence run. */ }
  }
  return [...urls].slice(0, limit(env.AUTOSEO_TECHNICAL_MAX_URLS, 5, 10));
}
export function inspectHtml(html, url, xRobots = '') {
  const source = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const titles = [...source.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/gi)].map(m => decode(clean(m[1])));
  const metas = [...source.matchAll(/<meta\b[^>]*>/gi)].map(m => attributes(m[0]));
  const descriptions = metas.filter(a => a.name?.toLowerCase() === 'description').map(a => a.content || '');
  const canonicals = [...source.matchAll(/<link\b[^>]*>/gi)].map(m => attributes(m[0]))
    .filter(a => a.rel?.toLowerCase().split(/\s+/).includes('canonical')).map(a => a.href || '');
  const robots = [xRobots, ...metas.filter(a => /^(robots|googlebot)$/i.test(a.name || '')).map(a => a.content || '')].join(',');
  const h1Count = [...source.matchAll(/<h1\b[^>]*>/gi)].length;
  const internal = new Set(); let emptyLinks = 0; let invalidLinks = 0;
  for (const m of source.matchAll(/<a\b[^>]*>/gi)) {
    const href = attributes(m[0]).href;
    if (href === undefined || !href.trim()) { emptyLinks++; continue; }
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    try { const link = new URL(href, url); if (link.origin === new URL(url).origin) { link.hash = ''; internal.add(link.href); } }
    catch { invalidLinks++; }
  }
  const issues = [];
  for (const [name, values] of [['title', titles], ['meta_description', descriptions], ['canonical', canonicals]]) {
    if (!values.length || values.some(v => !v.trim())) issues.push(`missing_${name}`);
    if (values.length > 1) issues.push(`multiple_${name}`);
  }
  for (const canonical of canonicals.filter(Boolean)) {
    try { if (!/^https?:$/.test(new URL(canonical, url).protocol)) issues.push('invalid_canonical'); }
    catch { issues.push('invalid_canonical'); }
  }
  if (/\b(noindex|none)\b/i.test(robots)) issues.push('noindex');
  if (h1Count !== 1) issues.push('h1_count');
  if (!internal.size) issues.push('no_internal_links');
  if (emptyLinks || invalidLinks) issues.push('invalid_internal_link_basics');
  return { titles, descriptions, canonicals, noindex: /\b(noindex|none)\b/i.test(robots), h1Count,
    internalLinks: { uniqueCount: internal.size, emptyLinks, invalidLinks }, issues: [...new Set(issues)] };
}
export function markDuplicates(pages) {
  for (const [field, code] of [['titles', 'duplicate_title'], ['descriptions', 'duplicate_meta_description'], ['canonicals', 'duplicate_canonical']]) {
    const seen = new Map();
    for (const page of pages.filter(p => p.technical.status === 'ok')) {
      for (let value of new Set(page.technical[field])) {
        value = value.trim(); if (!value) continue;
        if (field === 'canonicals') { try { value = new URL(value, page.technical.finalUrl).href; } catch { continue; } }
        else value = value.toLowerCase().replace(/\s+/g, ' ');
        const group = seen.get(value) || []; group.push(page); seen.set(value, group);
      }
    }
    for (const group of seen.values()) if (group.length > 1) for (const p of group) p.technical.issues = [...new Set([...p.technical.issues, code])];
  }
}
export function parsePageSpeed(data) {
  const lh = data?.lighthouseResult;
  if (!lh || lh.runtimeError) throw new Error('invalid_lighthouse_result');
  const metric = (id) => number(lh.audits?.[id]?.numericValue);
  const score = (id) => { const n = number(lh.categories?.[id]?.score); return n === null || n > 1 ? null : Math.round(n * 100); };
  const field = data.loadingExperience?.metrics || {};
  const originField = data.originLoadingExperience?.metrics || {};
  return { status: 'ok', strategy: lh.configSettings?.formFactor || lh.configSettings?.emulatedFormFactor || 'mobile',
    measuredAt: lh.fetchTime || data.analysisUTCTimestamp || null, finalUrl: lh.finalUrl || null,
    scores: { performance: score('performance'), seo: score('seo'), accessibility: score('accessibility'), bestPractices: score('best-practices') },
    lab: { lcpMs: metric('largest-contentful-paint'), cls: metric('cumulative-layout-shift'), tbtMs: metric('total-blocking-time'), fcpMs: metric('first-contentful-paint') },
    field: { scope: 'url', inpMs: number(field.INTERACTION_TO_NEXT_PAINT?.percentile) },
    originField: { scope: 'origin', inpMs: number(originField.INTERACTION_TO_NEXT_PAINT?.percentile) } };
}
async function request(url, fetchImpl, timeoutMs, bodyType = 'text', sameOrigin = null) {
  const signal = AbortSignal.timeout(timeoutMs);
  let current = url; const redirects = [];
  for (let hop = 0; hop <= 5; hop++) {
    const res = await fetchImpl(current, { signal, redirect: 'manual', headers: { 'User-Agent': 'AutoSEO-v4-Intelligence' } });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) throw new Error('redirect_without_location');
      const next = new URL(location, current);
      if (!/^https?:$/.test(next.protocol) || next.username || next.password || (sameOrigin && next.origin !== sameOrigin)) throw new Error('external_redirect');
      redirects.push({ status: res.status, from: current, to: next.href }); current = next.href; continue;
    }
    const body = bodyType === 'json' && res.ok ? await res.json() : await res.text();
    return { statusCode: res.status, ok: res.ok, finalUrl: current, redirects, headers: res.headers, body };
  }
  throw new Error('redirect_limit');
}
const failure = (error) => ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' :
  ['external_redirect', 'redirect_limit', 'redirect_without_location', 'invalid_lighthouse_result'].includes(error.message) ? error.message : 'request_failed';
export function providerHooks(env = {}) {
  return Object.fromEntries(['ranking', 'backlink'].map(kind => {
    const prefix = `AUTOSEO_${kind.toUpperCase()}`;
    return [kind, { provider: env[`${prefix}_PROVIDER`] || null, configured: Boolean(env[`${prefix}_PROVIDER`]),
      credentialsPresent: Boolean(env[`${prefix}_API_KEY`]), status: 'not_integrated', enabled: false,
      records: [], expectedFields: kind === 'ranking'
        ? ['query', 'url', 'position', 'country', 'device', 'observedAt']
        : ['sourceUrl', 'targetUrl', 'anchorText', 'follow', 'firstSeen', 'lastSeen'] }];
  }));
}
export async function collectTechnical({ siteUrl, gscPages = [], ga4Pages = [], env = process.env, fetchImpl = fetch }) {
  const urls = selectUrls(siteUrl, gscPages, ga4Pages, env);
  const origin = new URL(siteUrl).origin;
  const timeout = limit(env.AUTOSEO_FETCH_TIMEOUT_MS, 15000, 30000);
  const resources = [];
  for (const path of ['/robots.txt', '/sitemap.xml']) {
    const url = new URL(path, origin).href;
    try {
      const r = await request(url, fetchImpl, timeout, 'text', origin);
      const validContent = path.endsWith('.xml') ? /<(urlset|sitemapindex)\b/i.test(r.body) : /^(?:user-agent|sitemap)\s*:/im.test(r.body);
      resources.push({ url, status: 'ok', statusCode: r.statusCode, reachable: r.ok, validContent, finalUrl: r.finalUrl, redirects: r.redirects });
    } catch (error) { resources.push({ url, status: 'unavailable', reachable: null, error: failure(error) }); }
  }
  const pages = [];
  for (const url of urls) {
    const page = { url, path: new URL(url).pathname, technical: null, pagespeed: null };
    try {
      const r = await request(url, fetchImpl, timeout, 'text', origin);
      const html = /(?:text\/html|application\/xhtml\+xml)/i.test(r.headers.get('content-type') || '');
      const analysis = html && r.ok ? inspectHtml(r.body, r.finalUrl, r.headers.get('x-robots-tag') || '') : { issues: [], titles: [], descriptions: [], canonicals: [] };
      if (!r.ok) analysis.issues.push('http_status');
      if (r.ok && !html) analysis.issues.push('non_html_response');
      if (r.redirects.length) analysis.issues.push('redirect');
      page.technical = { status: 'ok', statusCode: r.statusCode, finalUrl: r.finalUrl, redirects: r.redirects, ...analysis };
    } catch (error) { page.technical = { status: 'unavailable', issues: [], error: failure(error) }; }
    try {
      const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
      endpoint.searchParams.set('url', url); endpoint.searchParams.set('strategy', 'mobile');
      for (const category of ['performance', 'seo', 'accessibility', 'best-practices']) endpoint.searchParams.append('category', category);
      if (env.PAGESPEED_API_KEY) endpoint.searchParams.set('key', env.PAGESPEED_API_KEY);
      const r = await request(endpoint.href, fetchImpl, 45000, 'json');
      page.pagespeed = r.ok ? parsePageSpeed(r.body) : { status: 'unavailable', error: `http_${r.statusCode}` };
    } catch (error) { page.pagespeed = { status: 'unavailable', error: failure(error) }; }
    pages.push(page);
  }
  markDuplicates(pages);
  return { measuredAt: new Date().toISOString(), scope: 'sampled_urls', resources, pages };
}
export function technicalActions(intelligence) {
  const actions = [];
  for (const p of intelligence.pages) {
    const issues = [...p.technical.issues]; const speed = [];
    if (p.pagespeed.status === 'ok') {
      const { scores, lab, field } = p.pagespeed;
      for (const [name, value, threshold, below] of [
        ['performance', scores.performance, 90, true], ['seo', scores.seo, 90, true],
        ['lcpMs', lab.lcpMs, 2500], ['cls', lab.cls, 0.1], ['tbtMs', lab.tbtMs, 200],
        ['fcpMs', lab.fcpMs, 1800], ['inpMs', field.inpMs, 200],
      ]) if (value !== null && (below ? value < threshold : value > threshold)) speed.push(name);
    }
    if (!issues.length && !speed.length) continue;
    const signals = [...(issues.length ? ['technical_seo_issue'] : []), ...(speed.length ? ['pagespeed_issue'] : [])];
    const high = issues.some(i => ['http_status', 'noindex', 'missing_canonical', 'invalid_canonical'].includes(i));
    actions.push({ id: JSON.stringify(['technical_page', p.url]), scope: 'page', page: p.url, path: p.path,
      type: signals[0], signals, priority: high ? 'High' : 'Medium',
      evidence: { technicalIssues: issues, pagespeedIssues: speed, technical: p.technical, pagespeed: p.pagespeed },
      recommendedAction: 'Review the measured page issues; confirm intended indexing/canonical/redirect behavior and repeat lab measurements before editing.' });
  }
  for (const r of intelligence.resources) if (r.status === 'ok' && (!r.reachable || !r.validContent)) actions.push({
    id: JSON.stringify(['technical_site', r.url]), scope: 'site', page: r.url, type: 'technical_seo_issue',
    signals: ['technical_seo_issue'], priority: 'High', evidence: r,
    recommendedAction: 'Restore a reachable, valid robots.txt or sitemap response.' });
  return actions.sort((a, b) => (a.priority === 'High' ? 0 : 1) - (b.priority === 'High' ? 0 : 1) || a.id.localeCompare(b.id));
}
