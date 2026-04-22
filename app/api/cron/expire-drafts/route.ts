// Auto-expire draft picks 30 minutes before game_time
// Runs every 15 minutes via external cron

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ?? '';

export async function GET(request: Request) {
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Find drafts where game starts within 30 minutes
  const cutoff = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  const { data: expiring } = await supabase
    .from('picks')
    .select('id, game, pick, game_time')
    .eq('status', 'draft')
    .lte('game_time', cutoff);

  if (!expiring || expiring.length === 0) {
    return NextResponse.json({ expired: 0 });
  }

  // Mark as expired (rejected with reason)
  const ids = expiring.map((p) => p.id);
  await supabase.from('picks').update({ status: 'rejected' }).in('id', ids);

  // Notify admin
  if (ADMIN_TELEGRAM_ID && TELEGRAM_BOT_TOKEN) {
    const lines = expiring.map((p) => `  #${p.id}: ${p.game} — ${p.pick}`).join('\n');
    const msg =
      `⏰ <b>${expiring.length} DRAFT(S) EXPIRED</b>\n` +
      `Game starting soon — auto-rejected:\n${lines}`;
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: ADMIN_TELEGRAM_ID, text: msg, parse_mode: 'HTML' }),
      });
    } catch { /* non-critical */ }
  }

  return NextResponse.json({ expired: expiring.length, ids });
}
