// Subscriber Retention Agent — onboarding, churn prevention, win celebrations
// Sharkline: keep subscribers engaged and reduce churn

import { type SupabaseClient } from "@supabase/supabase-js";
import { BRAND } from "../tipster/brand";

const BRAND_URL = BRAND.url;
const DASHBOARD_URL = BRAND.dashboardUrl;

// ─── Onboarding Messages ───

interface OnboardingStep {
  day: number;
  step: number;
  buildMessage: (sub: Subscriber, stats: RecordStats) => string;
}

interface Subscriber {
  id: string;
  telegram_id: string;
  telegram_user_id?: string;
  telegram_username?: string;
  email?: string;
  sports?: string[];
  plan?: string;
  subscribed_at: string;
  onboarding_step: number;
  status: string;
}

interface RecordStats {
  wins: number;
  losses: number;
  roi: number;
  bestSport?: { name: string; units: number };
}

const ONBOARDING_SEQUENCE: OnboardingStep[] = [
  {
    day: 1,
    step: 1,
    buildMessage: () =>
      `Welcome to Sharkline VIP! 🦈\n\n` +
      `You now get full analysis cards for every pick.\n\n` +
      `Tips:\n` +
      `1. Follow recommended stake sizes\n` +
      `2. Track your record at ${DASHBOARD_URL}\n` +
      `3. Questions? Reply here.\n\n` +
      `First pick drops tomorrow at 7am EST. 🦈`,
  },
  {
    day: 3,
    step: 2,
    buildMessage: (_sub, stats) =>
      `Quick tip: Most bettors focus on winning picks. Professionals focus on value picks.\n\n` +
      `A 55% win rate at good odds beats 65% at bad odds. We target value — not just winners.\n\n` +
      `Current ROI: +${stats.roi > 0 ? stats.roi : 0}%\n\n` +
      `🦈 Sharkline — ${BRAND_URL}`,
  },
  {
    day: 7,
    step: 3,
    buildMessage: (sub, stats) => {
      const daysSince = Math.floor((Date.now() - new Date(sub.subscribed_at).getTime()) / 86400000);
      return (
        `One week in. 🦈\n\n` +
        `Your record since joining: ${stats.wins}W-${stats.losses}L` +
        (stats.roi > 0 ? ` | +${stats.roi}% ROI` : ``) +
        `\n\n` +
        `We publish everything — wins and losses. No other tipster does this.\n\n` +
        `Full record: ${DASHBOARD_URL}`
      );
    },
  },
  {
    day: 14,
    step: 4,
    buildMessage: (sub, stats) => {
      let msg = `Two weeks with Sharkline. 🦈\n\n`;
      if (stats.bestSport) {
        msg += `${stats.bestSport.name} has hit +${stats.bestSport.units.toFixed(1)}u this month.\n\n`;
      }
      if (sub.plan && sub.plan !== "all_sports") {
        msg += `You're on ${sub.plan}. Want to add more sports?\n`;
        msg += `Upgrade → ${BRAND_URL}\n`;
      }
      return msg;
    },
  },
];

/**
 * Process onboarding for all active subscribers.
 * Called daily by cron at 8am.
 */
