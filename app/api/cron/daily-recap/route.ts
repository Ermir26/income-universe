// Daily recap cron — 23:00 UTC via Vercel cron
// Posts day's results summary to both Telegram channels

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getSystemStatus } from '@/lib/method/system-status';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const VIP_CHANNEL_ID = process.env.TELEGRAM_VIP_CHANNEL_ID ?? process.env.VIP_CHANNEL_ID ?? '';
const FREE_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID ?? '';

const WIN_TEMPLATES = [
  'Clean sweep. Method delivers.',
  'Green day. Discipline pays off.',
  'Solid session. The edge compounds.',
  'Another day, another step forward.',
  'Consistency wins. The Shark Method at work.',
];

const LOSS_TEMPLATES = [
  'Rough day. The edge plays out over volume, not single days.',
  'Down today. Bankroll management keeps us in the game.',
  'Bad days are built into the method. That\'s why we size stakes carefully.',
  'Short-term noise. The method is built for months, not moments.',
  'Red day, but the bankroll is intact. That\'s the point.',
  'Variance happens. Discipline is what separates us.',
];

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
  // Auth check
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Get today's settled picks
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: todayPicks } = await supabase.from('picks')
    .select('result, profit, stake')
    .gte('settled_at', todayStart.toISOString())
    .in('result', ['won', 'lost', 'push']);

  if (!todayPicks || todayPicks.length === 0) {
    // No picks settled today — skip recap
    await supabase.from('agent_logs').insert({
      agent_name: 'daily-recap',
      action: 'skipped',
      result: JSON.stringify({ reason: 'no picks settled today' }),
      revenue_generated: 0,
    }).then(() => {}, () => {});
    return NextResponse.json({ skipped: 'no settled picks today' });
  }

  const wins = todayPicks.filter((p) => p.result === 'won').length;
  const losses = todayPicks.filter((p) => p.result === 'lost').length;
  const netUnits = todayPicks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

  // Calculate current balance: 100 + SUM(all settled profit)
  const { data: allProfits } = await supabase.from('picks')
    .select('profit')
    .in('result', ['won', 'lost', 'push']);
  const currentBalance = 100 + (allProfits ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

  // Calculate streak
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
  const streakLabel = streakDir === 'win' ? `W${streakCount}` : streakDir === 'loss' ? `L${streakCount}` : '--';

  // Monthly P&L
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const { data: monthPicks } = await supabase.from('picks')
    .select('profit, stake')
    .gte('settled_at', monthStart.toISOString())
    .in('result', ['won', 'lost', 'push']);

  const monthProfit = (monthPicks ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
  const monthWagered = (monthPicks ?? []).reduce((s, p) => s + (parseFloat(p.stake) || 1), 0);
  const monthROI = monthWagered > 0 ? +((monthProfit / monthWagered) * 100).toFixed(1) : 0;

  // System status
  const systemStatus = await getSystemStatus(supabase);
  const hasPaused = systemStatus.some((s) => s.status === 'paused');
  const hasCaution = systemStatus.some((s) => s.status === 'caution');
  const methodBadge = hasPaused ? '🔴 Paused' : hasCaution ? '🟡 Caution' : '🟢 Active';

  // Format date
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  // Pick template deterministically (day-of-month modulo)
  const dayOfMonth = now.getUTCDate();
  const isWinDay = netUnits >= 0;

  let msg: string;
  if (isWinDay) {
    const template = WIN_TEMPLATES[dayOfMonth % WIN_TEMPLATES.length];
    msg =
      `📊 <b>DAILY RECAP</b> — ${dateStr}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Record: ${wins}W-${losses}L | Units: +${netUnits.toFixed(1)}u\n` +
      `Balance: ${currentBalance.toFixed(1)}u | Streak: ${streakLabel}\n\n` +
      `<i>${template}</i>\n\n` +
      `Monthly P&L: ${monthProfit >= 0 ? '+' : ''}${monthProfit.toFixed(1)}u | ${monthROI}% ROI\n` +
      `🦈 #SharkMethod #DailyRecap`;
  } else {
    const template = LOSS_TEMPLATES[dayOfMonth % LOSS_TEMPLATES.length];
    msg =
      `📊 <b>DAILY RECAP</b> — ${dateStr}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `Record: ${wins}W-${losses}L | Units: ${netUnits.toFixed(1)}u\n` +
      `Balance: ${currentBalance.toFixed(1)}u\n\n` +
      `<i>${template}</i>\n\n` +
      `Method status: ${methodBadge} | Monthly P&L: ${monthProfit >= 0 ? '+' : ''}${monthProfit.toFixed(1)}u\n` +
      `🦈 #SharkMethod #DailyRecap`;
  }

  // Post to both channels
  const channels = [VIP_CHANNEL_ID, FREE_CHANNEL_ID].filter(Boolean);
  for (const chatId of channels) {
    await sendTelegram(msg, chatId);
  }

  // Log
  await supabase.from('agent_logs').insert({
    agent_name: 'daily-recap',
    action: 'posted',
    result: JSON.stringify({
      wins, losses, netUnits: +netUnits.toFixed(2),
      balance: +currentBalance.toFixed(2), streak: streakLabel,
      monthProfit: +monthProfit.toFixed(2), monthROI,
      template_type: isWinDay ? 'win' : 'loss',
    }),
    revenue_generated: 0,
  }).then(() => {}, () => {});

  return NextResponse.json({
    posted: true,
    wins, losses,
    net_units: +netUnits.toFixed(2),
    balance: +currentBalance.toFixed(2),
  });
}
