// Master cron — all Sharkline scheduled jobs with auto-recovery
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "./tipster-core.mjs";
import { updateResults, postDailyRecord, getWeeklyRecord } from "./update-results.mjs";
import { postDailyRecap, generateSocialPosts, postSocialProof, postWeeklyRecap, postFomoTrigger } from "./marketing-agent.mjs";
import { generateAllContent, generateReasoningReplay } from "./content-generators.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ERMIR_CHAT_ID = process.env.ERMIR_CHAT_ID || "7238245588";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function ts() {
  return new Date().toLocaleString("en-US", { timeZone: "America/New_York" });
}

// ─── Error notification to Ermir ───
async function notifyError(jobName, error) {
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: ERMIR_CHAT_ID,
          text: `Warning: ${jobName} Failed\n\nTime: ${ts()}\nError: ${error.message || error}`,
        }),
      }
    );
  } catch {
    console.error(`[${ts()}] Failed to send error notification`);
  }
}

// ─── Auto-recovery job wrapper ───
async function runJob(name, fn) {
  const runTime = ts();
  console.log(`\n[${runTime}] ${name} starting...`);
  try {
    await fn();
    console.log(`[${runTime}] ${name} complete\n`);
  } catch (err) {
    console.error(`[${runTime}] ${name} failed: ${err.message}`);

    // Retry once after 60 seconds
    console.log(`[${runTime}] Retrying ${name} in 60s...`);
    await new Promise((r) => setTimeout(r, 60000));

    try {
      await fn();
      console.log(`[${runTime}] ${name} succeeded on retry\n`);
    } catch (retryErr) {
      console.error(`[${runTime}] ${name} failed on retry: ${retryErr.message}`);
      await notifyError(name, retryErr);

      try {
        await supabase.from("agent_logs").insert({
          agent_name: "tipster-cron",
          action: `${name}_failed`,
          result: JSON.stringify({
            error: retryErr.message,
            time: runTime,
            retried: true,
          }),
          revenue_generated: 0,
        });
      } catch {
        console.error(`[${ts()}] Could not log to Supabase either`);
      }
    }
  }
}

// ─── Dynamic import of TypeScript tipster agent ───
async function runTipsterForSports(sportKeys, label) {
  const { runTipster } = await import("../lib/tipster/tipster-agent.ts");
  const result = await runTipster({
    oddsApiKey: ODDS_API_KEY,
    anthropicApiKey: ANTHROPIC_API_KEY,
    telegramBotToken: TELEGRAM_BOT_TOKEN,
    telegramChannelId: TELEGRAM_CHANNEL_ID,
    vipChannelId: VIP_CHANNEL_ID || undefined,
    supabase,
    sportKeys,
  });
  console.log(`   ${label}: ${result.gamesFound} games → ${result.cardsGenerated} cards → ${result.picksSent} sent`);

  // Always log to agent_logs — even zero-pick runs, so we can detect silent cron death
  try {
    await supabase.from("agent_logs").insert({
      agent_name: "tipster-cron",
      action: `${label.toLowerCase().replace(/\s+/g, "_")}_run`,
      result: JSON.stringify({
        games_found: result.gamesFound,
        cards_generated: result.cardsGenerated,
        picks_sent: result.picksSent,
        sport_keys: sportKeys,
      }),
      revenue_generated: 0,
    });
  } catch { /* non-critical */ }

  return result;
}

// ─── Bankroll summary ───
async function postBankrollSummary() {
  const { data: lastEntry } = await supabase.from("bankroll_log")
    .select("balance").order("created_at", { ascending: false }).limit(1).single();
  const balance = lastEntry?.balance ?? 100;
  const pl = balance - 100;
  const roi = ((pl / 100) * 100).toFixed(1);

  if (pl <= 0) {
    console.log(`   Skipping bankroll summary — balance: ${balance.toFixed(1)}u`);
    return;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: todayEntries } = await supabase.from("bankroll_log")
    .select("action, units").gte("created_at", today.toISOString());

  const entries = todayEntries || [];
  const todayWins = entries.filter((e) => e.action === "win").length;
  const todayLosses = entries.filter((e) => e.action === "loss").length;

  const date = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York", month: "long", day: "numeric",
  });

  let msg = `📊 <b>BANKROLL UPDATE</b> — ${date}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Balance: <b>${balance.toFixed(1)}u</b>\n`;
  msg += `P/L: <b>+${pl.toFixed(1)}u</b>\n`;
  msg += `ROI: <b>+${roi}%</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (todayWins + todayLosses > 0) {
    msg += `Today: ${todayWins}W-${todayLosses}L\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  }
  msg += `🦈 Sharkline — sharkline.ai`;

  await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, "HTML");
  console.log(`   📤 Bankroll summary posted`);
}

