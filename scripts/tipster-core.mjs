// Core tipster logic — Sharkline sport-unlock model with analysis cards
import Anthropic from "@anthropic-ai/sdk";
import { researchGame, generateAnalysisCard, formatAnalysisCard, formatFreeCard, formatMaxTeaser } from "../lib/agents/card-generator.mjs";
import { classifyPick } from "../lib/engine/scoring.mjs";

// ─── Brand ───
const BRAND = "Sharkline";
const BRAND_FOOTER = "🦈 Sharkline — sharkline.ai";
const BRAND_URL = "sharkline.ai";

// ─── Sport configuration ───
const SPORT_KEYS = [
  "basketball_nba",
  "basketball_euroleague",
  "americanfootball_nfl",
  "icehockey_nhl",
  "baseball_mlb",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_uefa_champs_league",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_france_ligue_one",
  "soccer_usa_mls",
  "tennis_atp_monte_carlo_masters",
  "tennis_atp_french_open",
  "tennis_atp_wimbledon",
  "tennis_wta_french_open",
  "tennis_wta_wimbledon",
  "mma_mixed_martial_arts",
];

const SPORT_EMOJIS = {
  basketball_nba: "🏀", basketball_euroleague: "🏀",
  americanfootball_nfl: "🏈", icehockey_nhl: "🏒", baseball_mlb: "⚾",
  soccer_epl: "⚽", soccer_spain_la_liga: "⚽", soccer_uefa_champs_league: "⚽",
  soccer_italy_serie_a: "⚽", soccer_germany_bundesliga: "⚽",
  soccer_france_ligue_one: "⚽", soccer_usa_mls: "⚽",
  tennis_atp_monte_carlo_masters: "🎾",
  tennis_atp_french_open: "🎾", tennis_atp_wimbledon: "🎾",
  tennis_wta_french_open: "🎾", tennis_wta_wimbledon: "🎾",
  mma_mixed_martial_arts: "🥊",
};

const SPORT_LABELS = {
  basketball_nba: "NBA", basketball_euroleague: "Euroleague",
  americanfootball_nfl: "NFL", icehockey_nhl: "NHL", baseball_mlb: "MLB",
  soccer_epl: "EPL", soccer_spain_la_liga: "La Liga",
  soccer_uefa_champs_league: "Champions League",
  soccer_italy_serie_a: "Serie A", soccer_germany_bundesliga: "Bundesliga",
  soccer_france_ligue_one: "Ligue 1", soccer_usa_mls: "MLS",
  tennis_atp_monte_carlo_masters: "ATP Monte-Carlo",
  tennis_atp_french_open: "ATP French Open", tennis_atp_wimbledon: "ATP Wimbledon",
  tennis_wta_french_open: "WTA French Open", tennis_wta_wimbledon: "WTA Wimbledon",
  mma_mixed_martial_arts: "MMA",
};

const SPORT_PICK_TARGETS = {
  basketball_nba: { min: 2, max: 3 },
  icehockey_nhl: { min: 1, max: 2 },
  soccer: { min: 2, max: 3 },
  baseball_mlb: { min: 1, max: 2 },
  tennis: { min: 1, max: 1 },
  mma_mixed_martial_arts: { min: 1, max: 1 },
  americanfootball_nfl: { min: 3, max: 4 },
  basketball_euroleague: { min: 1, max: 1 },
};

const FREE_ROTATION = {
  1: "basketball_nba",
  2: "icehockey_nhl",
  3: "soccer",
  4: "tennis_or_mlb",
  5: "basketball_nba",
  6: "soccer",
  0: "mixed",
};

const SOCCER_KEYS = new Set([
  "soccer_epl", "soccer_spain_la_liga", "soccer_uefa_champs_league",
  "soccer_italy_serie_a", "soccer_germany_bundesliga",
]);

const TENNIS_KEYS = new Set(["tennis_atp_french_open", "tennis_atp_wimbledon"]);

