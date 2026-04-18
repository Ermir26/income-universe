// Public API — returns live scores for all pending picks with games in progress
// Used by the /method page "LIVE NOW" section

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getLiveScores, isPickOnTrack, type PendingPick, type LiveScore } from '@/lib/sports-data/live-scores';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
);

export interface LivePickScore {
  pickId: string;
  sport: string;
  game: string;
  pick: string;
  odds: string;
  tier: string;
  stake: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  gameState: string;
  period: number;
  clock: string;
  statusText: string;
  onTrack: boolean | null;
}

export async function GET() {
  // Get pending picks where game_time is in the past
  const { data: picks } = await supabase
    .from('picks')
    .select('id, sport_key, game, pick, odds, stake, tier, sport, bet_type, line, side, game_time')
    .eq('status', 'pending')
    .lte('game_time', new Date().toISOString())
    .order('game_time', { ascending: true });

  if (!picks || picks.length === 0) {
    return NextResponse.json(
      { live: [] },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
    );
  }

  const pendingPicks: PendingPick[] = picks.map((p) => ({
    id: p.id,
    sport_key: p.sport_key,
    game: p.game,
    pick: p.pick,
    odds: p.odds,
    stake: parseFloat(p.stake) || 1,
    tier: p.tier ?? '',
    sport: p.sport ?? '',
    bet_type: p.bet_type,
    line: p.line != null ? parseFloat(p.line) : null,
    side: p.side,
    game_time: p.game_time,
  }));

  const scores = await getLiveScores(pendingPicks);

  // Only return games that are "in" progress (not pre or post)
  const liveResults: LivePickScore[] = [];
  for (const score of scores) {
    if (score.gameState !== 'in') continue;

    const pick = pendingPicks.find((p) => p.id === score.pickId);
    if (!pick) continue;

    const onTrack = isPickOnTrack(pick, score);

    liveResults.push({
      pickId: pick.id,
      sport: pick.sport,
      game: pick.game,
      pick: pick.pick,
      odds: pick.odds,
      tier: pick.tier,
      stake: pick.stake,
      homeTeam: score.homeTeam,
      awayTeam: score.awayTeam,
      homeScore: score.homeScore,
      awayScore: score.awayScore,
      gameState: score.gameState,
      period: score.period,
      clock: score.clock,
      statusText: score.statusText,
      onTrack,
    });
  }

  return NextResponse.json(
    { live: liveResults },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } },
  );
}
