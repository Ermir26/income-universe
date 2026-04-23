// Analysis Card Generator — rich Telegram messages for each pick
// Sharkline's signature format: data-driven cards with tipster voice.
//
// Changes for win-rate improvement:
//   1. Generate 8 candidates, filter to top 2-3 (generate more, publish less)
//   2. Feed real ESPN data into prompt (team records, standings)
//   3. Foundation picks: heavy favorites for padding win rate
//   4. Performance feedback loop: recent results steer picks
//   5. Bet type restrictions: prefer moneyline/totals, avoid parlays/props/big spreads

import { type SupabaseClient } from "@supabase/supabase-js";
import { getTier, formatTierBadge, getTierStakeStars, type Tier } from "./tiers";
import { buildResearchPackets, formatResearchForPrompt } from "../sports-data/research";
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
export type PickPool = "safe" | "edge";

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
  pool: PickPool;
  confidence: number;
  tier: Tier;
  stake: number;
  scoring: ScoringResult;
  analysis: string;
  stats_line: string;
  telegram_html: string;
  is_sharpest: boolean;
  is_underdog_alert: boolean;
  validator_corrected?: string; // "bookmaker" if auto-corrected, undefined if clean
  original_bookmaker?: string;  // original value before correction
}

interface ClaudeCandidate {
  game: string;
  pick: string;
  odds: string;
  bookmaker: string;
  pickType: string;
  pool: string;
  confidence: number;
  analysis: string;
  form_summary: string;
  h2h_summary: string;
  line_movement: string;
  sharpest?: boolean;
  is_underdog_alert?: boolean;
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

export const TRUSTED_BOOKS = new Set([
  "DraftKings", "FanDuel", "BetMGM", "Caesars", "PointsBet",
  "BetRivers", "Bovada", "BetOnline", "Pinnacle", "Bet365",
  "ESPN BET",
]);

function formatOddsForPrompt(game: GameData): string {
  const lines: string[] = [];
  const bookmakers = (game.bookmakers ?? [])
    .filter((bm) => TRUSTED_BOOKS.has(bm.title))
    .sort((a, b) => {
      const ai = [...TRUSTED_BOOKS].indexOf(a.title);
      const bi = [...TRUSTED_BOOKS].indexOf(b.title);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    })
    .slice(0, 10);
  for (const bm of bookmakers) {
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

// ─── Performance Feedback Loop ───

interface PerformanceFeedback {
  totalPicks: number;
  winRate: number;
  bestSport: { name: string; winRate: number } | null;
  worstSport: { name: string; winRate: number } | null;
  bestBetType: { name: string; winRate: number } | null;
  avoidList: string[];
}

async function getPerformanceFeedback(supabase: SupabaseClient): Promise<PerformanceFeedback> {
  const { data: picks } = await supabase
    .from('picks')
    .select('sport, bet_type, result')
    .in('result', ['won', 'lost'])
    .order('settled_at', { ascending: false })
    .limit(30);

  if (!picks || picks.length < 5) {
    return { totalPicks: 0, winRate: 0, bestSport: null, worstSport: null, bestBetType: null, avoidList: [] };
  }

  const totalWins = picks.filter((p) => p.result === 'won').length;
  const overallWinRate = +((totalWins / picks.length) * 100).toFixed(1);

  // Group by sport
  const sportGroups: Record<string, { wins: number; total: number }> = {};
  for (const p of picks) {
    const sport = p.sport || 'Unknown';
    if (!sportGroups[sport]) sportGroups[sport] = { wins: 0, total: 0 };
    sportGroups[sport].total++;
    if (p.result === 'won') sportGroups[sport].wins++;
  }

  // Group by bet_type
  const betGroups: Record<string, { wins: number; total: number }> = {};
  for (const p of picks) {
    const bt = p.bet_type || 'unknown';
    if (!betGroups[bt]) betGroups[bt] = { wins: 0, total: 0 };
    betGroups[bt].total++;
    if (p.result === 'won') betGroups[bt].wins++;
  }

  const sportEntries = Object.entries(sportGroups)
    .filter(([, v]) => v.total >= 3)
    .map(([name, v]) => ({ name, winRate: +((v.wins / v.total) * 100).toFixed(1) }))
    .sort((a, b) => b.winRate - a.winRate);

  const betEntries = Object.entries(betGroups)
    .filter(([, v]) => v.total >= 3)
    .map(([name, v]) => ({ name, winRate: +((v.wins / v.total) * 100).toFixed(1) }))
    .sort((a, b) => b.winRate - a.winRate);

  // Build avoid list: sport+bet combos below 50%
  const avoidList: string[] = [];
  for (const [sport, sv] of Object.entries(sportGroups)) {
    if (sv.total >= 3 && (sv.wins / sv.total) < 0.5) {
      avoidList.push(`${sport} (${((sv.wins / sv.total) * 100).toFixed(0)}% win rate)`);
    }
  }
  for (const [bt, bv] of Object.entries(betGroups)) {
    if (bv.total >= 3 && (bv.wins / bv.total) < 0.5) {
      avoidList.push(`${bt} bets (${((bv.wins / bv.total) * 100).toFixed(0)}% win rate)`);
    }
  }

  return {
    totalPicks: picks.length,
    winRate: overallWinRate,
    bestSport: sportEntries[0] ?? null,
    worstSport: sportEntries[sportEntries.length - 1] ?? null,
    bestBetType: betEntries[0] ?? null,
    avoidList,
  };
}

function formatFeedbackBlock(fb: PerformanceFeedback): string {
  if (fb.totalPicks === 0) return '';
  const lines = [
    `\nYour recent performance (last ${fb.totalPicks} picks):`,
    `- Win rate: ${fb.winRate}%`,
  ];
  if (fb.bestSport) lines.push(`- Best performing sport: ${fb.bestSport.name} (${fb.bestSport.winRate}% win rate)`);
  if (fb.worstSport && fb.worstSport.name !== fb.bestSport?.name) {
    lines.push(`- Worst performing sport: ${fb.worstSport.name} (${fb.worstSport.winRate}% win rate)`);
  }
  if (fb.bestBetType) lines.push(`- Best performing bet type: ${fb.bestBetType.name} (${fb.bestBetType.winRate}% win rate)`);
  if (fb.avoidList.length > 0) {
    lines.push(`- AVOID (cold spots): ${fb.avoidList.join(', ')}`);
  }
  lines.push('Adjust your picks accordingly. Lean into what\'s working. Avoid sports and bet types where the system is cold.');
  return lines.join('\n');
}

// ─── Change 5: Bet Type Restrictions ───

const BET_TYPE_RULES = `
ODDS STRATEGY — this is critical for long-term profitability:

TARGET DISTRIBUTION for each day's picks:
- 60% of picks at -110 to -135 range (spreads, totals, slight favorites) — this is your bread and butter, where 57%+ hit rate generates consistent profit
- 20% of picks at +100 to +180 range (value underdogs, slight dogs) — these are where the big profit comes from. One +150 winner equals 1.5 units vs the 0.91 units from a -110 winner. Look for dogs where the public is overreacting to recent results or where injury news hasn't moved the line enough.
- 15% of picks at -140 to -200 range (moderate favorites ML) — only when data strongly supports it across multiple dimensions
- 5% FOUNDATION picks at -200 to -300 range — max 1 per day, only when absolutely overwhelming evidence. These are for win rate optics, not profit.

NEVER pick anything at -300 or worse — the math doesn't work. You need 75%+ to break even at those odds.
NEVER pick anything at +200 or worse — too much variance, not reliable enough for a premium service.

The sweet spot is -110 to +150. This is where sharp bettors live.

KEY CONCEPT — VALUE BETTING:
Don't just pick who will win. Pick where the ODDS are wrong. If you calculate a team has a 60% chance of winning but the odds imply only 50% probability (+100), that's a value bet even though the team isn't a heavy favorite. These value spots are more profitable than -250 favorites that everyone already knows will likely win.

When giving reasoning, always include WHY the odds represent value — not just why the team will win. For example: "The line hasn't adjusted for [key player] returning from injury — this team should be -150 but is currently -120, offering value."

BET TYPES (in order of preference):
1. Moneyline — most straightforward, easiest to hit
2. Totals (over/under) — predictable when you have scoring trend data
3. F5 Totals (MLB only) — First 5 innings over/under, isolates starting pitchers
4. Spreads — only when the line is 3 points or less

AVOID:
- Parlays (never)
- Player props (too volatile)
- Spreads larger than 7 points (blowout variance)`;

// ─── Multi-Candidate Generation (Change 1) ───

/**
 * Generate 10 candidate picks across multiple games, then filter to the best ones.
 * Wide net, tight filter. Falls back to top 2 if zero pass threshold.
 */
export async function generateCandidates(
  games: GameData[],
  apiKey: string,
  weights: ScoringWeights,
  pickTypeHint: PickType,
  supabase: SupabaseClient,
  todaysPicks?: { game: string; pick: string }[],
): Promise<AnalysisCard[]> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  // Hard gate: reject games with no bookmakers — Claude cannot analyze odds it can't see
  const selectedGames = games.filter((g) => {
    const hasBooks = (g.bookmakers ?? []).length > 0;
    if (!hasBooks) {
      console.log(`   🚫 FILTERED (no bookmakers): ${g.home_team} vs ${g.away_team} — will not be analyzed`);
    }
    return hasBooks;
  });

  if (selectedGames.length === 0) {
    console.log(`   ⚠️ All games filtered out — no bookmakers available`);
    return [];
  }

  // Build odds text for all games
  const gamesBlock = selectedGames.map((g, i) => {
    const odds = formatOddsForPrompt(g);
    return `GAME ${i + 1}: ${g.home_team} vs ${g.away_team}\nTime: ${g.commence_time}\nOdds:\n${odds}`;
  }).join('\n\n');

  // Fetch comprehensive research data (injuries, form, standings, weather)
  const uniqueKeys = [...new Set(selectedGames.map((g) => g.sport_key))];
  const researchPackets = await buildResearchPackets(uniqueKeys);
  const researchBlock = formatResearchForPrompt(researchPackets);

  // Performance feedback (Change 4)
  const feedback = await getPerformanceFeedback(supabase);
  const feedbackBlock = formatFeedbackBlock(feedback);

  const alreadyPostedBlock = todaysPicks && todaysPicks.length > 0
    ? `\nALREADY POSTED TODAY — do NOT recommend the same game + bet type combination again:\n${todaysPicks.map((p) => `- ${p.game}: ${p.pick}`).join("\n")}\n`
    : "";

  const pickTypeInstruction = pickTypeHint === "foundation"
    ? `PICK TYPE: SAFE (Foundation) 🛡️
You are generating SAFE PICKS for the free channel. These are HEAVY FAVORITES where the moneyline is between -200 and -350.

CRITICAL SAFE PICK RULES:
- The pick MUST be a moneyline favorite between -200 and -350.
- DO NOT pick spreads, totals, or underdogs. Moneyline favorites ONLY.
- Set "pickType": "foundation" and "pool": "safe" for ALL picks in this batch.
- Set confidence between 70-85 for these (they are safe plays, rate them honestly).
- Rate form_factor and situational highly (75+) when the favorite has dominant recent form.
- The goal is WINNING, not ROI. Obvious winners that most fans would agree with.
- These exist to prove the system works, not to make money.
- Keep analysis to 1-2 sentences. No deep breakdown needed.
- Look for: dominant home teams, teams on 4+ win streaks, lopsided matchups, teams fighting for playoffs vs eliminated opponents.
- If a game has no favorite between -200 and -350, skip that game entirely.
- Generate 1-2 SAFE picks maximum.`
    : `PICK TYPE: EDGE (Value) 💎
You are generating EDGE PICKS for VIP/Method channels. These are picks where the odds are WRONG.

EDGE PICK RULES:
- Find games where the odds are mispriced. Value underdogs the public is sleeping on.
- Totals where weather/tactical data points clearly one direction but the line hasn't adjusted.
- Spreads where injury news or motivation mismatch creates a 3+ point edge.
- These are picks that require deep 17-dimension analysis to find — the public wouldn't find these.
- Set "pickType": "value" and "pool": "edge" for ALL picks in this batch.
- Generate 4-8 EDGE picks.
- Mark your single SHARPEST PLAY with "sharpest": true — the one pick where odds are most mispriced relative to true probability.

UNDERDOG ALERT (optional, max 1):
After generating your main edge picks, check if any underdog at +150 or higher has genuine value — meaning your calculated true probability is at least 15% higher than what the odds imply.
If yes, include ONE extra pick with "is_underdog_alert": true and "pool": "edge".
If none qualify, don't force it — skip the underdog alert.
Underdog alerts are OPTIONAL high-risk plays, not part of the main system.

ZERO OVERLAP RULE:
Edge picks MUST use different games from safe/foundation picks when possible. If the same game appears in both pools, the edge pick must use a DIFFERENT bet type (e.g., safe = ML favorite, edge = the total or spread).`;

  const candidateCount = Math.max(10, selectedGames.length * 2);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `${getBrandPromptRules()}

You are an elite sports analyst combining 17 research dimensions for every game. Write in first person plural ("we"). Sound like a team of analysts who watch every game.

═══════════════════════════════════════
COMPREHENSIVE RESEARCH DATA (LIVE)
═══════════════════════════════════════
${researchBlock}
${feedbackBlock}

═══════════════════════════════════════
17 ANALYSIS DIMENSIONS
═══════════════════════════════════════
For EVERY game, you MUST cross-reference these dimensions before making a pick:

1. STANDINGS CONTEXT — Where each team sits. Fighting for title/playoffs/relegation? Nothing to play for?
2. FORM — Last 5 results. Streak direction. Goals scored/conceded trends.
3. INJURIES — Key players out or doubtful. Impact on team strength.
4. HEAD-TO-HEAD — Historical matchups between these teams. Home/away H2H splits.
5. WEATHER — Temperature, wind, rain for outdoor sports. How it affects gameplay.
6. MOTIVATION — What's at stake? Must-win? Dead rubber? Revenge game?
7. TACTICAL MATCHUP — Style matchups (press vs possession, run-heavy vs pass, etc).
8. SCHEDULING — Back-to-back? Rest days? Mid-week fixtures?
9. TRAVEL/FATIGUE — Road trip length, timezone changes, back-to-backs.
10. HOME/AWAY SPLITS — How each team performs at home vs away specifically.
11. LINE MOVEMENT — Has the line moved? Which direction? Sharp vs public money.
12. PLAYER MATCHUPS — Key individual battles that could decide the game.
13. SEASONAL TRENDS — Time-of-season patterns (early season chaos, late season motivation).
14. VENUE HISTORY — How teams perform at this specific venue.
15. COACHING — Tactical tendencies, recent adjustments, record vs opponent.
16. ODDS VALUE — True probability vs implied probability from odds. Where's the mispricing?
17. EXTERNAL FACTORS — Crowd, travel bans, midweek European games, playoff implications.

═══════════════════════════════════════
MLB FIRST 5 INNINGS (F5) TOTALS
═══════════════════════════════════════
This is a premium market that isolates starting pitcher performance from bullpen variance. When analyzing MLB games, consider F5 totals as a PRIMARY bet type alongside moneyline and full-game totals.

F5 ANALYSIS DIMENSIONS:
- STARTER QUALITY: ERA, WHIP, K/9, innings pitched this season. Elite starters (ERA < 3.00) strongly favor unders.
- PITCHER VS LINEUP: Historical stats of the starter against today's opposing lineup. Check batting average against, slugging against.
- BULLPEN REMOVAL: F5 eliminates bullpen variance entirely. A dominant starter paired with a bad bullpen = F5 under is BETTER than full-game under.
- PARK FACTORS: Some parks play very differently in early innings vs late (Coors Field, Yankee Stadium). Use park-adjusted metrics.
- WEATHER EARLY: Wind and temperature affect ball carry. Morning/afternoon games differ from night games.
- FIRST INNING TENDENCIES: Some pitchers are notoriously slow starters (high 1st inning ERA). Factor this into F5 overs.
- LINEUP POSITION: The 1-5 hitters bat more in F5. Weight top-of-order quality more heavily than full lineup depth.

F5 TOTALS RULES:
- Only recommend F5 totals when BOTH starters have clear data (not a spot start or bullpen game).
- F5 lines are typically 4.5 or 5.0. Target games where pitcher data strongly supports one direction.
- F5 unders are preferred when both starters are elite (combined ERA < 6.00).
- F5 overs work when both starters struggle early or face stacked lineups.
- Format picks as "F5 Over 4.5" or "F5 Under 5.0" — always specify "F5" prefix.
- Confidence for F5 picks should reflect pitcher sample size — lower confidence if either starter has < 30 IP this season.
- Generate 1-3 F5 picks per day during MLB season when strong matchups exist. Don't force F5 picks if the data isn't there.

${BET_TYPE_RULES}

${pickTypeInstruction}
${alreadyPostedBlock}

═══════════════════════════════════════
GAMES TO ANALYZE (with real odds)
═══════════════════════════════════════

${gamesBlock}

═══════════════════════════════════════
INSTRUCTIONS
═══════════════════════════════════════

Generate up to ${candidateCount} candidate picks across ALL ${selectedGames.length} games. Be AGGRESSIVE with volume — if ${selectedGames.length} games have clear edges, recommend picks for all of them. ONE pick per game maximum — choose the single best bet type for each game.

For each pick, your reasoning MUST reference at least 4-5 of the 17 dimensions above with CONCRETE details from the research data. No vague analysis — cite specific records, injury names, standings positions, form streaks.

You must also rate each scoring factor from 0-100 based on your analysis.

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "game": "Home Team vs Away Team",
    "pick": "Team Name -3.5",
    "odds": "-110",
    "bookmaker": "MUST be one of the exact book names listed in the Odds section for this game. Do not write a book name that does not appear in the Odds above. Do not attribute a line to a book that does not offer it.",
    "pickType": "${pickTypeHint}",
    "pool": "${pickTypeHint === "foundation" ? "safe" : "edge"}",
    "confidence": 72,
    "analysis": "4-6 sentences referencing at least 4 specific research dimensions. Cite actual data: records, injury names, form streaks, standings positions.",
    "form_summary": "W4" or "L2W3" etc,
    "h2h_summary": "3-1 this season" or "first meeting",
    "line_movement": "↑ opened +3.5 now +2.5" or "steady",
    "sharpest": false,
    "is_underdog_alert": false,
    "factors": {
      "odds_value": 72,
      "form_factor": 68,
      "h2h_factor": 55,
      "market_movement": 60,
      "public_vs_sharp": 65,
      "situational": 70
    }
  }
]

RULES:
- Use REAL odds from the games above. Pick the best value line.
- ONE pick per game only. Choose the single strongest bet type.
- Reject odds worse than +200 (low hit rate).
- odds_value: how much value vs implied probability (80+ = great value)
- form_factor: recent form of the picked team/player (80+ = hot streak)
- h2h_factor: head-to-head record favors pick (50 = neutral, 80+ = dominant)
- market_movement: line moving in pick's direction (70+ = sharp money agrees)
- public_vs_sharp: contrarian value, sharps on our side (70+ = fading public)
- situational: rest, travel, injuries, motivation (70+ = strong situational edge)
- Be honest with ratings. Don't inflate. A realistic range is 55-80 for most factors.
- confidence: your overall confidence (0-100). Most picks should be 58-78. A 60-65 pick with solid data is publishable.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.log(`   ⚠️ Claude returned no text block for ${pickTypeHint} candidates`);
    await supabase.from('agent_logs').insert({
      agent_name: 'sharp-picks', action: 'claude_no_text',
      result: JSON.stringify({ pickType: pickTypeHint, gamesCount: selectedGames.length }),
      revenue_generated: 0,
    }).then(() => {}, () => {});
    return [];
  }

  const jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    console.log(`   ⚠️ Claude response not valid JSON array for ${pickTypeHint}: ${jsonStr.slice(0, 200)}`);
    await supabase.from('agent_logs').insert({
      agent_name: 'sharp-picks', action: 'claude_bad_json',
      result: JSON.stringify({ pickType: pickTypeHint, preview: jsonStr.slice(0, 500) }),
      revenue_generated: 0,
    }).then(() => {}, () => {});
    return [];
  }

  let candidates: ClaudeCandidate[];
  try {
    candidates = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    console.log(`   ⚠️ JSON parse failed for ${pickTypeHint}: ${(parseErr as Error).message}`);
    return [];
  }

  if (!Array.isArray(candidates)) return [];

  console.log(`   📊 Claude returned ${candidates.length} ${pickTypeHint} candidates`);

  // ── Validate pick line + price against payload, auto-correct bookmaker only ──
  const PRICE_TOLERANCE = 5; // ±5 cents American odds
  const correctedBookmakers = new Map<string, string>(); // game → original bookmaker
  const rejectedCandidates = new Set<number>(); // indices to drop

  for (let ci = 0; ci < candidates.length; ci++) {
    const cand = candidates[ci];
    const game = selectedGames.find((g) => {
      const fwd = `${g.home_team} vs ${g.away_team}`;
      const rev = `${g.away_team} vs ${g.home_team}`;
      if (cand.game === fwd || cand.game === rev) return true;
      const cl = cand.game.toLowerCase();
      const hw = g.home_team.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      const aw = g.away_team.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      return hw.some((w: string) => cl.includes(w)) && aw.some((w: string) => cl.includes(w));
    });
    if (!game) continue;

    // Parse Claude's pick to determine what market/line/side to look for
    const citedPrice = parseInt(cand.odds, 10);
    const pickTrimmed = cand.pick.trim();
    const ouMatch = pickTrimmed.match(/^(?:F5\s+)?(Over|Under)\s+([\d.]+)$/i);
    const spreadMatch = pickTrimmed.match(/^(.+?)\s+([+-][\d.]+)$/);
    const isDrawPick = pickTrimmed.toLowerCase() === "draw";
    let citedLine: number | null = null;
    let marketKey: string;
    let sideMatch: (o: { name: string; point?: number }) => boolean;

    if (ouMatch) {
      citedLine = parseFloat(ouMatch[2]);
      marketKey = pickTrimmed.match(/^F5/i) ? "totals" : "totals";
      const side = ouMatch[1].toLowerCase();
      sideMatch = (o) => o.name.toLowerCase() === (side === "over" ? "over" : "under");
    } else if (isDrawPick) {
      marketKey = "h2h";
      sideMatch = (o) => o.name.toLowerCase() === "draw";
    } else if (spreadMatch && Math.abs(parseFloat(spreadMatch[2])) <= 20) {
      citedLine = parseFloat(spreadMatch[2]);
      marketKey = "spreads";
      const teamWord = spreadMatch[1].trim().toLowerCase();
      const gameParts = cand.game.split(" vs ").map((t: string) => t.trim().toLowerCase());
      const isHome = gameParts[0]?.includes(teamWord) || teamWord.includes(gameParts[0] ?? "");
      sideMatch = (o) => {
        const oName = o.name.toLowerCase();
        return isHome
          ? !!(gameParts[0] && (oName.includes(gameParts[0]) || gameParts[0].includes(oName)))
          : !!(gameParts[1] && (oName.includes(gameParts[1]) || gameParts[1].includes(oName)));
      };
    } else {
      // Moneyline
      marketKey = "h2h";
      const teamName = pickTrimmed.replace(/\s+ML$/i, "").replace(/\s+[+-]\d{3,}$/, "").trim().toLowerCase();
      const gameParts = cand.game.split(" vs ").map((t: string) => t.trim().toLowerCase());
      const isHome = gameParts[0]?.includes(teamName) || teamName.includes(gameParts[0] ?? "");
      sideMatch = (o) => {
        const oName = o.name.toLowerCase();
        return isHome
          ? !!(gameParts[0] && (oName.includes(gameParts[0]) || gameParts[0].includes(oName)))
          : !!(gameParts[1] && (oName.includes(gameParts[1]) || gameParts[1].includes(oName)));
      };
    }

    // Search all bookmakers for a matching outcome
    type MatchResult = { book: string; price: number; line: number | null; exact: boolean };
    const matches: MatchResult[] = [];

    for (const bm of (game.bookmakers ?? []).filter((b) => TRUSTED_BOOKS.has(b.title))) {
      for (const mkt of bm.markets) {
        if (mkt.key !== marketKey) continue;
        for (const o of mkt.outcomes) {
          if (!sideMatch(o)) continue;
          // Line check: for totals/spreads, line must match exactly
          if (citedLine != null && o.point != null && o.point !== citedLine) continue;
          if (citedLine != null && o.point == null) continue;
          // This outcome matches the cited side + line
          const priceDiff = isNaN(citedPrice) ? Infinity : Math.abs(o.price - citedPrice);
          matches.push({ book: bm.title, price: o.price, line: o.point ?? null, exact: priceDiff <= PRICE_TOLERANCE });
        }
      }
    }

    if (matches.length === 0) {
      // No book offers this line/side — reject
      console.log(`   🚫 VALIDATOR REJECT: ${cand.game} — ${cand.pick} @ ${cand.odds} (${cand.bookmaker}) — line not offered by any book`);
      rejectedCandidates.add(ci);
      // Log rejection to supabase
      supabase.from("pick_decision_log").insert({
        game_id: game.id, sport: game.sport_key, game: cand.game,
        pick: cand.pick, odds: cand.odds, bookmaker: cand.bookmaker,
        confidence: cand.confidence,
        odds_api_payload: game,
        validator_result: "rejected",
        final_decision: "rejected_validator",
        rejection_reason: `Line ${cand.pick} not offered by any trusted book. Market: ${marketKey}, cited line: ${citedLine}, cited price: ${citedPrice}`,
      }).then(() => {}, () => {});
      continue;
    }

    // Check if the cited bookmaker has the matching outcome
    const citedBookMatch = matches.find((m) => m.book === cand.bookmaker && m.exact);
    if (citedBookMatch) {
      // Perfect match — bookmaker + line + price all correct
      continue;
    }

    // Check if cited book has it but price is off
    const citedBookWrongPrice = matches.find((m) => m.book === cand.bookmaker && !m.exact);
    if (citedBookWrongPrice) {
      // Book has the line but price diverges beyond tolerance — reject
      console.log(`   🚫 VALIDATOR REJECT: ${cand.game} — price mismatch at ${cand.bookmaker}: cited ${citedPrice}, actual ${citedBookWrongPrice.price}`);
      rejectedCandidates.add(ci);
      supabase.from("pick_decision_log").insert({
        game_id: game.id, sport: game.sport_key, game: cand.game,
        pick: cand.pick, odds: cand.odds, bookmaker: cand.bookmaker,
        confidence: cand.confidence,
        odds_api_payload: game,
        validator_result: "rejected",
        final_decision: "rejected_validator",
        rejection_reason: `Price mismatch at ${cand.bookmaker}: cited ${citedPrice}, actual ${citedBookWrongPrice.price} (tolerance ±${PRICE_TOLERANCE})`,
      }).then(() => {}, () => {});
      continue;
    }

    // Cited book doesn't have it, but another book does with acceptable price — auto-correct bookmaker
    const bestMatch = matches.find((m) => m.exact) ?? matches[0];
    if (bestMatch && Math.abs(bestMatch.price - citedPrice) <= PRICE_TOLERANCE) {
      const original = cand.bookmaker;
      cand.bookmaker = bestMatch.book;
      cand.odds = String(bestMatch.price);
      correctedBookmakers.set(cand.game, original);
      console.log(`   🔧 BOOKMAKER FIX: "${original}" → "${bestMatch.book}" (price ${bestMatch.price}) for ${cand.game}`);
    } else {
      // Line exists at another book but price is too far off — reject
      console.log(`   🚫 VALIDATOR REJECT: ${cand.game} — ${cand.bookmaker} doesn't offer ${cand.pick}, nearest is ${bestMatch?.book} @ ${bestMatch?.price} (too far from ${citedPrice})`);
      rejectedCandidates.add(ci);
      supabase.from("pick_decision_log").insert({
        game_id: game.id, sport: game.sport_key, game: cand.game,
        pick: cand.pick, odds: cand.odds, bookmaker: cand.bookmaker,
        confidence: cand.confidence,
        odds_api_payload: game,
        validator_result: "rejected",
        final_decision: "rejected_validator",
        rejection_reason: `${cand.bookmaker} doesn't offer ${cand.pick}. Nearest: ${bestMatch?.book} @ ${bestMatch?.price} (cited ${citedPrice}, beyond ±${PRICE_TOLERANCE} tolerance)`,
      }).then(() => {}, () => {});
    }
  }