// Minimum confidence — never send below 62
const MIN_CONFIDENCE = 62;

export { SPORT_KEYS, SPORT_EMOJIS, SPORT_LABELS, SOCCER_KEYS, TENNIS_KEYS, BRAND, BRAND_FOOTER, BRAND_URL, MIN_CONFIDENCE };

export function getSportEmoji(sportKey) {
  return SPORT_EMOJIS[sportKey] || "🔥";
}

export function getSportLabel(sportKey) {
  return SPORT_LABELS[sportKey] || sportKey;
}

export function getSportCategory(sportKey) {
  if (SOCCER_KEYS.has(sportKey)) return "soccer";
  if (TENNIS_KEYS.has(sportKey)) return "tennis";
  return sportKey;
}

export function getTodayFreeSport() {
  const day = new Date().getDay();
  return FREE_ROTATION[day];
}

// ─── STEP 1: Fetch real games from ALL sports ───
export async function fetchUpcomingGames(apiKey) {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const allGames = [];

  const results = await Promise.allSettled(
    SPORT_KEYS.map(async (sportKey) => {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const games = await res.json();
      return games.map((g) => ({ ...g, sport_key_original: sportKey }));
    })
  );

  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      allGames.push(...result.value);
    }
  }

  const seen = new Set();
  const upcoming = allGames.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    const gameTime = new Date(g.commence_time);
    return gameTime > now && gameTime < tomorrow;
  });

  upcoming.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
  return upcoming;
}

// ─── STEP 2: Research + analyze each game with analysis cards ───
export async function analyzeWithCards(games, apiKey, supabase, { minConfidence = MIN_CONFIDENCE } = {}) {
  const cards = [];

  // Limit concurrent research to avoid rate limits
  const batchSize = 4;
  for (let i = 0; i < games.length; i += batchSize) {
    const batch = games.slice(i, i + batchSize);

    const batchResults = await Promise.allSettled(
      batch.map(async (game) => {
        // Step 2a: Web search for real data
        console.log(`   Researching: ${game.home_team} vs ${game.away_team}`);
        const research = await researchGame(game, apiKey);

        // Step 2b: Generate analysis card with scoring
        const card = await generateAnalysisCard(game, research, null, apiKey, supabase);
        return card;
      })
    );

    for (const result of batchResults) {
      if (result.status === "fulfilled" && result.value) {
        const card = result.value;
        // Only keep picks above minimum confidence
        if (card.tier && card.scoring.score >= minConfidence) {
          cards.push(card);
        } else if (card.scoring) {
          console.log(`   Filtered: ${card.game} (score: ${card.scoring.score}, min: ${minConfidence})`);
        }
      }
    }
  }

  // Sort by scoring.score descending
  cards.sort((a, b) => b.scoring.score - a.scoring.score);
  return cards;
}

// ─── Legacy: analyzePicks without cards (fallback) ───
export async function analyzePicks(games, apiKey, { minConfidence = MIN_CONFIDENCE } = {}) {
  const client = new Anthropic({ apiKey });
  const gamesText = formatGamesForPrompt(games);
  const sportsList = [...new Set(games.map((g) => g.sport_title || g.sport_key))].join(", ");
  const quotas = buildPickQuotas(games);

  const quotaInstructions = Object.entries(quotas)
    .map(([cat, q]) => `- ${getSportLabel(cat) || cat}: ${q.target} pick(s) (${q.games} games available)`)
    .join("\n");

  const totalPicks = Object.values(quotas).reduce((sum, q) => sum + q.target, 0);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `You are a professional sports analyst for Sharkline — the world's first sport-specific AI tipster with verified picks.

Here are REAL upcoming games with REAL bookmaker odds across multiple sports (${sportsList}):

${gamesText}

Pick the best value bets from THIS list ONLY. Do NOT invent any game not on this list.

TARGET PICK VOLUME PER SPORT:
${quotaInstructions}
Total target: ~${totalPicks} picks

RULES:
- Only pick games with at least ${minConfidence}/100 confidence. If a sport has no good picks, skip it entirely.
- Rank picks by value within each sport.
- Quality over quantity — fewer good picks is better than hitting the target with weak ones.
- NEVER send a pick below ${minConfidence} confidence. Ever.

For each pick return:
- sport, sport_key, game, pick, odds, confidence (${minConfidence}-100), rank, game_time, game_id
- reasoning: Write in FIRST PERSON as a confident tipster. 2-3 sentences. No AI mentions.
- vip_reasoning: Deeper analysis (4-5 sentences). Still first person, no AI mentions.

Return ONLY this JSON array:
[{"sport":"...","sport_key":"...","game":"...","pick":"...","odds":"...","confidence":75,"rank":1,"game_time":"...","game_id":"...","reasoning":"...","vip_reasoning":"..."}]`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new Error("No text response from Claude");

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
  }
  const picks = JSON.parse(jsonStr);
  return picks.filter((p) => p.confidence >= minConfidence);
}

