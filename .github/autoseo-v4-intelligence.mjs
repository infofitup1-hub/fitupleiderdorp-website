import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import assert from 'node:assert/strict';

const SITE_URL = process.env.GSC_SITE_URL || 'https://fitupleiderdorp.nl/';
const GA4_PROPERTY_ID = process.env.GA4_PROPERTY_ID || '540487028';
const ACCESS_TOKEN = process.env.ACCESS_TOKEN || '';
const OUTPUT_DIR = process.env.AUTOSEO_OUTPUT_DIR || 'artifacts/autoseo-v4';

const QUESTION_PREFIXES = ['wat ', 'hoe ', 'waar ', 'welke ', 'wanneer ', 'waarom ', 'kan ', 'is ', 'zijn '];
const LOCAL_TERMS = ['leiderdorp', 'leiden', 'sportschool', 'fitness', 'personal trainer', 'personal training', 'small group', 'afvallen', 'krachttraining', 'gym'];

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function dateRanges() {
  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);

  const currentStart = new Date(end);
  currentStart.setUTCDate(currentStart.getUTCDate() - 27);

  const previousEnd = new Date(currentStart);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - 27);

  return {
    current: { startDate: isoDate(currentStart), endDate: isoDate(end) },
    previous: { startDate: isoDate(previousStart), endDate: isoDate(previousEnd) },
  };
}

function normalizePath(value) {
  if (!value || value === '(not set)' || value === '/') return '/';
  try {
    const url = value.startsWith('http') ? new URL(value) : new URL(value, SITE_URL);
    let path = url.pathname || '/';
    if (path.length > 1) path = path.replace(/\/+$/, '');
    return path || '/';
  } catch {
    const path = value.split('?')[0].replace(/\/+$/, '');
    return path || '/';
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!response.ok) {
    const detail = data?.error?.message || text || response.statusText;
    throw new Error(`${response.status} ${response.statusText}: ${detail}`);
  }
  return data;
}

