// ESPN free API wrapper — fetches game results from public scoreboard endpoints
// Caches responses in memory for 60s so multiple picks on the same day only hit ESPN once

import { SPORT_KEY_TO_ESPN, LEAGUE_NAME_TO_ESPN_SLUG } from './espn-leagues';

const USER_AGENT = 'Sharkline/1.0';
const CACHE_TTL_MS = 60_000; // 60 seconds
const POLITE_DELAY_MS = 2_000; // 2 seconds between API calls

export interface GameResult {
  eventId: string;
  completed: boolean;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  statusText: string; // "Final", "In Progress", "Postponed", etc.
}

// In-memory cache: key = "sport/league/YYYYMMDD" → { data, fetchedAt }
const cache = new Map<string, { data: GameResult[]; fetchedAt: number }>();

let lastFetchTime = 0;

// Rate-limit flag: if ESPN returns 429, back off until this timestamp
let backoffUntil = 0;

async function politeDelay(): Promise<void> {
  const elapsed = Date.now() - lastFetchTime;
  if (elapsed < POLITE_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLITE_DELAY_MS - elapsed));
  }
  lastFetchTime = Date.now();
}

function getCacheKey(sport: string, league: string, dateStr: string): string {
  return `${sport}/${league}/${dateStr}`;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Fetch all games for a sport/league on a given date from ESPN.
 * Results are cached in memory for 60 seconds.
 */
async function fetchScoreboard(sport: string, league: string, dateStr: string): Promise<GameResult[]> {
  const cacheKey = getCacheKey(sport, league, dateStr);

  // Check cache
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // Check backoff
  if (Date.now() < backoffUntil) {
    return cached?.data ?? [];
  }

  await politeDelay();

  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${dateStr}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });

    if (res.status === 429) {
      backoffUntil = Date.now() + 10 * 60 * 1000; // 10 min backoff
      console.log(`   ⚠️ ESPN 429 — backing off 10 min`);
      return cached?.data ?? [];
    }

    if (!res.ok) return cached?.data ?? [];

    const data = await res.json();
    const events = data.events ?? [];
    const results: GameResult[] = [];

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home');
      const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'away');
      if (!home || !away) continue;

      results.push({
        eventId: String(event.id),
        completed: event.status?.type?.completed === true,
        homeTeam: home.team?.displayName ?? '',
        awayTeam: away.team?.displayName ?? '',
        homeScore: parseInt(home.score ?? '0', 10),
        awayScore: parseInt(away.score ?? '0', 10),
        statusText: event.status?.type?.description ?? 'Unknown',
      });
    }

    cache.set(cacheKey, { data: results, fetchedAt: Date.now() });
    return results;
  } catch {
    return cached?.data ?? [];
  }
}

/**
 * Find a specific game result by ESPN event ID.
 * Searches the scoreboard for the game's date.
 */
export async function fetchGameResultByEventId(
  eventId: string,
  sportKey: string,
  gameDate: Date,
): Promise<GameResult | null> {
  const espn = SPORT_KEY_TO_ESPN[sportKey];
  if (!espn) return null;

  const dateStr = formatDate(gameDate);
  const games = await fetchScoreboard(espn.sport, espn.league, dateStr);

  // ESPN event IDs stored as "espn_12345" — strip prefix
  const cleanId = eventId.replace(/^espn_/, '');
  return games.find((g) => g.eventId === cleanId) ?? null;
}

/**
 * Find a game result by team names (fuzzy match).
 * Useful when event ID doesn't match or wasn't stored.
 */
export async function fetchGameResultByTeams(
  homeTeam: string,
  awayTeam: string,
  sportKey: string,
  gameDate: Date,
): Promise<GameResult | null> {
  const espn = SPORT_KEY_TO_ESPN[sportKey];
  if (!espn) return null;

  const dateStr = formatDate(gameDate);
  const games = await fetchScoreboard(espn.sport, espn.league, dateStr);

  const fuzzy = (a: string, b: string) => {
    const al = a.toLowerCase();
    const bl = b.toLowerCase();
    return al.includes(bl) || bl.includes(al) || al.split(' ').some((w) => w.length > 3 && bl.includes(w));
  };

  return games.find((g) =>
    (fuzzy(g.homeTeam, homeTeam) && fuzzy(g.awayTeam, awayTeam)) ||
    (fuzzy(g.homeTeam, awayTeam) && fuzzy(g.awayTeam, homeTeam)),
  ) ?? null;
}

/**
 * Resolve a sport_key from league name if sport_key is missing.
 */
export function resolveSportKeyFromLeague(league: string): string | null {
  const slug = LEAGUE_NAME_TO_ESPN_SLUG[league];
  if (!slug) return null;

  for (const [key, val] of Object.entries(SPORT_KEY_TO_ESPN)) {
    if (val.league === slug) return key;
  }
  return null;
}

/** Check if ESPN is currently in backoff mode */
export function isESPNBackedOff(): boolean {
  return Date.now() < backoffUntil;
}