  // Remove rejected candidates
  candidates = candidates.filter((_, i) => !rejectedCandidates.has(i));

  // ── Filter candidates ──

  // Fuzzy game matching — Claude might return names in different order or format
  function matchGame(candGame: string): GameData | undefined {
    // Exact match first
    const exact = selectedGames.find((g) => `${g.home_team} vs ${g.away_team}` === candGame);
    if (exact) return exact;
    // Reversed match
    const reversed = selectedGames.find((g) => `${g.away_team} vs ${g.home_team}` === candGame);
    if (reversed) return reversed;
    // Fuzzy: check if both team names appear somewhere in the candidate string
    const candLower = candGame.toLowerCase();
    return selectedGames.find((g) => {
      const home = g.home_team.toLowerCase();
      const away = g.away_team.toLowerCase();
      // Check if significant words from both teams appear
      const homeWords = home.split(/\s+/).filter((w) => w.length > 3);
      const awayWords = away.split(/\s+/).filter((w) => w.length > 3);
      const homeMatch = homeWords.some((w) => candLower.includes(w));
      const awayMatch = awayWords.some((w) => candLower.includes(w));
      return homeMatch && awayMatch;
    });
  }

  const cards: AnalysisCard[] = [];

  // First pass: build all scoreable candidates (even below threshold)
  interface ScoredCandidate {
    cand: ClaudeCandidate;
    game: GameData;
    scoring: ScoringResult;
    effectivePickType: PickType;
    tier: Tier | null;
    passedFilter: boolean;
    filterReason?: string;
  }