// ─── Weekly weight recalibration ───
async function recalibrateAllWeights() {
  const { recalibrateWeights } = await import("../lib/tipster/scoring-engine.ts");
  const sports = [
    "basketball_nba", "icehockey_nhl", "soccer_epl", "soccer_spain_la_liga",
    "americanfootball_nfl", "baseball_mlb", "soccer_uefa_champs_league",
    "mma_mixed_martial_arts", "tennis_atp_french_open",
  ];
  for (const sport of sports) {
    try {
      await recalibrateWeights(supabase, sport);
    } catch (err) {
      console.log(`   Calibration failed for ${sport}: ${err.message}`);
    }
  }
}

// ─── Content buffer — post daily from pre-generated content ───
async function postFromContentBuffer() {
  const { postBufferedContent } = await import("../lib/agents/content-buffer.ts");
  return postBufferedContent(supabase, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID);
}

// ─── Retention: onboarding + churn ───
async function runOnboarding() {
  const { processOnboarding } = await import("../lib/agents/retention-agent.ts");
  return processOnboarding(supabase, TELEGRAM_BOT_TOKEN);
}

async function runChurnCheck() {
  const { checkChurnRisk } = await import("../lib/agents/retention-agent.ts");
  return checkChurnRisk(supabase, TELEGRAM_BOT_TOKEN);
}

async function runMonthlyReport() {
  const { sendMonthlyReport } = await import("../lib/agents/retention-agent.ts");
  return sendMonthlyReport(supabase, TELEGRAM_BOT_TOKEN);
}

// ─── Community ───
async function runMondayDiscussion() {
  const { postMondayDiscussion } = await import("../lib/agents/community-agent.ts");
  return postMondayDiscussion(supabase, TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY);
}

async function runMilestoneCheck() {
  const { checkMilestones } = await import("../lib/agents/community-agent.ts");
  return checkMilestones(TELEGRAM_BOT_TOKEN);
}

// ─── Affiliate weekly odds comparison ───
async function postOddsComparison() {
  const { buildOddsComparisonPost } = await import("../lib/integrations/affiliates.ts");
  const msg = await buildOddsComparisonPost(supabase);
  if (msg) {
    await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, VIP_CHANNEL_ID || TELEGRAM_CHANNEL_ID, "HTML");
    console.log("   📤 Odds comparison posted");
  } else {
    console.log("   No affiliate links configured — skipping odds comparison");
  }
}

// Sport key groups
const ACTIVE_SPORTS = (process.env.ACTIVE_SPORTS || "soccer,basketball").split(",").map(s => s.trim());

const SOCCER_KEYS = [
  "soccer_epl", "soccer_spain_la_liga", "soccer_italy_serie_a",
  "soccer_germany_bundesliga", "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
];
const NBA_KEYS = ["basketball_nba", "basketball_euroleague"];
const NHL_KEYS = ["icehockey_nhl"];
const NFL_KEYS = ["americanfootball_nfl"];
const MLB_KEYS = ["baseball_mlb"];
const TENNIS_KEYS = ["tennis_atp_monte_carlo_masters", "tennis_atp_french_open", "tennis_atp_wimbledon", "tennis_wta_french_open", "tennis_wta_wimbledon"];
const MMA_KEYS = ["mma_mixed_martial_arts"];

const isSoccerActive = ACTIVE_SPORTS.includes("soccer");
const isBasketballActive = ACTIVE_SPORTS.includes("basketball");
const isHockeyActive = ACTIVE_SPORTS.includes("hockey");
const isFootballActive = ACTIVE_SPORTS.includes("football");
const isBaseballActive = ACTIVE_SPORTS.includes("baseball");
const isTennisActive = ACTIVE_SPORTS.includes("tennis");
const isMMAActive = ACTIVE_SPORTS.includes("mma");

