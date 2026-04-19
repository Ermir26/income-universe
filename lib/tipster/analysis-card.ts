// Analysis Card Generator — rich Telegram messages for each pick
// Sharkline's signature format: data-driven cards with tipster voice.
//
// Changes for win-rate improvement:
//   1. Generate 8 candidates, filter to top 2-3 (generate more, publish less)
//   2. Feed real ESPN data into prompt (team records, standings)
//   3. Foundation picks: heavy favorites for padding win rate
//   4. Performance feedback loop: recent results steer picks
//   5. Bet type restrictions: prefer moneyline/totals, avoid parlays/props/big spreads

import Anthropic from "@anthropic-ai/sdk";
import { type SupabaseClient } from "@supabase/supabase-js";
import { getTier, formatTierBadge, getTierStakeStars, type Tier } from "./tiers";
import {
  calculateConfidence,
  type ScoringFactors,
  type ScoringWeights,
  type ScoringResult,
} from "./scoring-engine";
import { getBrandPromptRules } from "./brand";
import { SPORT_KEY_TO_ESPN } from "../sports-data/espn-leagues";

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

interface ClaudeCandidate {
  game: string;
  pick: string;
  odds: string;
  bookmaker: string;
  pickType: string;
  confidence: number;
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

// ─── Change 2: ESPN Real Data Context ───

// In-memory cache for ESPN context data (1 hour TTL)
const espnContextCache = new Map<string, { data: string; fetchedAt: number }>();
const ESPN_CONTEXT_TTL = 3_600_000; // 1 hour

interface ESPNTeamRecord {
  name: string;
  record: string;
  homeAway: string;
}

async function fetchESPNContext(sportKeys: string[]): Promise<string> {
  const cacheKey = sportKeys.sort().join(',');
  const cached = espnContextCache.get(cacheKey);
  if (cached && Date.now() - cached.fetchedAt < ESPN_CONTEXT_TTL) {
    return cached.data;
  }

  const sections: string[] = [];
  const seenLeagues = new Set<string>();

  for (const sportKey of sportKeys) {
    const espn = SPORT_KEY_TO_ESPN[sportKey];
    if (!espn || seenLeagues.has(`${espn.sport}/${espn.league}`)) continue;
    seenLeagues.add(`${espn.sport}/${espn.league}`);

    try {
      // Fetch today's scoreboard
      const scoreUrl = `https://site.api.espn.com/apis/site/v2/sports/${espn.sport}/${espn.league}/scoreboard`;
      const scoreRes = await fetch(scoreUrl, {
        headers: { 'User-Agent': 'Sharkline/1.0' },
        signal: AbortSignal.timeout(8_000),
      });

      if (!scoreRes.ok) continue;
      const scoreData = await scoreRes.json();
      const events = scoreData.events ?? [];
      const leagueName = getLeagueName(sportKey);

      if (events.length === 0) continue;

      const lines: string[] = [`\n--- ${leagueName} Today ---`];

      for (const event of events.slice(0, 10)) {
        const comp = event.competitions?.[0];
        if (!comp) continue;

        const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'home');
        const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === 'away');
        if (!home || !away) continue;

        const homeName = home.team?.displayName ?? '';
        const awayName = away.team?.displayName ?? '';
        const homeRecord = home.records?.[0]?.summary ?? '';
        const awayRecord = away.records?.[0]?.summary ?? '';
        const gameStatus = event.status?.type?.description ?? '';
        const gameTime = event.date ? new Date(event.date).toLocaleTimeString('en-US', {
          timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', hour12: true,
        }) : '';

        let line = `  ${awayName} (${awayRecord || '?'}) @ ${homeName} (${homeRecord || '?'})`;
        if (gameTime) line += ` — ${gameTime} ET`;
        if (gameStatus && gameStatus !== 'Scheduled') line += ` [${gameStatus}]`;
        lines.push(line);
      }

      if (lines.length > 1) sections.push(lines.join('\n'));

      // Fetch standings (compact)
      try {
        const standUrl = `https://site.api.espn.com/apis/v2/sports/${espn.sport}/${espn.league}/standings`;
        const standRes = await fetch(standUrl, {
          headers: { 'User-Agent': 'Sharkline/1.0' },
          signal: AbortSignal.timeout(8_000),
        });
        if (standRes.ok) {
          const standData = await standRes.json();
          const groups = standData.children ?? [];
          const standLines: string[] = [`\n  ${leagueName} Standings (top 5 per division):`];
          for (const group of groups.slice(0, 4)) {
            const divName = group.name ?? '';
            const entries = group.standings?.entries ?? [];
            if (entries.length === 0) continue;
            standLines.push(`    ${divName}:`);
            for (const entry of entries.slice(0, 5)) {
              const team = entry.team?.displayName ?? '';
              const wins = entry.stats?.find((s: { name: string }) => s.name === 'wins')?.value ?? '?';
              const losses = entry.stats?.find((s: { name: string }) => s.name === 'losses')?.value ?? '?';
              standLines.push(`      ${team}: ${wins}-${losses}`);
            }
          }
          if (standLines.length > 1) sections.push(standLines.join('\n'));
        }
      } catch { /* standings are supplementary */ }

    } catch { /* non-critical */ }
  }

  const contextBlock = sections.length > 0
    ? sections.join('\n')
    : '(No ESPN data available for today)';

  espnContextCache.set(cacheKey, { data: contextBlock, fetchedAt: Date.now() });
  return contextBlock;
}

// ─── Change 4: Performance Feedback Loop ───

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
PREFERRED bet types (in order of reliability):
1. Moneyline on favorites (-120 to -350) — highest hit rate
2. Totals (over/under) — more predictable than spreads
3. Spread only when the line is 3 points or less (close games are harder to predict on spread)

