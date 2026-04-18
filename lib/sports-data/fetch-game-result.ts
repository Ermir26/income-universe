// Unified game result fetcher — ESPN primary, TheSportsDB fallback
// Shared interface so we can swap sources without touching the cron

import {
  fetchGameResultByEventId,
  fetchGameResultByTeams,
  isESPNBackedOff,
  resolveSportKeyFromLeague,
  type GameResult,
} from './espn';
import { fetchGameResultFromSportsDB } from './thesportsdb';

export type { GameResult };

export interface PickForSettlement {
  id: string;
  event_id: string | null;
  sport_key: string | null;
  league: string | null;
  game: string; // "Home Team vs Away Team"
  game_time: string; // ISO timestamp
}

/**
 * Fetch the game result for a pick.
 * Primary: ESPN (by event_id, then by team names).
 * Fallback: TheSportsDB (if ESPN returns nothing or is backed off).
 */
export async function fetchGameResult(pick: PickForSettlement): Promise<GameResult | null> {
  const gameDate = new Date(pick.game_time);
  const sportKey = pick.sport_key ?? resolveSportKeyFromLeague(pick.league ?? '') ?? '';
  const [team1, team2] = pick.game.split(' vs ').map((t) => t.trim());

  // ── Primary: ESPN ──
  if (!isESPNBackedOff()) {
    // Try event_id first (most reliable)
    if (pick.event_id && sportKey) {
      const byId = await fetchGameResultByEventId(pick.event_id, sportKey, gameDate);
      if (byId) return byId;
    }

    // Try team name match
    if (team1 && team2 && sportKey) {
      const byTeam = await fetchGameResultByTeams(team1, team2, sportKey, gameDate);
      if (byTeam) return byTeam;
    }
  }

  // ── Fallback: TheSportsDB ──
  if (team1 && team2 && sportKey) {
    const sportsDb = await fetchGameResultFromSportsDB(team1, team2, sportKey, gameDate);
    if (sportsDb) return sportsDb;
  }

  return null;
}