// ─── Format games for Claude prompt ───
function formatGamesForPrompt(games) {
  return games.map((g, i) => {
    const time = new Date(g.commence_time).toLocaleString("en-US", {
      timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "2-digit", hour12: true,
    });
    const sportLabel = g.sport_title || g.sport_key;
    const emoji = getSportEmoji(g.sport_key_original || g.sport_key);

    let spreads = [], totals = [], moneylines = [];
    for (const bm of g.bookmakers || []) {
      for (const market of bm.markets || []) {
        if (market.key === "spreads") for (const o of market.outcomes) spreads.push({ team: o.name, point: o.point, price: o.price });
        if (market.key === "totals") for (const o of market.outcomes) totals.push({ side: o.name, point: o.point, price: o.price });
        if (market.key === "h2h") for (const o of market.outcomes) moneylines.push({ team: o.name, price: o.price });
      }
    }

    let oddsStr = "";
    if (spreads.length > 0) {
      const unique = {}; for (const s of spreads) if (!unique[s.team]) unique[s.team] = s;
      oddsStr += "  Spreads: " + Object.values(unique).map((s) => `${s.team} ${s.point > 0 ? "+" : ""}${s.point} (${s.price > 0 ? "+" : ""}${s.price})`).join(", ") + "\n";
    }
    if (totals.length > 0) {
      const over = totals.find((t) => t.side === "Over"); const under = totals.find((t) => t.side === "Under");
      if (over) oddsStr += `  Totals: Over ${over.point} (${over.price > 0 ? "+" : ""}${over.price}), Under ${under?.point || over.point} (${under ? (under.price > 0 ? "+" : "") + under.price : "N/A"})\n`;
    }
    if (moneylines.length > 0) {
      const unique = {}; for (const m of moneylines) if (!unique[m.team]) unique[m.team] = m;
      oddsStr += "  Moneyline: " + Object.values(unique).map((m) => `${m.team} (${m.price > 0 ? "+" : ""}${m.price})`).join(", ") + "\n";
    }

    return `${emoji} Game ${i + 1}: ${sportLabel}\n  ${g.home_team} vs ${g.away_team}\n  Time: ${time} EST\n  Game ID: ${g.id}\n  Sport Key: ${g.sport_key_original || g.sport_key}\n  Commence: ${g.commence_time}\n${oddsStr}`;
  }).join("\n");
}

function buildPickQuotas(games) {
  const sportCategories = {};
  for (const g of games) {
    const cat = getSportCategory(g.sport_key_original || g.sport_key);
    sportCategories[cat] = (sportCategories[cat] || 0) + 1;
  }
  const quotas = {};
  for (const [cat, count] of Object.entries(sportCategories)) {
    const target = SPORT_PICK_TARGETS[cat] || { min: 1, max: 2 };
    quotas[cat] = { target: Math.min(target.max, Math.max(target.min, Math.ceil(count / 3))), games: count };
  }
  return quotas;
}

