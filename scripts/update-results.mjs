// Result tracking + daily record posting with "never show bad stats" rules
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import {
  calculateProfit, sendTelegramMessage, SPORT_KEYS,
  formatVipDailySummary, getSportLabel, getSportEmoji,
} from "./tipster-core.mjs";
import { fetchLiveScores, searchScoresOnWeb } from "./live-data-agent.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID;
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID || "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── Parse a pick string ───
function parsePick(pickStr) {
  pickStr = pickStr.trim();
  if (pickStr.endsWith(" ML")) return { type: "moneyline", team: pickStr.replace(" ML", "").trim() };
  if (pickStr.toLowerCase() === "draw") return { type: "draw" };
  const ouMatch = pickStr.match(/^(Over|Under)\s+([\d.]+)$/i);
  if (ouMatch) return { type: "total", side: ouMatch[1].toLowerCase(), line: parseFloat(ouMatch[2]) };
  const spreadMatch = pickStr.match(/^(.+?)\s+([+-][\d.]+)$/);
  if (spreadMatch) return { type: "spread", team: spreadMatch[1].trim(), line: parseFloat(spreadMatch[2]) };
  return { type: "moneyline", team: pickStr };
}

// ─── Determine result ───
function determineResult(pick, score) {
  if (!score.completed || !score.scores || score.scores.length < 2) return null;
  const parsed = parsePick(pick.pick);
  const homeScore = score.scores.find((s) => s.name === score.home_team);
  const awayScore = score.scores.find((s) => s.name === score.away_team);
  if (!homeScore || !awayScore) return null;
  const homePoints = parseFloat(homeScore.score);
  const awayPoints = parseFloat(awayScore.score);
  if (isNaN(homePoints) || isNaN(awayPoints)) return null;

  const matchTeam = (team, candidate) =>
    candidate.toLowerCase().includes(team.toLowerCase()) ||
    team.toLowerCase().includes(candidate.toLowerCase());

  switch (parsed.type) {
    case "moneyline": {
      if (matchTeam(parsed.team, score.home_team)) {
        return homePoints > awayPoints ? "won" : homePoints < awayPoints ? "lost" : "push";
      }
      if (matchTeam(parsed.team, score.away_team)) {
        return awayPoints > homePoints ? "won" : awayPoints < homePoints ? "lost" : "push";
      }
      return null;
    }
    case "draw": return homePoints === awayPoints ? "won" : "lost";
    case "spread": {
      let teamScore, oppScore;
      if (matchTeam(parsed.team, score.home_team)) { teamScore = homePoints; oppScore = awayPoints; }
      else if (matchTeam(parsed.team, score.away_team)) { teamScore = awayPoints; oppScore = homePoints; }
      else return null;
      const adjusted = teamScore + parsed.line;
      return adjusted > oppScore ? "won" : adjusted < oppScore ? "lost" : "push";
    }
    case "total": {
      const total = homePoints + awayPoints;
      if (parsed.side === "over") return total > parsed.line ? "won" : total < parsed.line ? "lost" : "push";
      return total < parsed.line ? "won" : total > parsed.line ? "lost" : "push";
    }
    default: return null;
  }
}