  const allScored: ScoredCandidate[] = [];

  for (const cand of candidates) {
    const game = matchGame(cand.game);
    if (!game) {
      console.log(`   ⏭️ FILTERED (no game match): ${cand.game}`);
      continue;
    }

    const scoring = calculateConfidence(cand.factors, weights);
    const effectivePickType: PickType = cand.pickType === "foundation" ? "foundation" : "value";
    const tier = getTier(scoring.confidence, effectivePickType);

    let passedFilter = true;
    let filterReason: string | undefined;

    // a. Reject confidence < 60
    if (cand.confidence < 60) {
      passedFilter = false;
      filterReason = `low confidence ${cand.confidence}`;
    }

    // b. Reject odds worse than +200
    const oddsNum = parseInt(cand.odds, 10);
    if (!isNaN(oddsNum) && oddsNum > 200) {
      passedFilter = false;
      filterReason = `odds too risky ${cand.odds}`;
    }

    // c. Reject if scoring engine puts it below tier threshold
    if (!tier) {
      passedFilter = false;
      filterReason = `below tier threshold ${scoring.confidence}`;
    }

    if (!passedFilter) {
      console.log(`   ⏭️ FILTERED (${filterReason}): ${cand.game} — ${cand.pick}`);
    }

    allScored.push({ cand, game, scoring, effectivePickType, tier, passedFilter, filterReason });
  }

