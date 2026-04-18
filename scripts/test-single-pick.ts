// One-shot manual test — fetch 1 real game, analyze, score, send to both channels, log to Supabase
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

import { fetchUpcomingGames } from "../lib/tipster/tipster-agent";
import { generateAnalysisCard, type AnalysisCard } from "../lib/tipster/analysis-card";
import { loadWeights, type ScoringWeights } from "../lib/tipster/scoring-engine";
import { hashPick, timestampOnChain, getPolygonScanUrl } from "../lib/tipster/blockchain";
import { recordBet } from "../lib/tipster/bankroll";
import { getTier, formatTierBadge, getTierStakeStars } from "../lib/tipster/tiers";

const ODDS_API_KEY = process.env.ODDS_API_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const FREE_CHANNEL = process.env.TELEGRAM_CHANNEL_ID!;
const VIP_CHANNEL = process.env.TELEGRAM_VIP_CHANNEL_ID || process.env.VIP_CHANNEL_ID!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const HAS_WALLET = !!process.env.POLYGON_WALLET_PRIVATE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Sport keys to search — soccer + basketball
const SEARCH_KEYS = [
  "soccer_epl", "soccer_spain_la_liga", "soccer_italy_serie_a",
  "soccer_germany_bundesliga", "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
  "basketball_nba", "basketball_euroleague",
];