// ─── Get all-time record ───
export async function getRecord(supabaseClient) {
  const { data: allPicks } = await supabaseClient
    .from("picks")
    .select("result, profit, sport, game, pick, odds, game_time, sent_at")
    .not("result", "in", "(pending,void)")
    .order("sent_at", { ascending: false });

  if (!allPicks || allPicks.length === 0) {
    return { wins: 0, losses: 0, pushes: 0, total: 0, winRate: 0, profit: 0, roi: 0, streak: "", streakCount: 0, streakType: "none", recentWins: [] };
  }

  const wins = allPicks.filter((p) => p.result === "won").length;
  const losses = allPicks.filter((p) => p.result === "lost").length;
  const pushes = allPicks.filter((p) => p.result === "push").length;
  const total = wins + losses + pushes;
  const winRate = (wins + losses) > 0 ? +((wins / (wins + losses)) * 100).toFixed(1) : 0;
  const totalProfit = allPicks.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0);
  const totalWagered = (wins + losses) * 100;
  const roi = totalWagered > 0 ? +((totalProfit / totalWagered) * 100).toFixed(1) : 0;

  let streak = "";
  let streakCount = 0;
  let streakType = "none";
  const sorted = allPicks.filter((p) => p.result === "won" || p.result === "lost");
  if (sorted.length > 0) {
    const firstResult = sorted[0].result;
    streakCount = 1;
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].result === firstResult) streakCount++;
      else break;
    }
    streakType = firstResult === "won" ? "win" : "loss";
    streak = `${streakCount}${firstResult === "won" ? "W" : "L"}`;
  }

  const recentWins = allPicks.filter((p) => p.result === "won").slice(0, 5);

  // Per-sport records
  const bySport = {};
  for (const p of allPicks) {
    if (!bySport[p.sport]) bySport[p.sport] = { wins: 0, losses: 0 };
    if (p.result === "won") bySport[p.sport].wins++;
    if (p.result === "lost") bySport[p.sport].losses++;
  }

  return { wins, losses, pushes, total, winRate, profit: totalProfit, roi, streak, streakCount, streakType, recentWins, bySport };
}

// ─── Get weekly record ───
export async function getWeeklyRecord(supabaseClient) {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekPicks } = await supabaseClient
    .from("picks").select("result, profit, sport")
    .not("result", "in", "(pending,void)").gte("sent_at", weekAgo.toISOString());

  if (!weekPicks || weekPicks.length === 0) {
    return { wins: 0, losses: 0, pushes: 0, winRate: 0, profit: 0, bySport: {} };
  }

  const wins = weekPicks.filter((p) => p.result === "won").length;
  const losses = weekPicks.filter((p) => p.result === "lost").length;
  const pushes = weekPicks.filter((p) => p.result === "push").length;
  const winRate = (wins + losses) > 0 ? +((wins / (wins + losses)) * 100).toFixed(1) : 0;
  const profit = weekPicks.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0);

  const bySport = {};
  for (const p of weekPicks) {
    if (!bySport[p.sport]) bySport[p.sport] = { wins: 0, losses: 0 };
    if (p.result === "won") bySport[p.sport].wins++;
    if (p.result === "lost") bySport[p.sport].losses++;
  }

  return { wins, losses, pushes, winRate, profit, bySport };
}

// ─── Get today's record ───
export async function getTodayRecord(supabaseClient) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data: todayPicks } = await supabaseClient
    .from("picks").select("result, profit, sport, game, pick, odds")
    .gte("sent_at", today.toISOString()).order("sent_at", { ascending: true });

  if (!todayPicks || todayPicks.length === 0) {
    return { picks: [], wins: 0, losses: 0, pushes: 0, pending: 0, profit: 0 };
  }

  const wins = todayPicks.filter((p) => p.result === "won").length;
  const losses = todayPicks.filter((p) => p.result === "lost").length;
  const pushes = todayPicks.filter((p) => p.result === "push").length;
  const pending = todayPicks.filter((p) => p.result === "pending").length;
  const profit = todayPicks.reduce((sum, p) => sum + (parseFloat(p.profit) || 0), 0);

  return { picks: todayPicks, wins, losses, pushes, pending, profit };
}

// ═══════════════════════════════════════════
// "NEVER SHOW BAD STATS" RULES
// ═══════════════════════════════════════════

// Should we post the daily record?
export function shouldPostDailyRecord(today) {
  // Only post if more wins than losses
  return today.wins > today.losses;
}

// Should we post the weekly recap?
export function shouldPostWeeklyRecap(weekly) {
  return weekly.wins > weekly.losses;
}

// Format win rate — only show % if 65%+, otherwise show total wins only
export function formatWinDisplay(record) {
  if (record.winRate >= 65) {
    return `${record.wins}W-${record.losses}L (${record.winRate}%)`;
  }
  return `✅ ${record.wins} wins`;
}