const ALL_ACTIVE_KEYS = [
  ...(isSoccerActive ? SOCCER_KEYS : []),
  ...(isBasketballActive ? NBA_KEYS : []),
  ...(isHockeyActive ? NHL_KEYS : []),
  ...(isFootballActive ? NFL_KEYS : []),
  ...(isBaseballActive ? MLB_KEYS : []),
  ...(isTennisActive ? TENNIS_KEYS : []),
  ...(isMMAActive ? MMA_KEYS : []),
];

// ═══════════════════════════════════
// CRON SCHEDULE (all times EST)
// ═══════════════════════════════════

// 6:00 AM — Soccer (all major leagues)
if (isSoccerActive) {
  cron.schedule("0 6 * * *", () => {
    console.log(`[${ts()}] Soccer cron triggered`);
    runJob("Soccer Picks", () => runTipsterForSports(SOCCER_KEYS, "Soccer"));
  }, { timezone: "America/New_York" });
}

// 8:00 AM — Tennis (ATP/WTA) + Onboarding + Content Buffer
if (isTennisActive) {
  cron.schedule("0 8 * * *", () => {
    console.log(`[${ts()}] Tennis cron triggered`);
    runJob("Tennis Picks", () => runTipsterForSports(TENNIS_KEYS, "Tennis"));
  }, { timezone: "America/New_York" });
}

// 8:00 AM — Daily onboarding check + content buffer post
cron.schedule("0 8 * * *", () => {
  console.log(`[${ts()}] Daily onboarding + content buffer triggered`);
  runJob("Onboarding", runOnboarding);
  runJob("Content Buffer", postFromContentBuffer);
}, { timezone: "America/New_York" });

// 9:00 AM — NBA + NHL
if (isBasketballActive || isHockeyActive) {
  cron.schedule("0 9 * * *", () => {
    console.log(`[${ts()}] NBA/NHL cron triggered`);
    const keys = [...(isBasketballActive ? NBA_KEYS : []), ...(isHockeyActive ? NHL_KEYS : [])];
    runJob("NBA/NHL Picks", () => runTipsterForSports(keys, "NBA/NHL"));
  }, { timezone: "America/New_York" });
}

// 10:00 AM — NFL (season: Sep-Feb)
if (isFootballActive) {
  cron.schedule("0 10 * * *", () => {
    const month = new Date().getMonth(); // 0-indexed
    if (month >= 8 || month <= 1) { // Sep(8) through Feb(1)
      console.log(`[${ts()}] NFL cron triggered`);
      runJob("NFL Picks", () => runTipsterForSports(NFL_KEYS, "NFL"));
    }
  }, { timezone: "America/New_York" });
}

// 11:00 AM — MLB
if (isBaseballActive) {
  cron.schedule("0 11 * * *", () => {
    console.log(`[${ts()}] MLB cron triggered`);
    runJob("MLB Picks", () => runTipsterForSports(MLB_KEYS, "MLB"));
  }, { timezone: "America/New_York" });
}

// 1:00 PM — MMA (runs daily but only finds fights on fight days)
if (isMMAActive) {
  cron.schedule("0 13 * * *", () => {
    console.log(`[${ts()}] MMA cron triggered`);
    runJob("MMA Picks", () => runTipsterForSports(MMA_KEYS, "MMA"));
  }, { timezone: "America/New_York" });
}

// 6:00 PM — Evening slate (all sports with remaining games)
cron.schedule("0 18 * * *", () => {
  console.log(`[${ts()}] Evening slate cron triggered`);
  runJob("Evening Slate", () => runTipsterForSports(ALL_ACTIVE_KEYS, "Evening"));
}, { timezone: "America/New_York" });

// 10:00 PM — Daily recap (ALWAYS post, win or lose) + bankroll summary
cron.schedule("0 22 * * *", () => {
  console.log(`[${ts()}] Daily summary cron triggered`);
  runJob("Daily Recap", postDailyRecap);
  runJob("Bankroll Summary", postBankrollSummary);
}, { timezone: "America/New_York" });

// 11:00 PM — Run result tracker + trigger content generation after settling
cron.schedule("0 23 * * *", () => {
  console.log(`[${ts()}] Result checker + content generation cron triggered`);
  runJob("Result Checker", updateResults);
  setTimeout(() => {
    runJob("Post-Settle Content", generateAllContent);
  }, 5 * 60 * 1000);
}, { timezone: "America/New_York" });

