// Ask the Shark — Saturday 14:00 UTC weekly event
// Posts announcement to free channel, opens 2-hour window for free users to get 1 VIP-quality analysis

import { NextResponse } from 'next/server';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const FREE_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? 'Galaxytipbot';

async function sendTelegram(text: string, chatId: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !chatId) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
}

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // Only runs on Saturdays (configured in vercel.json)
  const now = new Date();
  if (now.getUTCDay() !== 6) {
    return NextResponse.json({ skipped: 'not Saturday' });
  }

  await sendTelegram(
    `🦈 <b>ASK THE SHARK — OPEN</b>\n\n` +
    `For the next 2 hours, DM me any game and get a real analysis.\n` +
    `Free users included. One question each.\n\n` +
    `Only this Saturday. Don't miss it → @${BOT_USERNAME}\n` +
    `🦈 Sharkline`,
    FREE_CHANNEL_ID,
  );

  return NextResponse.json({ posted: true });
}
