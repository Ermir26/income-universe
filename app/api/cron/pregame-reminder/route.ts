// Pre-game reminder cron — runs every 15 minutes via external cron
// Sends reminders to Method channel 1 hour before game starts
// Only for Method-eligible picks that haven't had a reminder sent yet

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
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

  if (!METHOD_CHANNEL_ID) {
    return NextResponse.json({ skipped: 'no method channel configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Find Method-eligible picks where game starts in 45-75 minutes and reminder not sent
  const now = new Date();
  const windowStart = new Date(now.getTime() + 45 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 75 * 60 * 1000);

  const { data: picks } = await supabase
    .from('picks')
    .select('id, game, pick, odds, stake, game_time')
    .eq('status', 'pending')
    .eq('reminder_sent', false)
    .eq('method_eligible', true)
    .gte('game_time', windowStart.toISOString())
    .lte('game_time', windowEnd.toISOString());

  if (!picks || picks.length === 0) {
    return NextResponse.json({ reminders_sent: 0 });
  }

  let sent = 0;
  for (const pick of picks) {
    const gameTime = new Date(pick.game_time);
    const minsUntil = Math.round((gameTime.getTime() - now.getTime()) / 60000);

    const msg =
      `⏰ <b>REMINDER</b> — ${pick.game} in ~${minsUntil} min\n` +
      `Your pick: <b>${pick.pick}</b> @ ${pick.odds}\n` +
      `Stake: ${pick.stake}u\n` +
      `Make sure your bet is placed.\n` +
      `🦈 Sharkline`;

    await sendTelegram(msg, METHOD_CHANNEL_ID);

    // Mark reminder as sent
    await supabase.from('picks').update({ reminder_sent: true }).eq('id', pick.id);
    sent++;
  }

  // Log
  await supabase.from('agent_logs').insert({
    agent_name: 'pregame-reminder',
    action: 'reminders_sent',
    result: JSON.stringify({ sent, picks: picks.map((p) => p.game) }),
    revenue_generated: 0,
  }).then(() => {}, () => {});

  return NextResponse.json({ reminders_sent: sent });
}