export async function processOnboarding(
  supabase: SupabaseClient,
  telegramBotToken: string,
): Promise<{ sent: number; errors: number }> {
  const { data: subscribers } = await supabase
    .from("subscribers")
    .select("*")
    .eq("status", "active")
    .lt("onboarding_step", ONBOARDING_SEQUENCE.length);

  if (!subscribers || subscribers.length === 0) {
    console.log("   No subscribers need onboarding");
    return { sent: 0, errors: 0 };
  }

  // Get current stats for messages
  const stats = await getRecordStats(supabase);
  let sent = 0;
  let errors = 0;

  for (const sub of subscribers) {
    const daysSinceSubscribe = Math.floor(
      (Date.now() - new Date(sub.subscribed_at).getTime()) / 86400000
    );

    // Find the next onboarding step
    const nextStep = ONBOARDING_SEQUENCE.find(
      (s) => s.step === sub.onboarding_step + 1 && daysSinceSubscribe >= s.day
    );

    if (!nextStep) continue;

    const chatId = sub.telegram_user_id || sub.telegram_id;
    if (!chatId) continue;

    const message = nextStep.buildMessage(sub as Subscriber, stats);

    try {
      await sendTelegramDM(message, telegramBotToken, chatId);
      await supabase
        .from("subscribers")
        .update({ onboarding_step: nextStep.step })
        .eq("id", sub.id);
      sent++;
      console.log(`   ✅ Onboarding step ${nextStep.step} → ${sub.telegram_username || chatId}`);
    } catch (err) {
      errors++;
      console.log(`   ❌ Onboarding failed for ${sub.telegram_username || chatId}: ${(err as Error).message}`);
    }
  }

  return { sent, errors };
}

/**
 * Monthly performance report — sent 1st of each month.
 */
export async function sendMonthlyReport(
  supabase: SupabaseClient,
  telegramBotToken: string,
): Promise<{ sent: number }> {
  const { data: subscribers } = await supabase
    .from("subscribers")
    .select("*")
    .eq("status", "active");

  if (!subscribers || subscribers.length === 0) return { sent: 0 };

  // Get last month's stats
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const { data: monthPicks } = await supabase
    .from("picks")
    .select("result, profit, sport, pick, odds, category")
    .neq("result", "pending")
    .gte("sent_at", firstOfLastMonth.toISOString())
    .lt("sent_at", firstOfMonth.toISOString());

  const picks = monthPicks ?? [];
  const wins = picks.filter((p) => p.result === "won").length;
  const losses = picks.filter((p) => p.result === "lost").length;
  const totalProfit = picks.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0);
  const units = totalProfit / 100;
  const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : "0";
  const roi = (wins + losses) > 0 ? ((totalProfit / ((wins + losses) * 100)) * 100).toFixed(1) : "0";

  const bestPick = picks
    .filter((p) => p.result === "won")
    .sort((a, b) => (parseFloat(b.profit) || 0) - (parseFloat(a.profit) || 0))[0];

  const monthName = firstOfLastMonth.toLocaleDateString("en-US", { month: "long" });
  const isBadMonth = losses >= wins;

  let msg = `📊 <b>Sharkline — ${monthName} Report</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Record: <b>${wins}W-${losses}L</b> (${winRate}%)\n`;
  msg += `Units: ${units >= 0 ? "+" : ""}${units.toFixed(1)}u\n`;
  msg += `ROI: ${parseFloat(roi) >= 0 ? "+" : ""}${roi}%\n`;

  if (bestPick) {
    msg += `\n💎 Best Pick: ${bestPick.pick} at ${bestPick.odds} ✅\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (isBadMonth) {
    msg += `Tough month. We adjust, we improve, we come back stronger.\n`;
    msg += `Reply STAY for a 10% loyalty discount on next month.\n`;
  } else {
    msg += `Another profitable month. Let's keep it going. 🦈\n`;
  }

  msg += `\nFull record → ${DASHBOARD_URL}`;

  let sent = 0;
  for (const sub of subscribers) {
    const chatId = sub.telegram_user_id || sub.telegram_id;
    if (!chatId) continue;

    try {
      await sendTelegramDM(msg, telegramBotToken, chatId);
      sent++;
    } catch (err) {
      console.log(`   Monthly report failed for ${sub.telegram_username || chatId}: ${(err as Error).message}`);
    }
  }

  return { sent };
}

/**
 * Churn prediction — check for inactive subscribers (7+ days).
 */
