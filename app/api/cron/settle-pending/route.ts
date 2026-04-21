// Settlement cron — runs every 5 minutes via external cron (cron-job.org)
// Fetches results from ESPN (primary) and TheSportsDB (fallback)
// Grades picks, updates bankroll, posts to Telegram, revalidates dashboard

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@supabase/supabase-js';
import { fetchGameResult, type GameResult } from '@/lib/sports-data/fetch-game-result';
import { getSystemStatus } from '@/lib/method/system-status';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const VIP_CHANNEL_ID = process.env.TELEGRAM_VIP_CHANNEL_ID ?? process.env.VIP_CHANNEL_ID ?? '';
const FREE_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID ?? '';
const METHOD_CHANNEL_ID = process.env.TELEGRAM_METHOD_CHANNEL_ID ?? '';

const MAX_RETRIES = 6;
const RETRY_INTERVAL_MINUTES = 15;

// ─── Pick grading (structured — reads bet_type, line, side columns) ───

interface StructuredPick {
  bet_type: string | null; // 'moneyline' | 'spread' | 'total' | 'draw'
  line: number | null;
  side: string | null; // 'home' | 'away' | 'over' | 'under' | 'draw'
  pick: string; // fallback for legacy text parsing
  game: string;
}

function gradePick(pick: StructuredPick, result: GameResult): 'won' | 'lost' | 'push' | null {
  if (!result.completed) return null;

  const betType = pick.bet_type ?? inferBetType(pick.pick);
  const line = pick.line ?? inferLine(pick.pick);
  const side = pick.side ?? inferSide(pick);

  switch (betType) {
    case 'moneyline': {
      const pickedScore = side === 'home' ? result.homeScore : result.awayScore;
      const oppScore = side === 'home' ? result.awayScore : result.homeScore;
      return pickedScore > oppScore ? 'won' : pickedScore < oppScore ? 'lost' : 'push';
    }
    case 'draw':
      return result.homeScore === result.awayScore ? 'won' : 'lost';
    case 'spread': {
      if (line == null) return null; // can't grade spread without a line
      const pickedScore = side === 'home' ? result.homeScore : result.awayScore;
      const oppScore = side === 'home' ? result.awayScore : result.homeScore;
      const adjusted = pickedScore + line;
      return adjusted > oppScore ? 'won' : adjusted < oppScore ? 'lost' : 'push';
    }
    case 'total': {
      if (line == null) return null; // can't grade total without a line
      const total = result.homeScore + result.awayScore;
      if (side === 'over') return total > line ? 'won' : total < line ? 'lost' : 'push';
      return total < line ? 'won' : total > line ? 'lost' : 'push';
    }
    default:
      return null;
  }
}

// Legacy fallbacks for picks that don't have structured fields yet
function inferBetType(pickStr: string): string {
  if (/^(over|under)\s/i.test(pickStr)) return 'total';
  if (pickStr.toLowerCase() === 'draw') return 'draw';
  // Only real spreads have small numbers (< 20); larger = American odds = moneyline
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

function inferSide(pick: StructuredPick): string {
  const pickStr = pick.pick;
  if (/^over\s/i.test(pickStr)) return 'over';
  if (/^under\s/i.test(pickStr)) return 'under';
  if (pickStr.toLowerCase() === 'draw') return 'draw';
  // Determine home/away from game string
  const [home] = pick.game.split(' vs ').map((t) => t.trim().toLowerCase());
  const teamInPick = pickStr.replace(/\s+[+-][\d.]+$/, '').replace(/\s+ML$/, '').toLowerCase();
  return home.includes(teamInPick) || teamInPick.includes(home) ? 'home' : 'away';
}

function americanToDecimal(odds: string): number {
  const num = parseInt(odds, 10);
  if (isNaN(num)) return 2.0;
  if (num > 0) return +(1 + num / 100).toFixed(4);
  return +(1 + 100 / Math.abs(num)).toFixed(4);
}

function calculateProfit(odds: string, wager: number): number {
  const num = parseInt(odds, 10);
  if (isNaN(num)) return 0;
  if (num > 0) return +(wager * (num / 100)).toFixed(2);
  return +(wager * (100 / Math.abs(num))).toFixed(2);
}

function getSportEmoji(sportKey: string): string {
  if (sportKey?.startsWith('soccer_')) return '⚽';
  if (sportKey?.startsWith('basketball_')) return '🏀';
  if (sportKey?.startsWith('icehockey_')) return '🏒';
  if (sportKey?.startsWith('baseball_')) return '⚾';
  if (sportKey?.startsWith('americanfootball_')) return '🏈';
  if (sportKey?.startsWith('mma_')) return '🥊';
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
  } catch {
    // non-critical
  }
}

