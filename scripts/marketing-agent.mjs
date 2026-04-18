// Marketing Growth Agent — autonomous promotional content from real data
// Sharkline: win announcements, daily recaps, social posts, weekly recaps, FOMO triggers
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import {
  getRecord, getWeeklyRecord, getTodayRecord, shouldPostDailyRecord,
  shouldPostWeeklyRecap, getWinningSports, formatWinDisplay, formatStreak, formatRoi,
} from "./update-results.mjs";
import { sendTelegramMessage, getSportEmoji, getSportLabel } from "./tipster-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BRAND_URL = "sharkline.ai";
const DASHBOARD_URL = "sharkline.ai/public";
const pickUrl = (id) => `${BRAND_URL}/public/pick/${id}`;

// ═══════════════════════════════════
// A) WIN ANNOUNCEMENT — post after each settled win
// ═══════════════════════════════════

export async function postWinAnnouncement(pick) {
  const emoji = getSportEmoji(pick.sport_key) || "🔥";
  const tier = pick.category || pick.tier || "VALUE";
  const tierEmoji = tier === "MAXIMUM" ? "💎" : tier === "STRONG VALUE" ? "🔥" : "✅";

  // Get current streak
  const record = await getRecord(supabase);
  const streakText = record.streakType === "win" && record.streakCount >= 2
    ? `\nThat's <b>${record.streakCount} in a row!</b> 🔥`
    : "";

  const link = pickUrl(pick.id);

  const msg =
    `💰 <b>WINNER!</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${emoji} ${pick.sport || pick.game}\n` +
    `${pick.game}\n` +
    `<b>${pick.pick}</b> at ${pick.odds} ✅\n` +
    `${tierEmoji} ${tier}` +
    streakText + `\n` +
    `\n📊 Full analysis → ${link}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `Join free → ${BRAND_URL}\n` +
    `🦈 Sharkline`;

  try {
    const msgId = await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, "HTML");
    console.log(`   📤 Win announcement posted → msg:${msgId}`);

    await supabase.from("marketing_posts").insert({
      platform: "telegram",
      content: msg,
      pick_ids: [pick.id],
      performance_data: { type: "win_announcement", streak: record.streakCount },
      posted: true,
    });

    return msgId;
  } catch (err) {
    console.log(`   Win announcement failed: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════
// B) DAILY RECAP — 10pm EST, ALWAYS posts (win or lose)
// ═══════════════════════════════════

export async function postDailyRecap() {
  console.log("\n📊 Marketing Agent — Daily Recap...\n");

  const today = await getTodayRecord(supabase);
  const allTime = await getRecord(supabase);

  if (today.wins + today.losses === 0) {
    console.log(`   No picks settled today — skipping`);
    return null;
  }

  const date = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York", month: "long", day: "numeric",
  });

  const isWinningDay = today.wins > today.losses;
  const todayUnits = (today.profit || 0) / 100;
  const allTimeUnits = allTime.totalProfit ? (allTime.totalProfit / 100) : 0;
  let msg;

  if (isWinningDay) {
    // ── WINNING DAY template ──
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const { data: todayWins } = await supabase
      .from("picks").select("sport, game, pick, odds, profit, category")
      .eq("result", "won")
      .gte("sent_at", todayDate.toISOString())
      .order("profit", { ascending: false })
      .limit(1);
    const bestPick = todayWins?.[0];

    msg = `📊 <b>Sharkline Daily Record</b> — ${date}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Today: <b>${today.wins}W-${today.losses}L</b> | +${todayUnits.toFixed(1)}u\n`;

    if (bestPick) {
      msg += `Best pick: ${bestPick.pick} at ${bestPick.odds} ✅\n`;
    }

    if (allTime.winRate >= 55) {
      msg += `Overall: ${allTime.wins}W-${allTime.losses}L (${allTime.winRate}%)\n`;
    }
    if (allTime.roi > 0) msg += `ROI: +${allTime.roi}%\n`;

    const streakStr = formatStreak(allTime);
    if (streakStr) msg += `${streakStr}\n`;

    msg += `\n📊 Full record → ${DASHBOARD_URL}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Tomorrow's picks drop at 7am EST 🔐`;
  } else {
    // ── LOSING DAY template ──
    msg = `📊 <b>Sharkline Daily Record</b> — ${date}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Today: <b>${today.wins}W-${today.losses}L</b> | ${todayUnits.toFixed(1)}u\n`;
    msg += `Variance didn't go our way today.\n`;
    msg += `Overall record: <b>${allTime.wins}W-${allTime.losses}L</b>`;
    if (allTimeUnits > 0) msg += ` | +${allTimeUnits.toFixed(1)}u`;
    msg += `\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Back tomorrow with fresh plays. 🔐`;
  }

  try {
    const msgId = await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, "HTML");
    console.log(`   📤 Daily recap posted → msg:${msgId}`);

    await supabase.from("marketing_posts").insert({
      platform: "telegram",
      content: msg,
      performance_data: {
        type: "daily_recap",
        today: { wins: today.wins, losses: today.losses },
        allTime: { wins: allTime.wins, winRate: allTime.winRate },
      },
      posted: true,
    });

    return { msgId };
  } catch (err) {
    console.log(`   Daily recap failed: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════
// C) SOCIAL MEDIA POSTS — Claude generates for 3 platforms
// ═══════════════════════════════════

export async function generateSocialPosts() {
  console.log("\n📣 Marketing Agent — Generating social posts...\n");

  const record = await getRecord(supabase);
  const weekly = await getWeeklyRecord(supabase);

  if (record.total === 0) {
    console.log("   No completed picks — skipping");
    return [];
  }

  // Build positive-only stats
  const statLines = [];
  if (record.winRate >= 55) {
    statLines.push(`Record: ${record.wins}W-${record.losses}L (${record.winRate}%)`);
  } else {
    statLines.push(`Verified Wins: ${record.wins}`);
  }
  if (record.roi > 0) statLines.push(`ROI: +${record.roi}%`);
  if (record.streakType === "win" && record.streakCount >= 3) {
    statLines.push(`Win Streak: ${record.streakCount}`);
  }
  if (weekly.wins > weekly.losses && weekly.winRate >= 55) {
    statLines.push(`This Week: ${weekly.wins}W-${weekly.losses}L`);
  }

  const winningSports = getWinningSports(record.bySport || {});
  if (Object.keys(winningSports).length > 0) {
    const best = Object.entries(winningSports).sort((a, b) => b[1].wins - a[1].wins)[0];
    statLines.push(`Best Sport: ${best[0]} — ${best[1].wins}W (${best[1].winRate}%)`);
  }

  if (statLines.length <= 1) {
    console.log("   Not enough positive stats — skipping");
    return [];
  }

  // Get recent wins for examples
  const recentWins = record.recentWins?.slice(0, 3) || [];
  const recentText = recentWins
    .map((w) => `${w.sport}: ${w.pick} at ${w.odds}`)
    .join("\n") || "Building track record";

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `You are the copywriter for Sharkline, a sports picks service. Write as a confident human tipster. NEVER mention AI, algorithms, or automation.

REAL verified stats:
${statLines.map((l) => `- ${l}`).join("\n")}

Recent wins:
${recentText}

Generate 3 social media posts:
1. Twitter/X (under 280 chars): Punchy, with #SportsBetting #FreePicks #Sharkline hashtags
2. Reddit (title + body for r/sportsbetting): Conversational, like a real person sharing their capper. Not spammy.
3. Instagram caption (under 200 chars): Bold, punchy, with emojis

Rules:
- ONLY use real stats provided. Never invent numbers.
- Only highlight stats that look good (55%+ win rate, streaks 3+, positive ROI)
- Sound confident but not scammy
- Write in first person plural ("we")
- End each with: "Free picks daily → sharkline.ai"
- If nothing positive to say, return []

Return ONLY this JSON:
[
  {"platform":"twitter","content":"..."},
  {"platform":"reddit","content":"TITLE: ...\\n\\nBODY: ..."},
  {"platform":"instagram","content":"..."}
]`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return [];

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
  }

  let posts;
  try {
    posts = JSON.parse(jsonStr);
  } catch {
    console.log("   Failed to parse Claude response");
    return [];
  }

  if (!posts || posts.length === 0) {
    console.log("   Claude returned empty — not enough positive angles");
    return [];
  }

  // Save all to Supabase
  const performanceData = {
    wins: record.wins,
    losses: record.losses,
    winRate: record.winRate,
    roi: record.roi,
    streak: record.streakCount,
  };

  for (const post of posts) {
    await supabase.from("marketing_posts").insert({
      platform: post.platform,
      content: post.content,
      performance_data: performanceData,
      posted: false,
    });
  }

  console.log(`   Generated ${posts.length} social posts:`);
  for (const post of posts) {
    console.log(`\n   ─── ${post.platform.toUpperCase()} ───`);
    console.log(`   ${post.content.substring(0, 200)}${post.content.length > 200 ? "..." : ""}`);
    console.log(`   [SAVED — for Ermir to post manually]`);
  }

  return posts;
}

// ═══════════════════════════════════
// D) WEEKLY RECAP — Monday 10am, ALWAYS posts (win or lose)
// ═══════════════════════════════════

export async function postWeeklyRecap() {
  console.log("\n🏆 Marketing Agent — Weekly Recap...\n");

  const weekly = await getWeeklyRecord(supabase);

  if (weekly.wins + weekly.losses === 0) {
    console.log(`   No picks this week — skipping`);
    return null;
  }

  const record = await getRecord(supabase);
  const isWinningWeek = weekly.wins > weekly.losses;
  const weeklyUnits = (weekly.profit || 0) / 100;
  const allTimeUnits = record.totalProfit ? (record.totalProfit / 100) : 0;

  let msg;

  if (isWinningWeek) {
    // ── WINNING WEEK template ──
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const { data: weekWins } = await supabase
      .from("picks").select("sport, sport_key, game, pick, odds, profit, category")
      .eq("result", "won").gte("sent_at", weekAgo.toISOString())
      .order("profit", { ascending: false }).limit(1);

    const bestHit = weekWins?.[0];

    msg = `📈 <b>Sharkline — Week in Review</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Record: <b>${weekly.wins}W-${weekly.losses}L</b>`;
    if (weekly.winRate >= 55) msg += ` (${weekly.winRate}%)`;
    msg += ` | +${weeklyUnits.toFixed(1)}u\n`;

    if (record.roi > 0) msg += `ROI: <b>+${record.roi}%</b>\n`;

    const winningSports = Object.entries(weekly.bySport || {})
      .filter(([, r]) => r.wins > r.losses)
      .sort((a, b) => b[1].wins - a[1].wins);

    if (winningSports.length > 0) {
      msg += `\n`;
      for (const [sport, r] of winningSports) {
        const emoji = getSportEmoji(sport) || "🏅";
        msg += `${emoji} ${sport}: ${r.wins}W-${r.losses}L\n`;
      }
      msg += `\n🏆 Top Sport: <b>${winningSports[0][0]}</b>\n`;
    }

    if (bestHit) {
      msg += `💎 Best Pick: <b>${bestHit.pick}</b> at ${bestHit.odds} ✅\n`;
    }

    msg += `\n📊 Full dashboard → ${DASHBOARD_URL}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Join free → ${BRAND_URL}\n`;
    msg += `🦈 Sharkline`;
  } else {
    // ── LOSING WEEK template ──
    msg = `📈 <b>Sharkline — Week in Review</b>\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `Record: <b>${weekly.wins}W-${weekly.losses}L</b> | ${weeklyUnits.toFixed(1)}u\n`;
    msg += `Tough week. This is betting — variance happens.\n`;
    msg += `Overall since launch: <b>${record.wins}W-${record.losses}L</b>`;
    if (allTimeUnits > 0) msg += ` | +${allTimeUnits.toFixed(1)}u`;
    if (record.winRate >= 55) msg += ` | ${record.winRate}%`;
    msg += `\n`;
    msg += `We don't hide losses. We track everything on-chain.\n`;
    msg += `Full verified record → ${DASHBOARD_URL}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🦈 Sharkline`;
  }

  try {
    const msgId = await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, "HTML");
    console.log(`   📤 Weekly recap posted → msg:${msgId}`);

    await supabase.from("marketing_posts").insert({
      platform: "telegram",
      content: msg,
      performance_data: {
        type: "weekly_recap",
        weekly: { wins: weekly.wins, losses: weekly.losses, winRate: weekly.winRate },
      },
      posted: true,
    });

    return { msgId };
  } catch (err) {
    console.log(`   Weekly recap failed: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════
// E) FOMO TRIGGERS — scattered through the day
// ═══════════════════════════════════

export async function postFomoTrigger() {
  console.log("\n🔥 Marketing Agent — FOMO check...\n");

  const record = await getRecord(supabase);
  const weekly = await getWeeklyRecord(supabase);

  // Check for MAXIMUM picks that hit this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const { data: maxHits } = await supabase
    .from("picks").select("sport, odds, pick")
    .eq("result", "won")
    .in("category", ["MAXIMUM"])
    .gte("sent_at", weekAgo.toISOString());

  const maxCount = maxHits?.length ?? 0;

  // Pick the best FOMO angle
  let fomoMsg = null;

  if (maxCount >= 2) {
    // Average odds of MAX hits
    const avgOdds = maxHits.reduce((sum, p) => {
      const odds = parseInt(p.odds, 10);
      return sum + (isNaN(odds) ? 0 : odds);
    }, 0) / maxCount;
    const avgStr = avgOdds > 0 ? `+${Math.round(avgOdds)}` : `${Math.round(avgOdds)}`;

    fomoMsg =
      `🔥 <b>${maxCount} MAXIMUM picks</b> hit this week.\n` +
      `VIP members saw them all at avg ${avgStr} odds.\n` +
      `Upgrade → ${BRAND_URL}\n` +
      `🦈 Sharkline`;
  } else if (record.streakType === "win" && record.streakCount >= 4) {
    // Hot streak
    fomoMsg =
      `⚡ <b>${record.streakCount} in a row.</b> We don't miss.\n` +
      `Next pick drops soon.\n` +
      `Join free → ${BRAND_URL}\n` +
      `🦈 Sharkline`;
  } else if (record.winRate >= 60 && record.total >= 20) {
    // Strong overall record
    fomoMsg =
      `📈 <b>${record.winRate}% win rate</b> across ${record.total} picks.\n` +
      `That's not luck. That's Sharkline.\n` +
      `Join free → ${BRAND_URL}\n` +
      `🦈 Sharkline`;
  }

  if (!fomoMsg) {
    console.log("   No positive FOMO angle — skipping");
    return null;
  }

  try {
    const msgId = await sendTelegramMessage(fomoMsg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, "HTML");
    console.log(`   📤 FOMO trigger posted → msg:${msgId}`);

    await supabase.from("marketing_posts").insert({
      platform: "telegram",
      content: fomoMsg,
      performance_data: { type: "fomo_trigger", maxHits: maxCount, streak: record.streakCount },
      posted: true,
    });

    return { msgId };
  } catch (err) {
    console.log(`   FOMO trigger failed: ${err.message}`);
    return null;
  }
}