// Every 5 minutes — Settlement checker (calls /api/cron/settle-pending locally)
cron.schedule("*/5 * * * *", () => {
  console.log(`[${ts()}] Settlement checker triggered (every 5 min)`);
  runJob("Settlement Checker", async () => {
    const port = process.env.PORT || 3000;
    const secret = process.env.CRON_SECRET || "";
    try {
      const res = await fetch(`http://localhost:${port}/api/cron/settle-pending`, {
        headers: secret ? { Authorization: `Bearer ${secret}` } : {},
        signal: AbortSignal.timeout(30000),
      });
      const data = await res.json();
      console.log(`   Settlement: ${data.settled} settled, ${data.retried} retried, ${data.failed || 0} failed`);
    } catch (err) {
      // Fallback to legacy update-results if Next.js server isn't running
      console.log(`   Settlement API unavailable, using legacy updater: ${err.message}`);
      await updateResults();
    }
  });
}, { timezone: "America/New_York" });

// Every hour — Heartbeat log so we can detect silent cron death from agent_logs
cron.schedule("0 * * * *", async () => {
  try {
    await supabase.from("agent_logs").insert({
      agent_name: "tipster-cron",
      action: "heartbeat",
      result: JSON.stringify({ pid: process.pid, uptime_s: Math.floor(process.uptime()), time: ts() }),
      revenue_generated: 0,
    });
  } catch { /* non-critical */ }
}, { timezone: "America/New_York" });

// 10:00 AM Monday — Weekly recap + community discussion + milestones
cron.schedule("0 10 * * 1", () => {
  console.log(`[${ts()}] Monday cron triggered`);
  runJob("Weekly Recap", postWeeklyRecap);
  runJob("Monday Discussion", runMondayDiscussion);
  runJob("Milestone Check", runMilestoneCheck);
}, { timezone: "America/New_York" });

// 3:00 AM Monday — Weekly weight recalibration
cron.schedule("0 3 * * 1", () => {
  console.log(`[${ts()}] Weekly recalibration triggered`);
  runJob("Weight Recalibration", recalibrateAllWeights);
}, { timezone: "America/New_York" });

// 12:00 PM Wednesday — FOMO trigger + upgrade nudges + churn check
cron.schedule("0 12 * * 3", () => {
  console.log(`[${ts()}] Wednesday engagement cron triggered`);
  runJob("FOMO Trigger", postFomoTrigger);
  runJob("Churn Check", runChurnCheck);
  runJob("Upgrade Nudge", async () => {
    const { buildUpgradeNudge } = await import("./tipster-core.mjs");
    const weekly = await getWeeklyRecord(supabase);

    if (weekly.wins <= weekly.losses) {
      console.log(`   Skipping nudge — not a winning week (${weekly.wins}W-${weekly.losses}L)`);
      return;
    }

    const { data: subs } = await supabase
      .from("subscribers")
      .select("*")
      .eq("status", "active")
      .neq("tier", "all_sports");

    if (!subs || subs.length === 0) {
      console.log("   No active subscribers to nudge");
      return;
    }

    let sent = 0;
    for (const sub of subs) {
      const nudge = buildUpgradeNudge(sub, weekly.bySport);
      if (!nudge) continue;

      if (sub.telegram_user_id) {
        try {
          await sendTelegramMessage(nudge, TELEGRAM_BOT_TOKEN, sub.telegram_user_id);
          sent++;
        } catch (err) {
          console.log(`   Failed to nudge ${sub.telegram_username || sub.telegram_user_id}: ${err.message}`);
        }
      }
    }
    console.log(`   Sent ${sent}/${subs.length} upgrade nudges`);
  });
}, { timezone: "America/New_York" });

// 2:00 PM Tue/Thu — Scheduled content generation
cron.schedule("0 14 * * 2,4", () => {
  console.log(`[${ts()}] Scheduled content generation triggered`);
  runJob("Content Generation", generateAllContent);
}, { timezone: "America/New_York" });

// 5:00 PM Sunday — Weekly odds comparison (affiliate revenue)
cron.schedule("0 17 * * 0", () => {
  console.log(`[${ts()}] Odds comparison triggered`);
  runJob("Odds Comparison", postOddsComparison);
}, { timezone: "America/New_York" });