// ─── Main handler ───

export async function GET(request: Request) {
  // Auth check — shared secret header
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const runStart = Date.now();

  // Fetch picks ready for settlement
  const { data: picks, error } = await supabase
    .from('picks')
    .select('*')
    .eq('status', 'pending')
    .lte('settlement_check_time', new Date().toISOString())
    .order('settlement_check_time', { ascending: true })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!picks || picks.length === 0) {
    // Log even empty runs
    await supabase.from('agent_logs').insert({
      agent_name: 'settle-pending',
      action: 'cron_run',
      result: JSON.stringify({ picks_checked: 0, settled: 0, retried: 0, duration_ms: Date.now() - runStart }),
      revenue_generated: 0,
    }).then(() => {}, () => {});

    return NextResponse.json({ picks_checked: 0, settled: 0, retried: 0 });
  }

  let settled = 0;
  let retried = 0;
  let failed = 0;
  const settledPicks: Array<{ id: string; result: string; profit: number; sport: string; sport_key: string; game: string; pick: string; odds: string; category: string; actual_result: string; stake: number }> = [];

  for (const pick of picks) {
    try {
      const gameResult = await fetchGameResult({
        id: pick.id,
        event_id: pick.event_id,
        sport_key: pick.sport_key,
        league: pick.league,
        game: pick.game,
        game_time: pick.game_time,
      });

      if (!gameResult) {
        // No data found — retry
        const retryCount = (pick.settle_retry_count ?? 0) + 1;
        if (retryCount >= MAX_RETRIES) {
          await supabase.from('picks').update({
            status: 'needs_manual_review',
            settle_retry_count: retryCount,
          }).eq('id', pick.id);

          await sendTelegram(
            `⚠️ <b>MANUAL REVIEW NEEDED</b>\n${pick.sport} — ${pick.game}\n${pick.pick} @ ${pick.odds}\nCould not find result after ${MAX_RETRIES} attempts`,
            VIP_CHANNEL_ID,
          );
          failed++;
        } else {
          await supabase.from('picks').update({
            settlement_check_time: new Date(Date.now() + RETRY_INTERVAL_MINUTES * 60 * 1000).toISOString(),
            settle_retry_count: retryCount,
          }).eq('id', pick.id);
          retried++;
        }
        continue;
      }

      if (!gameResult.completed) {
        // Game still in progress — retry later
        const retryCount = (pick.settle_retry_count ?? 0) + 1;
        if (retryCount >= MAX_RETRIES) {
          await supabase.from('picks').update({
            status: 'needs_manual_review',
            settle_retry_count: retryCount,
          }).eq('id', pick.id);

          await sendTelegram(
            `⚠️ <b>MANUAL REVIEW NEEDED</b>\n${pick.sport} — ${pick.game}\nGame status: ${gameResult.statusText}\nRetries exhausted (${MAX_RETRIES})`,
            VIP_CHANNEL_ID,
          );
          failed++;
        } else {
          await supabase.from('picks').update({
            settlement_check_time: new Date(Date.now() + RETRY_INTERVAL_MINUTES * 60 * 1000).toISOString(),
            settle_retry_count: retryCount,
          }).eq('id', pick.id);
          retried++;
        }
        continue;
      }

      // Game completed — grade the pick using structured fields
      const grade = gradePick({
        bet_type: pick.bet_type,
        line: pick.line != null ? parseFloat(pick.line) : null,
        side: pick.side,
        pick: pick.pick,
        game: pick.game,
      }, gameResult);
      if (!grade) {
        // Couldn't determine result — manual review
        await supabase.from('picks').update({
          status: 'needs_manual_review',
          settle_retry_count: (pick.settle_retry_count ?? 0) + 1,
        }).eq('id', pick.id);
        failed++;
        continue;
      }

      const stake = parseFloat(pick.stake) || 1;
      let profit = 0;
      if (grade === 'won') {
        const decOdds = americanToDecimal(pick.odds);
        profit = +(stake * (decOdds - 1)).toFixed(2); // profit in units
      } else if (grade === 'lost') {
        profit = -stake;
      }

      const actualScore = `${gameResult.homeTeam}: ${gameResult.homeScore}, ${gameResult.awayTeam}: ${gameResult.awayScore}`;

      // Update the pick
      await supabase.from('picks').update({
        result: grade,
        status: grade,
        profit,
        actual_result: actualScore,
        actual_home_score: gameResult.homeScore,
        actual_away_score: gameResult.awayScore,
        settled_at: new Date().toISOString(),
      }).eq('id', pick.id);

      // Bankroll log
      const { data: lastEntry } = await supabase.from('bankroll_log')
        .select('balance').order('created_at', { ascending: false }).limit(1).single();
      const curBalance = lastEntry?.balance ?? 100;

      if (grade === 'won') {
        await supabase.from('bankroll_log').insert({
          pick_id: pick.id, action: 'win', units: profit, balance: +(curBalance + profit).toFixed(2),
        });
      } else if (grade === 'lost') {
        await supabase.from('bankroll_log').insert({
          pick_id: pick.id, action: 'loss', units: profit, balance: +(curBalance + profit).toFixed(2),
        });
      } else if (grade === 'push') {
        await supabase.from('bankroll_log').insert({
          pick_id: pick.id, action: 'push', units: 0, balance: curBalance,
        });
      }

      settled++;
      settledPicks.push({
        id: pick.id, result: grade, profit, sport: pick.sport, sport_key: pick.sport_key,
        game: pick.game, pick: pick.pick, odds: pick.odds, category: pick.category,
        actual_result: actualScore, stake,
      });
    } catch (err) {
      console.error(`Settlement error for ${pick.game}:`, err);
      failed++;
    }
  }

  // ── Update tipster_stats aggregates ──
  if (settledPicks.length > 0) {
    const groups: Record<string, { wins: number; losses: number; pushes: number }> = {};
    for (const p of settledPicks) {
      const key = p.sport_key || p.sport || 'unknown';
      if (!groups[key]) groups[key] = { wins: 0, losses: 0, pushes: 0 };
      if (p.result === 'won') groups[key].wins++;
      if (p.result === 'lost') groups[key].losses++;
      if (p.result === 'push') groups[key].pushes++;
    }

    for (const [sportKey, counts] of Object.entries(groups)) {
      const { data: existing } = await supabase.from('tipster_stats')
        .select('*').eq('sport', sportKey).is('tier', null).limit(1).single();

      if (existing) {
        const w = existing.wins + counts.wins;
        const l = existing.losses + counts.losses;
        const p = existing.pushes + counts.pushes;
        await supabase.from('tipster_stats').update({
          total_picks: w + l + p,
          wins: w, losses: l, pushes: p,
          win_rate: (w + l) > 0 ? +((w / (w + l)) * 100).toFixed(1) : 0,
          updated_at: new Date().toISOString(),
        }).eq('id', existing.id);
      } else {
        const total = counts.wins + counts.losses + counts.pushes;
        await supabase.from('tipster_stats').insert({
          sport: sportKey, tier: null,
          total_picks: total, wins: counts.wins, losses: counts.losses, pushes: counts.pushes,
          win_rate: (counts.wins + counts.losses) > 0 ? +((counts.wins / (counts.wins + counts.losses)) * 100).toFixed(1) : 0,
        });
      }
    }
  }

  // ── Post result notifications per channel ──
  if (settledPicks.length > 0) {
    // Calculate current balance: 100 + SUM(all settled profit)
    const { data: allProfits } = await supabase.from('picks')
      .select('profit')
      .in('result', ['won', 'lost', 'push']);
    const currentBalance = 100 + (allProfits ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

    // Calculate current streak from most recent consecutive results
    const { data: recentPicks } = await supabase.from('picks')
      .select('result')
      .in('result', ['won', 'lost'])
      .order('sent_at', { ascending: false })
      .limit(20);

    let streakCount = 0;
    let streakDir: 'win' | 'loss' | '' = '';
    for (const rp of (recentPicks ?? [])) {
      if (!streakDir) {
        streakDir = rp.result === 'won' ? 'win' : 'loss';
        streakCount = 1;
      } else if ((streakDir === 'win' && rp.result === 'won') || (streakDir === 'loss' && rp.result === 'lost')) {
        streakCount++;
      } else {
        break;
      }
    }

    // Get system status for method status badge
    const systemStatus = await getSystemStatus(supabase);
    const hasPaused = systemStatus.some((s) => s.status === 'paused');
    const hasCaution = systemStatus.some((s) => s.status === 'caution');
    const methodBadge = hasPaused ? '🔴 Paused' : hasCaution ? '🟡 Caution' : '🟢 Active';

    // Season record for free channel
    const { data: allRecord } = await supabase.from('picks')
      .select('result').in('result', ['won', 'lost']);
    const seasonW = allRecord?.filter((r) => r.result === 'won').length ?? 0;
    const seasonL = allRecord?.filter((r) => r.result === 'lost').length ?? 0;

    for (const p of settledPicks) {
      const emoji = getSportEmoji(p.sport_key);
      const resultEmoji = p.result === 'won' ? '✅' : p.result === 'lost' ? '❌' : '➖';
      const resultLabel = p.result.toUpperCase();

      // ── FREE: just result + season record + CTA ──
      if (FREE_CHANNEL_ID) {
        const freeMsg =
          `${resultEmoji} <b>${resultLabel}</b> — ${p.game}\n` +
          `${emoji} ${p.pick} at ${p.odds}\n` +
          `Season: ${seasonW}W-${seasonL}L\n\n` +
          `🦈 sharkline.ai`;
        await sendTelegram(freeMsg, FREE_CHANNEL_ID);
      }

      // ── VIP: result + units P/L + streak ──
      if (VIP_CHANNEL_ID) {
        const streakLabel = streakDir === 'win' ? ` | Streak: W${streakCount}` : '';
        let vipMsg: string;
        if (p.result === 'won') {
          vipMsg =
            `${resultEmoji} <b>WON</b> — ${p.game}\n` +
            `${emoji} ${p.pick} at ${p.odds}\n` +
            `+${p.profit.toFixed(2)}u${streakLabel}\n` +
            `🦈 Sharkline`;
        } else if (p.result === 'lost') {
          vipMsg =
            `${resultEmoji} <b>LOST</b> — ${p.game}\n` +
            `${emoji} ${p.pick} at ${p.odds}\n` +
            `-${p.stake}u\n` +
            `🦈 Sharkline`;
        } else {
          vipMsg =
            `${resultEmoji} <b>PUSH</b> — ${p.game}\n` +
            `${emoji} ${p.pick} — No action, units returned.\n` +
            `🦈 Sharkline`;
        }
        await sendTelegram(vipMsg, VIP_CHANNEL_ID);
      }

      // ── METHOD: full bankroll + exposure + method status ──
      if (METHOD_CHANNEL_ID) {
        let methodMsg: string;
        if (p.result === 'won') {
          const streakLabel = streakDir === 'win' ? ` | Streak: W${streakCount}` : '';
          methodMsg =
            `${resultEmoji} <b>WON</b> — ${p.game}\n` +
            `${emoji} ${p.pick} at ${p.odds}\n` +
            `+${p.profit.toFixed(2)}u | Balance: ${currentBalance.toFixed(1)}u${streakLabel}\n` +
            `Method status: ${methodBadge}\n` +
            `🦈 #SharkMethod`;
        } else if (p.result === 'lost') {
          methodMsg =
            `${resultEmoji} <b>LOST</b> — ${p.game}\n` +
            `${emoji} ${p.pick} at ${p.odds}\n` +
            `-${p.stake}u | Balance: ${currentBalance.toFixed(1)}u\n` +
            `Method status: ${methodBadge}\n` +
            `🦈 #SharkMethod`;
        } else {
          methodMsg =
            `${resultEmoji} <b>PUSH</b> — ${p.game}\n` +
            `${emoji} ${p.pick} — No action, units returned.\n` +
            `Balance: ${currentBalance.toFixed(1)}u\n` +
            `🦈 #SharkMethod`;
        }
        await sendTelegram(methodMsg, METHOD_CHANNEL_ID);
      }
    }
  }

  // ── Status change alerts (caution/recovery) — METHOD channel only ──
  if (settledPicks.length > 0 && METHOD_CHANNEL_ID) {
    // Get fresh system status AFTER settlement
    const postStatus = await getSystemStatus(supabase);

    // Calculate current balance for the messages
    const { data: balProfits } = await supabase.from('picks')
      .select('profit')
      .in('result', ['won', 'lost', 'push']);
    const balanceNow = 100 + (balProfits ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

    // Overall record
    const { data: overallRecord } = await supabase.from('picks')
      .select('result')
      .in('result', ['won', 'lost']);
    const overallW = overallRecord?.filter((r) => r.result === 'won').length ?? 0;
    const overallL = overallRecord?.filter((r) => r.result === 'lost').length ?? 0;

    // Get the sports we just settled picks for
    const settledSports = [...new Set(settledPicks.map((p) => p.sport))];

    for (const sport of settledSports) {
      const sportStatus = postStatus.find((s) => s.sport === sport);
      if (!sportStatus) continue;

      // Detect caution: sport has 3+ loss streak and status is caution
      if (sportStatus.status === 'caution' && sportStatus.streakType === 'loss' && sportStatus.streak === 3) {
        const cautionMsg =
          `⚠️ <b>SYSTEM UPDATE</b> — ${sport} on Caution\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${sport} has hit ${sportStatus.streak} consecutive losses. Per Shark Method rules:\n` +
          `→ Stakes reduced to 0.5 units until 2 consecutive wins\n` +
          `→ Method status: 🟡 Caution\n\n` +
          `Bankroll protection is why we have these rules.\n` +
          `Balance: ${balanceNow.toFixed(1)}u | Overall record: ${overallW}W-${overallL}L\n` +
          `🦈 #SharkMethod`;
        await sendTelegram(cautionMsg, METHOD_CHANNEL_ID);
      }

      // Detect recovery: sport just recovered from caution (2 consecutive wins)
      if (sportStatus.status === 'active' && sportStatus.streakType === 'win' && sportStatus.streak === 2) {
        const recoveryMsg =
          `✅ <b>SYSTEM UPDATE</b> — ${sport} back to Active\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${sport} has hit 2 consecutive wins. Stakes restored to normal.\n` +
          `→ Method status: 🟢 Active\n\n` +
          `Balance: ${balanceNow.toFixed(1)}u\n` +
          `🦈 #SharkMethod`;
        await sendTelegram(recoveryMsg, METHOD_CHANNEL_ID);
      }
    }
  }

  // ── Win streak alerts (5+ consecutive wins) ──
  if (settledPicks.length > 0) {
    // Calculate streak for alerts
    const { data: streakCheckPicks } = await supabase.from('picks')
      .select('result').in('result', ['won', 'lost'])
      .order('sent_at', { ascending: false }).limit(20);

    let alertStreak = 0;
    let alertStreakDir: 'win' | 'loss' | '' = '';
    for (const rp of (streakCheckPicks ?? [])) {
      if (!alertStreakDir) {
        alertStreakDir = rp.result === 'won' ? 'win' : 'loss';
        alertStreak = 1;
      } else if ((alertStreakDir === 'win' && rp.result === 'won') || (alertStreakDir === 'loss' && rp.result === 'lost')) {
        alertStreak++;
      } else {
        break;
      }
    }

    if (alertStreakDir === 'win' && alertStreak >= 5) {
      const { data: streakProfits } = await supabase.from('picks')
        .select('profit').eq('result', 'won')
        .order('settled_at', { ascending: false }).limit(alertStreak);
      const streakImpact = (streakProfits ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

      if (FREE_CHANNEL_ID) {
        await sendTelegram(
          `🦈 ${alertStreak} WINS STRAIGHT 🔥\nThe system is locked in.\nThese wins are on VIP edge picks → sharkline.ai`,
          FREE_CHANNEL_ID,
        );
      }
      if (VIP_CHANNEL_ID) {
        await sendTelegram(
          `🦈 ${alertStreak} WINS STRAIGHT 🔥\nThe system is locked in.\nCurrent streak: W${alertStreak}. Keep tailing.\n🦈 Sharkline`,
          VIP_CHANNEL_ID,
        );
      }
      if (METHOD_CHANNEL_ID) {
        await sendTelegram(
          `🦈 ${alertStreak} WINS STRAIGHT 🔥\nStreak: W${alertStreak} | Bankroll impact: +${streakImpact.toFixed(1)}u\n🦈 #SharkMethod`,
          METHOD_CHANNEL_ID,
        );
      }
    }
  }

  // ── Revalidate dashboard pages ──
  if (settled > 0) {
    try {
      revalidatePath('/');
      revalidatePath('/public');
      revalidatePath('/dashboard');
      revalidatePath('/method');
    } catch {
      // revalidation is best-effort
    }
  }

  // ── Log to agent_logs ──
  await supabase.from('agent_logs').insert({
    agent_name: 'settle-pending',
    action: 'cron_run',
    result: JSON.stringify({
      picks_checked: picks.length,
      settled,
      retried,
      failed,
      duration_ms: Date.now() - runStart,
      results: settledPicks.map((p) => ({ game: p.game, result: p.result, profit: p.profit })),
    }),
    revenue_generated: 0,
  }).then(() => {}, () => {});

  // ── Update daily_records + bankroll ──
  if (settled > 0) {
    const todayStr = new Date().toISOString().split('T')[0];
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);

    const { data: todayPicks } = await supabase.from('picks')
      .select('result, profit')
      .gte('sent_at', todayStart.toISOString())
      .not('result', 'in', '(pending,void,needs_manual_review)');

    if (todayPicks) {
      const w = todayPicks.filter((p) => p.result === 'won').length;
      const l = todayPicks.filter((p) => p.result === 'lost').length;
      const p = todayPicks.filter((p) => p.result === 'push').length;
      const dayProfit = todayPicks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

      await supabase.from('daily_records').upsert({
        date: todayStr, wins: w, losses: l, pushes: p, profit: dayProfit,
      }, { onConflict: 'date' });

      await supabase.from('bankroll').upsert({
        date: todayStr, day_profit: dayProfit, picks_won: w, picks_lost: l, picks_pushed: p,
      }, { onConflict: 'date' });
    }
  }

  return NextResponse.json({
    picks_checked: picks.length,
    settled,
    retried,
    failed,
    duration_ms: Date.now() - runStart,
  });
}