// ─── STEP 3: Validate picks ───
export function validatePicks(picks, games) {
  const now = new Date();
  const gameIds = new Set(games.map((g) => g.id));
  return picks.filter((pick) => {
    // HARD GUARD: every pick MUST have a game_id matching an Odds API event
    if (!pick.game_id) { console.log(`   ❌ REJECTED "${pick.game}" — no Odds API event_id`); return false; }
    if (!gameIds.has(pick.game_id)) { console.log(`   ❌ REJECTED "${pick.game}" — event_id not in API response`); return false; }
    if (pick.game_time && new Date(pick.game_time) <= now) { console.log(`   Skipping "${pick.game}" — already started`); return false; }
    return true;
  });
}

// ─── Bankroll management ───
export function applyBankrollRules(picks, { streak, sportPicksToday = {} } = {}) {
  const streakType = streak?.endsWith("W") ? "win" : streak?.endsWith("L") ? "loss" : "none";
  const streakCount = parseInt(streak) || 0;
  let minConf = MIN_CONFIDENCE;

  if (streakType === "loss" && streakCount >= 3) {
    minConf = 75;
    console.log(`   Conservative mode: ${streakCount}L streak → min conf 75`);
  }

  let filtered = picks.filter((p) => {
    const conf = p.scoring?.score || p.confidence;
    return conf >= minConf;
  });

  filtered = filtered.filter((p) => {
    const cat = getSportCategory(p.sport_key);
    const maxForSport = cat === "americanfootball_nfl" ? 4 : 3;
    const count = sportPicksToday[p.sport] || 0;
    if (count >= maxForSport) { console.log(`   Skipping ${p.sport} ${p.game} — cap reached`); return false; }
    return true;
  });

  const mode = streakType === "loss" && streakCount >= 3 ? "conservative" : streakType === "win" && streakCount >= 5 ? "aggressive" : "normal";
  return { picks: filtered, mode, streakCount, streakType };
}

// ─── Group picks by sport ───
export function groupPicksBySport(picks) {
  const groups = {};
  for (const pick of picks) {
    const key = pick.sport_key || pick.sport;
    if (!groups[key]) groups[key] = [];
    groups[key].push(pick);
  }
  for (const key of Object.keys(groups)) {
    groups[key].sort((a, b) => (b.scoring?.score || b.confidence || 0) - (a.scoring?.score || a.confidence || 0));
  }
  return groups;
}

// ─── Format VIP batch — now with analysis cards ───
export function formatVipBatchMessage(sportKey, picks) {
  // If picks have analysis cards, use card format
  if (picks[0]?.tier) {
    return picks.map((card) => formatAnalysisCard(card)).filter(Boolean).join("\n\n");
  }

  // Legacy format fallback
  const emoji = getSportEmoji(sportKey);
  const label = getSportLabel(sportKey);
  const date = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" });

  let msg = `${emoji} ${label} PICKS — ${date}\n━━━━━━━━━━━━━━━━━━\n\n`;
  for (const [i, pick] of picks.entries()) {
    const gameTime = pick.game_time
      ? new Date(pick.game_time).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }) + " EST"
      : "TBD";
    const confDot = pick.confidence >= 75 ? "🟢" : pick.confidence >= 62 ? "🟡" : "🔴";
    const num = ["1️⃣", "2️⃣", "3️⃣", "4️⃣"][i] || `${i + 1}.`;
    msg += `${num} ${pick.game} — ${gameTime}\nPick: ${pick.pick}\nOdds: ${pick.odds}\nConfidence: ${confDot} ${pick.confidence}/100\n${pick.reasoning}\n`;
    if (pick.vip_reasoning) msg += `\n📊 ${pick.vip_reasoning}\n`;
    msg += `\n`;
  }
  msg += `━━━━━━━━━━━━━━━━━━\n${BRAND_FOOTER}`;
  return msg;
}

