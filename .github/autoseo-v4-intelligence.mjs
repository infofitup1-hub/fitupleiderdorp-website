import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';

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

function scoreBase(row, ga4) {
  const visibility = Math.min(30, Math.log10(row.impressions + 1) * 10);
  const rank = row.position <= 3 ? 5 : row.position <= 10 ? 25 : row.position <= 15 ? 20 : row.position <= 20 ? 12 : 5;
  const target = ctrTarget(row.position);
  const ctrGap = target > 0 ? Math.max(0, (target - row.ctr) / target) : 0;
  const ctr = Math.min(25, ctrGap * 25);
  const engagement = ga4 ? Math.min(10, ga4.engagementRate * 12) : 3;
  const conversion = ga4?.keyEvents > 0 ? Math.min(10, 4 + Math.log10(ga4.keyEvents + 1) * 5) : 0;
  return Math.min(100, Math.round(visibility + rank + ctr + engagement + conversion));
}

function confidence(row, ga4) {
  if (row.impressions >= 100 && (ga4?.sessions || 0) >= 20) return 'high';
  if (row.impressions >= 30 || (ga4?.sessions || 0) >= 10) return 'medium';
  return 'low';
}

function priority(score) {
  if (score >= 70) return 'high';
  if (score >= 45) return 'medium';
  return 'low';
}

function buildOpportunities(gscRows, ga4Rows, keyEventsAvailable) {
  const ga4ByPath = new Map(ga4Rows.map((row) => [row.path, row]));
  const opportunities = [];
  const seen = new Set();

  const add = (opportunity) => {
    const id = `${opportunity.type}:${opportunity.query || ''}:${opportunity.path || ''}`;
    if (seen.has(id)) return;
    seen.add(id);
    opportunities.push({ id, ...opportunity });
  };

  for (const row of gscRows) {
    const ga4 = ga4ByPath.get(row.path);
    const base = scoreBase(row, ga4);
    const target = ctrTarget(row.position);

    if (row.impressions >= 20 && row.position >= 4 && row.position <= 15) {
      const score = Math.min(100, base + (row.position <= 10 ? 10 : 5));
      add({
        type: 'near_win_ranking',
        priority: priority(score),
        score,
        confidence: confidence(row, ga4),
        query: row.query,
        page: row.page,
        path: row.path,
        evidence: { impressions: row.impressions, clicks: row.clicks, ctr: row.ctr, position: row.position, sessions: ga4?.sessions || 0, keyEvents: ga4?.keyEvents || 0 },
        recommendedAction: 'Strengthen search-intent match, headings, internal links and topical depth on the ranking page; preserve the existing URL.',
      });
    }

    if (row.impressions >= 50 && row.position <= 10 && row.ctr < target * 0.75) {
      const score = Math.min(100, base + 12);
      add({
        type: 'ctr_opportunity',
        priority: priority(score),
        score,
        confidence: confidence(row, ga4),
        query: row.query,
        page: row.page,
        path: row.path,
        evidence: { impressions: row.impressions, clicks: row.clicks, ctr: row.ctr, heuristicCtrTarget: target, position: row.position },
        recommendedAction: 'Test a more specific title/meta proposition aligned to this query while keeping page intent stable.',
      });
    }

    if (row.previous?.clicks >= 5 && row.clicks <= row.previous.clicks * 0.7) {
      const decline = 1 - row.clicks / Math.max(1, row.previous.clicks);
      const score = Math.min(100, base + Math.round(decline * 20));
      add({
        type: 'traffic_decline',
        priority: priority(score),
        score,
        confidence: confidence(row, ga4),
        query: row.query,
        page: row.page,
        path: row.path,
        evidence: { clicks: row.clicks, previousClicks: row.previous.clicks, declinePct: decline, position: row.position, previousPosition: row.previous.position },
        recommendedAction: 'Inspect SERP/intent changes, content freshness, internal links and indexing before editing the page.',
      });
    }

    if (row.impressions >= 10 && row.position <= 20 && (isQuestion(row.query) || isLocalIntent(row.query))) {
      const score = Math.min(100, base + (isQuestion(row.query) ? 8 : 5));
      add({
        type: 'geo_answer_candidate',
        priority: priority(score),
        score,
        confidence: confidence(row, ga4),
        query: row.query,
        page: row.page,
        path: row.path,
        evidence: { impressions: row.impressions, clicks: row.clicks, ctr: row.ctr, position: row.position, questionIntent: isQuestion(row.query), localIntent: isLocalIntent(row.query) },
        recommendedAction: 'Add a concise answer-first section, supporting evidence, entity clarity and relevant structured data where appropriate; this is GEO readiness, not measured AI visibility.',
      });
    }
  }

  if (keyEventsAvailable) {
    for (const row of ga4Rows) {
      if (row.sessions >= 30 && row.keyEvents === 0) {
        const score = Math.min(70, Math.round(30 + Math.log10(row.sessions + 1) * 12 + row.engagementRate * 10));
        add({
          type: 'conversion_gap',
          priority: priority(score),
          score,
          confidence: row.sessions >= 100 ? 'high' : 'medium',
          path: row.path,
          evidence: { sessions: row.sessions, engagementRate: row.engagementRate, keyEvents: row.keyEvents },
          recommendedAction: 'Check landing-page CTA clarity, conversion tracking and intent alignment before driving more organic traffic here.',
        });
      }
    }
  }

  return opportunities.sort((a, b) => b.score - a.score).slice(0, 50);
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
    `- High priority: ${payload.summary.highPriority}`,
    `- GEO answer candidates: ${payload.geoSignals.answerReadyCandidates.length}`,
    '',
    '## Top opportunities',
    '',
    '| Score | Priority | Type | Query / Path |',
    '|---:|---|---|---|',
    ...top.map((op) => `| ${op.score} | ${op.priority} | ${op.type} | ${(op.query || op.path || '').replace(/\|/g, '\\|')} |`),
    '',
    '> GEO items in this first run measure answer-readiness from search demand. They do not yet measure mentions or citations inside ChatGPT, Perplexity or other AI engines.',
  ];
  return `${lines.join('\n')}\n`;
}