// ═══════════════════════════════════
// SOCIAL PROOF — for free channel
// ═══════════════════════════════════

export async function postSocialProof() {
  console.log("\n📣 Social proof check...\n");

  const record = await getRecord(supabase);

  if (record.total === 0) {
    console.log("   No completed picks — skipping");
    return null;
  }

  const hasPositiveRoi = record.roi > 0;
  const hasWinStreak = record.streakType === "win" && record.streakCount >= 3;
  const hasGoodRate = record.winRate >= 55;

  if (!hasPositiveRoi && !hasWinStreak && !hasGoodRate && (!record.recentWins || record.recentWins.length === 0)) {
    console.log("   No positive angles — skipping");
    return null;
  }

  const bestWin = record.recentWins?.[0];

  let msg = `📈 <b>RECORD CHECK</b>\n━━━━━━━━━━━━━━━━━━\n`;
  msg += `${formatWinDisplay(record)}\n`;

  if (bestWin) {
    msg += `Latest hit: ${bestWin.sport} — ${bestWin.pick} at ${bestWin.odds} ✅\n`;
  }

  const roiStr = formatRoi(record);
  if (roiStr) msg += `${roiStr}\n`;

  const streakStr = formatStreak(record);
  if (streakStr) msg += `${streakStr}\n`;

  const winningSports = getWinningSports(record.bySport || {});
  if (Object.keys(winningSports).length > 0) {
    const sportLine = Object.entries(winningSports)
      .map(([sport, r]) => `${sport} ${r.wins}-${r.losses}`)
      .join(", ");
    msg += `Hot: ${sportLine}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━\nFree picks daily right here\n🦈 Sharkline — ${BRAND_URL}`;

  try {
    const msgId = await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, "HTML");
    console.log(`   📤 Social proof posted → msg:${msgId}`);
    return { msgId };
  } catch (err) {
    console.log(`   Social proof failed: ${err.message}`);
    return null;
  }
}

// ─── CLI ───
async function main() {
  const cmd = process.argv[2] || "all";
  switch (cmd) {
    case "daily": await postDailyRecap(); break;
    case "weekly": await postWeeklyRecap(); break;
    case "social": await generateSocialPosts(); break;
    case "fomo": await postFomoTrigger(); break;
    case "proof": await postSocialProof(); break;
    case "all":
      await postDailyRecap();
      await generateSocialPosts();
      await postFomoTrigger();
      break;
    default:
      console.log("Usage: node marketing-agent.mjs [daily|weekly|social|fomo|proof|all]");
  }
}

const isDirectRun = process.argv[1]?.endsWith("marketing-agent.mjs");
if (isDirectRun) main().catch(console.error);
