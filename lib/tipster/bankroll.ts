// Bankroll Management — virtual bankroll tracking
// Starting balance: 100 units. Tracks every bet and settlement.

import { type SupabaseClient } from "@supabase/supabase-js";

const STARTING_BALANCE = 100;

/**
 * Get the current bankroll balance from the log.
 * If no entries exist, returns the starting balance.
 */
export async function getCurrentBankroll(
  supabase: SupabaseClient,
): Promise<number> {
  const { data } = await supabase
    .from("bankroll_log")
    .select("balance")
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: { balance: number } | null };

  return data?.balance ?? STARTING_BALANCE;
}

/**
 * Get ROI based on bankroll performance.
 */
export async function getROI(
  supabase: SupabaseClient,
): Promise<number> {
  const balance = await getCurrentBankroll(supabase);
  return +((balance - STARTING_BALANCE) / STARTING_BALANCE * 100).toFixed(1);
}

/**
 * Get profit/loss in units.
 */
export async function getProfitLoss(
  supabase: SupabaseClient,
): Promise<number> {
  const balance = await getCurrentBankroll(supabase);
  return +(balance - STARTING_BALANCE).toFixed(2);
}

/**
 * Record a new bet placement. Deducts stake from bankroll.
 */
export async function recordBet(
  supabase: SupabaseClient,
  pickId: string,
  stake: number,
): Promise<number> {
  const currentBalance = await getCurrentBankroll(supabase);
  const newBalance = +(currentBalance - stake).toFixed(2);

  await supabase.from("bankroll_log").insert({
    pick_id: pickId,
    action: "bet",
    units: -stake,
    balance: newBalance,
  });

  return newBalance;
}

/**
 * Record a win. Adds back: stake * decimal odds.
 * American odds are converted to decimal first.
 */
export async function recordWin(
  supabase: SupabaseClient,
  pickId: string,
  stake: number,
  americanOdds: string,
): Promise<number> {
  const currentBalance = await getCurrentBankroll(supabase);
  const decimalOdds = americanToDecimal(americanOdds);
  const payout = +(stake * decimalOdds).toFixed(2);
  const newBalance = +(currentBalance + payout).toFixed(2);

  await supabase.from("bankroll_log").insert({
    pick_id: pickId,
    action: "win",
    units: payout,
    balance: newBalance,
  });

  return newBalance;
}

/**
 * Record a loss. No money returned (stake was already deducted at bet time).
 */
export async function recordLoss(
  supabase: SupabaseClient,
  pickId: string,
): Promise<number> {
  const currentBalance = await getCurrentBankroll(supabase);

  await supabase.from("bankroll_log").insert({
    pick_id: pickId,
    action: "loss",
    units: 0,
    balance: currentBalance,
  });

  return currentBalance;
}

/**
 * Record a push. Returns the stake to the bankroll.
 */
export async function recordPush(
  supabase: SupabaseClient,
  pickId: string,
  stake: number,
): Promise<number> {
  const currentBalance = await getCurrentBankroll(supabase);
  const newBalance = +(currentBalance + stake).toFixed(2);

  await supabase.from("bankroll_log").insert({
    pick_id: pickId,
    action: "push",
    units: stake,
    balance: newBalance,
  });

  return newBalance;
}

/**
 * Get daily bankroll summary data.
 */
export async function getDailySummary(
  supabase: SupabaseClient,
): Promise<{
  balance: number;
  roi: number;
  profitLoss: number;
  todayBets: number;
  todayWins: number;
  todayLosses: number;
  todayPushes: number;
  todayProfit: number;
}> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const balance = await getCurrentBankroll(supabase);
  const roi = await getROI(supabase);
  const profitLoss = await getProfitLoss(supabase);

  const { data: todayEntries } = await supabase
    .from("bankroll_log")
    .select("action, units")
    .gte("created_at", today.toISOString()) as { data: Array<{ action: string; units: number }> | null };

  const entries = todayEntries ?? [];
  const todayBets = entries.filter((e) => e.action === "bet").length;
  const todayWins = entries.filter((e) => e.action === "win").length;
  const todayLosses = entries.filter((e) => e.action === "loss").length;
  const todayPushes = entries.filter((e) => e.action === "push").length;
  const todayProfit = entries.reduce((sum, e) => sum + (e.units ?? 0), 0);

  return { balance, roi, profitLoss, todayBets, todayWins, todayLosses, todayPushes, todayProfit: +todayProfit.toFixed(2) };
}

/**
 * Format daily bankroll summary for Telegram (HTML).
 */
export function formatBankrollSummary(summary: Awaited<ReturnType<typeof getDailySummary>>): string {
  const date = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
  });

  let msg = `📊 <b>BANKROLL UPDATE</b> — ${date}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Balance: <b>${summary.balance.toFixed(1)}u</b>\n`;

  if (summary.profitLoss >= 0) {
    msg += `P/L: <b>+${summary.profitLoss.toFixed(1)}u</b>\n`;
  } else {
    // Only show if we're still net positive
    if (summary.balance >= STARTING_BALANCE) {
      msg += `P/L: <b>+${summary.profitLoss.toFixed(1)}u</b>\n`;
    }
  }

  if (summary.roi > 0) {
    msg += `ROI: <b>+${summary.roi}%</b>\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (summary.todayBets > 0) {
    msg += `Today: ${summary.todayWins}W-${summary.todayLosses}L`;
    if (summary.todayPushes > 0) msg += `-${summary.todayPushes}P`;
    if (summary.todayProfit > 0) msg += ` (+${summary.todayProfit.toFixed(1)}u)`;
    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🦈 Sharkline — sharkline.ai`;

  return msg;
}

/**
 * Convert American odds to decimal odds.
 */
function americanToDecimal(odds: string): number {
  const num = parseInt(odds, 10);
  if (isNaN(num)) return 2.0; // default even odds
  if (num > 0) return +(1 + num / 100).toFixed(4);
  return +(1 + 100 / Math.abs(num)).toFixed(4);
}
