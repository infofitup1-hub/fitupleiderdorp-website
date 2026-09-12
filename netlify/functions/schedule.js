// Haalt het lesrooster op bij de Virtuagym Club Events API en geeft alleen
// de velden door die de frontend nodig heeft. api_key/club_secret blijven
// hier server-side (Netlify env vars) en komen nooit in de browser terecht.

const API_BASE = 'https://api.virtuagym.com/api/v1/club';
const DAY_MS = 24 * 60 * 60 * 1000;

exports.handler = async function handler(event) {
  const clubId = process.env.VIRTUAGYM_CLUB_ID || '104091';
  const apiKey = process.env.VIRTUAGYM_API_KEY;
  const clubSecret = process.env.VIRTUAGYM_CLUB_SECRET;

  if (!apiKey || !clubSecret) {
    return json(200, { configured: false, events: [] });
  }

  const days = Math.min(Math.max(parseInt(event.queryStringParameters?.days, 10) || 7, 1), 14);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  // Virtuagym's Club Events API verwacht timestamp_start/timestamp_end in milliseconden.
  const timestampStart = startOfToday;
  const timestampEnd = startOfToday + days * DAY_MS;

  const url = `${API_BASE}/${clubId}/events?` + new URLSearchParams({
    api_key: apiKey,
    club_secret: clubSecret,
    sync_from: '0',
    timestamp_start: String(timestampStart),
    timestamp_end: String(timestampEnd),
  });

  let upstream;
  try {
    upstream = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch (err) {
    return json(502, { configured: true, error: 'network_error', events: [] });
  }

  if (!upstream.ok) {
    return json(502, { configured: true, error: `upstream_${upstream.status}`, events: [] });
  }

  let data;
  try {
    data = await upstream.json();
  } catch (err) {
    return json(502, { configured: true, error: 'bad_upstream_json', events: [] });
  }

  const results = Array.isArray(data?.results) ? data.results : [];

  const events = results
    .filter((e) => !e.canceled)
    .map((e) => ({
      id: e.event_id,
      title: e.title,
      start: e.start,
      end: e.end,
      bookable: !!e.bookable,
      spotsLeft: typeof e.max_places === 'number' && typeof e.attendees === 'number'
        ? Math.max(e.max_places - e.attendees, 0)
        : null,
      maxPlaces: typeof e.max_places === 'number' ? e.max_places : null,
    }))
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  return json(200, { configured: true, events }, 300);
};

function json(statusCode, body, cacheSeconds) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': cacheSeconds ? `public, max-age=${cacheSeconds}` : 'no-store',
    },
    body: JSON.stringify(body),
  };
}
