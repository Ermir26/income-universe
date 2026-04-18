// Live score fetcher — queries ESPN public scoreboards for in-progress games
// Matches pending picks to ESPN events using fuzzy team name matching
// Caches ESPN responses for 60 seconds to avoid hammering

import { SPORT_KEY_TO_ESPN } from './espn-leagues';

export interface LiveScore {
  pickId: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  gameState: 'pre' | 'in' | 'post';
  period: number;
  clock: string;
  statusText: string;
}

export interface PendingPick {
  id: string;
  sport_key: string | null;
  game: string; // "Home vs Away"
  pick: string;
  odds: string;
  stake: number;
  tier: string;
  sport: string;
  bet_type: string | null;
  line: number | null;
  side: string | null;
  game_time: string;
}

// ── ESPN response cache ──
const scoreCache = new Map<string, { data: ESPNEvent[]; fetchedAt: number }>();
const CACHE_TTL = 60_000;

interface ESPNEvent {
  id: string;
  competitions: Array<{
    competitors: Array<{
      homeAway: string;
      score: string;
      team: { displayName: string; shortDisplayName: string; abbreviation: string };
    }>;
  }>;
  status: {
    type: { state: string; description: string; completed: boolean };
    displayClock: string;
    period: number;
  };
}

async function fetchESPNScoreboard(sport: string, league: string): Promise<ESPNEvent[]> {
  const cacheKey = `${sport}/${league}`;
  const cached = scoreCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Sharkline/1.0' },
      signal: AbortSignal.timeout(8_000),
    });

    if (!res.ok) return cached?.data ?? [];

    const json = await res.json();
    const events: ESPNEvent[] = json.events ?? [];
    scoreCache.set(cacheKey, { data: events, fetchedAt: Date.now() });
    return events;
  } catch {
    return cached?.data ?? [];
  }
}

function fuzzyMatch(a: string, b: string): boolean {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return true;
  if (al.includes(bl) || bl.includes(al)) return true;
  // Check if significant words overlap (length > 3)
  const aWords = al.split(/\s+/).filter((w) => w.length > 3);
  const bWords = bl.split(/\s+/).filter((w) => w.length > 3);
  return aWords.some((w) => bWords.some((bw) => w === bw || w.includes(bw) || bw.includes(w)));
}

function matchEvent(pick: PendingPick, events: ESPNEvent[]): ESPNEvent | null {
  const [team1, team2] = pick.game.split(' vs ').map((t) => t.trim());
  if (!team1 || !team2) return null;

  for (const event of events) {
    const comp = event.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c) => c.homeAway === 'home');
    const away = comp.competitors?.find((c) => c.homeAway === 'away');
    if (!home || !away) continue;

    const homeNames = [home.team.displayName, home.team.shortDisplayName, home.team.abbreviation];
    const awayNames = [away.team.displayName, away.team.shortDisplayName, away.team.abbreviation];

    const matchesHome = homeNames.some((n) => fuzzyMatch(n, team1)) || homeNames.some((n) => fuzzyMatch(n, team2));
    const matchesAway = awayNames.some((n) => fuzzyMatch(n, team2)) || awayNames.some((n) => fuzzyMatch(n, team1));

    if (matchesHome && matchesAway) return event;
  }

  return null;
}

/**
 * Fetch live scores for an array of pending picks.
 * Only returns scores for picks where a matching ESPN event is found.
 */
export async function getLiveScores(pendingPicks: PendingPick[]): Promise<LiveScore[]> {
  // Group picks by ESPN sport/league to minimize API calls
  const sportLeagueKeys = new Set<string>();
  for (const pick of pendingPicks) {
    const espn = pick.sport_key ? SPORT_KEY_TO_ESPN[pick.sport_key] : null;
    if (espn) sportLeagueKeys.add(`${espn.sport}/${espn.league}`);
  }

  // Fetch all relevant scoreboards in parallel
  const fetchPromises = [...sportLeagueKeys].map(async (key) => {
    const [sport, league] = key.split('/');
    const events = await fetchESPNScoreboard(sport, league);
    return { key, events };
  });

  const results = await Promise.all(fetchPromises);
  const eventsByLeague = new Map<string, ESPNEvent[]>();
  for (const { key, events } of results) {
    eventsByLeague.set(key, events);
  }

  // Match each pick to an ESPN event
  const liveScores: LiveScore[] = [];
  for (const pick of pendingPicks) {
    const espn = pick.sport_key ? SPORT_KEY_TO_ESPN[pick.sport_key] : null;
    if (!espn) continue;

    const key = `${espn.sport}/${espn.league}`;
    const events = eventsByLeague.get(key);
    if (!events) continue;

    const event = matchEvent(pick, events);
    if (!event) continue;

    const comp = event.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === 'home')!;
    const away = comp.competitors.find((c) => c.homeAway === 'away')!;

    liveScores.push({
      pickId: pick.id,
      homeTeam: home.team.displayName,
      awayTeam: away.team.displayName,
      homeScore: parseInt(home.score ?? '0', 10),
      awayScore: parseInt(away.score ?? '0', 10),
      gameState: event.status.type.state as 'pre' | 'in' | 'post',
      period: event.status.period ?? 0,
      clock: event.status.displayClock ?? '',
      statusText: event.status.type.description ?? '',
    });
  }

  return liveScores;
}