async function fetchGsc(range) {
  const encodedSite = encodeURIComponent(SITE_URL);
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`;
  const body = {
    startDate: range.startDate,
    endDate: range.endDate,
    dimensions: ['query', 'page'],
    rowLimit: 25000,
    startRow: 0,
  };
  const data = await fetchJson(url, { method: 'POST', body: JSON.stringify(body) });
  return (data.rows || []).map((row) => ({
    query: row.keys?.[0] || '',
    page: row.keys?.[1] || '',
    path: normalizePath(row.keys?.[1] || ''),
    clicks: Number(row.clicks || 0),
    impressions: Number(row.impressions || 0),
    ctr: Number(row.ctr || 0),
    position: Number(row.position || 0),
  }));
}

async function runGa4(range, includeKeyEvents = true) {
  const metrics = ['sessions', 'engagedSessions', 'totalUsers'];
  if (includeKeyEvents) metrics.push('keyEvents');

  const body = {
    dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
    dimensions: [{ name: 'landingPagePlusQueryString' }],
    metrics: metrics.map((name) => ({ name })),
    limit: '10000',
  };

  return fetchJson(`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

async function fetchGa4(range) {
  let data;
  let keyEventsAvailable = true;
  try {
    data = await runGa4(range, true);
  } catch (error) {
    if (!String(error.message).includes('keyEvents')) throw error;
    keyEventsAvailable = false;
    console.warn('GA4 keyEvents metric unavailable; retrying without it.');
    data = await runGa4(range, false);
  }

  const metricNames = (data.metricHeaders || []).map((h) => h.name);
  const rows = (data.rows || []).map((row) => {
    const metrics = Object.fromEntries(metricNames.map((name, i) => [name, Number(row.metricValues?.[i]?.value || 0)]));
    const landingPage = row.dimensionValues?.[0]?.value || '/';
    const sessions = metrics.sessions || 0;
    const engagedSessions = metrics.engagedSessions || 0;
    return {
      landingPage,
      path: normalizePath(landingPage),
      sessions,
      engagedSessions,
      engagementRate: sessions > 0 ? engagedSessions / sessions : 0,
      totalUsers: metrics.totalUsers || 0,
      keyEvents: metrics.keyEvents || 0,
    };
  });

  return { rows, keyEventsAvailable };
}

function aggregateGa4(rows) {
  const map = new Map();
  for (const row of rows) {
    const item = map.get(row.path) || { path: row.path, sessions: 0, engagedSessions: 0, totalUsers: 0, keyEvents: 0 };
    item.sessions += row.sessions;
    item.engagedSessions += row.engagedSessions;
    item.totalUsers += row.totalUsers;
    item.keyEvents += row.keyEvents;
    map.set(row.path, item);
  }
  return [...map.values()].map((row) => ({
    ...row,
    engagementRate: row.sessions > 0 ? row.engagedSessions / row.sessions : 0,
  }));
}

function gscKey(row) {
  return `${row.query}\u0000${row.page}`;
}

function enrichGsc(current, previous) {
  const prev = new Map(previous.map((row) => [gscKey(row), row]));
  return current.map((row) => {
    const old = prev.get(gscKey(row));
    return {
      ...row,
      previous: old ? {
        clicks: old.clicks,
        impressions: old.impressions,
        ctr: old.ctr,
        position: old.position,
      } : null,
      change: old ? {
        clicksPct: old.clicks > 0 ? (row.clicks - old.clicks) / old.clicks : null,
        impressionsPct: old.impressions > 0 ? (row.impressions - old.impressions) / old.impressions : null,
        position: old.position - row.position,
      } : null,
    };
  });
}

function aggregateGscPages(rows) {
  const map = new Map();
  for (const row of rows) {
    const item = map.get(row.path) || { path: row.path, clicks: 0, impressions: 0, weightedPosition: 0, queries: 0 };
    item.clicks += row.clicks;
    item.impressions += row.impressions;
    item.weightedPosition += row.position * row.impressions;
    item.queries += 1;
    map.set(row.path, item);
  }
  return [...map.values()].map((row) => ({
    path: row.path,
    clicks: row.clicks,
    impressions: row.impressions,
    ctr: row.impressions > 0 ? row.clicks / row.impressions : 0,
    position: row.impressions > 0 ? row.weightedPosition / row.impressions : 0,
    queries: row.queries,
  }));
}

function ctrTarget(position) {
  if (position <= 3) return 0.12;
  if (position <= 5) return 0.08;
  if (position <= 10) return 0.04;
  if (position <= 15) return 0.02;
  return 0.01;
}

function isQuestion(query) {
  const q = query.trim().toLowerCase();
  return QUESTION_PREFIXES.some((prefix) => q.startsWith(prefix)) || q.includes('?');
}

function isLocalIntent(query) {
  const q = query.toLowerCase();
  return LOCAL_TERMS.some((term) => q.includes(term));
}

// Scores are heuristics, not predicted clicks or attributed query conversions.
// Volume grows linearly to 1,000 impressions; overlapping signals add no bonus.
function confidence(row) {
  const impressions = Math.max(row.impressions, row.previous?.impressions || 0);
  if (impressions >= 100) return 'high';
  if (impressions >= 30) return 'medium';
  return 'low';
}

function priority(score, certainty, criticalEligible = false) {
  if (certainty === 'low' || score < 40) return 'Monitor';
  if (score >= 80 && certainty === 'high' && criticalEligible) return 'Critical';
  if (score >= 60 && certainty === 'high') return 'High';
  return 'Medium';
}

function scoreOpportunity(row, ga4, keyEventsAvailable) {
  const target = ctrTarget(row.position);
  const gap = row.position > 0 ? Math.max(0, (target - row.ctr) / target) : 0;
  const lostClicks = Math.max(0, (row.previous?.clicks || 0) - row.clicks);
  const decline = row.previous?.clicks > 0 ? lostClicks / row.previous.clicks : 0;
  const volume = 30 * Math.min(1, Math.max(row.impressions, row.previous?.impressions || 0) / 1000);
  const rank = row.position >= 4 && row.position <= 10 ? 20
    : row.position > 10 && row.position <= 15 ? 12 : row.position > 0 && row.position <= 3 ? 8 : 0;
  const ctr = 25 * gap;
  // GA4 is page-level context only; require a useful sample before weighting it.
  const conversion = keyEventsAvailable && ga4?.sessions >= 30
    ? 10 * Math.min(1, ga4.keyEvents / ga4.sessions / 0.05) : 0;
  const trend = 15 * Math.min(1, lostClicks / 30) * decline;
  const certainty = confidence(row);
  const factor = { high: 1, medium: 0.8, low: 0.5 }[certainty];
  const score = Math.round(Math.min(100, (volume + rank + ctr + conversion + trend) * factor));
  const criticalEligible = (lostClicks >= 30 && decline >= 0.5)
    || (row.impressions >= 1000 && row.position >= 4 && row.position <= 10
      && gap >= 0.75 && conversion >= 5);
  return { score, confidence: certainty, priority: priority(score, certainty, criticalEligible) };
}

const ACTIONS = {
  traffic_decline: 'Inspect SERP/intent changes, content freshness, internal links and indexing for this query/page before editing.',
  ctr_opportunity: 'Test a more specific title/meta proposition aligned to this query while keeping page intent and the existing URL stable.',
  near_win_ranking: 'Strengthen search-intent match, headings, internal links and topical depth for this query on the existing page.',
  geo_answer_candidate: 'Add a concise answer-first section for this query with supporting evidence and relevant structured data; this measures GEO readiness only.',
  conversion_gap: 'Check landing-page CTA clarity, conversion tracking and intent alignment before driving more organic traffic here.',
};

function buildOpportunities(gscRows, ga4Rows, keyEventsAvailable) {
  const ga4ByPath = new Map(ga4Rows.map((row) => [row.path, row]));
  const merged = new Map();
  for (const row of gscRows) {
    const signals = [];
    const validPosition = Number.isFinite(row.position) && row.position > 0;
    if (row.previous?.clicks >= 5 && row.clicks <= row.previous.clicks * 0.7) signals.push('traffic_decline');
    if (validPosition && row.impressions >= 50 && row.position <= 10 && row.ctr < ctrTarget(row.position) * 0.75) signals.push('ctr_opportunity');
    if (validPosition && row.impressions >= 20 && row.position >= 4 && row.position <= 15) signals.push('near_win_ranking');
    if (validPosition && row.impressions >= 10 && row.position <= 20 && (isQuestion(row.query) || isLocalIntent(row.query))) signals.push('geo_answer_candidate');
    if (!signals.length) continue;

    // Exact GSC query + page identity: different URLs/queries must not collapse.
    const id = JSON.stringify(['query_page', row.query, row.page]);
    const ga4 = ga4ByPath.get(row.path);
    const ranked = scoreOpportunity(row, ga4, keyEventsAvailable);
    const opportunity = {
      id, type: signals[0], signals, ...ranked,
      query: row.query, page: row.page, path: row.path,
      evidence: {
        impressions: row.impressions, clicks: row.clicks, ctr: row.ctr, position: row.position,
        heuristicCtrTarget: validPosition ? ctrTarget(row.position) : null,
        previousClicks: row.previous?.clicks ?? null, previousPosition: row.previous?.position ?? null,
        sessions: ga4?.sessions || 0, keyEvents: keyEventsAvailable ? ga4?.keyEvents ?? null : null,
        ga4Scope: 'landing_page', questionIntent: isQuestion(row.query), localIntent: isLocalIntent(row.query),
      },
      recommendedAction: ranked.priority === 'Monitor'
        ? 'Monitor this query/page through the next 28-day window before editing; current evidence or impact is limited.'
        : ACTIONS[signals[0]],
    };
    const existing = merged.get(id);
    if (existing) {
      opportunity.signals = [...new Set([...existing.signals, ...signals])]
        .sort((a, b) => Object.keys(ACTIONS).indexOf(a) - Object.keys(ACTIONS).indexOf(b));
      // Duplicate input cannot inflate scores or consume the top-50 budget.
      const winner = existing.score >= opportunity.score ? existing : opportunity;
      winner.signals = opportunity.signals;
      winner.type = winner.signals[0];
      if (winner.priority !== 'Monitor') winner.recommendedAction = ACTIONS[winner.type];
      merged.set(id, winner);
    } else {
      merged.set(id, opportunity);
    }
  }

  // No query attribution is available in GA4: retain one separate page action.
  if (keyEventsAvailable) {
    for (const row of ga4Rows) {
      if (row.sessions < 30 || row.keyEvents !== 0) continue;
      const score = Math.round(40 + 25 * Math.min(1, row.sessions / 500));
      const certainty = row.sessions >= 100 ? 'high' : 'medium';
      const id = JSON.stringify(['page', row.path]);
      merged.set(id, {
        id, type: 'conversion_gap', signals: ['conversion_gap'], score,
        priority: priority(score, certainty), confidence: certainty, path: row.path,
        evidence: { sessions: row.sessions, engagementRate: row.engagementRate, keyEvents: 0, ga4Scope: 'landing_page' },
        recommendedAction: ACTIONS.conversion_gap,
      });
    }
  }
  const tierOrder = { Critical: 0, High: 1, Medium: 2, Monitor: 3 };
  return [...merged.values()].sort((a, b) => tierOrder[a.priority] - tierOrder[b.priority]
    || b.score - a.score || a.id.localeCompare(b.id)).slice(0, 50);
}

function buildGeoSignals(rows) {
  const candidates = rows
    .filter((row) => row.impressions >= 5 && row.position <= 30 && (isQuestion(row.query) || isLocalIntent(row.query)))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 25)
    .map((row) => ({ query: row.query, path: row.path, impressions: row.impressions, clicks: row.clicks, position: row.position, questionIntent: isQuestion(row.query), localIntent: isLocalIntent(row.query) }));

  return {
    scope: 'GEO readiness signals derived from Google search demand; no external LLM citation/mention measurement is included yet.',
    questionQueryCount: rows.filter((row) => isQuestion(row.query)).length,
    localIntentQueryCount: rows.filter((row) => isLocalIntent(row.query)).length,
    answerReadyCandidates: candidates,
  };
}

