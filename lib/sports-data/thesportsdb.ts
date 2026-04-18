// TheSportsDB free API fallback — used when ESPN is down or returns nothing
// API key "3" is the free public test key
// Docs: https://www.thesportsdb.com/api.php

import type { GameResult } from './espn';

const USER_AGENT = 'Sharkline/1.0';
const API_KEY = '3';
const POLITE_DELAY_MS = 2_000;

let lastFetchTime = 0;

// Map sport_key to TheSportsDB sport name
const SPORT_MAP: Record<string, string> = {
  soccer_epl: 'Soccer',
  soccer_spain_la_liga: 'Soccer',
  soccer_italy_serie_a: 'Soccer',
  soccer_germany_bundesliga: 'Soccer',
  soccer_france_ligue_one: 'Soccer',
  soccer_usa_mls: 'Soccer',
  soccer_uefa_champs_league: 'Soccer',
  soccer_uefa_europa_league: 'Soccer',
  basketball_nba: 'Basketball',
  basketball_euroleague: 'Basketball',
  icehockey_nhl: 'Ice Hockey',
  baseball_mlb: 'Baseball',
  americanfootball_nfl: 'American Football',
  mma_mixed_martial_arts: 'Fighting',
};

async function politeDelay(): Promise<void> {
  const elapsed = Date.now() - lastFetchTime;
  if (elapsed < POLITE_DELAY_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLITE_DELAY_MS - elapsed));
  }
  lastFetchTime = Date.now();
}

/**
 * Fetch game results from TheSportsDB for a given date and sport.
 * Returns results in the same GameResult format as the ESPN wrapper.
 */
export async function fetchGameResultFromSportsDB(
  homeTeam: string,
  awayTeam: string,
  sportKey: string,
  gameDate: Date,
): Promise<GameResult | null> {
  const sportName = SPORT_MAP[sportKey];
  if (!sportName) return null;

  await politeDelay();

  const dateStr = gameDate.toISOString().split('T')[0]; // YYYY-MM-DD
  const url = `https://www.thesportsdb.com/api/v1/json/${API_KEY}/eventsday.php?d=${dateStr}&s=${encodeURIComponent(sportName)}`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = await res.json();
    const events = data.events;
    if (!Array.isArray(events)) return null;

    const fuzzy = (a: string, b: string) => {
      const al = a.toLowerCase();
      const bl = b.toLowerCase();
      return al.includes(bl) || bl.includes(al) || al.split(' ').some((w) => w.length > 3 && bl.includes(w));
    };

    for (const event of events) {
      const dbHome = event.strHomeTeam ?? '';
      const dbAway = event.strAwayTeam ?? '';

      const match =
        (fuzzy(dbHome, homeTeam) && fuzzy(dbAway, awayTeam)) ||
        (fuzzy(dbHome, awayTeam) && fuzzy(dbAway, homeTeam));

      if (!match) continue;

      const homeScore = parseInt(event.intHomeScore ?? '', 10);
      const awayScore = parseInt(event.intAwayScore ?? '', 10);
      const completed = !isNaN(homeScore) && !isNaN(awayScore) && event.strStatus === 'Match Finished';

      return {
        eventId: String(event.idEvent ?? ''),
        completed,
        homeTeam: dbHome,
        awayTeam: dbAway,
        homeScore: isNaN(homeScore) ? 0 : homeScore,
        awayScore: isNaN(awayScore) ? 0 : awayScore,
        statusText: event.strStatus ?? 'Unknown',
      };
    }

    return null;
  } catch {
    return null;
  }
}