async function selfTest() {
  const sampleGsc = enrichGsc([
    { query: 'sportschool leiderdorp', page: `${SITE_URL}sportschool-leiderdorp/`, path: '/sportschool-leiderdorp', clicks: 8, impressions: 220, ctr: 0.036, position: 5.2 },
    { query: 'hoe kan ik afvallen leiderdorp', page: `${SITE_URL}afvallen-leiderdorp/`, path: '/afvallen-leiderdorp', clicks: 2, impressions: 80, ctr: 0.025, position: 9.1 },
  ], [
    { query: 'sportschool leiderdorp', page: `${SITE_URL}sportschool-leiderdorp/`, path: '/sportschool-leiderdorp', clicks: 14, impressions: 210, ctr: 0.067, position: 4.9 },
  ]);
  const sampleGa4 = [{ path: '/sportschool-leiderdorp', sessions: 50, engagedSessions: 35, engagementRate: 0.7, totalUsers: 44, keyEvents: 3 }];
  const ops = buildOpportunities(sampleGsc, sampleGa4, true);
  if (!ops.some((op) => op.type === 'near_win_ranking')) throw new Error('self-test: near-win opportunity missing');
  if (!ops.some((op) => op.type === 'geo_answer_candidate')) throw new Error('self-test: GEO answer candidate missing');
  console.log(`Self-test passed with ${ops.length} opportunities.`);
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
    schemaVersion: '1.0.0',
    metadata: {
      generatedAt: new Date().toISOString(),
      siteUrl: SITE_URL,
      ga4PropertyId: GA4_PROPERTY_ID,
      dateRanges: ranges,
      scoringModel: 'autoseo-v4-heuristic-1',
    },
    sources: {
      searchConsole: { connected: true, dimensions: ['query', 'page'] },
      ga4: { connected: true, dimension: 'landingPagePlusQueryString', keyEventsAvailable: ga4CurrentResult.keyEventsAvailable },
    },
    summary: {
      gscRows: gscCurrent.length,
      ga4Pages: ga4Current.length,
      opportunities: opportunities.length,
      highPriority: opportunities.filter((op) => op.priority === 'high').length,
      mediumPriority: opportunities.filter((op) => op.priority === 'medium').length,
      lowPriority: opportunities.filter((op) => op.priority === 'low').length,
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

  console.log(`Created ${payload.summary.opportunities} prioritized opportunities (${payload.summary.highPriority} high priority).`);
  for (const op of opportunities.slice(0, 10)) {
    console.log(`[${op.priority.toUpperCase()} ${op.score}] ${op.type}: ${op.query || op.path}`);
  }
}

main().catch((error) => {
  console.error('AutoSEO v4 intelligence failed:', error.stack || error.message || error);
  process.exit(1);
});
