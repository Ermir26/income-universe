// Daily picks cron — 13:00 UTC (6 AM Arizona) via Vercel cron
// Generates picks for all active sports, applies safety rails, sends to Telegram
//
// Safety rails:
//   TIPSTER_ENABLED env var kill switch
//   MAX_PICKS_PER_DAY cap (top N by confidence)
//   AUTO_PAUSE_CHECK (<52% over 30 picks)
//   DUPLICATE_PREVENTION (skip existing pending event_ids)
//   Zero-candidate graceful handling

import { NextResponse } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { runTipster, type TipsterResult } from '@/lib/tipster/tipster-agent';
import { checkSportHealth } from '@/lib/tipster/safety';
import { SPORT_CATEGORY_KEYS } from '@/lib/tipster/brand';
import { getSystemStatus, getTodayExposure, MAX_DAILY_EXPOSURE } from '@/lib/method/system-status';
import { isBankrollTrackingActive } from '@/lib/tipster/bankroll-launch';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const CRON_SECRET = process.env.CRON_SECRET ?? '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? '';
const VIP_CHANNEL_ID = process.env.TELEGRAM_VIP_CHANNEL_ID ?? process.env.VIP_CHANNEL_ID ?? '';
const METHOD_CHANNEL_ID = process.env.TELEGRAM_METHOD_CHANNEL_ID ?? '';

const MAX_PICKS_PER_DAY = 10; // 1-2 safe + 4-8 edge + 1 optional underdog

export const maxDuration = 120;

// ─── Helpers ───

async function sendVip(text: string): Promise<void> {
  if (!TELEGRAM_BOT_TOKEN || !VIP_CHANNEL_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: VIP_CHANNEL_ID, text, parse_mode: 'HTML' }),
    });
  } catch { /* non-critical */ }
}

async function log(
  supabase: SupabaseClient,
  action: string,
  data: Record<string, unknown>,
): Promise<void> {
  await supabase.from('agent_logs').insert({
    agent_name: 'daily-picks-cron',
    action,
    result: JSON.stringify({ run_type: 'daily-generation', ...data }),
    revenue_generated: 0,
  }).then(() => {}, () => {});
}

async function isGloballyPaused(supabase: SupabaseClient): Promise<{ paused: boolean; reason: string }> {
  // Check each sport category — if ALL are paused, the system is paused
  const categories = Object.keys(SPORT_CATEGORY_KEYS);
  const pausedCategories: string[] = [];

  for (const category of categories) {
    const health = await checkSportHealth(supabase, category);
    if (health.action === 'pause' || health.action === 'paper') {
      pausedCategories.push(category);
    }
  }

  if (pausedCategories.length === categories.length) {
    return {
      paused: true,
      reason: `All ${categories.length} sport categories paused or in paper mode: ${pausedCategories.join(', ')}`,
    };
  }

  return { paused: false, reason: '' };
}

async function getPendingEventIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data } = await supabase
    .from('picks')
    .select('event_id')
    .eq('status', 'pending')
    .not('event_id', 'is', null);

  return new Set((data ?? []).map((r) => r.event_id).filter(Boolean));
}

async function getTodaysPicks(supabase: SupabaseClient): Promise<{ game: string; pick: string }[]> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from('picks')
    .select('game, pick')
    .gte('sent_at', todayStart.toISOString());

  return (data ?? []).filter((r) => r.game && r.pick);
}

// ─── Main handler ───