AVOID:
- Parlays (never)
- Player props (too volatile)
- Spreads larger than 7 points (blowout variance)
- Heavy underdogs above +250 (low hit rate)`;

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
  const client = new Anthropic({ apiKey });

  // Limit to 6 games max for the prompt to avoid hitting token limits
  const selectedGames = games.slice(0, 6);
  const sportKey = selectedGames[0]?.sport_key ?? '';
  const league = getLeagueName(sportKey);

  // Build odds text for all games
  const gamesBlock = selectedGames.map((g, i) => {
    const odds = formatOddsForPrompt(g);
    return `GAME ${i + 1}: ${g.home_team} vs ${g.away_team}\nTime: ${g.commence_time}\nOdds:\n${odds}`;
  }).join('\n\n');

  // Fetch ESPN context (Change 2)
  const uniqueKeys = [...new Set(selectedGames.map((g) => g.sport_key))];
  const espnContext = await fetchESPNContext(uniqueKeys);

  // Performance feedback (Change 4)
  const feedback = await getPerformanceFeedback(supabase);
  const feedbackBlock = formatFeedbackBlock(feedback);

  const alreadyPostedBlock = todaysPicks && todaysPicks.length > 0
    ? `\nALREADY POSTED TODAY — do NOT recommend the same game + bet type combination again:\n${todaysPicks.map((p) => `- ${p.game}: ${p.pick}`).join("\n")}\n`
    : "";

  const pickTypeInstruction = pickTypeHint === "foundation"
    ? `PICK TYPE: FOUNDATION 🛡️
Include at least 1-2 FOUNDATION picks — these are heavy favorites (moneyline -200 to -350 range) where one team has a clear, data-backed edge.
Foundation picks should be the safest bets of the day. Mark them with "pickType": "foundation".
- Only select where you assess >75% win probability.
- Target heavy favorites, dominant form, or lopsided matchups.
- Odds should be in the -200 to -350 range (moneyline favorites only).
- The goal is WINNING, not ROI. Safe plays that pad the record.`
    : `PICK TYPE: VALUE 💎
You are selecting VALUE picks. Value picks target analytical edges where odds are mispriced.
- Find genuine value — where the true probability exceeds what the odds imply.
- Look for reverse line movement, CLV edges, sharp-vs-public divergence.
- These picks should have a real analytical basis, not just gut feeling.
- Mark with "pickType": "value".`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    messages: [
      {
        role: "user",
        content: `${getBrandPromptRules()}

You are an expert sports analyst writing for Sharkline. Write in first person plural ("we"). Sound like a team of analysts who watch every game.

Here is today's REAL schedule and team data from ESPN (current as of today — use this, do NOT rely on memory):
${espnContext}
${feedbackBlock}

${BET_TYPE_RULES}

${pickTypeInstruction}
${alreadyPostedBlock}

Here are the games to analyze:

${gamesBlock}

Generate 10 candidate picks across these games. Rate honestly — a 60-65 confidence pick with strong data backing is still worth publishing. We will filter down to the best 2-3, so include a range of confidence levels.

You must also rate each scoring factor from 0-100 based on your analysis.

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "game": "Home Team vs Away Team",
    "pick": "Team Name -3.5",
    "odds": "-110",
    "bookmaker": "best bookmaker from the odds above",
    "pickType": "${pickTypeHint}",
    "confidence": 72,
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
]

RULES:
- Use REAL odds from the games above. Pick the best value line.
- You may suggest multiple picks from the same game (e.g., moneyline + total).
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
  if (!textBlock || textBlock.type !== "text") return [];

  const jsonStr = textBlock.text.trim();
  const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let candidates: ClaudeCandidate[];
  try {
    candidates = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  if (!Array.isArray(candidates)) return [];

  // ── Filter candidates ──

  const gameMap = new Map(selectedGames.map((g) => [`${g.home_team} vs ${g.away_team}`, g]));

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
    const game = gameMap.get(cand.game);
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

  // Determine which candidates to use
  let selectedCandidates = allScored.filter((s) => s.passedFilter);

  // Zero-pick fallback: if nothing passed, take top 2 by confidence regardless
  if (selectedCandidates.length === 0 && allScored.length > 0) {
    console.log(`   ⚠️ ZERO-PICK FALLBACK: No candidates passed filter. Taking top 2 by confidence.`);
    const sorted = [...allScored].sort((a, b) => b.scoring.confidence - a.scoring.confidence);
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
    html += `${emoji} <b>${league}</b>\n`;
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
    html += `🦈 Sharkline — sharkline.ai #SharkMethod`;

    cards.push({
      sport: league,
      sport_key: game.sport_key,
      league,
      game: `${game.home_team} vs ${game.away_team}`,
      game_id: game.id,
      game_time: game.commence_time,
      pick: cand.pick,
      odds: cand.odds,
      bookmaker: cand.bookmaker,
      pickType: effectivePickType,
      confidence: scoring.confidence,
      tier,
      stake: tier.stake,
      scoring,
      analysis: cand.analysis,
      stats_line: statsLine,
      telegram_html: html,
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
  "bookmaker": "best bookmaker",
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
  html += `🦈 Sharkline — sharkline.ai #SharkMethod`;

  return {
    sport: league, sport_key: sportKey, league,
    game: `${game.home_team} vs ${game.away_team}`,
    game_id: game.id, game_time: game.commence_time,
    pick: parsed.pick, odds: parsed.odds, bookmaker: parsed.bookmaker,
    pickType: effectivePickType, confidence: scoring.confidence,
    tier, stake: tier.stake, scoring, analysis: parsed.analysis,
    stats_line: statsLine, telegram_html: html,
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