async function sendTelegram(html: string, chatId: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram error: ${data.description}`);
  return String(data.result.message_id);
}

function buildFreeHtml(card: AnalysisCard): string {
  const sportEmoji: Record<string, string> = {
    basketball_nba: "🏀", basketball_euroleague: "🏀",
    soccer_epl: "⚽", soccer_spain_la_liga: "⚽", soccer_uefa_champs_league: "⚽",
    soccer_italy_serie_a: "⚽", soccer_germany_bundesliga: "⚽",
    soccer_france_ligue_one: "⚽", soccer_usa_mls: "⚽",
  };
  const emoji = sportEmoji[card.sport_key] ?? "🏅";
  let html = `${emoji} ${card.sport} | ${card.league}\n`;
  html += `${card.game}\n`;
  html += `Pick: <b>${card.pick}</b> @ ${card.odds}\n\n`;
  html += `🔐 Full analysis + blockchain proof → VIP only\n`;
  html += `Join VIP: sharkline.ai`;
  return html;
}

async function main() {
  console.log("═".repeat(50));
  console.log("SHARKLINE — Manual Test Pick");
  console.log("═".repeat(50));
  console.log(`Time: ${new Date().toLocaleString("en-US", { timeZone: "America/New_York" })} EST`);
  console.log(`Free Channel: ${FREE_CHANNEL}`);
  console.log(`VIP Channel: ${VIP_CHANNEL}`);
  console.log(`Blockchain: ${HAS_WALLET ? "ENABLED" : "SKIPPED (no wallet key)"}`);
  console.log();

  // Step 1: Fetch games
  console.log("━━━ Step 1: Fetching upcoming games (next 24h) ━━━");
  const games = await fetchUpcomingGames(ODDS_API_KEY, SEARCH_KEYS, 24);
  console.log(`Found ${games.length} upcoming games`);

  if (games.length === 0) {
    console.log("\nNo upcoming games found. Try expanding the time window or checking active leagues.");
    process.exit(0);
  }

  // Show first few games
  for (const g of games.slice(0, 5)) {
    const t = new Date(g.commence_time).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
    console.log(`  ${g.sport_key}: ${g.home_team} vs ${g.away_team} — ${t}`);
  }
  if (games.length > 5) console.log(`  ... and ${games.length - 5} more`);
  console.log();

  // Step 2: Pick first game, load weights, generate analysis
  const game = games[0];
  console.log("━━━ Step 2: Analyzing first game with Claude ━━━");
  console.log(`Game: ${game.home_team} vs ${game.away_team}`);
  console.log(`Sport: ${game.sport_key}`);
  console.log(`Kickoff: ${new Date(game.commence_time).toLocaleString("en-US", { timeZone: "America/New_York" })} EST`);
  console.log(`Bookmakers: ${game.bookmakers?.map(b => b.title).join(", ") || "none"}`);
  console.log();

  const weights = await loadWeights(supabase, game.sport_key);
  console.log(`Loaded weights for ${game.sport_key}:`, JSON.stringify(weights));
  console.log("Calling Claude for analysis...");

  const card = await generateAnalysisCard(game, ANTHROPIC_API_KEY, weights);

  if (!card || !card.game_id) {
    if (card && !card.game_id) console.log("\n❌ REJECTED: card has no Odds API event_id");
    else console.log("\n❌ Game did not qualify (confidence < 62). Trying next game...");

    // Try remaining games until one qualifies
    for (let i = 1; i < Math.min(games.length, 10); i++) {
      const nextGame = games[i];
      console.log(`\nTrying game ${i + 1}: ${nextGame.home_team} vs ${nextGame.away_team}`);
      const nextWeights = await loadWeights(supabase, nextGame.sport_key);
      const nextCard = await generateAnalysisCard(nextGame, ANTHROPIC_API_KEY, nextWeights);
      if (nextCard && nextCard.game_id) {
        return await processCard(nextCard);
      }
      if (nextCard && !nextCard.game_id) console.log(`  ❌ REJECTED: no event_id`);
      else console.log(`  ❌ Did not qualify`);
    }

    console.log("\n❌ No games qualified after trying 10 games. All below confidence threshold.");
    process.exit(0);
  }

  await processCard(card);
}

async function processCard(card: AnalysisCard) {
  // Step 3: Show scoring breakdown
  console.log("\n━━━ Step 3: Scoring Engine Results ━━━");
  console.log(`Confidence: ${card.confidence}/100`);
  console.log(`Tier: ${formatTierBadge(card.tier)}`);
  console.log(`Stake: ${card.stake}u (${getTierStakeStars(card.tier)})`);
  console.log();

  console.log("Factor Breakdown:");
  const factors = card.scoring.factors;
  const weights = card.scoring.weights;
  const breakdown = card.scoring.breakdown;
  for (const [key, score] of Object.entries(factors)) {
    const w = (weights as unknown as Record<string, number>)[key] ?? 0;
    const contrib = (breakdown as unknown as Record<string, number>)[key] ?? 0;
    const bar = score >= 75 ? "🟢" : score >= 50 ? "🟡" : "🔴";
    console.log(`  ${bar} ${key}: ${score}/100 × ${(w * 100).toFixed(0)}% = ${contrib.toFixed(1)} pts`);
  }
  console.log();

  console.log("Pick:", card.pick);
  console.log("Odds:", card.odds, `(${card.bookmaker})`);
  console.log("Analysis:", card.analysis);
  console.log();

  // Step 4: Blockchain (skip if no wallet)
  let chainData = {
    pick_hash: "",
    tx_hash: null as string | null,
    block_number: null as number | null,
    block_timestamp: null as string | null,
    verified: false,
  };

  if (HAS_WALLET) {
    console.log("━━━ Step 4: Blockchain Timestamping ━━━");
    try {
      const pickHash = hashPick({
        sport: card.sport,
        league: card.league,
        game: card.game,
        pick: card.pick,
        odds: card.odds,
        confidence: card.confidence,
        tier: card.tier.name,
        timestamp: new Date().toISOString(),
      });
      chainData.pick_hash = pickHash;
      console.log(`Pick hash: ${pickHash}`);

      const result = await timestampOnChain(pickHash);
      chainData.tx_hash = result.txHash;
      chainData.block_number = result.blockNumber;
      chainData.block_timestamp = new Date(result.timestamp * 1000).toISOString();
      chainData.verified = true;

      const url = getPolygonScanUrl(result.txHash);
      console.log(`✅ On-chain: ${url}`);
      console.log(`Block: ${result.blockNumber}, Timestamp: ${chainData.block_timestamp}`);
    } catch (err) {
      console.log(`⚠️ Blockchain failed (continuing): ${(err as Error).message}`);
    }
  } else {
    console.log("━━━ Step 4: Blockchain — SKIPPED (no POLYGON_WALLET_PRIVATE_KEY) ━━━");
    const pickHash = hashPick({
      sport: card.sport,
      league: card.league,
      game: card.game,
      pick: card.pick,
      odds: card.odds,
      confidence: card.confidence,
      tier: card.tier.name,
      timestamp: new Date().toISOString(),
    });
    chainData.pick_hash = pickHash;
    console.log(`Pick hash (not timestamped): ${pickHash}`);
  }
  console.log();

  // Step 5: Send to VIP channel (full analysis)
  console.log("━━━ Step 5: Sending to Telegram ━━━");

  let vipMsgId = "";
  try {
    vipMsgId = await sendTelegram(card.telegram_html, VIP_CHANNEL);
    console.log(`✅ VIP channel → msg:${vipMsgId}`);
  } catch (err) {
    console.log(`❌ VIP send failed: ${(err as Error).message}`);
  }

  // Send stripped pick to free channel
  let freeMsgId = "";
  try {
    const freeHtml = buildFreeHtml(card);
    freeMsgId = await sendTelegram(freeHtml, FREE_CHANNEL);
    console.log(`✅ FREE channel → msg:${freeMsgId}`);
  } catch (err) {
    console.log(`❌ FREE send failed: ${(err as Error).message}`);
  }
  console.log();

  // Step 6: Log to Supabase
  console.log("━━━ Step 6: Logging to Supabase ━━━");

  try {
    const { data: row, error } = await supabase.from("picks").insert({
      sport: card.sport,
      sport_key: card.sport_key,
      league: card.league,
      game: card.game,
      pick: card.pick,
      odds: card.odds,
      bookmaker: card.bookmaker,
      confidence: card.confidence,
      tier: card.tier.name,
      stake: card.stake,
      scoring_factors: card.scoring.factors,
      scoring_weights: card.scoring.weights,
      scoring_score: card.confidence,
      category: card.tier.name,
      reasoning: card.analysis,
      telegram_message_id: vipMsgId || null,
      channel: "vip",
      status: "pending",
      sent_at: new Date().toISOString(),
      game_time: card.game_time,
      event_id: card.game_id || null,
      pick_hash: chainData.pick_hash || null,
      tx_hash: chainData.tx_hash,
      block_number: chainData.block_number,
      block_timestamp: chainData.block_timestamp,
      verified: chainData.verified,
    }).select("id").single();

    if (error) {
      console.log(`❌ Supabase insert error: ${error.message}`);
    } else {
      console.log(`✅ Pick logged → id: ${row?.id}`);

      // Record bet in bankroll
      if (row?.id) {
        const newBalance = await recordBet(supabase, row.id, card.stake);
        console.log(`✅ Bankroll updated → balance: ${newBalance}u (-${card.stake}u stake)`);
      }
    }
  } catch (err) {
    console.log(`❌ Supabase error: ${(err as Error).message}`);
  }

  // Log to agent_logs
  try {
    await supabase.from("agent_logs").insert({
      agent_name: "sharp-picks",
      action: "manual_test_pick",
      result: JSON.stringify({
        game: card.game,
        pick: card.pick,
        odds: card.odds,
        confidence: card.confidence,
        tier: card.tier.name,
        blockchain: chainData.verified,
        vip_sent: !!vipMsgId,
        free_sent: !!freeMsgId,
      }),
      revenue_generated: 0,
    });
    console.log("✅ Agent log recorded");
  } catch {
    console.log("⚠️ Agent log failed (non-critical)");
  }

  console.log();
  console.log("═".repeat(50));
  console.log("TEST COMPLETE");
  console.log("═".repeat(50));
  console.log(`Game: ${card.game}`);
  console.log(`Pick: ${card.pick} @ ${card.odds}`);
  console.log(`Tier: ${card.tier.emoji} ${card.tier.name} (${card.stake}u)`);
  console.log(`Confidence: ${card.confidence}/100`);
  console.log(`VIP msg: ${vipMsgId || "FAILED"}`);
  console.log(`Free msg: ${freeMsgId || "FAILED"}`);
  console.log(`Blockchain: ${chainData.verified ? chainData.tx_hash : "skipped"}`);
  console.log(`Supabase: logged`);
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("\n💥 FATAL:", err.message);
  console.error(err.stack);
  process.exit(1);
});