// ─── Format free channel pick ───
export function formatFreePickMessage(pick, { totalVipPicks = 0, sportCount = 0, paymentLink = "" } = {}) {
  // If pick has analysis card, use card format
  if (pick.tier) {
    return formatFreeCard(pick, { totalVipPicks, sportCount });
  }

  // Legacy format fallback
  const gameTime = pick.game_time
    ? new Date(pick.game_time).toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true }) + " EST"
    : "TBD";
  const confDot = pick.confidence >= 75 ? "🟢" : pick.confidence >= 62 ? "🟡" : "🔴";
  const emoji = getSportEmoji(pick.sport_key) || "🔥";

  return `⚡ SHARKLINE — Free Pick\n━━━━━━━━━━━━━━━━━━\n${emoji} ${pick.sport}\nGame: ${pick.game}\nTime: ${gameTime}\nPick: ${pick.pick}\nOdds: ${pick.odds}\nConfidence: ${confDot} ${pick.confidence}/100\n\n${pick.reasoning}\n\n━━━━━━━━━━━━━━━━━━\n📊 Subscribers received ${totalVipPicks} picks across ${sportCount} sports today.\n🏀 Single Sport → $19/mo\n⚽🏒🏀 3 Sports → $39/mo\n🌍 All Sports → $59/mo\n→ ${paymentLink || BRAND_URL}\n\n${BRAND_FOOTER}`;
}

// ─── Format VIP daily summary ───
export function formatVipDailySummary(resultsBySport, totalProfit) {
  const date = new Date().toLocaleDateString("en-US", { timeZone: "America/New_York", month: "long", day: "numeric" });
  let msg = `📊 Today's Results — ${date}\n━━━━━━━━━━━━━━━━━━\n`;
  let totalWins = 0, totalLosses = 0;
  for (const [sportKey, r] of Object.entries(resultsBySport)) {
    const emoji = getSportEmoji(sportKey);
    const label = getSportLabel(sportKey);
    const icons = [];
    for (let i = 0; i < r.wins; i++) icons.push("✅");
    for (let i = 0; i < r.losses; i++) icons.push("❌");
    for (let i = 0; i < r.pushes; i++) icons.push("➖");
    msg += `${emoji} ${label}: ${r.wins}W-${r.losses}L ${icons.join("")}\n`;
    totalWins += r.wins;
    totalLosses += r.losses;
  }
  msg += `━━━━━━━━━━━━━━━━━━\nTotal: ${totalWins}W-${totalLosses}L`;
  if (totalProfit !== 0) msg += ` (${totalProfit >= 0 ? "+" : ""}$${totalProfit.toFixed(0)})`;
  msg += `\n${BRAND_FOOTER}`;
  return msg;
}

// ─── Telegram helpers ───
export async function sendTelegramMessage(text, botToken, chatId, parseMode) {
  const body = { chat_id: chatId, text };
  if (parseMode) body.parse_mode = parseMode;
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description);
  return String(data.result.message_id);
}

export async function sendTelegramWithRetry(text, botToken, chatId) {
  try { return await sendTelegramMessage(text, botToken, chatId); }
  catch (err) {
    console.log(`   Telegram retry in 5s: ${err.message}`);
    await new Promise((r) => setTimeout(r, 5000));
    return await sendTelegramMessage(text, botToken, chatId);
  }
}

export function calculateProfit(oddsStr, unit = 100) {
  const odds = parseInt(oddsStr, 10);
  if (isNaN(odds)) return 0;
  if (odds > 0) return +(unit * (odds / 100)).toFixed(2);
  return +(unit * (100 / Math.abs(odds))).toFixed(2);
}

async function withRetry(fn, label, retryDelay = 60000) {
  try { return await fn(); }
  catch (err) {
    console.log(`   ${label} failed, retrying in ${retryDelay / 1000}s: ${err.message}`);
    await new Promise((r) => setTimeout(r, retryDelay));
    return await fn();
  }
}