// Monthly — 1st of every month at 3am: subscriber check + monthly reports
cron.schedule("0 3 1 * *", () => {
  console.log(`[${ts()}] Monthly tasks triggered`);
  runJob("Monthly Report", runMonthlyReport);
  runJob("Subscriber Check", async () => {
    const { data: expired } = await supabase
      .from("subscribers")
      .select("*")
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    for (const sub of expired || []) {
      await supabase.from("subscribers")
        .update({ status: "expired" })
        .eq("id", sub.id);

      if (VIP_CHANNEL_ID && sub.telegram_user_id) {
        try {
          await fetch(
            `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/banChatMember`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: VIP_CHANNEL_ID,
                user_id: parseInt(sub.telegram_user_id, 10),
              }),
            }
          );
          console.log(`   Removed expired: ${sub.telegram_username || sub.telegram_user_id}`);
        } catch {
          console.log(`   Failed to remove: ${sub.telegram_username || sub.telegram_user_id}`);
        }
      }
    }
    console.log(`   Checked ${expired?.length || 0} expired subscribers`);
  });
}, { timezone: "America/New_York" });

// ═══════════════════════════════════
// STARTUP
// ═══════════════════════════════════
console.log("=".repeat(50));
console.log("SHARKLINE — Full Cron Agent");
console.log("=".repeat(50));
console.log(`Started: ${ts()}`);
console.log(`Active Sports: ${ACTIVE_SPORTS.join(", ")}`);
console.log(`Free Channel: ${TELEGRAM_CHANNEL_ID}`);
console.log(`VIP Channel: ${VIP_CHANNEL_ID || "(not configured)"}`);
console.log(`Free Group: ${process.env.TELEGRAM_FREE_GROUP_ID || "(not configured)"}`);
console.log(`VIP Group: ${process.env.TELEGRAM_VIP_GROUP_ID || "(not configured)"}`);
console.log(`Error DM: ${ERMIR_CHAT_ID}`);
console.log();
console.log("SCHEDULE (EST):");
if (isSoccerActive) console.log("  6:00 AM       — Soccer (EPL, La Liga, Serie A, Bundesliga, Ligue 1, UCL)");
if (isTennisActive) console.log("  8:00 AM       — Tennis (ATP/WTA)");
console.log("  8:00 AM       — Daily onboarding + content buffer");
if (isBasketballActive || isHockeyActive) console.log("  9:00 AM       — NBA + NHL");
if (isFootballActive) console.log("  10:00 AM      — NFL (Sep-Feb only)");
if (isBaseballActive) console.log("  11:00 AM      — MLB");
if (isMMAActive) console.log("  1:00 PM       — MMA (fight days)");
console.log("  6:00 PM       — Evening slate (all active sports)");
console.log("  10:00 PM      — Daily recap (always) + bankroll summary");
console.log("  11:00 PM      — Result tracker + content generation");
console.log("  Every 30min   — Result tracker (settle picks + update dashboard)");
console.log("  Every hour    — Heartbeat log (detect silent cron death)");
console.log("  10:00 AM Mon  — Weekly recap + community discussion");
console.log("  3:00 AM Mon   — Weight recalibration");
console.log("  12:00 PM Wed  — FOMO + nudges + churn check");
console.log("  2:00 PM Tue/Thu — Content generation");
console.log("  5:00 PM Sun   — Odds comparison (affiliates)");
console.log("  3:00 AM 1st   — Monthly reports + subscriber check");
console.log();
console.log("SYSTEMS:");
console.log("  1. Content Buffer  — auto-posts educational/celebration content");
console.log("  2. Retention       — onboarding, churn detection, monthly reports");
console.log("  3. Affiliates      — bookmaker links + revenue tracking");
console.log("  4. Community       — group engagement + milestones");
console.log("  5. Dashboard       — /dashboard (Ermir only)");
console.log();
console.log("SAFETY NET:");
console.log("  - Auto-pause sport if win rate < 52% over 30+ picks");
console.log("  - Paused sports enter paper trade mode");
console.log("  - Auto-resume after 10 paper picks at 56%+ win rate");
console.log();
console.log("TIERS:");
console.log("  VALUE (62-67)        — ✅ 1u stake");
console.log("  STRONG VALUE (68-72) — 🔥 1.5u stake");
console.log("  MAXIMUM (73-100)     — 💎 2u stake");
console.log("=".repeat(50));
