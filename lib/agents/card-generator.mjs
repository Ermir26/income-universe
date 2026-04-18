// Card Generator — web-searched analysis cards for every pick
// This is what makes Sharkline different from every tipster on earth.
import Anthropic from "@anthropic-ai/sdk";
import { computeScore, classifyPick, loadWeights } from "../engine/scoring.mjs";

// ─── Research a single game via Claude web search ───
export async function researchGame(game, apiKey) {
  const client = new Anthropic({ apiKey });

  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportLabel = game.sport_title || game.sport_key;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    tools: [{ type: "web_search_20250305" }],
    messages: [
      {
        role: "user",
        content: `You are a sports research assistant. Find REAL, CURRENT data for this upcoming game:

Sport: ${sportLabel}
${homeTeam} vs ${awayTeam}
Game time: ${game.commence_time}

Search the web and find these SPECIFIC data points:
1. ${homeTeam}'s last 5 game results (W/L sequence)
2. ${awayTeam}'s last 5 game results (W/L sequence)
3. Head-to-head record between these teams this season
4. Major injuries/suspensions for BOTH teams right now
5. ${homeTeam}'s home record this season (W-L at home)
6. ${awayTeam}'s away record this season (W-L on the road)

IMPORTANT: Only report data you actually found. If you cannot find a specific data point, say "data unavailable" for that field. NEVER make up statistics.

Return ONLY this JSON:
{
  "form_home": "W-W-L-W-W",
  "form_away": "L-W-W-L-W",
  "h2h": "Home Team 2-1 this season",
  "injuries_home": "Player X — questionable (knee)",
  "injuries_away": "No major injuries reported",
  "home_record": "28-8 at home",
  "away_record": "15-18 on the road",
  "data_quality": "high"
}

Set data_quality to "high" if you found 4+ data points, "medium" for 2-3, "low" for 0-1.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return getEmptyResearch(homeTeam, awayTeam);

  try {
    let jsonStr = textBlock.text.trim();
    // Extract JSON from response
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return getEmptyResearch(homeTeam, awayTeam);
    return JSON.parse(jsonMatch[0]);
  } catch {
    return getEmptyResearch(homeTeam, awayTeam);
  }
}

function getEmptyResearch(homeTeam, awayTeam) {
  return {
    form_home: "data unavailable",
    form_away: "data unavailable",
    h2h: "data unavailable",
    injuries_home: "data unavailable",
    injuries_away: "data unavailable",
    home_record: "data unavailable",
    away_record: "data unavailable",
    data_quality: "low",
  };
}

// ─── Generate analysis + pick for a single game ───
export async function generateAnalysisCard(game, research, odds, apiKey, supabase) {
  const client = new Anthropic({ apiKey });
  const homeTeam = game.home_team;
  const awayTeam = game.away_team;
  const sportLabel = game.sport_title || game.sport_key;
  const sportKey = game.sport_key_original || game.sport_key;

  // Format odds for prompt
  let oddsText = "";
  for (const bm of (game.bookmakers || []).slice(0, 2)) {
    for (const market of bm.markets || []) {
      for (const o of market.outcomes) {
        oddsText += `  ${market.key}: ${o.name} ${o.point ? o.point + " " : ""}(${o.price > 0 ? "+" : ""}${o.price})\n`;
      }
    }
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `You are a professional sports analyst for Sharkline, a premium sports picks service.

Game: ${homeTeam} vs ${awayTeam}
Sport: ${sportLabel}
Time: ${game.commence_time}

REAL ODDS:
${oddsText}

RESEARCHED DATA:
- ${homeTeam} form (last 5): ${research.form_home}
- ${awayTeam} form (last 5): ${research.form_away}
- Head to head: ${research.h2h}
- ${homeTeam} injuries: ${research.injuries_home}
- ${awayTeam} injuries: ${research.injuries_away}
- ${homeTeam} home record: ${research.home_record}
- ${awayTeam} away record: ${research.away_record}

Analyze this game and make your best pick. Write in first person as a confident tipster.
NEVER mention AI, algorithms, or automation. Sound like a real human analyst.

Return ONLY this JSON:
{
  "pick": "Lakers -3.5",
  "odds": "-110",
  "picked_team": "Lakers",
  "opponent_team": "Celtics",
  "is_home": true,
  "confidence": 78,
  "edge_percentage": 4.2,
  "analysis_text": "I'm backing the Lakers here. They've won 3 of 4 against Boston this year and Tatum's status is shaky. The line moved a full point towards LA which tells me sharp money agrees.",
  "form_display_home": "W-W-L-W-W",
  "form_display_away": "L-W-W-L-W",
  "h2h_display": "Lakers 3-1 this season",
  "injuries_display": "BOS — Tatum questionable",
  "line_move_display": "opened -2.5, now -3.5",
  "home_away_display": "LAL 28-8 at home"
}

IMPORTANT:
- confidence must be 0-100 (honest assessment)
- edge_percentage: your estimated edge over the market (0-10)
- Use REAL odds from above
- If data was unavailable, don't include that line in display fields
- category will be calculated from confidence`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return null;

  try {
    let jsonStr = textBlock.text.trim();
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const analysis = JSON.parse(jsonMatch[0]);

    // Run through scoring engine
    const weights = await loadWeights(supabase, sportKey);
    const scoringData = {
      form_team1: research.form_home,
      form_team2: research.form_away,
      picked_team: analysis.picked_team,
      h2h: analysis.h2h_display || research.h2h,
      line_open: null, // Would need historical data
      line_current: null,
      pick_side: null,
      injuries: `${research.injuries_home} | ${research.injuries_away}`,
      opponent_team: analysis.opponent_team,
      rest_days_picked: null,
      rest_days_opponent: null,
      travel_picked: analysis.is_home ? "home" : "away",
      travel_opponent: analysis.is_home ? "away" : "home",
      home_away_record: analysis.is_home ? research.home_record : research.away_record,
      is_home: analysis.is_home,
      weather: null,
      is_outdoor: ["soccer", "americanfootball", "baseball", "tennis"].some((s) => sportKey.includes(s)),
      claude_confidence: analysis.confidence,
    };

    const scoring = computeScore(scoringData, weights);
    const tier = classifyPick(scoring.score);

    return {
      ...analysis,
      sport: sportLabel,
      sport_key: sportKey,
      game: `${homeTeam} vs ${awayTeam}`,
      game_id: game.id,
      game_time: game.commence_time,
      scoring,
      tier,
      research,
    };
  } catch (err) {
    console.log(`   Card generation failed for ${homeTeam} vs ${awayTeam}: ${err.message}`);
    return null;
  }
}

// ─── Format the analysis card for Telegram ───
export function formatAnalysisCard(card) {
  const tier = card.tier;
  if (!tier) return null;

  const gameTime = card.game_time
    ? new Date(card.game_time).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }) + " EST"
    : "TBD";

  const confDot = card.scoring.score >= 85 ? "🟢" : card.scoring.score >= 75 ? "🟡" : "⚪";

  let msg = "";

  // MAX alert header
  if (tier.alert) {
    msg += "🚨 MAX CONFIDENCE PLAY 🚨\n";
  }

  msg += `⚡ SHARKLINE\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${getSportEmojiForCard(card.sport_key)} ${card.sport}\n`;
  msg += `${card.game} — ${gameTime}\n\n`;
  msg += `Pick: ${card.pick}\n`;
  msg += `Odds: ${card.odds}\n`;
  msg += `Stake: ${tier.stakeStars} (${tier.stake}u)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

  // Data section
  msg += `📊 DATA:\n`;
  if (card.form_display_home && card.form_display_home !== "data unavailable") {
    const homeAbbr = abbreviate(card.picked_team || card.game.split(" vs ")[0]);
    const awayAbbr = abbreviate(card.opponent_team || card.game.split(" vs ")[1]);
    if (card.is_home) {
      msg += `- Form: ${homeAbbr} ${card.form_display_home} | ${awayAbbr} ${card.form_display_away}\n`;
    } else {
      msg += `- Form: ${awayAbbr} ${card.form_display_away} | ${homeAbbr} ${card.form_display_home}\n`;
    }
  }
  if (card.h2h_display && card.h2h_display !== "data unavailable") {
    msg += `- H2H: ${card.h2h_display}\n`;
  }
  if (card.injuries_display && card.injuries_display !== "data unavailable") {
    msg += `- Injuries: ${card.injuries_display}\n`;
  }
  if (card.line_move_display && card.line_move_display !== "data unavailable") {
    msg += `- Line move: ${card.line_move_display}\n`;
  }
  if (card.home_away_display && card.home_away_display !== "data unavailable") {
    msg += `- Home record: ${card.home_away_display}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `CONFIDENCE: ${confDot} ${card.scoring.score}/100\n`;
  if (card.edge_percentage) msg += `EDGE: +${card.edge_percentage}%\n`;
  msg += `CATEGORY: ${tier.category}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${card.analysis_text}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🦈 Sharkline — sharkline.ai`;

  return msg;
}

// ─── Format MAX play teaser for free channel ───
export function formatMaxTeaser(card, lastMaxOdds) {
  const emoji = getSportEmojiForCard(card.sport_key);
  const label = card.sport;
  const lastHit = lastMaxOdds ? `Last MAX play hit at ${lastMaxOdds}. ` : "";

  return `🚨 MAX PLAY just dropped for ${emoji} ${label} subscribers.\n${lastHit}Unlock ${label} → sharkline.ai\n\n🦈 Sharkline`;
}

// ─── Format free channel VALUE pick (stripped down card) ───
export function formatFreeCard(card, { totalVipPicks = 0, sportCount = 0 } = {}) {
  const gameTime = card.game_time
    ? new Date(card.game_time).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }) + " EST"
    : "TBD";

  let msg = `⚡ SHARKLINE — Free Pick\n━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${getSportEmojiForCard(card.sport_key)} ${card.sport}\n`;
  msg += `${card.game} — ${gameTime}\n\n`;
  msg += `Pick: ${card.pick}\n`;
  msg += `Odds: ${card.odds}\n`;
  msg += `Stake: ${card.tier.stakeStars} (${card.tier.stake}u)\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `${card.analysis_text}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📊 Subscribers received ${totalVipPicks} picks across ${sportCount} sports today with full analysis cards.\n`;
  msg += `🏀 Single Sport → $19/mo\n`;
  msg += `⚽🏒🏀 3 Sports → $39/mo\n`;
  msg += `🌍 All Sports → $59/mo\n`;
  msg += `→ sharkline.ai\n\n`;
  msg += `🦈 Sharkline — sharkline.ai`;

  return msg;
}

// ─── Helpers ───
function abbreviate(name) {
  if (!name) return "???";
  // Common abbreviations
  const abbrs = {
    "Los Angeles Lakers": "LAL", "Boston Celtics": "BOS", "Golden State Warriors": "GSW",
    "Milwaukee Bucks": "MIL", "Denver Nuggets": "DEN", "Phoenix Suns": "PHX",
  };
  if (abbrs[name]) return abbrs[name];
  // Take first 3 chars
  return name.replace(/^(The |FC |CF )/, "").substring(0, 3).toUpperCase();
}

function getSportEmojiForCard(sportKey) {
  const emojis = {
    basketball_nba: "🏀", basketball_euroleague: "🏀",
    americanfootball_nfl: "🏈", icehockey_nhl: "🏒", baseball_mlb: "⚾",
    soccer_epl: "⚽", soccer_spain_la_liga: "⚽", soccer_uefa_champs_league: "⚽",
    soccer_italy_serie_a: "⚽", soccer_germany_bundesliga: "⚽",
    tennis_atp_french_open: "🎾", tennis_atp_wimbledon: "🎾",
    mma_mixed_martial_arts: "🥊",
  };
  return emojis[sportKey] || "🔥";
}
