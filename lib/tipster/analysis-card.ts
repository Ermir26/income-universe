// Analysis Card Generator — rich Telegram messages for each pick
// Sharkline's signature format: data-driven cards with tipster voice.

import Anthropic from "@anthropic-ai/sdk";
import { getTier, formatTierBadge, getTierStakeStars, type Tier } from "./tiers";
import {
  calculateConfidence,
  type ScoringFactors,
  type ScoringWeights,
  type ScoringResult,
} from "./scoring-engine";
import { getBrandPromptRules } from "./brand";

export interface GameData {
  id: string;
  sport_key: string;
  sport_title?: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: Array<{
    key: string;
    title: string;
    markets: Array<{
      key: string;
      outcomes: Array<{
        name: string;
        price: number;
        point?: number;
      }>;
    }>;
  }>;
}

export type PickType = "foundation" | "value";

export interface AnalysisCard {
  sport: string;
  sport_key: string;
  league: string;
  game: string;
  game_id: string;
  game_time: string;
  pick: string;
  odds: string;
  bookmaker: string;
  pickType: PickType;
  confidence: number;
  tier: Tier;
  stake: number;
  scoring: ScoringResult;
  analysis: string;
  stats_line: string;
  telegram_html: string;
}

interface ClaudePickResponse {
  pick: string;
  odds: string;
  bookmaker: string;
  pickType: PickType;
  analysis: string;
  form_summary: string;
  h2h_summary: string;
  line_movement: string;
  factors: ScoringFactors;
}

const SPORT_EMOJIS: Record<string, string> = {
  basketball_nba: "🏀",
  americanfootball_nfl: "🏈", icehockey_nhl: "🏒", baseball_mlb: "⚾",
  soccer_epl: "⚽", soccer_spain_la_liga: "⚽", soccer_uefa_champs_league: "⚽",
  soccer_italy_serie_a: "⚽", soccer_germany_bundesliga: "⚽",
  soccer_france_ligue_one: "⚽", soccer_usa_mls: "⚽",
  tennis_atp_french_open: "🎾", tennis_atp_wimbledon: "🎾",
  tennis_wta_french_open: "🎾", tennis_wta_wimbledon: "🎾",
  mma_mixed_martial_arts: "🥊",
};

const SPORT_LABELS: Record<string, string> = {
  basketball_nba: "NBA",
  americanfootball_nfl: "NFL", icehockey_nhl: "NHL", baseball_mlb: "MLB",
  soccer_epl: "Premier League", soccer_spain_la_liga: "La Liga",
  soccer_uefa_champs_league: "Champions League",
  soccer_italy_serie_a: "Serie A", soccer_germany_bundesliga: "Bundesliga",
  soccer_france_ligue_one: "Ligue 1", soccer_usa_mls: "MLS",
  tennis_atp_french_open: "ATP French Open", tennis_atp_wimbledon: "ATP Wimbledon",
  tennis_wta_french_open: "WTA French Open", tennis_wta_wimbledon: "WTA Wimbledon",
  mma_mixed_martial_arts: "MMA",
};

function getSportEmoji(key: string): string {
  return SPORT_EMOJIS[key] ?? "🔥";
}

function getLeagueName(key: string): string {
  return SPORT_LABELS[key] ?? key;
}

function formatOddsForPrompt(game: GameData): string {
  const lines: string[] = [];
  for (const bm of (game.bookmakers ?? []).slice(0, 3)) {
    lines.push(`  ${bm.title}:`);
    for (const market of bm.markets) {
      for (const o of market.outcomes) {
        const priceStr = o.price > 0 ? `+${o.price}` : `${o.price}`;
        const pointStr = o.point != null ? ` ${o.point}` : "";
        lines.push(`    ${market.key}: ${o.name}${pointStr} (${priceStr})`);
      }
    }
  }
  return lines.join("\n");
}

function formatGameTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }) + " EST";
}

/**
 * Generate an analysis card for a single game using Claude.
 * Returns null if the game doesn't qualify (confidence < 62).
 *
 * @param pickTypeHint — "foundation" targets heavy favorites (>80% win prob, short odds),
 *                        "value" targets analytical edges where odds are mispriced.
 */