  // Deduplicate: one pick per game (keep highest confidence)
  const bestByGame = new Map<string, ScoredCandidate>();
  for (const s of allScored) {
    const gameId = s.game.id;
    const existing = bestByGame.get(gameId);
    if (!existing || s.scoring.confidence > existing.scoring.confidence) {
      bestByGame.set(gameId, s);
    }
  }
  const dedupedScored = [...bestByGame.values()];

  // Determine which candidates to use
  let selectedCandidates = dedupedScored.filter((s) => s.passedFilter);

  // Zero-pick fallback: if nothing passed, take top 2 by confidence regardless
  if (selectedCandidates.length === 0 && dedupedScored.length > 0) {
    console.log(`   ⚠️ ZERO-PICK FALLBACK: No candidates passed filter. Taking top 2 by confidence.`);
    const sorted = [...dedupedScored].sort((a, b) => b.scoring.confidence - a.scoring.confidence);
    selectedCandidates = sorted.slice(0, 2).map((s) => {
      // Force a VALUE tier for fallback picks
      const fallbackTier = s.tier ?? { name: "VALUE" as const, emoji: "✅", stake: 1, color: "#22c55e" };
      return { ...s, tier: fallbackTier, passedFilter: true, filterReason: 'LOW_CONFIDENCE_FALLBACK' };
    });
    // Log as low confidence in agent logs (but don't change user-facing tier)
    for (const s of selectedCandidates) {
      console.log(`   ⚠️ LOW CONFIDENCE FALLBACK: ${s.cand.game} — ${s.cand.pick} (conf: ${s.scoring.confidence})`);
    }
  }

