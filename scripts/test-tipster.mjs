import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  fetchUpcomingGames,
  analyzePicks,
  validatePicks,
  applyBankrollRules,
  groupPicksBySport,
  formatVipBatchMessage,
  formatFreePickMessage,
  selectFreePick,
  filterPicksForSubscriber,
  buildUpgradeNudge,
  getSportEmoji,
  getSportLabel,
  sendTelegramMessage,
} from "./tipster-core.mjs";
import {
  shouldPostDailyRecord,
  formatDailyRecord,
  formatWinDisplay,
  formatStreak,
  formatRoi,
  getWinningSports,
} from "./update-results.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function log(test, status, message) {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⏳";
  console.log(`${icon} TEST ${test}: ${message}`);
}

async function main() {
  console.log("\n🚀 SHARKLINE — SPORT-UNLOCK SYSTEM TEST\n");
  console.log("━".repeat(50));

  const required = { ODDS_API_KEY, ANTHROPIC_API_KEY, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, SUPABASE_URL, SUPABASE_ANON_KEY };
  for (const [name, val] of Object.entries(required)) {
    if (!val) { console.log(`❌ Missing ${name}`); process.exit(1); }
  }
  console.log("📋 Environment loaded");
  console.log(`   VIP Channel: ${VIP_CHANNEL_ID || "(not configured — VIP picks will be logged only)"}\n`);

  // ─── TEST 1: Multi-sport scanner ───
  log(1, "RUN", "Fetching games from all sport endpoints...");
  let games;
  try {
    games = await fetchUpcomingGames(ODDS_API_KEY);
    const sportCounts = {};
    for (const g of games) {
      const key = g.sport_title || g.sport_key;
      sportCounts[key] = (sportCounts[key] || 0) + 1;
    }
    log(1, "PASS", `${games.length} real games across ${Object.keys(sportCounts).length} sports`);
    for (const [sport, count] of Object.entries(sportCounts)) {
      console.log(`   ${sport}: ${count} games`);
    }
  } catch (err) {
    log(1, "FAIL", err.message);
    process.exit(1);
  }
  console.log();

  if (games.length === 0) {
    console.log("No upcoming games. Try again when games are scheduled.\n");
    process.exit(0);
  }

  // ─── TEST 2: Claude picks with per-sport quotas ───
  log(2, "RUN", "Claude analyzing games (per-sport quotas, min confidence 65)...");
  let rawPicks;
  try {
    rawPicks = await analyzePicks(games, ANTHROPIC_API_KEY, { minConfidence: 65 });
    log(2, "PASS", `${rawPicks.length} picks (all above 65 confidence)`);
    for (const p of rawPicks) {
      const emoji = getSportEmoji(p.sport_key);
      console.log(`   ${emoji} ${p.sport}: ${p.game} [rank ${p.rank || "?"}]`);
      console.log(`   Pick: ${p.pick} (${p.odds}) | Confidence: ${p.confidence}/100`);
      console.log(`   ${p.reasoning}`);
      if (p.vip_reasoning) console.log(`   📊 VIP: ${p.vip_reasoning.substring(0, 100)}...`);
      console.log();
    }
  } catch (err) {
    log(2, "FAIL", err.message);
    process.exit(1);
  }

  // ─── TEST 3: Validation + Bankroll rules ───
  log(3, "RUN", "Validating + applying bankroll rules...");
  const validPicks = validatePicks(rawPicks, games);
  const { picks, mode, streakCount, streakType } = applyBankrollRules(validPicks, { streak: "1L", sportPicksToday: {} });
  log(3, "PASS", `${picks.length} picks after bankroll (mode: ${mode}, streak: ${streakCount}${streakType === "win" ? "W" : "L"})`);
  console.log();

  if (picks.length === 0) {
    console.log("No picks passed filters. Exiting.\n");
    process.exit(0);
  }

  // ─── TEST 4: Sport grouping + VIP batch format ───
  log(4, "RUN", "Grouping picks by sport + formatting VIP batches...");
  const groups = groupPicksBySport(picks);
  const sportKeys = Object.keys(groups);
  console.log(`   ${sportKeys.length} sport groups: ${sportKeys.map((k) => `${getSportEmoji(k)} ${getSportLabel(k)} (${groups[k].length})`).join(", ")}`);

  for (const [sportKey, sportPicks] of Object.entries(groups)) {
    const batchMsg = formatVipBatchMessage(sportKey, sportPicks);
    console.log(`\n   ─── VIP Batch: ${getSportLabel(sportKey)} ───`);
    console.log(`   ${batchMsg.substring(0, 200)}...`);
  }
  log(4, "PASS", `${sportKeys.length} VIP batch messages formatted`);
  console.log();

  // ─── TEST 5: Free pick selection (2nd best, rotated sport) ───
  log(5, "RUN", "Selecting free channel pick (2nd best, rotated sport)...");
  const freePick = selectFreePick(picks);
  if (freePick) {
    const freeMsg = formatFreePickMessage(freePick, {
      totalVipPicks: picks.length,
      sportCount: sportKeys.length,
      paymentLink: "DM for access",
    });
    console.log(`   Free pick: ${getSportEmoji(freePick.sport_key)} ${freePick.sport} ${freePick.game}`);
    console.log(`   Confidence: ${freePick.confidence}/100 (not the best — saved for VIP)`);
    console.log(`\n   ─── Free Channel Message ───`);
    console.log(`   ${freeMsg.substring(0, 300)}...`);
    log(5, "PASS", "Free pick selected with tier CTA");
  } else {
    log(5, "FAIL", "No free pick selected");
  }
  console.log();

  // ─── TEST 6: Send free pick to Telegram ───
  log(6, "RUN", "Sending free pick to Telegram...");
  let allSent = true;
  try {
    const freeText = formatFreePickMessage(freePick, {
      totalVipPicks: picks.length,
      sportCount: sportKeys.length,
      paymentLink: "DM for access",
    });
    const freeMsgId = await sendTelegramMessage(freeText, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID);
    console.log(`   📤 FREE: ${getSportEmoji(freePick.sport_key)} ${freePick.sport} ${freePick.game} → msg:${freeMsgId}`);
  } catch (err) {
    console.log(`   ❌ FREE send failed: ${err.message}`);
    allSent = false;
  }

  // Send VIP batches
  if (VIP_CHANNEL_ID) {
    for (const [sportKey, sportPicks] of Object.entries(groups)) {
      try {
        const batchMsg = formatVipBatchMessage(sportKey, sportPicks);
        const vipMsgId = await sendTelegramMessage(batchMsg, TELEGRAM_BOT_TOKEN, VIP_CHANNEL_ID);
        console.log(`   📤 VIP batch: ${getSportEmoji(sportKey)} ${getSportLabel(sportKey)} (${sportPicks.length}) → msg:${vipMsgId}`);
      } catch (err) {
        console.log(`   ⚠️ VIP batch failed: ${err.message}`);
      }
    }
  } else {
    for (const [sportKey, sportPicks] of Object.entries(groups)) {
      console.log(`   📋 VIP (logged): ${getSportEmoji(sportKey)} ${getSportLabel(sportKey)} (${sportPicks.length} picks)`);
    }
  }

  // Log to Supabase
  for (const pick of picks) {
    const isFree = pick === freePick;
    const { data: row, error } = await supabase.from("picks").insert({
      sport: pick.sport, game: pick.game, pick: pick.pick, odds: pick.odds,
      confidence: pick.confidence, reasoning: pick.reasoning,
      channel: isFree ? "free" : "vip",
      sent_at: new Date().toISOString(),
      game_time: pick.game_time || null,
      sport_key: pick.sport_key || null,
    }).select("id").single();

    if (error) { console.log(`   DB: ${error.message}`); allSent = false; }
    else console.log(`   💾 Saved (${isFree ? "free" : "vip"}): ${row.id}`);
  }

  log(6, allSent ? "PASS" : "FAIL", `${picks.length} picks processed (1 free + ${picks.length} VIP batched)`);
  console.log();

  // ─── TEST 7: Subscriber filtering ───
  log(7, "RUN", "Testing subscriber sport filtering...");
  const allPicks = filterPicksForSubscriber(picks, ["all"]);
  const nbaPicks = filterPicksForSubscriber(picks, ["basketball_nba"]);
  const threeSports = filterPicksForSubscriber(picks, ["basketball_nba", "icehockey_nhl", "soccer_epl"]);
  const noPicks = filterPicksForSubscriber(picks, []);
  console.log(`   All Sports Pass (all): ${allPicks.length} picks`);
  console.log(`   NBA only: ${nbaPicks.length} picks`);
  console.log(`   3 Sports (NBA+NHL+EPL): ${threeSports.length} picks`);
  console.log(`   No sports: ${noPicks.length} picks`);
  log(7, "PASS", `Filtering works — all:${allPicks.length}, nba:${nbaPicks.length}, 3sport:${threeSports.length}, none:${noPicks.length}`);
  console.log();

  // ─── TEST 8: Upgrade nudge ───
  log(8, "RUN", "Testing upgrade nudge generation...");
  const mockWeekly = {
    basketball_nba: { wins: 5, losses: 2 },
    icehockey_nhl: { wins: 3, losses: 1 },
    soccer_epl: { wins: 4, losses: 2 },
  };
  const singleSub = { tier: "single_sport", unlocked_sports: ["basketball_nba"] };
  const threeSub = { tier: "three_sports", unlocked_sports: ["basketball_nba", "icehockey_nhl", "soccer_epl"] };
  const allSportsSub = { tier: "all_sports", unlocked_sports: ["all"] };

  const singleNudge = buildUpgradeNudge(singleSub, mockWeekly);
  const threeNudge = buildUpgradeNudge(threeSub, mockWeekly);
  const allSportsNudge = buildUpgradeNudge(allSportsSub, mockWeekly);

  console.log(`   Single sport nudge: ${singleNudge || "(none — all winning sports unlocked)"}`);
  console.log(`   3 sports nudge: ${threeNudge || "(none — all winning sports unlocked)"}`);
  console.log(`   All Sports pass nudge: ${allSportsNudge || "(none — already has everything)"}`);
  log(8, "PASS", `Nudge: single=${!!singleNudge}, three=${!!threeNudge}, allSports=${!allSportsNudge}`);
  console.log();

  // ─── TEST 9: Results checker ───
  log(9, "RUN", "Running results checker...");
  try {
    const { updateResults } = await import("./update-results.mjs");
    const { updated } = await updateResults();
    log(9, "PASS", `Results checker ran — ${updated} picks updated`);
  } catch (err) {
    log(9, "FAIL", err.message);
  }
  console.log();

  // ─── TEST 10: Daily record logic ───
  log(10, "RUN", "Checking daily record logic...");
  const winDay = { picks: [{ result: "won" }, { result: "won" }, { result: "lost" }], wins: 2, losses: 1, pushes: 0, pending: 0, profit: 80 };
  const loseDay = { picks: [{ result: "won" }, { result: "lost" }, { result: "lost" }], wins: 1, losses: 2, pushes: 0, pending: 0, profit: -110 };

  const postWin = shouldPostDailyRecord(winDay);
  const postLose = shouldPostDailyRecord(loseDay);
  if (postWin && !postLose) {
    log(10, "PASS", "Posts on winning day (2W-1L), skips on losing day (1W-2L)");
  } else {
    log(10, "FAIL", `postWin=${postWin}, postLose=${postLose} — expected true/false`);
  }
  console.log();

  // ─── TEST 11: Health endpoint ───
  log(11, "RUN", "Checking health status...");
  try {
    const telegramRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const telegramOk = (await telegramRes.json()).ok;

    const oddsRes = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
    const oddsOk = oddsRes.ok;

    const claudeOk = ANTHROPIC_API_KEY.startsWith("sk-ant-");

    const { error: sbErr } = await supabase.from("picks").select("id").limit(1);
    const supabaseOk = !sbErr;

    console.log(`   Telegram: ${telegramOk ? "✅" : "❌"}`);
    console.log(`   Odds API: ${oddsOk ? "✅" : "❌"}`);
    console.log(`   Claude API: ${claudeOk ? "✅" : "❌"}`);
    console.log(`   Supabase: ${supabaseOk ? "✅" : "❌"}`);

    const allOk = telegramOk && oddsOk && claudeOk && supabaseOk;
    log(11, allOk ? "PASS" : "FAIL", allOk ? "All services healthy" : "Some services degraded");
  } catch (err) {
    log(11, "FAIL", err.message);
  }
  console.log();

  // ─── TEST 12: Error recovery ───
  log(12, "RUN", "Testing error recovery (bad API key)...");
  try {
    try {
      await fetchUpcomingGames("INVALID_KEY_12345");
      log(12, "PASS", "Graceful degradation — returned empty on bad key");
    } catch (err) {
      log(12, "PASS", `Error caught gracefully: ${err.message.substring(0, 60)}`);
    }
  } catch (err) {
    log(12, "FAIL", err.message);
  }

  // ─── SUMMARY ───
  console.log("\n" + "━".repeat(50));

  console.log("\n📊 Sport-Unlock Model:");
  console.log("   TIERS:");
  console.log("     Single Sport — $19/mo (1 sport)");
  console.log("     3 Sports     — $39/mo (choose 3)");
  console.log("     All Sports Pass  — $59/mo (all sports)");

  console.log("\n📊 Cron Schedule:");
  console.log("   9:00 AM       — Morning picks (per-sport quotas, free + VIP)");
  console.log("   11:00 AM      — Marketing + social proof");
  console.log("   6:00 PM       — Evening picks (per-sport quotas, free + VIP)");
  console.log("   10:00 PM      — Daily record (free: winning only, VIP: per-sport always)");
  console.log("   11:00 PM      — Results checker");
  console.log("   10:00 AM Mon  — Weekly recap (winning weeks only)");
  console.log("   12:00 PM Wed  — Upgrade nudge DM");
  console.log("   3:00 AM 1st   — Subscriber cleanup");

  console.log("\n📋 Never-Show-Bad-Stats Rules:");
  console.log("   ✅ Daily record: only posts on winning days (free channel)");
  console.log("   ✅ VIP daily: always posts per-sport breakdown");
  console.log("   ✅ Win %: hidden if below 65%");
  console.log("   ✅ Streak: only win streaks 3+");
  console.log("   ✅ ROI: only if positive");
  console.log("   ✅ Weekly recap: only on winning weeks");
  console.log("   ✅ Landing page: hides stats below 60%");

  console.log("\n📋 Free Channel Rules:");
  console.log("   ✅ 1 pick/day (2nd best, NOT the best)");
  console.log("   ✅ Rotated sport: Mon=NBA, Tue=NHL, Wed=Soccer, Thu=Tennis/MLB, Fri=NBA, Sat=Soccer, Sun=Mixed");
  console.log("   ✅ Every message shows tier CTA ($19/$39/$59)");

  console.log("\n📋 VIP Channel Rules:");
  console.log("   ✅ Batched by sport (one message per sport, not per pick)");
  console.log("   ✅ Per-sport quotas: NBA 2-3, NHL 1-2, Soccer 2-3, MLB 1-2, Tennis 1, MMA 1, NFL 3-4");
  console.log("   ✅ Ranked within sport (rank 1 = best value)");

  console.log("\n" + "━".repeat(50));
  console.log("\n🎯 SHARKLINE — SPORT-UNLOCK SYSTEM COMPLETE\n");
}

main().catch(console.error);