export async function generateAnalysisCard(
  game: GameData,
  apiKey: string,
  weights: ScoringWeights,
  pickTypeHint: PickType = "value",
  todaysPicks?: { game: string; pick: string }[],
): Promise<AnalysisCard | null> {
  const client = new Anthropic({ apiKey });
  const sportKey = game.sport_key;
  const league = getLeagueName(sportKey);
  const oddsText = formatOddsForPrompt(game);

  const alreadyPostedBlock = todaysPicks && todaysPicks.length > 0
    ? `\nALREADY POSTED TODAY — do NOT recommend the same game + bet type combination again:\n${todaysPicks.map((p) => `- ${p.game}: ${p.pick}`).join("\n")}\n`
    : "";

  const pickTypeInstruction = pickTypeHint === "foundation"
    ? `PICK TYPE: FOUNDATION 🔒
You are selecting a FOUNDATION pick. Foundation picks are meant to pad the win rate.
- Only select a pick where you assess >80% win probability.
- Target heavy favorites, dominant form teams, or matchups where data overwhelmingly supports one side.
- It's okay if odds are very short (1.10-1.50 decimal / -150 to -1000 American). The goal is WINNING, not ROI.
- If this game does NOT have a clear >80% probability side, return null / skip it.
- Set "pickType": "foundation" in your response.`
    : `PICK TYPE: VALUE 💎
You are selecting a VALUE pick. Value picks target analytical edges where odds are mispriced.
- Find genuine value — where the true probability exceeds what the odds imply.
- Look for reverse line movement, CLV edges, sharp-vs-public divergence.
- These picks should have a real analytical basis, not just gut feeling.
- Set "pickType": "value" in your response.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `${getBrandPromptRules()}

You are an expert sports analyst writing for Sharkline. Write in first person plural ("we"). Sound like a team of analysts who watch every game.

Game: ${game.home_team} vs ${game.away_team}
League: ${league}
Time: ${game.commence_time}

REAL ODDS:
${oddsText}

${pickTypeInstruction}
${alreadyPostedBlock}
Analyze this game and make your best pick. You must also rate each scoring factor from 0-100 based on your analysis.

Return ONLY this JSON (no markdown, no explanation):
{
  "pick": "Team Name -3.5",
  "odds": "-110",
  "bookmaker": "best bookmaker from the odds above",
  "pickType": "${pickTypeHint}",
  "analysis": "3-4 sentences of first-person analysis. Be specific about why this is a good bet. Reference form, matchups, or situational factors.",
  "form_summary": "W4" or "L2W3" etc,
  "h2h_summary": "3-1 this season" or "first meeting",
  "line_movement": "↑ opened +3.5 now +2.5" or "steady",
  "factors": {
    "odds_value": 72,
    "form_factor": 68,
    "h2h_factor": 55,
    "market_movement": 60,
    "public_vs_sharp": 65,
    "situational": 70
  }
}

RULES:
- Use REAL odds from above. Pick the best value line.
- odds_value: how much value vs implied probability (80+ = great value)
- form_factor: recent form of the picked team/player (80+ = hot streak)
- h2h_factor: head-to-head record favors pick (50 = neutral, 80+ = dominant)
- market_movement: line moving in pick's direction (70+ = sharp money agrees)
- public_vs_sharp: contrarian value, sharps on our side (70+ = fading public)
- situational: rest, travel, injuries, motivation (70+ = strong situational edge)
- Be honest with ratings. Don't inflate.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  let jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: ClaudePickResponse;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  // Run through scoring engine
  const scoring = calculateConfidence(parsed.factors, weights);
  const tier = getTier(scoring.confidence);

  // Below threshold — don't send
  if (!tier) return null;

  // Build stats line
  const statParts: string[] = [];
  if (parsed.form_summary) statParts.push(`Form: ${parsed.form_summary}`);
  if (parsed.h2h_summary && parsed.h2h_summary !== "first meeting") statParts.push(`H2H: ${parsed.h2h_summary}`);
  if (parsed.line_movement && parsed.line_movement !== "steady") statParts.push(`Line: ${parsed.line_movement}`);
  const statsLine = statParts.join(" | ");

  // Build Telegram HTML message
  const gameTime = formatGameTime(game.commence_time);
  const emoji = getSportEmoji(sportKey);
  const stakeStars = getTierStakeStars(tier);
  const confBar = scoring.confidence >= 85 ? "🟢" : scoring.confidence >= 75 ? "🟡" : "⚪";

  const pickType: PickType = parsed.pickType === "foundation" ? "foundation" : "value";
  const pickTypeBadge = pickType === "foundation" ? "🔒 FOUNDATION" : "💎 VALUE";

  let html = "";

  if (tier.name === "MAXIMUM") {
    html += "🚨 <b>MAX CONFIDENCE PLAY</b> 🚨\n";
  }

  html += `🦈 <b>SHARK METHOD</b> — <b>${pickTypeBadge}</b>\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  html += `${emoji} <b>${league}</b>\n`;
  html += `${game.home_team} vs ${game.away_team} — ${gameTime}\n\n`;
  html += `🎯 <b>Pick:</b> ${parsed.pick}\n`;
  html += `📊 <b>Odds:</b> ${parsed.odds} (${parsed.bookmaker})\n`;
  html += `🏷️ <b>Tier:</b> ${tier.name}\n`;
  html += `💰 <b>Stake:</b> ${tier.stake} units ${stakeStars}\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;

  if (statsLine) {
    html += `📊 ${statsLine}\n`;
  }

  html += `${confBar} Confidence: ${scoring.confidence}/100 — ${formatTierBadge(tier)}\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  html += `${parsed.analysis}\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  html += `Follow the method. Trust the process.\n`;
  html += `🦈 Sharkline — sharkline.ai #SharkMethod`;

  return {
    sport: league,
    sport_key: sportKey,
    league,
    game: `${game.home_team} vs ${game.away_team}`,
    game_id: game.id,
    game_time: game.commence_time,
    pick: parsed.pick,
    odds: parsed.odds,
    bookmaker: parsed.bookmaker,
    pickType,
    confidence: scoring.confidence,
    tier,
    stake: tier.stake,
    scoring,
    analysis: parsed.analysis,
    stats_line: statsLine,
    telegram_html: html,
  };
}

/**
 * Format a "WINNER" message for settled winning picks.
 */
export function formatWinnerMessage(card: {
  sport_key: string;
  sport: string;
  game: string;
  pick: string;
  odds: string;
  tier: string;
}): string {
  const emoji = getSportEmoji(card.sport_key);
  return (
    `✅ <b>WINNER</b>\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `${emoji} ${card.sport}\n` +
    `${card.game}\n` +
    `<b>${card.pick}</b> at ${card.odds} ✅\n` +
    `Tier: ${card.tier}\n` +
    `━━━━━━━━━━━━━━━━━━━━━━\n` +
    `🦈 Sharkline — sharkline.ai`
  );
}