export async function checkChurnRisk(
  supabase: SupabaseClient,
  telegramBotToken: string,
): Promise<{ contacted: number }> {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data: atRisk } = await supabase
    .from("subscribers")
    .select("*")
    .eq("status", "active")
    .lt("last_active", sevenDaysAgo.toISOString());

  if (!atRisk || atRisk.length === 0) {
    console.log("   No at-risk subscribers");
    return { contacted: 0 };
  }

  // Get recent performance for the message
  const stats = await getRecordStats(supabase);

  // Get 3 recent winning picks they might have missed
  const { data: recentWins } = await supabase
    .from("picks")
    .select("sport, game, pick, odds")
    .eq("result", "won")
    .order("sent_at", { ascending: false })
    .limit(3);

  const missedPicks = (recentWins ?? [])
    .map((w) => `• ${w.sport}: ${w.pick} at ${w.odds} ✅`)
    .join("\n");

  let contacted = 0;
  for (const sub of atRisk) {
    const chatId = sub.telegram_user_id || sub.telegram_id;
    if (!chatId) continue;

    let msg = `Hey — noticed you've been quiet. 🦈\n\n`;
    if (stats.roi > 0) {
      msg += `This month we've hit +${stats.roi}% ROI.\n\n`;
    }
    if (missedPicks) {
      msg += `Picks you may have missed:\n${missedPicks}\n\n`;
    }
    msg += `Reply PAUSE to hold your spot instead of cancelling.\n`;
    msg += `Full record → ${DASHBOARD_URL}`;

    try {
      await sendTelegramDM(msg, telegramBotToken, chatId);
      contacted++;
      console.log(`   📤 Churn outreach → ${sub.telegram_username || chatId}`);
    } catch (err) {
      console.log(`   Churn outreach failed: ${(err as Error).message}`);
    }
  }

  return { contacted };
}

/**
 * Win celebration — post to FREE channel on STRONG VALUE or MAXIMUM wins.
 * Called by result tracker when a high-tier pick wins.
 */
export async function postWinCelebration(
  supabase: SupabaseClient,
  telegramBotToken: string,
  freeChannelId: string,
  pick: {
    game: string;
    pick: string;
    odds: string;
    category: string;
    stake: number;
    profit: number;
  },
): Promise<boolean> {
  const tier = pick.category;
  if (tier !== "STRONG VALUE" && tier !== "MAXIMUM") return false;

  const tierEmoji = tier === "MAXIMUM" ? "💎" : "🔥";
  const units = pick.profit / 100;

  const msg =
    `${tierEmoji} <b>${tier}</b> just landed!\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${pick.game}\n` +
    `<b>${pick.pick}</b> at ${pick.odds} ✅\n` +
    `+${units.toFixed(1)}u profit\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `VIP subscribers knew this at 7am.\n` +
    `Join VIP → ${BRAND_URL}\n` +
    `🦈 Sharkline`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: freeChannelId, text: msg, parse_mode: "HTML" }),
    });
    const data = await res.json();
    if (data.ok) {
      console.log(`   🎉 Win celebration posted → msg:${data.result.message_id}`);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Helpers ───

async function getRecordStats(supabase: SupabaseClient): Promise<RecordStats> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: picks } = await supabase
    .from("picks")
    .select("result, profit, sport")
    .neq("result", "pending")
    .gte("sent_at", thirtyDaysAgo.toISOString());

  const allPicks = picks ?? [];
  const wins = allPicks.filter((p) => p.result === "won").length;
  const losses = allPicks.filter((p) => p.result === "lost").length;
  const totalProfit = allPicks.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0);
  const wagered = (wins + losses) * 100;
  const roi = wagered > 0 ? +((totalProfit / wagered) * 100).toFixed(1) : 0;

  // Best sport
  const bySport: Record<string, number> = {};
  for (const p of allPicks) {
    if (p.result === "won" || p.result === "lost") {
      bySport[p.sport] = (bySport[p.sport] || 0) + (parseFloat(p.profit) || 0);
    }
  }
  const bestEntry = Object.entries(bySport).sort((a, b) => b[1] - a[1])[0];
  const bestSport = bestEntry ? { name: bestEntry[0], units: bestEntry[1] / 100 } : undefined;

  return { wins, losses, roi, bestSport };
}

async function sendTelegramDM(text: string, botToken: string, chatId: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description);
}