function buildJoinedPages(gscPages, ga4Pages) {
  const ga4 = new Map(ga4Pages.map((row) => [row.path, row]));
  return gscPages.map((row) => ({ ...row, ga4: ga4.get(row.path) || null }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 500);
}

function markdownSummary(payload) {
  const top = payload.opportunities.slice(0, 15);
  const lines = [
    '# AutoSEO v4 Intelligence',
    '',
    `Generated: ${payload.metadata.generatedAt}`,
    `Current window: ${payload.metadata.dateRanges.current.startDate} to ${payload.metadata.dateRanges.current.endDate}`,
    `Previous window: ${payload.metadata.dateRanges.previous.startDate} to ${payload.metadata.dateRanges.previous.endDate}`,
    '',
    '## Data',
    `- GSC query/page rows: ${payload.summary.gscRows}`,
    `- GA4 landing pages: ${payload.summary.ga4Pages}`,
    `- Prioritized opportunities: ${payload.summary.opportunities}`,
    `- Critical: ${payload.summary.criticalPriority}`,
    `- High: ${payload.summary.highPriority}`,
    `- Medium: ${payload.summary.mediumPriority}`,
    `- Monitor: ${payload.summary.monitorPriority}`,
    `- GEO answer candidates: ${payload.geoSignals.answerReadyCandidates.length}`,
    '',
    '## Top opportunities',
    '',
    '| Score | Priority | Signals | Query / Path |',
    '|---:|---|---|---|',
    ...top.map((op) => `| ${op.score} | ${op.priority} | ${op.signals.join(', ')} | ${(op.query || op.path || '').replace(/\|/g, '\\|')} |`),
    '',
    '> GEO items in this first run measure answer-readiness from search demand. They do not yet measure mentions or citations inside ChatGPT, Perplexity or other AI engines.',
  ];
  return `${lines.join('\n')}\n`;
}

async function selfTest() {
  const row = (query, impressions, extra = {}) => ({
    query, page: `${SITE_URL}test/`, path: '/test', clicks: 0,
    impressions, ctr: 0, position: 6, ...extra,
  });
  const ga4 = [{ path: '/test', sessions: 100, engagedSessions: 70, engagementRate: 0.7, totalUsers: 90, keyEvents: 5 }];
  const samples = [
    row('fitness critical', 2000),
    row('fitness high', 900),
    row('fitness medium', 100),
    row('fitness monitor', 10),
  ];
  const ops = buildOpportunities(samples, ga4, true);
  assert.deepEqual(ops.map((op) => op.priority), ['Critical', 'High', 'Medium', 'Monitor']);
  assert.equal(ops.length, samples.length);
  assert.deepEqual(ops[0].signals, ['ctr_opportunity', 'near_win_ranking', 'geo_answer_candidate']);
  assert.equal(ops[0].recommendedAction, ACTIONS.ctr_opportunity);
  assert.ok(ops[3].recommendedAction.startsWith('Monitor'));
  assert.ok(ops.every((op) => Number.isFinite(op.score) && op.score >= 0 && op.score <= 100));

  const duplicate = buildOpportunities([...samples, ...samples], ga4, true);
  assert.deepEqual(duplicate, ops, 'duplicate input must not inflate scores or actions');
  assert.deepEqual(buildOpportunities([...samples].reverse(), ga4, true), ops, 'stable ordering');
  const separate = buildOpportunities([
    samples[0], { ...samples[0], page: `${SITE_URL}other/`, path: '/other' },
    { ...samples[0], query: 'other query' },
  ], ga4, true);
  assert.equal(separate.length, 3, 'distinct queries/pages must remain separate');
  const noGeo = buildOpportunities([row('generic query', 2000)], ga4, true)[0];
  assert.equal(noGeo.score, ops[0].score, 'GEO overlap must not boost score');

  const decline = row('fitness decline', 1000, {
    previous: { clicks: 100, impressions: 1200, position: 5 },
  });
  const declineOp = buildOpportunities([decline], ga4, true)[0];
  assert.equal(declineOp.priority, 'Critical');
  assert.equal(declineOp.type, 'traffic_decline');
  assert.equal(declineOp.signals.length, 4);
  assert.equal(declineOp.recommendedAction, ACTIONS.traffic_decline);
  const smallDecline = row('fitness small decline', 10, {
    previous: { clicks: 5, impressions: 20, position: 5 },
  });
  assert.equal(buildOpportunities([smallDecline], ga4, true)[0].priority, 'Monitor');
  assert.equal(buildOpportunities([row('fitness weak', 20)], ga4, true)[0].confidence, 'low');
  assert.equal(buildOpportunities([row('fitness weak', 20)], ga4, true)[0].priority, 'Monitor');
  assert.equal(buildOpportunities([row('fitness', 5000, { position: 0 })], ga4, true).length, 0);
  assert.deepEqual(buildOpportunities([], [], false), []);

  assert.equal(priority(39, 'high', true), 'Monitor');
  assert.equal(priority(40, 'high'), 'Medium');
  assert.equal(priority(59, 'high'), 'Medium');
  assert.equal(priority(60, 'high'), 'High');
  assert.equal(priority(79, 'high', true), 'High');
  assert.equal(priority(80, 'high', true), 'Critical');
  assert.equal(priority(100, 'high', false), 'High');
  assert.equal(priority(100, 'medium', true), 'Medium');
  assert.equal(priority(100, 'low', true), 'Monitor');

  const missingGa4 = buildOpportunities(samples, [], false);
  assert.ok(missingGa4.every((op) => op.evidence.keyEvents === null));
  assert.ok(missingGa4[0].score < ops[0].score);
  const unavailable = buildOpportunities(samples, ga4, false);
  assert.equal(unavailable[0].score, missingGa4[0].score, 'unavailable keyEvents cannot boost score');
  const gapGa4 = [{ ...ga4[0], keyEvents: 0 }];
  const withGap = buildOpportunities(samples, gapGa4, true);
  assert.equal(withGap.filter((op) => op.type === 'conversion_gap').length, 1);
  assert.equal(withGap.find((op) => op.type === 'conversion_gap').query, undefined);
  assert.ok(!buildOpportunities(samples, gapGa4, false).some((op) => op.type === 'conversion_gap'));
  assert.equal(buildOpportunities([], [{ ...gapGa4[0], sessions: 29 }], true).length, 0);

  const many = Array.from({ length: 60 }, (_, i) => row(`fitness ${i}`, 2000));
  const capped = buildOpportunities([...many, ...many], ga4, true);
  assert.equal(capped.length, 50);
  assert.equal(new Set(capped.map((op) => op.id)).size, 50);
  assert.deepEqual(capped, buildOpportunities([...many].reverse(), ga4, true));
  const joined = enrichGsc([samples[0]], [{ ...samples[0], clicks: 10 }]);
  assert.equal(joined[0].previous.clicks, 10);
  assert.equal(normalizePath(`${SITE_URL}test/?utm_source=test`), '/test');

  const summary = Object.fromEntries(['Critical', 'High', 'Medium', 'Monitor'].map((tier) => [
    `${tier.toLowerCase()}Priority`, ops.filter((op) => op.priority === tier).length,
  ]));
  const markdown = markdownSummary({
    opportunities: ops, summary: { ...summary, opportunities: ops.length, gscRows: 4, ga4Pages: 1 },
    metadata: { generatedAt: 'test', dateRanges: dateRanges() },
    geoSignals: { answerReadyCandidates: [] },
  });
  for (const tier of ['Critical', 'High', 'Medium', 'Monitor']) assert.ok(markdown.includes(`- ${tier}: 1`));
  assert.ok(markdown.includes('ctr_opportunity, near_win_ranking, geo_answer_candidate'));
  console.log('Self-test passed: four tiers, thresholds/confidence, merged signals/actions, duplicate isolation, declines, GA4 fallback, deterministic top-50 and summary.');
}

async function main() {
  if (process.argv.includes('--self-test')) return selfTest();
  if (!ACCESS_TOKEN) throw new Error('ACCESS_TOKEN is required');

  const ranges = dateRanges();
  console.log(`Fetching GSC ${ranges.current.startDate}..${ranges.current.endDate} and previous 28 days`);
  const [gscCurrentRaw, gscPreviousRaw, ga4CurrentResult, ga4PreviousResult] = await Promise.all([
    fetchGsc(ranges.current),
    fetchGsc(ranges.previous),
    fetchGa4(ranges.current),
    fetchGa4(ranges.previous),
  ]);

  const gscCurrent = enrichGsc(gscCurrentRaw, gscPreviousRaw);
  const ga4Current = aggregateGa4(ga4CurrentResult.rows);
  const ga4Previous = aggregateGa4(ga4PreviousResult.rows);
  const gscPages = aggregateGscPages(gscCurrent);
  const opportunities = buildOpportunities(gscCurrent, ga4Current, ga4CurrentResult.keyEventsAvailable);
  const geoSignals = buildGeoSignals(gscCurrent);

  const payload = {
    schemaVersion: '2.0.0',
    metadata: {
      generatedAt: new Date().toISOString(),
      siteUrl: SITE_URL,
      ga4PropertyId: GA4_PROPERTY_ID,
      dateRanges: ranges,
      scoringModel: 'autoseo-v4-heuristic-2',
    },
    sources: {
      searchConsole: { connected: true, dimensions: ['query', 'page'] },
      ga4: { connected: true, dimension: 'landingPagePlusQueryString', keyEventsAvailable: ga4CurrentResult.keyEventsAvailable },
    },
    summary: {
      gscRows: gscCurrent.length,
      ga4Pages: ga4Current.length,
      opportunities: opportunities.length,
      criticalPriority: opportunities.filter((op) => op.priority === 'Critical').length,
      highPriority: opportunities.filter((op) => op.priority === 'High').length,
      mediumPriority: opportunities.filter((op) => op.priority === 'Medium').length,
      monitorPriority: opportunities.filter((op) => op.priority === 'Monitor').length,
    },
    searchConsole: {
      current: gscCurrent.sort((a, b) => b.impressions - a.impressions).slice(0, 5000),
      previous: gscPreviousRaw.sort((a, b) => b.impressions - a.impressions).slice(0, 5000),
      pages: gscPages,
    },
    ga4: {
      current: ga4Current.sort((a, b) => b.sessions - a.sessions),
      previous: ga4Previous.sort((a, b) => b.sessions - a.sessions),
    },
    joinedPages: buildJoinedPages(gscPages, ga4Current),
    geoSignals,
    opportunities,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await writeFile(`${OUTPUT_DIR}/intelligence-input.json`, JSON.stringify(payload, null, 2));
  await writeFile(`${OUTPUT_DIR}/opportunities.json`, JSON.stringify(opportunities, null, 2));
  await writeFile(`${OUTPUT_DIR}/summary.md`, markdownSummary(payload));

  console.log(`Created ${payload.summary.opportunities} prioritized opportunities (${payload.summary.criticalPriority} Critical, ${payload.summary.highPriority} High, ${payload.summary.mediumPriority} Medium, ${payload.summary.monitorPriority} Monitor).`);
  for (const op of opportunities.slice(0, 10)) {
    console.log(`[${op.priority.toUpperCase()} ${op.score}] ${op.type}: ${op.query || op.path}`);
  }
}

main().catch((error) => {
  console.error('AutoSEO v4 intelligence failed:', error.stack || error.message || error);
  process.exit(1);
});