export async function GET(request: Request) {
  // Auth check
  if (CRON_SECRET) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // ── Kill switch ──
  if (process.env.TIPSTER_ENABLED === 'false') {
    await log(supabase, 'skipped', { reason: 'TIPSTER_ENABLED=false' });
    return NextResponse.json({ skipped: 'disabled' });
  }

  try {
    // ── Auto-pause check ──
    const pauseCheck = await isGloballyPaused(supabase);
    if (pauseCheck.paused) {
      await log(supabase, 'auto_paused', { reason: pauseCheck.reason });
      await sendVip(
        `⚠️ <b>SYSTEM PAUSED</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `${pauseCheck.reason}\n` +
        `No picks will be generated until performance recovers.\n` +
        `🦈 Sharkline`,
      );
      return NextResponse.json({
        generated: 0, posted_free: 0, posted_vip: 0,
        skipped_low_confidence: 0, skipped_duplicates: 0,
        auto_paused: true, errors: [],
      });
    }

    // ── Daily exposure check ──
    const todayExposure = await getTodayExposure(supabase);
    if (todayExposure >= MAX_DAILY_EXPOSURE) {
      await log(supabase, 'exposure_limit', { todayExposure, max: MAX_DAILY_EXPOSURE });
      await sendVip(
        `⚠️ <b>DAILY EXPOSURE LIMIT</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Today's exposure: ${todayExposure}u / ${MAX_DAILY_EXPOSURE}u max\n` +
        `No more picks today. Discipline > volume.\n` +
        `🦈 Sharkline`,
      );
      return NextResponse.json({
        generated: 0, posted_free: 0, posted_vip: 0,
        skipped_low_confidence: 0, skipped_duplicates: 0,
        auto_paused: false, exposure_limit: true, errors: [],
      });
    }

    // ── System recovery mode check — adjust based on yesterday's P/L ──
    const yesterday = new Date();
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);
    const todayMidnight = new Date();
    todayMidnight.setUTCHours(0, 0, 0, 0);

    const { data: yesterdayPicks } = await supabase.from('picks')
      .select('profit')
      .gte('settled_at', yesterday.toISOString())
      .lt('settled_at', todayMidnight.toISOString())
      .in('result', ['won', 'lost', 'push']);

    const yesterdayPnl = (yesterdayPicks ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

    // Get current system mode
    const { data: sysStatus } = await supabase.from('system_status').select('mode').eq('id', 1).single();
    const currentMode = sysStatus?.mode ?? 'standard';

    if (yesterdayPnl < 0 && currentMode === 'standard') {
      // Enter recovery mode
      await supabase.from('system_status').update({
        mode: 'recovery', triggered_at: new Date().toISOString(), reason: `Yesterday P/L: ${yesterdayPnl.toFixed(1)}u`,
      }).eq('id', 1);
      await log(supabase, 'recovery_mode_entered', { yesterdayPnl });

      // Notify Method channel (only if bankroll tracking is launched)
      if (METHOD_CHANNEL_ID && TELEGRAM_BOT_TOKEN && await isBankrollTrackingActive(supabase)) {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: METHOD_CHANNEL_ID,
            text: `⚡ <b>RECOVERY MODE ACTIVE</b>\nYesterday: ${yesterdayPnl.toFixed(1)}u\nToday: tighter selection, safer plays.\nThe method protects your bankroll.\n🦈 Sharkline`,
            parse_mode: 'HTML',
          }),
        }).catch(() => {});
      }
    } else if (yesterdayPnl >= 0 && currentMode === 'recovery') {
      // Check for 2 consecutive positive days before exiting recovery
      const twoDaysAgo = new Date();
      twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
      twoDaysAgo.setUTCHours(0, 0, 0, 0);

      const { data: twoDayAgoPicks } = await supabase.from('picks')
        .select('profit')
        .gte('settled_at', twoDaysAgo.toISOString())
        .lt('settled_at', yesterday.toISOString())
        .in('result', ['won', 'lost', 'push']);

      const twoDayAgoPnl = (twoDayAgoPicks ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

      if (twoDayAgoPnl >= 0 || yesterdayPnl > 0) {
        // Exit recovery: either 2 consecutive positive days, or a strong positive day
        await supabase.from('system_status').update({
          mode: 'standard', triggered_at: new Date().toISOString(), reason: `Recovery complete. Yesterday P/L: +${yesterdayPnl.toFixed(1)}u`,
        }).eq('id', 1);
        await log(supabase, 'recovery_mode_exited', { yesterdayPnl, twoDayAgoPnl });

        // Notify Method channel (only if bankroll tracking is launched)
        if (METHOD_CHANNEL_ID && TELEGRAM_BOT_TOKEN && await isBankrollTrackingActive(supabase)) {
          await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id: METHOD_CHANNEL_ID,
              text: `✅ <b>RECOVERY COMPLETE</b>\nYesterday: +${yesterdayPnl.toFixed(1)}u\nSystem returning to standard mode.\n🦈 Sharkline`,
              parse_mode: 'HTML',
            }),
          }).catch(() => {});
        }
      } else {
        await log(supabase, 'recovery_mode_continuing', { yesterdayPnl, twoDayAgoPnl, reason: 'Need 2 consecutive positive days' });
      }
    }

    // ── System status — streak & win-rate based safety ──
    const systemStatus = await getSystemStatus(supabase);
    const pausedSports = systemStatus.filter((s) => s.status === 'paused').map((s) => s.sport);
    const cautionSports = systemStatus.filter((s) => s.status === 'caution').map((s) => s.sport);

    if (pausedSports.length > 0) {
      await log(supabase, 'sports_paused', { pausedSports, reason: 'system_status' });
    }
    if (cautionSports.length > 0) {
      await log(supabase, 'sports_caution', { cautionSports, reason: 'loss_streak' });
    }

    // ── Get existing pending event_ids for duplicate prevention ──
    const existingEventIds = await getPendingEventIds(supabase);

    // ── Get today's picks to prevent cross-run duplicates ──
    const todaysPicks = await getTodaysPicks(supabase);

    // ── Calculate remaining exposure budget ──
    const remainingUnits = +(MAX_DAILY_EXPOSURE - todayExposure).toFixed(1);
    await log(supabase, 'exposure_budget', { todayExposure, remainingUnits, max: MAX_DAILY_EXPOSURE });

    // ── Generate picks ──
    const result: TipsterResult = await runTipster({
      oddsApiKey: process.env.ODDS_API_KEY ?? 'exhausted',
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
      telegramBotToken: TELEGRAM_BOT_TOKEN,
      telegramChannelId: process.env.TELEGRAM_CHANNEL_ID ?? '',
      vipChannelId: VIP_CHANNEL_ID,
      methodChannelId: METHOD_CHANNEL_ID,
      supabase,
      minHoursAhead: 24,
      maxPicks: MAX_PICKS_PER_DAY,
      maxExposureUnits: remainingUnits,
      existingEventIds,
      todaysPicks,
      pausedSports,
      cautionSports,
    });

    // ── Zero candidates path ──
    if (result.cardsGenerated === 0) {
      await log(supabase, 'no_picks', {
        games_found: result.gamesFound,
        reason: result.gamesFound === 0 ? 'no games found' : 'no candidates met confidence threshold',
      });
      await sendVip(
        `📊 <b>No value found today — sitting out.</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Games scanned: ${result.gamesFound}\n` +
        `Discipline > volume.\n` +
        `🦈 Sharkline`,
      );
      return NextResponse.json({
        generated: 0, posted_free: 0, posted_vip: 0,
        skipped_low_confidence: 0, skipped_duplicates: 0,
        auto_paused: false, errors: [],
      });
    }

    // ── Log success ──
    const skippedLowConf = result.skippedLowConfidence ?? 0;
    const skippedDupes = result.skippedDuplicates ?? 0;
    const skippedExposure = result.skippedExposure ?? 0;

    await log(supabase, 'generation_complete', {
      games_found: result.gamesFound,
      cards_generated: result.cardsGenerated,
      picks_sent: result.picksSent,
      skipped_low_confidence: skippedLowConf,
      skipped_duplicates: skippedDupes,
      skipped_exposure: skippedExposure,
      max_picks_cap: MAX_PICKS_PER_DAY,
      exposure_budget: remainingUnits,
    });

    return NextResponse.json({
      generated: result.cardsGenerated,
      posted_free: result.postedFree ?? 0,
      posted_vip: result.postedVip ?? 0,
      posted_method: result.postedMethod ?? 0,
      skipped_low_confidence: skippedLowConf,
      skipped_duplicates: skippedDupes,
      skipped_exposure: skippedExposure,
      auto_paused: false,
      errors: [],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';

    await log(supabase, 'error', { error: message });
    await sendVip(
      `🚨 <b>DAILY PICKS ERROR</b>\n` +
      `━━━━━━━━━━━━━━━━━━━━━━\n` +
      `${message}\n` +
      `Check Vercel logs.\n` +
      `🦈 Sharkline`,
    );

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
