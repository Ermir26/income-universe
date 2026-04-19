import { NextResponse } from 'next/server';
import { fetchUpcomingGames, SPORT_GROUPS } from '@/lib/tipster/tipster-agent';
import { getActiveSportKeys, SPORT_CATEGORY_KEYS } from '@/lib/tipster/brand';
import { checkSportHealth } from '@/lib/tipster/safety';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const results: Record<string, unknown> = {};

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );

  // Check active sports
  const activeSportKeys = getActiveSportKeys();
  results.active_sports_env = process.env.ACTIVE_SPORTS;
  results.active_sport_keys = activeSportKeys;
  results.sport_keys_count = activeSportKeys.length;

  // Check sport health for each category
  const healthResults: Record<string, unknown> = {};
  for (const [category, keys] of Object.entries(SPORT_CATEGORY_KEYS)) {
    const relevant = keys.filter(k => activeSportKeys.includes(k));
    if (relevant.length === 0) {
      healthResults[category] = { relevant: 0, skipped: true };
      continue;
    }
    const health = await checkSportHealth(supabase, category);
    healthResults[category] = { relevant: relevant.length, ...health };
  }
  results.sport_health = healthResults;

  // Test fetchUpcomingGames
  try {
    const games = await fetchUpcomingGames(
      process.env.ODDS_API_KEY ?? 'exhausted',
      activeSportKeys,
      24,
    );
    results.games_found = games.length;
    results.game_sports = [...new Set(games.map(g => g.sport_key))];
  } catch (err) {
    results.fetch_error = (err as Error).message;
  }

  results.now = new Date().toISOString();
  return NextResponse.json(results);
}