// Format streak — only show if it's a win streak of 3+
export function formatStreak(record) {
  if (record.streakType === "win" && record.streakCount >= 3) {
    return `🔥 Current Streak: ${record.streakCount}W`;
  }
  return null; // don't show
}

// Format ROI — only show if positive
export function formatRoi(record) {
  if (record.roi > 0) return `ROI: +${record.roi}%`;
  return null; // don't show
}

// Get winning sports only (65%+ win rate)
export function getWinningSports(bySport) {
  const winning = {};
  for (const [sport, r] of Object.entries(bySport)) {
    const total = r.wins + r.losses;
    if (total > 0) {
      const rate = (r.wins / total) * 100;
      if (rate >= 65) winning[sport] = { ...r, winRate: rate.toFixed(1) };
    }
  }
  return winning;
}

// ─── Format daily record (with "never show bad stats" rules) ───
export function formatDailyRecord(today, weekly, allTime) {
  const date = new Date().toLocaleDateString("en-US", {
    timeZone: "America/New_York",
    month: "long",
    day: "numeric",
  });

  const todayIcons = today.picks
    .filter((p) => p.result !== "pending")
    .map((p) => p.result === "won" ? "✅" : p.result === "lost" ? "❌" : "➖")
    .join("");

  const todayRecord = `${today.wins}W-${today.losses}L${today.pushes > 0 ? `-${today.pushes}P` : ""}`;

  let msg =
    `📊 DAILY RECORD — ${date}\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Today: ${todayIcons} (${todayRecord})\n`;

  // Weekly — only show if winning
  if (weekly.wins > weekly.losses) {
    if (weekly.winRate >= 65) {
      msg += `This Week: ${weekly.wins}W-${weekly.losses}L (${weekly.winRate}%)\n`;
    } else {
      msg += `This Week: ✅ ${weekly.wins} wins\n`;
    }
  }

  // All time
  msg += `All Time: ${formatWinDisplay(allTime)}\n`;

  // ROI — only if positive
  const roiStr = formatRoi(allTime);
  if (roiStr) msg += `${roiStr}\n`;

  // Streak — only win streaks 3+
  const streakStr = formatStreak(allTime);
  if (streakStr) msg += `${streakStr}\n`;

  msg +=
    `━━━━━━━━━━━━━━━━━━\n` +
    `📈 VIP gets ALL picks daily\n` +
    `🦈 Sharkline — sharkline.ai`;

  return msg;
}