// ─── Select the free channel pick (VALUE tier only, 2nd best) ───
export function selectFreePick(picks) {
  const todaySport = getTodayFreeSport();

  // Only VALUE tier picks go free — never STRONG VALUE or MAXIMUM
  const valuePicks = picks.filter((p) => {
    const tier = p.tier || classifyPick(p.scoring?.score || p.confidence);
    return tier?.category === "VALUE";
  });

  const sorted = [...(valuePicks.length > 0 ? valuePicks : picks)].sort((a, b) =>
    (b.scoring?.score || b.confidence || 0) - (a.scoring?.score || a.confidence || 0)
  );

  if (sorted.length <= 1) return sorted[0] || null;

  if (todaySport === "mixed") return sorted[1];

  let candidates;
  if (todaySport === "soccer") {
    candidates = sorted.filter((p) => SOCCER_KEYS.has(p.sport_key));
  } else if (todaySport === "tennis_or_mlb") {
    candidates = sorted.filter((p) => TENNIS_KEYS.has(p.sport_key) || p.sport_key === "baseball_mlb");
  } else {
    candidates = sorted.filter((p) => p.sport_key === todaySport);
  }

  if (candidates.length >= 2) return candidates[1];
  if (candidates.length === 1) return candidates[0];
  return sorted[1];
}

export function filterPicksForSubscriber(picks, unlockedSports) {
  if (!unlockedSports || unlockedSports.length === 0) return [];
  if (unlockedSports.includes("all")) return picks;
  return picks.filter((p) => unlockedSports.includes(p.sport_key));
}

export function buildUpgradeNudge(subscriber, weeklyBySport) {
  const unlocked = new Set(subscriber.unlocked_sports || []);
  if (unlocked.has("all")) return null;

  const missingSports = [];
  for (const [sportKey, r] of Object.entries(weeklyBySport)) {
    if (unlocked.has(sportKey)) continue;
    const total = r.wins + r.losses;
    if (total > 0 && r.wins > r.losses) {
      missingSports.push({ sportKey, ...r, winRate: ((r.wins / total) * 100).toFixed(0) });
    }
  }

  if (missingSports.length === 0) return null;

  const tier = subscriber.tier;

  if (tier === "single_sport") {
    const unlockedKey = [...unlocked][0];
    const unlockedRecord = weeklyBySport[unlockedKey];
    const best = missingSports.sort((a, b) => b.wins - a.wins)[0];
    if (!unlockedRecord || !best) return null;
    return `🔓 Your ${getSportLabel(unlockedKey)} picks went ${unlockedRecord.wins}-${unlockedRecord.losses} this week. Our ${getSportEmoji(best.sportKey)} ${getSportLabel(best.sportKey)} picks went ${best.wins}-${best.losses}.\nUpgrade to 3 Sports for just $20 more → ${BRAND_URL}`;
  }

  if (tier === "three_sports") {
    const missingCount = missingSports.reduce((sum, s) => sum + s.wins + s.losses, 0);
    const missLabels = missingSports.slice(0, 3).map((s) => getSportLabel(s.sportKey)).join(", ");
    return `🌍 You're missing ${missingCount} picks from ${missLabels}. All Sports Pass gets everything for $59/mo → ${BRAND_URL}`;
  }

  return null;
}