/**
 * Determine if our pick is "on track" based on the current score.
 * Returns true for on track, false for behind, null if can't determine.
 */
export function isPickOnTrack(
  pick: PendingPick,
  score: LiveScore,
): boolean | null {
  const betType = pick.bet_type ?? inferBetType(pick.pick);
  const line = pick.line ?? inferLine(pick.pick);
  const side = pick.side ?? inferSide(pick);

  switch (betType) {
    case 'moneyline': {
      if (side === 'home') return score.homeScore >= score.awayScore;
      if (side === 'away') return score.awayScore >= score.homeScore;
      return null;
    }
    case 'draw':
      return score.homeScore === score.awayScore;
    case 'spread': {
      if (line == null) return null;
      const pickedScore = side === 'home' ? score.homeScore : score.awayScore;
      const oppScore = side === 'home' ? score.awayScore : score.homeScore;
      return (pickedScore + line) >= oppScore;
    }
    case 'total': {
      if (line == null) return null;
      const total = score.homeScore + score.awayScore;
      // Estimate pace: if we're in period 2 of 4, extrapolate
      const progress = score.period > 0 ? Math.min(score.period / estimateTotalPeriods(pick.sport), 1) : 0.5;
      const projectedTotal = progress > 0 ? total / progress : total * 2;
      if (side === 'over') return projectedTotal >= line;
      if (side === 'under') return projectedTotal <= line;
      return null;
    }
    default:
      return null;
  }
}

function estimateTotalPeriods(sport: string): number {
  const s = sport.toLowerCase();
  if (s.includes('nba') || s.includes('basketball')) return 4;
  if (s.includes('nhl') || s.includes('hockey')) return 3;
  if (s.includes('mlb') || s.includes('baseball')) return 9;
  if (s.includes('soccer') || s.includes('football') || s.includes('premier') || s.includes('liga')) return 2;
  if (s.includes('nfl')) return 4;
  return 4;
}

// Infer helpers (same logic as settlement cron)
function inferBetType(pickStr: string): string {
  if (/^(over|under)\s/i.test(pickStr)) return 'total';
  if (pickStr.toLowerCase() === 'draw') return 'draw';
  const spreadMatch = pickStr.match(/\s([+-][\d.]+)$/);
  if (spreadMatch && Math.abs(parseFloat(spreadMatch[1])) <= 20) return 'spread';
  return 'moneyline';
}

function inferLine(pickStr: string): number | null {
  const ouMatch = pickStr.match(/^(?:Over|Under)\s+([\d.]+)$/i);
  if (ouMatch) return parseFloat(ouMatch[1]);
  const spreadMatch = pickStr.match(/\s([+-][\d.]+)$/);
  if (spreadMatch && Math.abs(parseFloat(spreadMatch[1])) <= 20) return parseFloat(spreadMatch[1]);
  return null;
}

function inferSide(pick: PendingPick): string {
  const pickStr = pick.pick;
  if (/^over\s/i.test(pickStr)) return 'over';
  if (/^under\s/i.test(pickStr)) return 'under';
  if (pickStr.toLowerCase() === 'draw') return 'draw';
  const [home] = pick.game.split(' vs ').map((t) => t.trim().toLowerCase());
  const teamInPick = pickStr.replace(/\s+[+-][\d.]+$/, '').replace(/\s+ML$/, '').toLowerCase();
  return home.includes(teamInPick) || teamInPick.includes(home) ? 'home' : 'away';
}
