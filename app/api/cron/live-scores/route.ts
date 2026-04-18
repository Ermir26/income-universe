// Live scores cron — runs every 5 minutes via cron-job.org
// Fetches live scores for pending picks and sends Telegram updates at key moments:
//   1. Game starts (first "in" state)
//   2. Halftime (statusText contains "Half" or mid-game period change)
// Game end is handled by settle-pending cron, not here.

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getLiveScores, isPickOnTrack, type PendingPick } from '@/lib/sports-data/live-scores';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const VIP_CHANNEL_ID = process.env.TELEGRAM_VIP_CHANNEL_ID ?? process.env.VIP_CHANNEL_ID ?? '';
const FREE_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID ?? '';

function getSportEmoji(sport: string): string {
  if (/nba|basketball/i.test(sport)) return '🏀';
  if (/nhl|hockey/i.test(sport)) return '🏒';
  if (/mlb|baseball/i.test(sport)) return '⚾';
  if (/nfl|football/i.test(sport)) return '🏈';
  if (/soccer|premier|liga|serie|bundes|ligue|mls|champions/i.test(sport)) return '⚽';
  if (/mma|ufc/i.test(sport)) return '🥊';
  if (/tennis|atp|wta/i.test(sport)) return '🎾';
  return '🏅';
}

async function sendTelegram(text: string, chatId: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
  } catch { /* non-critical */ }
}

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Get pending picks where game has started (game_time in the past)
  const { data: picks } = await supabase
    .from('picks')
    .select('id, sport_key, game, pick, odds, stake, tier, sport, bet_type, line, side, game_time, category')
    .eq('status', 'pending')
    .lte('game_time', new Date().toISOString())
    .order('game_time', { ascending: true });

  if (!picks || picks.length === 0) {
    return NextResponse.json({ checked: 0, updates_sent: 0 });
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
  let updatesSent = 0;
  const channels = [VIP_CHANNEL_ID, FREE_CHANNEL_ID].filter(Boolean);

  for (const score of scores) {
    const pick = pendingPicks.find((p) => p.id === score.pickId);
    if (!pick) continue;

    // Get last recorded state for this pick
    const { data: lastUpdate } = await supabase
      .from('live_score_updates')
      .select('game_state, status_text, home_score, away_score')
      .eq('pick_id', score.pickId)
      .order('sent_at', { ascending: false })
      .limit(1)
      .single();

    const prevState = lastUpdate?.game_state ?? 'pre';
    const prevStatusText = lastUpdate?.status_text ?? '';

    let shouldSend = false;
    let message = '';
    const emoji = getSportEmoji(pick.sport);

    // 1. Game starts — first time state = "in" and we haven't sent a kickoff
    if (score.gameState === 'in' && prevState === 'pre') {
      shouldSend = true;
      message =
        `🦈 <b>KICKOFF</b>: ${pick.game}\n` +
        `${emoji} Our pick: <b>${pick.pick}</b> at ${pick.odds}\n` +
        `Follow live → sharkline.ai/method`;
    }

    // 2. Halftime — statusText contains "Half" and we haven't sent halftime yet
    const isHalftime = /half/i.test(score.statusText) && !/half/i.test(prevStatusText);
    if (isHalftime && score.gameState === 'in') {
      shouldSend = true;
      const onTrack = isPickOnTrack(pick, score);
      const trackLabel = onTrack === true ? 'on track ✅' : onTrack === false ? 'behind ❌' : '';
      message =
        `🦈 <b>HALFTIME</b>: ${score.homeTeam} ${score.homeScore} - ${score.awayScore} ${score.awayTeam}\n` +
        `${emoji} Our pick: <b>${pick.pick}</b>${trackLabel ? ` — ${trackLabel}` : ''}`;
    }

    // Skip game end — settlement cron handles final results
    // Skip if state = "post"

    if (!shouldSend || !message) continue;

    // Record this update
    await supabase.from('live_score_updates').insert({
      pick_id: score.pickId,
      home_score: score.homeScore,
      away_score: score.awayScore,
      game_state: score.gameState,
      period: score.period,
      status_text: score.statusText,
    });

    // Send to both channels
    for (const chatId of channels) {
      await sendTelegram(message, chatId);
    }

    updatesSent++;
  }

  return NextResponse.json({
    checked: picks.length,
    scores_found: scores.length,
    updates_sent: updatesSent,
  });
}