// ─── Main: update results for pending picks ───
export async function updateResults() {
  console.log("\n📊 Updating pick results...\n");

  const { data: pendingPicks, error } = await supabase
    .from("picks").select("*").eq("result", "pending");

  if (error) {
    console.log(`   Error fetching pending picks: ${error.message}`);
    return { updated: 0 };
  }
  if (!pendingPicks || pendingPicks.length === 0) {
    console.log("   No pending picks to check");
    return { updated: 0 };
  }

  console.log(`   Found ${pendingPicks.length} pending picks`);

  // Fetch scores from ESPN free API (no quota, unlimited) + web search fallback
  const pendingSportKeys = [...new Set(pendingPicks.map(p => p.sport_key).filter(Boolean))];
  console.log(`   Fetching scores for ${pendingSportKeys.length} sports: ${pendingSportKeys.join(", ")}`);
  const scores = await fetchLiveScores(pendingSportKeys);
  console.log(`   Fetched ${scores.length} game scores from ESPN`);

  const scoreMap = new Map();
  for (const s of scores) {
    scoreMap.set(s.id, s);
    scoreMap.set(`${s.home_team} vs ${s.away_team}`.toLowerCase(), s);
  }

  let updated = 0;
  const settled = []; // track settled picks for bankroll + winner messages
  const unmatchedPicks = []; // picks not found via ESPN — will try web search

  for (const pick of pendingPicks) {
    let score = null;

    // Priority 1: Direct match by Odds API event_id (most reliable)
    if (pick.event_id) {
      score = scoreMap.get(pick.event_id);
    }

    // Priority 2: Exact game string match
    if (!score) {
      const gameKey = pick.game?.toLowerCase();
      if (gameKey) score = scoreMap.get(gameKey);
    }

    if (!score) {
      for (const s of scores) {
        const teams = pick.game?.split(" vs ").map((t) => t.trim().toLowerCase()) || [];
        if (teams.length === 2) {
          const sHome = s.home_team.toLowerCase();
          const sAway = s.away_team.toLowerCase();
          const fuzzy = (a, b) => a.includes(b) || b.includes(a) || a.split(" ").some(w => w.length > 3 && b.includes(w));
          // Try both orderings (pick might have teams reversed)
          const match1 = fuzzy(teams[0], sHome) && fuzzy(teams[1], sAway);
          const match2 = fuzzy(teams[0], sAway) && fuzzy(teams[1], sHome);
          if (match1 || match2) { score = s; break; }
        }
      }
    }

    // Last resort: match by sport_key + game_time proximity (within 2 hours)
    if (!score && pick.sport_key && pick.game_time) {
      const pickTime = new Date(pick.game_time).getTime();
      for (const s of scores) {
        if (s.sport_key !== pick.sport_key) continue;
        const scoreTime = new Date(s.commence_time).getTime();
        if (Math.abs(pickTime - scoreTime) < 2 * 60 * 60 * 1000) {
          // Close enough in time + same sport — check if at least one team name partially matches
          const gameStr = (pick.game || "").toLowerCase();
          if (gameStr.includes(s.home_team.toLowerCase().split(" ").pop()) ||
              gameStr.includes(s.away_team.toLowerCase().split(" ").pop())) {
            score = s;
            break;
          }
        }
      }
    }

    if (!score) { unmatchedPicks.push(pick); console.log(`   ⏳ ${pick.sport} ${pick.game} — no ESPN score, will try web search`); continue; }
    if (!score.completed) { console.log(`   ⏳ ${pick.sport} ${pick.game} — game still in progress`); continue; }

    const result = determineResult(pick, score);
    if (!result) { console.log(`   ❓ ${pick.sport} ${pick.game} — couldn't determine result`); continue; }

    const stake = parseFloat(pick.stake) || 1;
    let profit = 0;
    if (result === "won") profit = calculateProfit(pick.odds, stake * 100);
    else if (result === "lost") profit = -(stake * 100);

    const actualResult = score.scores
      ? score.scores.map((s) => `${s.name}: ${s.score}`).join(", ")
      : null;

    const { error: updateErr } = await supabase.from("picks").update({
      result,
      profit,
      status: result,
      actual_result: actualResult,
      settled_at: new Date().toISOString(),
    }).eq("id", pick.id);

    if (updateErr) {
      console.log(`   Error updating ${pick.game}: ${updateErr.message}`);
    } else {
      const icon = result === "won" ? "✅" : result === "lost" ? "❌" : "➖";
      console.log(`   ${icon} ${pick.sport} ${pick.game}: ${result} (${profit >= 0 ? "+" : ""}$${profit.toFixed(2)})`);
      updated++;
      settled.push({ ...pick, result, profit, stake });
    }
  }

  // ─── Web search fallback for picks not found via ESPN ───
  if (unmatchedPicks.length > 0) {
    // Only try web search for games whose game_time has passed (they should be finished)
    const overduePicks = unmatchedPicks.filter((p) => {
      if (!p.game_time) return true;
      const gameTime = new Date(p.game_time).getTime();
      const hoursSince = (Date.now() - gameTime) / (1000 * 60 * 60);
      return hoursSince > 3; // game started 3+ hours ago, should be done
    });

    if (overduePicks.length > 0) {
      try {
        const webScores = await searchScoresOnWeb(overduePicks);
        for (const ws of webScores) {
          const pick = overduePicks.find((p) => {
            if (ws.pick_id === p.id) return true;
            const teams = p.game?.split(" vs ").map((t) => t.trim().toLowerCase()) || [];
            const wsHome = ws.home_team?.toLowerCase() || "";
            const wsAway = ws.away_team?.toLowerCase() || "";
            return teams.some((t) => wsHome.includes(t) || t.includes(wsHome)) &&
                   teams.some((t) => wsAway.includes(t) || t.includes(wsAway));
          });
          if (!pick || !ws.completed || !ws.scores) continue;

          // Build a score object compatible with determineResult
          const fakeScore = {
            completed: true,
            home_team: ws.home_team,
            away_team: ws.away_team,
            scores: ws.scores,
          };

          const result = determineResult(pick, fakeScore);
          if (!result) continue;

          const stake = parseFloat(pick.stake) || 1;
          let profit = 0;
          if (result === "won") profit = calculateProfit(pick.odds, stake * 100);
          else if (result === "lost") profit = -(stake * 100);

          const actualResult = ws.scores.map((s) => `${s.name}: ${s.score}`).join(", ");

          const { error: updateErr } = await supabase.from("picks").update({
            result, profit, status: result, actual_result: actualResult,
            settled_at: new Date().toISOString(),
          }).eq("id", pick.id);

          if (!updateErr) {
            const icon = result === "won" ? "✅" : result === "lost" ? "❌" : "➖";
            console.log(`   ${icon} [WEB] ${pick.sport} ${pick.game}: ${result} (${profit >= 0 ? "+" : ""}$${profit.toFixed(2)})`);
            updated++;
            settled.push({ ...pick, result, profit, stake });
          }
        }
      } catch (err) {
        console.log(`   ⚠️ Web search fallback error: ${err.message}`);
      }
    }
  }

  // ─── Bankroll log entries ───
  for (const pick of settled) {
    const stake = pick.stake || 1;
    if (pick.result === "won") {
      const decOdds = americanToDecimal(pick.odds);
      const payout = +(stake * decOdds).toFixed(2);
      const { data: lastEntry } = await supabase.from("bankroll_log")
        .select("balance").eq("voided", false).order("created_at", { ascending: false }).limit(1).single();
      const curBalance = lastEntry?.balance ?? 100;
      await supabase.from("bankroll_log").insert({
        pick_id: pick.id, action: "win", units: payout, balance: +(curBalance + payout).toFixed(2),
      });
    } else if (pick.result === "lost") {
      const { data: lastEntry } = await supabase.from("bankroll_log")
        .select("balance").eq("voided", false).order("created_at", { ascending: false }).limit(1).single();
      const curBalance = lastEntry?.balance ?? 100;
      await supabase.from("bankroll_log").insert({
        pick_id: pick.id, action: "loss", units: 0, balance: curBalance,
      });
    } else if (pick.result === "push") {
      const { data: lastEntry } = await supabase.from("bankroll_log")
        .select("balance").eq("voided", false).order("created_at", { ascending: false }).limit(1).single();
      const curBalance = lastEntry?.balance ?? 100;
      await supabase.from("bankroll_log").insert({
        pick_id: pick.id, action: "push", units: pick.stake, balance: +(curBalance + pick.stake).toFixed(2),
      });
    }
  }

  // ─── Update tipster_stats ───
  await updateTipsterStats(settled);

  // ─── Post result notifications to Telegram ───
  for (const pick of settled) {
    const sportEmoji = getSportEmoji(pick.sport_key) || "🔥";
    const icon = pick.result === "won" ? "✅" : pick.result === "lost" ? "❌" : "➖";
    const label = pick.result === "won" ? "WINNER" : pick.result === "lost" ? "LOSS" : "PUSH";

    // VIP gets ALL results immediately
    if (VIP_CHANNEL_ID) {
      try {
        const vipMsg =
          `${icon} <b>${label}</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${sportEmoji} ${pick.sport}\n` +
          `${pick.game}\n` +
          `<b>${pick.pick}</b> at ${pick.odds} ${icon}\n` +
          (pick.actual_result ? `Result: ${pick.actual_result}\n` : "") +
          (pick.category ? `Tier: ${pick.category}\n` : "") +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🦈 Sharkline — sharkline.ai`;
        await sendTelegramMessage(vipMsg, TELEGRAM_BOT_TOKEN, VIP_CHANNEL_ID, "HTML");
        console.log(`   📤 VIP result: ${label} ${pick.sport} ${pick.game}`);
      } catch (err) {
        console.log(`   VIP result post failed: ${err.message}`);
      }
    }

    // Free channel only gets WINNERS
    if (pick.result === "won") {
      try {
        const freeMsg =
          `✅ <b>WINNER</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${sportEmoji} ${pick.sport}\n` +
          `${pick.game}\n` +
          `<b>${pick.pick}</b> at ${pick.odds} ✅\n` +
          (pick.category ? `Tier: ${pick.category}\n` : "") +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `🦈 Sharkline — sharkline.ai`;
        await sendTelegramMessage(freeMsg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID, "HTML");
        console.log(`   📤 FREE winner posted: ${pick.sport} ${pick.game}`);
      } catch (err) {
        console.log(`   Free winner post failed: ${err.message}`);
      }
    }
  }

  // Update daily_records + bankroll tables
  const todayStr = new Date().toISOString().split("T")[0];
  const today = await getTodayRecord(supabase);
  const allTime = await getRecord(supabase);

  await supabase.from("daily_records").upsert({
    date: todayStr,
    wins: today.wins,
    losses: today.losses,
    pushes: today.pushes,
    profit: today.profit,
    streak: allTime.streak,
  }, { onConflict: "date" });

  await supabase.from("bankroll").upsert({
    date: todayStr,
    day_profit: today.profit,
    picks_won: today.wins,
    picks_lost: today.losses,
    picks_pushed: today.pushes,
    streak_type: allTime.streakType,
    streak_count: allTime.streakCount,
  }, { onConflict: "date" });

  console.log(`   Updated ${updated}/${pendingPicks.length} picks`);

  // Log success to agent_logs
  try {
    await supabase.from("agent_logs").insert({
      agent_name: "result-tracker",
      action: "update_results",
      result: JSON.stringify({
        pending: pendingPicks.length,
        settled: updated,
        wins: settled.filter(p => p.result === "won").length,
        losses: settled.filter(p => p.result === "lost").length,
        pushes: settled.filter(p => p.result === "push").length,
        unmatched: pendingPicks.length - updated,
      }),
      revenue_generated: 0,
    });
  } catch { /* non-critical */ }

  return { updated };
}

// ─── Update tipster_stats table ───
async function updateTipsterStats(settledPicks) {
  // Aggregate by sport and tier
  const groups = {};
  for (const pick of settledPicks) {
    const sportKey = pick.sport_key || pick.sport || "unknown";
    const tier = pick.category || pick.tier || "VALUE";

    // By sport
    if (!groups[sportKey]) groups[sportKey] = { wins: 0, losses: 0, pushes: 0 };
    if (pick.result === "won") groups[sportKey].wins++;
    if (pick.result === "lost") groups[sportKey].losses++;
    if (pick.result === "push") groups[sportKey].pushes++;

    // By tier
    const tierKey = `tier:${tier}`;
    if (!groups[tierKey]) groups[tierKey] = { wins: 0, losses: 0, pushes: 0 };
    if (pick.result === "won") groups[tierKey].wins++;
    if (pick.result === "lost") groups[tierKey].losses++;
    if (pick.result === "push") groups[tierKey].pushes++;
  }

  for (const [key, counts] of Object.entries(groups)) {
    const isTier = key.startsWith("tier:");
    const sport = isTier ? null : key;
    const tier = isTier ? key.replace("tier:", "") : null;

    // Get current stats
    let query = supabase.from("tipster_stats").select("*");
    if (sport) query = query.eq("sport", sport).is("tier", null);
    else if (tier) query = query.eq("tier", tier).is("sport", null);

    const { data: existing } = await query.limit(1).single();

    if (existing) {
      const newWins = existing.wins + counts.wins;
      const newLosses = existing.losses + counts.losses;
      const newPushes = existing.pushes + counts.pushes;
      const newTotal = newWins + newLosses + newPushes;
      const newWinRate = (newWins + newLosses) > 0 ? +((newWins / (newWins + newLosses)) * 100).toFixed(1) : 0;

      await supabase.from("tipster_stats").update({
        total_picks: newTotal,
        wins: newWins,
        losses: newLosses,
        pushes: newPushes,
        win_rate: newWinRate,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      const total = counts.wins + counts.losses + counts.pushes;
      const winRate = (counts.wins + counts.losses) > 0 ? +((counts.wins / (counts.wins + counts.losses)) * 100).toFixed(1) : 0;

      await supabase.from("tipster_stats").insert({
        sport,
        tier,
        total_picks: total,
        wins: counts.wins,
        losses: counts.losses,
        pushes: counts.pushes,
        win_rate: winRate,
      });
    }
  }
}

function americanToDecimal(odds) {
  const num = parseInt(odds, 10);
  if (isNaN(num)) return 2.0;
  if (num > 0) return +(1 + num / 100).toFixed(4);
  return +(1 + 100 / Math.abs(num)).toFixed(4);
}

// ─── Post daily record (free: only if winning, VIP: always with per-sport breakdown) ───
export async function postDailyRecord() {
  console.log("\n📊 Checking daily record...\n");

  const today = await getTodayRecord(supabase);
  const weekly = await getWeeklyRecord(supabase);
  const allTime = await getRecord(supabase);

  // VIP always gets the per-sport summary
  if (VIP_CHANNEL_ID) {
    // Build per-sport results from today's picks
    const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0);
    const { data: todayPicks } = await supabase.from("picks")
      .select("sport_key, result, profit")
      .gte("sent_at", todayDate.toISOString())
      .not("result", "in", "(pending,void)");

    if (todayPicks && todayPicks.length > 0) {
      const resultsBySport = {};
      let totalProfit = 0;
      for (const p of todayPicks) {
        const key = p.sport_key || p.sport;
        if (!resultsBySport[key]) resultsBySport[key] = { wins: 0, losses: 0, pushes: 0 };
        if (p.result === "won") resultsBySport[key].wins++;
        if (p.result === "lost") resultsBySport[key].losses++;
        if (p.result === "push") resultsBySport[key].pushes++;
        totalProfit += parseFloat(p.profit) || 0;
      }

      const vipSummary = formatVipDailySummary(resultsBySport, totalProfit);
      try {
        const vipMsgId = await sendTelegramMessage(vipSummary, TELEGRAM_BOT_TOKEN, VIP_CHANNEL_ID);
        console.log(`   📤 VIP daily summary → msg:${vipMsgId}`);
      } catch (err) {
        console.log(`   VIP summary send failed: ${err.message}`);
      }
    }
  }

  // Free channel: only post if winning day
  if (!shouldPostDailyRecord(today)) {
    console.log(`   Skipping free channel record — today was ${today.wins}W-${today.losses}L`);
    return { skipped: true, reason: "more losses than wins" };
  }

  const msg = formatDailyRecord(today, weekly, allTime);
  console.log(msg);

  const msgId = await sendTelegramMessage(msg, TELEGRAM_BOT_TOKEN, TELEGRAM_CHANNEL_ID);
  console.log(`\n   📤 Posted daily record → msg:${msgId}`);
  return { msgId };
}

// ─── CLI entry point ───
async function main() {
  const cmd = process.argv[2] || "update";
  try {
    if (cmd === "update") await updateResults();
    else if (cmd === "record") await postDailyRecord();
    else if (cmd === "both") { await updateResults(); await postDailyRecord(); }
    else console.log("Usage: node update-results.mjs [update|record|both]");
  } catch (err) {
    console.error(`💥 Result tracker FATAL: ${err.message}`);
    console.error(err.stack);
    // Log failure to agent_logs so we never have silent failures
    try {
      await supabase.from("agent_logs").insert({
        agent_name: "result-tracker",
        action: cmd,
        result: JSON.stringify({ error: err.message, stack: err.stack }),
        revenue_generated: 0,
      });
    } catch { /* ignore logging failure */ }
    throw err;
  }
}

const isDirectRun = process.argv[1]?.endsWith("update-results.mjs");
if (isDirectRun) main().catch(console.error);
