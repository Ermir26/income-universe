// Weekly report cron — Sunday 20:00 UTC via Vercel cron
// Posts week's performance summary to both Telegram channels

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isBankrollTrackingActive } from '@/lib/tipster/bankroll-launch';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const VIP_CHANNEL_ID = process.env.TELEGRAM_VIP_CHANNEL_ID ?? process.env.VIP_CHANNEL_ID ?? '';
const FREE_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID ?? '';
const METHOD_CHANNEL_ID = process.env.TELEGRAM_METHOD_CHANNEL_ID ?? '';

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

  // Last 7 days
  const weekStart = new Date();
  weekStart.setUTCDate(weekStart.getUTCDate() - 7);
  weekStart.setUTCHours(0, 0, 0, 0);

  const { data: weekPicks } = await supabase.from('picks')
    .select('sport, game, pick, odds, result, profit, stake')
    .gte('settled_at', weekStart.toISOString())
    .in('result', ['won', 'lost', 'push']);

  if (!weekPicks || weekPicks.length === 0) {
    await supabase.from('agent_logs').insert({
      agent_name: 'weekly-report',
      action: 'skipped',
      result: JSON.stringify({ reason: 'no settled picks this week' }),
      revenue_generated: 0,
    }).then(() => {}, () => {});
    return NextResponse.json({ skipped: 'no settled picks this week' });
  }

  const wins = weekPicks.filter((p) => p.result === 'won').length;
  const losses = weekPicks.filter((p) => p.result === 'lost').length;
  const netUnits = weekPicks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
  const totalWagered = weekPicks.reduce((s, p) => s + (parseFloat(p.stake) || 1), 0);
  const roi = totalWagered > 0 ? +((netUnits / totalWagered) * 100).toFixed(1) : 0;

  // Current balance
  const { data: allProfits } = await supabase.from('picks')
    .select('profit')
    .in('result', ['won', 'lost', 'push']);
  const currentBalance = 100 + (allProfits ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

  // Per-sport breakdown
  const bySport: Record<string, { wins: number; losses: number; profit: number; wagered: number }> = {};
  for (const p of weekPicks) {
    const sport = p.sport || 'Unknown';
    if (!bySport[sport]) bySport[sport] = { wins: 0, losses: 0, profit: 0, wagered: 0 };
    if (p.result === 'won') bySport[sport].wins++;
    if (p.result === 'lost') bySport[sport].losses++;
    bySport[sport].profit += parseFloat(p.profit) || 0;
    bySport[sport].wagered += parseFloat(p.stake) || 1;
  }

  const sportEntries = Object.entries(bySport);
  const bestSport = sportEntries.reduce((a, b) => {
    const aRoi = a[1].wagered > 0 ? a[1].profit / a[1].wagered : 0;
    const bRoi = b[1].wagered > 0 ? b[1].profit / b[1].wagered : 0;
    return bRoi > aRoi ? b : a;
  });
  const worstSport = sportEntries.reduce((a, b) => {
    const aRoi = a[1].wagered > 0 ? a[1].profit / a[1].wagered : 0;
    const bRoi = b[1].wagered > 0 ? b[1].profit / b[1].wagered : 0;
    return bRoi < aRoi ? b : a;
  });

  // Best single pick
  const bestPick = weekPicks
    .filter((p) => p.result === 'won')
    .sort((a, b) => (parseFloat(b.profit) || 0) - (parseFloat(a.profit) || 0))[0];

  // Month-to-date
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

  // Week number (ISO week)
  const now = new Date();
  const startOfYear = new Date(now.getUTCFullYear(), 0, 1);
  const weekNum = Math.ceil(((now.getTime() - startOfYear.getTime()) / 86400000 + startOfYear.getUTCDay() + 1) / 7);

  const bankrollActive = await isBankrollTrackingActive(supabase);

  // ── FREE channel: record + ROI only, CTA ──
  const freeMsg =
    `📈 <b>WEEKLY REPORT</b> — Week ${weekNum}\n` +
    `Record: ${wins}W-${losses}L | ROI: ${roi}%\n\n` +
    (bankrollActive
      ? `🦈 Full breakdown + bankroll tracking → VIP from $37/wknd\n`
      : `🦈 Full breakdown → VIP from $37/wknd\n`) +
    `🦈 sharkline.ai`;

  // ── VIP channel: record + units + sport breakdown ──
  let vipMsg =
    `📈 <b>WEEKLY REPORT</b> — Week ${weekNum}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Record: ${wins}W-${losses}L\n` +
    `Units: ${netUnits >= 0 ? '+' : ''}${netUnits.toFixed(1)}u | ROI: ${roi}%\n\n`;

  if (sportEntries.length > 1) {
    const bs = bestSport[1];
    const ws = worstSport[1];
    vipMsg += `🏆 Best: ${bestSport[0]} (${bs.wins}W-${bs.losses}L, ${bs.profit >= 0 ? '+' : ''}${bs.profit.toFixed(1)}u)\n`;
    vipMsg += `📉 Weakest: ${worstSport[0]} (${ws.wins}W-${ws.losses}L, ${ws.profit >= 0 ? '+' : ''}${ws.profit.toFixed(1)}u)\n`;
  }
  if (bestPick) {
    vipMsg += `🔥 Pick of the week: ${bestPick.game} — ${bestPick.pick} at ${bestPick.odds} (+${parseFloat(bestPick.profit).toFixed(1)}u)\n`;
  }
  vipMsg += `\nMonth-to-date: ${monthProfit >= 0 ? '+' : ''}${monthProfit.toFixed(1)}u | ${monthROI}% ROI\n`;
  vipMsg += `🦈 Sharkline — on-chain before kickoff`;

  // ── METHOD channel: full report with balance + method status ──
  let methodMsg =
    `📈 <b>SHARK METHOD — Week ${weekNum} Report</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Record: ${wins}W-${losses}L\n` +
    `Units: ${netUnits >= 0 ? '+' : ''}${netUnits.toFixed(1)}u` + (bankrollActive ? ` | Balance: ${currentBalance.toFixed(1)}u` : '') + `\n` +
    `ROI: ${roi}%\n\n`;

  if (sportEntries.length > 1) {
    const bs = bestSport[1];
    const ws = worstSport[1];
    methodMsg += `🏆 Best sport: ${bestSport[0]} (${bs.wins}W-${bs.losses}L, ${bs.profit >= 0 ? '+' : ''}${bs.profit.toFixed(1)}u)\n`;
    methodMsg += `📉 Weakest sport: ${worstSport[0]} (${ws.wins}W-${ws.losses}L, ${ws.profit >= 0 ? '+' : ''}${ws.profit.toFixed(1)}u)\n`;
  }
  if (bestPick) {
    methodMsg += `🔥 Pick of the week: ${bestPick.game} — ${bestPick.pick} at ${bestPick.odds} (+${parseFloat(bestPick.profit).toFixed(1)}u)\n`;
  }
  methodMsg += `\nMonth-to-date: ${monthProfit >= 0 ? '+' : ''}${monthProfit.toFixed(1)}u | ${monthROI}% ROI\n\n`;
  methodMsg += `Follow the method. Trust the process.\n`;
  methodMsg += `🦈 #SharkMethod #WeeklyReport`;

  // Send to each channel
  if (FREE_CHANNEL_ID) await sendTelegram(freeMsg, FREE_CHANNEL_ID);
  if (VIP_CHANNEL_ID) await sendTelegram(vipMsg, VIP_CHANNEL_ID);
  if (METHOD_CHANNEL_ID) await sendTelegram(methodMsg, METHOD_CHANNEL_ID);

  await supabase.from('agent_logs').insert({
    agent_name: 'weekly-report',
    action: 'posted',
    result: JSON.stringify({
      week: weekNum, wins, losses,
      netUnits: +netUnits.toFixed(2),
      roi, balance: +currentBalance.toFixed(2),
      bestSport: bestSport[0], worstSport: worstSport[0],
    }),
    revenue_generated: 0,
  }).then(() => {}, () => {});

  return NextResponse.json({
    posted: true, week: weekNum, wins, losses,
    net_units: +netUnits.toFixed(2), balance: +currentBalance.toFixed(2),
  });
}