  for (const { cand, game, scoring, effectivePickType, tier } of selectedCandidates) {
    if (!tier) continue;

    // Per-game league name from sport_key (NOT global)
    const gameLeague = getLeagueName(game.sport_key);

    // Build stats line
    const statParts: string[] = [];
    if (cand.form_summary) statParts.push(`Form: ${cand.form_summary}`);
    if (cand.h2h_summary && cand.h2h_summary !== "first meeting") statParts.push(`H2H: ${cand.h2h_summary}`);
    if (cand.line_movement && cand.line_movement !== "steady") statParts.push(`Line: ${cand.line_movement}`);
    const statsLine = statParts.join(" | ");

    // Build Telegram HTML
    const gameTime = formatGameTime(game.commence_time);
    const emoji = getSportEmoji(game.sport_key);
    const stakeStars = getTierStakeStars(tier);
    const confBar = scoring.confidence >= 85 ? "🟢" : scoring.confidence >= 75 ? "🟡" : "⚪";
    const pickTypeBadge = effectivePickType === "foundation" ? "🛡️ FOUNDATION" : "💎 VALUE";

    let html = "";

    if (tier.name === "MAXIMUM") {
      html += "🚨 <b>MAX CONFIDENCE PLAY</b> 🚨\n";
    }

    if (tier.name === "FOUNDATION") {
      html += "🛡️ <b>FOUNDATION PICK</b>\n";
    }

    html += `🦈 <b>SHARK METHOD</b> — <b>${pickTypeBadge}</b>\n`;
    html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    html += `${emoji} <b>${gameLeague}</b>\n`;
    html += `${game.home_team} vs ${game.away_team} — ${gameTime}\n\n`;
    html += `🎯 <b>Pick:</b> ${cand.pick}\n`;
    html += `📊 <b>Odds:</b> ${cand.odds} (${cand.bookmaker})\n`;
    html += `🏷️ <b>Tier:</b> ${tier.name}\n`;
    html += `💰 <b>Stake:</b> ${tier.stake} units ${stakeStars}\n`;
    html += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (statsLine) {
      html += `📊 ${statsLine}\n`;
    }

    html += `${confBar} Confidence: ${scoring.confidence}/100 — ${formatTierBadge(tier)}\n`;
    html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
    html += `${cand.analysis}\n`;
    html += `━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (tier.name === "FOUNDATION") {
      html += `🛡️ Safe play. The method starts here.\n`;
    } else {
      html += `Follow the method. Trust the process.\n`;
    }
    html += `🦈 Sharkline — sharkline.ai`;

    cards.push({
      sport: gameLeague,
      sport_key: game.sport_key,
      league: gameLeague,
      game: `${game.home_team} vs ${game.away_team}`,
      game_id: game.id,
      game_time: game.commence_time,
      pick: cand.pick,
      odds: cand.odds,
      bookmaker: cand.bookmaker,
      pickType: effectivePickType,
      pool: (cand.pool === "safe" ? "safe" : "edge") as PickPool,
      confidence: scoring.confidence,
      tier,
      stake: tier.stake,
      scoring,
      analysis: cand.analysis,
      stats_line: statsLine,
      telegram_html: html,
      is_sharpest: cand.sharpest === true,
      is_underdog_alert: cand.is_underdog_alert === true,
      validator_corrected: correctedBookmakers.has(cand.game) ? "bookmaker" : undefined,
      original_bookmaker: correctedBookmakers.get(cand.game),
    });
  }

  // c. Sort by confidence DESC
  cards.sort((a, b) => b.confidence - a.confidence);

  return cards;
}

/**
 * Legacy single-game analysis (kept for backward compat but now calls multi-candidate).
 */
export async function generateAnalysisCard(
  game: GameData,
  apiKey: string,
  weights: ScoringWeights,
  pickTypeHint: PickType = "value",
  todaysPicks?: { game: string; pick: string }[],
  supabase?: SupabaseClient,
): Promise<AnalysisCard | null> {
  // If we have supabase, use the new multi-candidate path
  if (supabase) {
    const candidates = await generateCandidates([game], apiKey, weights, pickTypeHint, supabase, todaysPicks);
    return candidates[0] ?? null;
  }

  // Fallback: minimal single-game generation without ESPN context or feedback
  // Hard gate: no bookmakers = no analysis
  if ((game.bookmakers ?? []).length === 0) {
    console.log(`   🚫 FILTERED (no bookmakers, single-game): ${game.home_team} vs ${game.away_team}`);
    return null;
  }

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });
  const sportKey = game.sport_key;
  const league = getLeagueName(sportKey);
  const oddsText = formatOddsForPrompt(game);

  const alreadyPostedBlock = todaysPicks && todaysPicks.length > 0
    ? `\nALREADY POSTED TODAY — do NOT recommend the same game + bet type combination again:\n${todaysPicks.map((p) => `- ${p.game}: ${p.pick}`).join("\n")}\n`
    : "";

  const pickTypeInstruction = pickTypeHint === "foundation"
    ? `PICK TYPE: FOUNDATION 🛡️ — Select heavy favorites (-200 to -350 ML). >75% win probability only. Set "pickType": "foundation".`
    : `PICK TYPE: VALUE 💎 — Find genuine analytical edges where odds are mispriced. Set "pickType": "value".`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `${getBrandPromptRules()}

You are an expert sports analyst writing for Sharkline.

Game: ${game.home_team} vs ${game.away_team}
League: ${league}
Time: ${game.commence_time}

REAL ODDS:
${oddsText}

${BET_TYPE_RULES}

${pickTypeInstruction}
${alreadyPostedBlock}
Analyze this game and make your best pick. Rate each scoring factor 0-100.

Return ONLY this JSON (no markdown):
{
  "pick": "Team Name -3.5",
  "odds": "-110",
  "bookmaker": "MUST be one of the exact book names listed in the Odds section for this game. Do not write a book name that does not appear in the Odds above.",
  "pickType": "${pickTypeHint}",
  "analysis": "3-4 sentences.",
  "form_summary": "W4",
  "h2h_summary": "3-1 this season",
  "line_movement": "steady",
  "factors": {
    "odds_value": 72, "form_factor": 68, "h2h_factor": 55,
    "market_movement": 60, "public_vs_sharp": 65, "situational": 70
  }
}

Be honest with ratings. Don't inflate.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return null;

  const jsonMatch = textBlock.text.trim().match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let parsed: { pick: string; odds: string; bookmaker: string; pickType: string; analysis: string; form_summary: string; h2h_summary: string; line_movement: string; factors: ScoringFactors };
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }

  // ── Validate & auto-correct bookmaker ──
  let singleCorrected: string | undefined;
  let singleOriginalBook: string | undefined;
  const availableBooks = (game.bookmakers ?? [])
    .filter((bm) => TRUSTED_BOOKS.has(bm.title))
    .map((bm) => bm.title);

  if (availableBooks.length > 0 && !availableBooks.includes(parsed.bookmaker)) {
    const original = parsed.bookmaker;
    singleOriginalBook = original;
    const targetOdds = parseInt(parsed.odds, 10);
    let bestBook = availableBooks[0];
    if (!isNaN(targetOdds)) {
      let bestDiff = Infinity;
      for (const bm of (game.bookmakers ?? []).filter((b) => TRUSTED_BOOKS.has(b.title))) {
        for (const mkt of bm.markets) {
          for (const o of mkt.outcomes) {
            const diff = Math.abs(o.price - targetOdds);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestBook = bm.title;
            }
          }
        }
      }
    }
    parsed.bookmaker = bestBook;
    singleCorrected = "bookmaker";
    console.log(`   🔧 BOOKMAKER FIX (single): "${original}" → "${bestBook}" for ${game.home_team} vs ${game.away_team}`);
  }

  const scoring = calculateConfidence(parsed.factors, weights);
  const effectivePickType: PickType = parsed.pickType === "foundation" ? "foundation" : "value";
  const tier = getTier(scoring.confidence, effectivePickType);
  if (!tier) return null;

  const statParts: string[] = [];
  if (parsed.form_summary) statParts.push(`Form: ${parsed.form_summary}`);
  if (parsed.h2h_summary && parsed.h2h_summary !== "first meeting") statParts.push(`H2H: ${parsed.h2h_summary}`);
  if (parsed.line_movement && parsed.line_movement !== "steady") statParts.push(`Line: ${parsed.line_movement}`);
  const statsLine = statParts.join(" | ");

  const gameTime = formatGameTime(game.commence_time);
  const emoji = getSportEmoji(sportKey);
  const stakeStars = getTierStakeStars(tier);
  const confBar = scoring.confidence >= 85 ? "🟢" : scoring.confidence >= 75 ? "🟡" : "⚪";
  const pickTypeBadge = effectivePickType === "foundation" ? "🛡️ FOUNDATION" : "💎 VALUE";

  let html = "";
  if (tier.name === "MAXIMUM") html += "🚨 <b>MAX CONFIDENCE PLAY</b> 🚨\n";
  if (tier.name === "FOUNDATION") html += "🛡️ <b>FOUNDATION PICK</b>\n";

  html += `🦈 <b>SHARK METHOD</b> — <b>${pickTypeBadge}</b>\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  html += `${emoji} <b>${league}</b>\n`;
  html += `${game.home_team} vs ${game.away_team} — ${gameTime}\n\n`;
  html += `🎯 <b>Pick:</b> ${parsed.pick}\n`;
  html += `📊 <b>Odds:</b> ${parsed.odds} (${parsed.bookmaker})\n`;
  html += `🏷️ <b>Tier:</b> ${tier.name}\n`;
  html += `💰 <b>Stake:</b> ${tier.stake} units ${stakeStars}\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (statsLine) html += `📊 ${statsLine}\n`;
  html += `${confBar} Confidence: ${scoring.confidence}/100 — ${formatTierBadge(tier)}\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  html += `${parsed.analysis}\n`;
  html += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  if (tier.name === "FOUNDATION") {
    html += `🛡️ Safe play. The method starts here.\n`;
  } else {
    html += `Follow the method. Trust the process.\n`;
  }
  html += `🦈 Sharkline — sharkline.ai`;

  return {
    sport: league, sport_key: sportKey, league,
    game: `${game.home_team} vs ${game.away_team}`,
    game_id: game.id, game_time: game.commence_time,
    pick: parsed.pick, odds: parsed.odds, bookmaker: parsed.bookmaker,
    pickType: effectivePickType,
    pool: (effectivePickType === "foundation" ? "safe" : "edge") as PickPool,
    confidence: scoring.confidence,
    tier, stake: tier.stake, scoring, analysis: parsed.analysis,
    stats_line: statsLine, telegram_html: html,
    is_sharpest: false,
    is_underdog_alert: false,
    validator_corrected: singleCorrected,
    original_bookmaker: singleOriginalBook,
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