// ═══════════════════════════════════════════
// FULL TIPSTER RUN — Sharkline with analysis cards
// ═══════════════════════════════════════════
export async function runTipster({
  oddsApiKey, anthropicApiKey, botToken, channelId, vipChannelId,
  supabase, paymentLink = "",
}) {
  // Step 1: Fetch games
  const games = await withRetry(() => fetchUpcomingGames(oddsApiKey), "Odds API");

  const sportCounts = {};
  for (const g of games) {
    const key = g.sport_title || g.sport_key;
    sportCounts[key] = (sportCounts[key] || 0) + 1;
  }
  console.log(`   Odds API: ${games.length} upcoming games across ${Object.keys(sportCounts).length} sports`);
  for (const [sport, count] of Object.entries(sportCounts)) console.log(`      ${sport}: ${count} games`);

  if (games.length === 0) {
    console.log("   No upcoming games — nothing to send");
    if (supabase) {
      await supabase.from("agent_logs").insert({
        agent_name: "sharp-picks", action: "generate_and_send_picks",
        result: JSON.stringify({ picks_generated: 0, reason: "no upcoming games" }), revenue_generated: 0,
      });
    }
    return { games: 0, picks: 0, sent: 0 };
  }

  // Get streak + today's sport counts
  let streak = "";
  let sportPicksToday = {};
  if (supabase) {
    const { data: recent } = await supabase.from("picks").select("result, sport")
      .neq("result", "pending").order("sent_at", { ascending: false }).limit(20);
    if (recent?.length > 0) {
      const first = recent[0].result; let count = 0;
      for (const p of recent) { if (p.result === first) count++; else break; }
      streak = `${count}${first === "won" ? "W" : "L"}`;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const { data: tp } = await supabase.from("picks").select("sport").gte("sent_at", today.toISOString());
    for (const p of tp || []) sportPicksToday[p.sport] = (sportPicksToday[p.sport] || 0) + 1;
  }

  const streakType = streak?.endsWith("L") ? "loss" : streak?.endsWith("W") ? "win" : "none";
  const streakCount = parseInt(streak) || 0;
  const minConfidence = (streakType === "loss" && streakCount >= 3) ? 75 : MIN_CONFIDENCE;

  // Step 2: Research + analyze with analysis cards
  console.log(`   Generating analysis cards (min confidence: ${minConfidence})...`);
  let cards;
  try {
    cards = await analyzeWithCards(games, anthropicApiKey, supabase, { minConfidence });
    console.log(`   Generated ${cards.length} analysis cards`);
  } catch (err) {
    console.log(`   Card generation failed, falling back to legacy: ${err.message}`);
    const rawPicks = await withRetry(() => analyzePicks(games, anthropicApiKey, { minConfidence }), "Claude API");
    cards = rawPicks;
  }

  // Step 3: Validate
  const validPicks = validatePicks(cards, games);
  console.log(`   ${validPicks.length} picks passed validation`);

  // Step 4: Bankroll rules
  const { picks, mode } = applyBankrollRules(validPicks, { streak, sportPicksToday });
  console.log(`   ${picks.length} picks after bankroll (mode: ${mode})`);

  if (picks.length === 0) {
    console.log("   No picks passed all filters");
    return { games: games.length, picks: 0, sent: 0 };
  }

  // Streak messages
  if (mode === "conservative") {
    await sendTelegramWithRetry(`Being selective today. Quality over quantity. 🎯\n${BRAND_FOOTER}`, botToken, channelId);
  } else if (streakType === "win" && streakCount >= 5) {
    await sendTelegramWithRetry(`🔥 ${streakCount} in a row. We don't miss.\n${BRAND_FOOTER}`, botToken, channelId);
  }

  // Step 5: Group by sport for VIP batches
  const groups = groupPicksBySport(picks);
  const sportKeys = Object.keys(groups);
  const totalVipPicks = picks.length;

  // Send VIP batched messages (one per sport, with analysis cards)
  if (vipChannelId) {
    for (const [sportKey, sportPicks] of Object.entries(groups)) {
      try {
        // Send each card individually for better formatting
        for (const card of sportPicks) {
          const cardMsg = card.tier ? formatAnalysisCard(card) : formatVipBatchMessage(sportKey, [card]);
          if (cardMsg) {
            await sendTelegramWithRetry(cardMsg, botToken, vipChannelId);
          }
        }
        console.log(`   VIP: ${getSportEmoji(sportKey)} ${getSportLabel(sportKey)} (${sportPicks.length} cards sent)`);
      } catch (err) {
        console.log(`   VIP failed: ${err.message}`);
      }
    }
  }

  // Step 6: Free channel — 1 VALUE pick + MAX teasers
  const freePick = selectFreePick(picks);
  let freeMsgId = null;

  if (freePick) {
    const freeText = formatFreePickMessage(freePick, { totalVipPicks, sportCount: sportKeys.length, paymentLink });
    try {
      freeMsgId = await sendTelegramWithRetry(freeText, botToken, channelId);
      console.log(`   FREE: ${getSportEmoji(freePick.sport_key)} ${freePick.sport} ${freePick.game} → msg:${freeMsgId}`);
    } catch (err) {
      console.log(`   FREE send failed: ${err.message}`);
    }
  }

  // Send MAX teasers to free channel
  const maxPicks = picks.filter((p) => p.tier?.alert);
  for (const maxPick of maxPicks) {
    try {
      // Get last MAX play odds for social proof
      let lastMaxOdds = null;
      if (supabase) {
        const { data: lastMax } = await supabase.from("picks").select("odds")
          .eq("category", "MAXIMUM").eq("result", "won")
          .order("sent_at", { ascending: false }).limit(1).single();
        if (lastMax) lastMaxOdds = lastMax.odds;
      }
      const teaser = formatMaxTeaser(maxPick, lastMaxOdds);
      await sendTelegramWithRetry(teaser, botToken, channelId);
      console.log(`   🚨 MAX teaser sent for ${maxPick.sport}`);
    } catch (err) {
      console.log(`   MAX teaser failed: ${err.message}`);
    }
  }

  // Step 7: Log all picks to Supabase
  const sentPicks = [];
  if (supabase) {
    for (const pick of picks) {
      const isFree = pick === freePick;
      const tier = pick.tier || classifyPick(pick.scoring?.score || pick.confidence);
      const { error } = await supabase.from("picks").insert({
        sport: pick.sport, game: pick.game, pick: pick.pick, odds: pick.odds,
        confidence: pick.scoring?.score || pick.confidence,
        reasoning: pick.analysis_text || pick.reasoning,
        telegram_message_id: isFree ? freeMsgId : null,
        channel: isFree ? "free" : "vip",
        sent_at: new Date().toISOString(),
        game_time: pick.game_time || null,
        sport_key: pick.sport_key || null,
        event_id: pick.game_id || null,
        scoring_factors: pick.scoring?.factors || null,
        scoring_weights: pick.scoring?.weights || null,
        scoring_score: pick.scoring?.score || null,
        category: tier?.category || null,
        stake: tier?.stake || null,
        edge_percentage: pick.edge_percentage || null,
        research_data: pick.research || null,
      });
      if (error) console.log(`   DB error: ${error.message}`);
      else console.log(`   Saved (${isFree ? "free" : "vip"}, ${tier?.category || "?"}): ${pick.sport} ${pick.game}`);
      sentPicks.push(pick);
    }

    await supabase.from("agent_logs").insert({
      agent_name: "sharp-picks", action: "generate_and_send_picks",
      result: JSON.stringify({
        games_found: games.length, sports: sportKeys,
        picks_generated: cards.length, picks_validated: validPicks.length,
        picks_sent: sentPicks.length, mode, streak,
        categories: { VALUE: picks.filter((p) => p.tier?.category === "VALUE").length, STRONG_VALUE: picks.filter((p) => p.tier?.category === "STRONG VALUE").length, MAXIMUM: maxPicks.length },
        free_pick: freePick ? { sport: freePick.sport, game: freePick.game, pick: freePick.pick } : null,
        vip_by_sport: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
      }),
      revenue_generated: 0,
    });
    console.log(`   Saved to agent_logs`);
  }

  return { games: games.length, picks: picks.length, sent: sentPicks.length, sportCounts, groups, mode, freePick };
}
