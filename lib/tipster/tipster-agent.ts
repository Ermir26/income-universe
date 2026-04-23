// Upgraded Tipster Agent — Sharkline
// Orchestrates: Odds API → Claude analysis → Scoring Engine → Tier Filter → Analysis Cards → Telegram

import { type SupabaseClient } from "@supabase/supabase-js";
import { getTier, MIN_CONFIDENCE } from "./tiers";
import { calculateConfidence, loadWeights, type ScoringWeights } from "./scoring-engine";
import { generateCandidates, generateAnalysisCard, formatWinnerMessage, TRUSTED_BOOKS, type AnalysisCard, type GameData } from "./analysis-card";
import { recordBet } from "./bankroll";
import { hashPick, timestampOnChain, getPolygonScanUrl } from "./blockchain";
import { enforceSportSafety } from "./safety";
import { getActiveSportKeys, SPORT_CATEGORY_KEYS } from "./brand";
import { getEstimatedDurationMinutes, SETTLEMENT_GRACE_MINUTES, SPORT_KEY_TO_ESPN } from "../sports-data/espn-leagues";
import { crossCheckWithPinnacle } from "./pinnacle-cross-check";
import { sendAdminAlert } from "../integrations/telegram";

/** Parse pick string into structured bet fields */
function parseBetFields(pickStr: string, game: string): { bet_type: string; line: number | null; side: string } {
  const trimmed = pickStr.trim();
  // F5 (First 5 Innings) totals — e.g. "F5 Over 4.5", "F5 Under 5.0"
  const f5Match = trimmed.match(/^F5\s+(Over|Under)\s+([\d.]+)$/i);
  if (f5Match) {
    return { bet_type: "f5_total", line: parseFloat(f5Match[2]), side: f5Match[1].toLowerCase() };
  }
  const ouMatch = trimmed.match(/^(Over|Under)\s+([\d.]+)$/i);
  if (ouMatch) {
    return { bet_type: "total", line: parseFloat(ouMatch[2]), side: ouMatch[1].toLowerCase() };
  }
  if (trimmed.toLowerCase() === "draw") {
    return { bet_type: "draw", line: null, side: "draw" };
  }
  const spreadMatch = trimmed.match(/^(.+?)\s+([+-][\d.]+)$/);
  if (spreadMatch && Math.abs(parseFloat(spreadMatch[2])) <= 20) {
    const team = spreadMatch[1].trim().toLowerCase();
    const [home] = game.split(" vs ").map((t) => t.trim().toLowerCase());
    const isHome = home.includes(team) || team.includes(home);
    return { bet_type: "spread", line: parseFloat(spreadMatch[2]), side: isHome ? "home" : "away" };
  }
  // Moneyline (plain name, "Name ML", or "Name +175" where +175 is odds not spread)
  const teamName = trimmed.replace(/\s+ML$/, "").replace(/\s+[+-]\d{3,}$/, "").trim().toLowerCase();
  const [home] = game.split(" vs ").map((t) => t.trim().toLowerCase());
  const isHome = home.includes(teamName) || teamName.includes(home);
  return { bet_type: "moneyline", line: null, side: isHome ? "home" : "away" };
}

/** Compute settlement scheduling fields for a pick insert */
function settlementFields(sportKey: string, gameTime: string) {
  const kickoff = new Date(gameTime);
  const durationMin = getEstimatedDurationMinutes(sportKey);
  const estimatedEnd = new Date(kickoff.getTime() + durationMin * 60_000);
  const checkTime = new Date(estimatedEnd.getTime() + SETTLEMENT_GRACE_MINUTES * 60_000);
  const espn = SPORT_KEY_TO_ESPN[sportKey];
  return {
    estimated_end_time: estimatedEnd.toISOString(),
    settlement_check_time: checkTime.toISOString(),
    settle_retry_count: 0,
    league_slug: espn ? `${espn.sport}/${espn.league}` : null,
  };
}

// ─── ESPN Free API Fallback (no key, no quota) ───

const ESPN_SPORT_MAP: Record<string, string> = {
  soccer_epl: "soccer/eng.1",
  soccer_spain_la_liga: "soccer/esp.1",
  soccer_italy_serie_a: "soccer/ita.1",
  soccer_germany_bundesliga: "soccer/ger.1",
  soccer_france_ligue_one: "soccer/fra.1",
  soccer_usa_mls: "soccer/usa.1",
  soccer_uefa_champs_league: "soccer/uefa.champions",
  basketball_nba: "basketball/nba",
  icehockey_nhl: "hockey/nhl",
  baseball_mlb: "baseball/mlb",
  americanfootball_nfl: "football/nfl",
  mma_mixed_martial_arts: "mma/ufc",
};

// ─── Sport Configuration ───

const SPORT_KEYS = [
  // Soccer
  "soccer_epl", "soccer_spain_la_liga", "soccer_italy_serie_a",
  "soccer_germany_bundesliga", "soccer_france_ligue_one",
  "soccer_uefa_champs_league", "soccer_usa_mls",
  // Basketball
  "basketball_nba",
  // Ice Hockey
  "icehockey_nhl",
  // American Football
  "americanfootball_nfl",
  // Baseball
  "baseball_mlb",
  // Tennis
  "tennis_atp_monte_carlo_masters",
  "tennis_atp_french_open", "tennis_atp_wimbledon",
  "tennis_wta_french_open", "tennis_wta_wimbledon",
  // Combat
  "mma_mixed_martial_arts",
];

// Group sports by timeslot
export const SPORT_GROUPS: Record<string, string[]> = {
  european_soccer: [
    "soccer_epl", "soccer_spain_la_liga", "soccer_italy_serie_a",
    "soccer_germany_bundesliga", "soccer_france_ligue_one",
    "soccer_uefa_champs_league",
  ],
  nba_nhl: ["basketball_nba", "icehockey_nhl"],
  tennis_mlb: [
    "tennis_atp_monte_carlo_masters",
    "tennis_atp_french_open", "tennis_atp_wimbledon",
    "tennis_wta_french_open", "tennis_wta_wimbledon",
    "baseball_mlb",
  ],
  afternoon_soccer: ["soccer_usa_mls"],
  evening: SPORT_KEYS, // all sports — catches remaining games
};

interface TipsterConfig {
  oddsApiKey: string;
  anthropicApiKey: string;
  telegramBotToken: string;
  telegramChannelId: string;
  vipChannelId?: string;
  methodChannelId?: string;
  supabase: SupabaseClient;
  sportKeys?: string[];
  minHoursAhead?: number;
  paperMode?: boolean; // If true, log picks but don't send to Telegram
  maxPicks?: number; // Cap total picks per run (top N by confidence)
  maxExposureUnits?: number; // Remaining exposure budget in units (6u cap minus already exposed)
  existingEventIds?: Set<string>; // Skip duplicates for these event IDs
  todaysPicks?: { game: string; pick: string }[]; // Already-posted picks today (cross-run dedup)
  pausedSports?: string[]; // Sports paused by system status (no picks)
  cautionSports?: string[]; // Sports on caution (stakes halved)
}

export interface TipsterResult {
  gamesFound: number;
  cardsGenerated: number;
  picksSent: number;
  cards: AnalysisCard[];
  skippedLowConfidence?: number;
  skippedDuplicates?: number;
  skippedExposure?: number;
  postedFree?: number;
  postedVip?: number;
  postedMethod?: number;
}

/**
 * Fetch upcoming games from The Odds API, with ESPN free API fallback.
 * Falls back to ESPN when Odds API fails (e.g. quota exhausted, 401).
 */
export async function fetchUpcomingGames(
  apiKey: string,
  sportKeys: string[] = SPORT_KEYS,
  hoursAhead: number = 24,
): Promise<GameData[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  const allGames: GameData[] = [];
  const failedSportKeys: string[] = [];

  // Step 1: Try Odds API first
  const results = await Promise.allSettled(
    sportKeys.map(async (sportKey) => {
      const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401 || res.status === 429) {
          console.log(`   ⚠️ Odds API ${res.status} for ${sportKey} — will try ESPN`);
        }
        failedSportKeys.push(sportKey);
        return [];
      }
      const remaining = res.headers.get("x-requests-remaining");
      if (remaining) console.log(`   Odds API quota remaining: ${remaining}`);
      const games = await res.json();
      return (games as GameData[]).map((g) => ({ ...g, sport_key: sportKey }));
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled" && Array.isArray(result.value)) {
      allGames.push(...result.value);
    } else if (result.status === "rejected") {
      // Network error — all keys likely affected
    }
  }

  // Step 2: ESPN fallback for failed sport keys
  if (failedSportKeys.length > 0) {
    console.log(`   📡 ESPN fallback for ${failedSportKeys.length} sports: ${failedSportKeys.join(", ")}`);
    const espnGames = await fetchUpcomingGamesFromESPN(failedSportKeys, hoursAhead);
    console.log(`   📡 ESPN returned ${espnGames.length} games`);
    allGames.push(...espnGames);
  }

  console.log(`   Total games before filter: ${allGames.length}, cutoff: ${cutoff.toISOString()}`);

  // Deduplicate and filter to upcoming only (30-min buffer — no games starting within 30 minutes)
  const BUFFER_MS = 30 * 60 * 1000;
  const minStart = new Date(now.getTime() + BUFFER_MS);
  const seen = new Set<string>();
  return allGames
    .filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      const gameTime = new Date(g.commence_time);
      return gameTime > minStart && gameTime < cutoff;
    })
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
}

/**
 * ESPN free API — fetch upcoming games with odds (no key, no quota).
 * Returns data in the same GameData format as The Odds API.
 */
// ESPN provider names discovered at runtime — added to TRUSTED_BOOKS dynamically
const espnProviderNames = new Set<string>();

async function fetchUpcomingGamesFromESPN(
  sportKeys: string[],
  hoursAhead: number = 24,
): Promise<GameData[]> {
  const allGames: GameData[] = [];
  const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
  // Also check tomorrow for late-night games
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0].replace(/-/g, "");

  for (const sportKey of sportKeys) {
    const espnPath = ESPN_SPORT_MAP[sportKey];
    if (!espnPath) {
      console.log(`   ⚠️ No ESPN mapping for ${sportKey} — skipping`);
      continue;
    }

    for (const dateStr of [today, tomorrow]) {
      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard?dates=${dateStr}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(10000),
          cache: "no-store",
        });

        if (!res.ok) {
          console.log(`   ⚠️ ESPN ${res.status} for ${espnPath} date=${dateStr}`);
          continue;
        }
        const data = await res.json();
        const events = data.events || [];

        for (const event of events) {
          const comp = event.competitions?.[0];
          if (!comp) continue;

          const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "home");
          const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "away");
          if (!home || !away) continue;

          // Skip completed games
          if (event.status?.type?.completed) continue;

          const homeName: string = home.team?.displayName || "";
          const awayName: string = away.team?.displayName || "";
          const oddsData = comp.odds?.[0];

          // Build bookmaker data from ESPN odds
          // ESPN has two response formats: flat (homeTeamOdds.moneyLine) and nested (moneyline.home.close.odds)
          // We try nested first (current ESPN format), then flat as fallback
          const bookmakers: GameData["bookmakers"] = [];
          if (oddsData) {
            const markets: Array<{ key: string; outcomes: Array<{ name: string; price: number; point?: number }> }> = [];
            const ml = oddsData.moneyline;
            const ps = oddsData.pointSpread;
            const tot = oddsData.total;

            // Moneyline — nested structure: moneyline.home.close.odds / moneyline.away.close.odds
            const homeML = ml?.home?.close?.odds ?? ml?.home?.open?.odds ?? oddsData.homeTeamOdds?.moneyLine;
            const awayML = ml?.away?.close?.odds ?? ml?.away?.open?.odds ?? oddsData.awayTeamOdds?.moneyLine;
            if (homeML && awayML) {
              const outcomes: Array<{ name: string; price: number; point?: number }> = [
                { name: homeName, price: parseFloat(homeML) },
                { name: awayName, price: parseFloat(awayML) },
              ];
              // Draw (soccer)
              const drawML = ml?.draw?.close?.odds ?? ml?.draw?.open?.odds ?? oddsData.drawOdds?.moneyLine;
              if (drawML) {
                outcomes.push({ name: "Draw", price: parseFloat(drawML) });
              }
              markets.push({ key: "h2h", outcomes });
            }

            // Spread — nested: pointSpread.home.close.line / pointSpread.home.close.odds
            const homeSpreadLine = ps?.home?.close?.line ?? ps?.home?.open?.line;
            const homeSpreadOdds = ps?.home?.close?.odds ?? ps?.home?.open?.odds ?? oddsData.homeTeamOdds?.spreadOdds;
            const awaySpreadLine = ps?.away?.close?.line ?? ps?.away?.open?.line;
            const awaySpreadOdds = ps?.away?.close?.odds ?? ps?.away?.open?.odds ?? oddsData.awayTeamOdds?.spreadOdds;
            if (homeSpreadLine && homeSpreadOdds) {
              markets.push({
                key: "spreads",
                outcomes: [
                  { name: homeName, price: parseFloat(homeSpreadOdds), point: parseFloat(homeSpreadLine) },
                  { name: awayName, price: parseFloat(awaySpreadOdds || homeSpreadOdds), point: parseFloat(awaySpreadLine || String(-parseFloat(homeSpreadLine))) },
                ],
              });
            }

            // Totals — nested: total.over.close.line / total.over.close.odds
            const overLine = tot?.over?.close?.line ?? tot?.over?.open?.line;
            const overOdds = tot?.over?.close?.odds ?? tot?.over?.open?.odds ?? oddsData.overOdds;
            const underLine = tot?.under?.close?.line ?? tot?.under?.open?.line;
            const underOdds = tot?.under?.close?.odds ?? tot?.under?.open?.odds ?? oddsData.underOdds;
            const totalLine = overLine ?? (oddsData.overUnder ? String(oddsData.overUnder) : null);
            if (totalLine && overOdds) {
              // ESPN total lines come as "o2.5" or "u2.5" — strip the prefix
              const parseTotalLine = (v: string) => parseFloat(v.replace(/^[ou]/i, ""));
              markets.push({
                key: "totals",
                outcomes: [
                  { name: "Over", price: parseFloat(overOdds), point: parseTotalLine(totalLine) },
                  { name: "Under", price: parseFloat(underOdds || overOdds), point: parseTotalLine(underLine || totalLine) },
                ],
              });
            }

            if (markets.length > 0) {
              const providerName = oddsData.provider?.name || "ESPN BET";
              bookmakers.push({ key: "espn", title: providerName, markets });
              // Ensure ESPN provider name is in TRUSTED_BOOKS for validator
              espnProviderNames.add(providerName);
            }
          }

          allGames.push({
            id: `espn_${event.id}`,
            sport_key: sportKey,
            sport_title: sportKey,
            home_team: homeName,
            away_team: awayName,
            commence_time: event.date || comp.date,
            bookmakers,
          } as GameData);
        }
      } catch {
        // ESPN is best-effort
      }
    }
  }

  // Register ESPN provider names in TRUSTED_BOOKS so validator accepts them
  for (const name of espnProviderNames) {
    TRUSTED_BOOKS.add(name);
  }

  console.log(`   📡 ESPN: ${allGames.length} upcoming games (${allGames.filter((g) => (g.bookmakers?.length ?? 0) > 0).length} with odds)`);
  return allGames;
}

/**
 * Main tipster run: fetch games → analyze → score → filter → send.
 */
export async function runTipster(config: TipsterConfig): Promise<TipsterResult> {
  const {
    oddsApiKey, anthropicApiKey, telegramBotToken, telegramChannelId,
    vipChannelId, methodChannelId, supabase, sportKeys, minHoursAhead = 24, paperMode = false,
    maxPicks, maxExposureUnits, existingEventIds, todaysPicks, pausedSports = [], cautionSports = [],
  } = config;

  // Filter to active sports only
  const activeSportKeys = getActiveSportKeys();
  const requestedKeys = sportKeys ?? SPORT_KEYS;
  const filteredKeys = requestedKeys.filter((k) => activeSportKeys.includes(k));

  if (filteredKeys.length === 0) {
    console.log(`   No active sports in requested set — skipping`);
    return { gamesFound: 0, cardsGenerated: 0, picksSent: 0, cards: [] };
  }

  // Step 0: Safety check — check each sport category for health
  const liveSportKeys: string[] = [];
  const paperSportKeys: string[] = [];

  for (const [category, keys] of Object.entries(SPORT_CATEGORY_KEYS)) {
    const relevantKeys = filteredKeys.filter((k) => keys.includes(k));
    if (relevantKeys.length === 0) continue;

    const safety = await enforceSportSafety(supabase, category);
    if (safety.live) {
      liveSportKeys.push(...relevantKeys);
    } else if (safety.paper) {
      paperSportKeys.push(...relevantKeys);
    }
  }

  const allKeys = [...liveSportKeys, ...paperSportKeys];
  if (allKeys.length === 0) {
    console.log(`   All requested sports are paused — skipping`);
    return { gamesFound: 0, cardsGenerated: 0, picksSent: 0, cards: [] };
  }

  // Step 1: Fetch upcoming games
  const games = await fetchUpcomingGames(oddsApiKey, allKeys, minHoursAhead);
  console.log(`   Found ${games.length} upcoming games`);

  if (games.length === 0) {
    return { gamesFound: 0, cardsGenerated: 0, picksSent: 0, cards: [] };
  }

  // Build game lookup by event_id for cross-check + decision log
  const gameById = new Map<string, GameData>();
  for (const g of games) gameById.set(g.id, g);

  // Pinnacle cross-check enabled flag + scraper failure counter
  const pinnacleEnabled = process.env.PINNACLE_CROSSCHECK_ENABLED !== "false";
  let pinnacleScraperFailures = 0;

  // Step 2: Generate candidates using multi-game batch analysis
  // Generate 10 candidates per batch, filter to top picks (generate more, publish less).
  // Foundation picks are always attempted separately (at least 1).
  const effectiveMax = maxPicks ?? 5;
  const foundationTarget = Math.max(1, Math.floor(effectiveMax / 3)); // always at least 1
  const valueTarget = effectiveMax - foundationTarget;

  const cards: AnalysisCard[] = [];
  const weights = await loadWeights(supabase, games[0]?.sport_key);

  // Shuffle games so foundation and value get different games when possible
  const shuffled = [...games].sort(() => Math.random() - 0.5);

  // Always try foundation picks first (separate run — guaranteed attempt)
  const foundationGames = shuffled.slice(0, Math.min(shuffled.length, 6));
  console.log(`   🛡️ Generating foundation candidates from ${foundationGames.length} games (target: ${foundationTarget})...`);
  try {
    const foundationCandidates = await generateCandidates(
      foundationGames, anthropicApiKey, weights, "foundation", supabase, todaysPicks,
    );
    console.log(`   🛡️ Got ${foundationCandidates.length} foundation candidates, taking top ${foundationTarget}`);
    cards.push(...foundationCandidates.slice(0, foundationTarget));
  } catch (err) {
    console.log(`   Foundation generation failed: ${(err as Error).message}`);
    supabase.from('agent_logs').insert({
      agent_name: 'sharp-picks', action: 'foundation_error',
      result: JSON.stringify({ error: (err as Error).message, gamesCount: foundationGames.length }),
      revenue_generated: 0,
    }).then(() => {}, () => {});
  }

  // Generate value candidates (separate run)
  const valueGames = shuffled.slice(0, Math.min(shuffled.length, 6));
  console.log(`   💎 Generating value candidates from ${valueGames.length} games (target: ${valueTarget})...`);
  try {
    const valueCandidates = await generateCandidates(
      valueGames, anthropicApiKey, weights, "value", supabase, todaysPicks,
    );
    // Avoid duplicate games already picked by foundation
    const usedGameIds = new Set(cards.map((c) => c.game_id));
    const deduped = valueCandidates.filter((c) => !usedGameIds.has(c.game_id));
    console.log(`   💎 Got ${valueCandidates.length} value candidates (${deduped.length} after dedup), taking top ${valueTarget}`);
    cards.push(...deduped.slice(0, valueTarget));
  } catch (err) {
    console.log(`   Value generation failed: ${(err as Error).message}`);
    supabase.from('agent_logs').insert({
      agent_name: 'sharp-picks', action: 'value_error',
      result: JSON.stringify({ error: (err as Error).message, gamesCount: valueGames.length }),
      revenue_generated: 0,
    }).then(() => {}, () => {});
  }

  console.log(`   Generated ${cards.length} qualifying cards (confidence >= ${MIN_CONFIDENCE})`);

  // HARD GUARD: reject any card without an Odds API event_id OR valid game_time
  const validCards = cards.filter((c) => {
    if (!c.game_id) {
      console.log(`   ❌ REJECTED (no event_id): ${c.game} — pick will not be sent`);
      return false;
    }
    if (!c.game_time) {
      console.log(`   ❌ REJECTED (no game_time): ${c.game} — hallucination guard`);
      return false;
    }
    // Verify game_time is a valid future ISO date
    const gt = new Date(c.game_time);
    if (isNaN(gt.getTime())) {
      console.log(`   ❌ REJECTED (invalid game_time): ${c.game} — "${c.game_time}"`);
      return false;
    }
    return true;
  });

  if (validCards.length < cards.length) {
    console.log(`   ⚠️ Filtered out ${cards.length - validCards.length} cards without event_id or game_time`);
  }

  if (validCards.length === 0) {
    return { gamesFound: games.length, cardsGenerated: 0, picksSent: 0, cards: [] };
  }

  // Cross-run dedup — skip cards that match today's already-posted game+pick combos
  let skippedCrossRunDupes = 0;
  const crossRunDeduped = todaysPicks && todaysPicks.length > 0
    ? validCards.filter((c) => {
        const isDupe = todaysPicks.some(
          (tp) => tp.game === c.game && tp.pick === c.pick,
        );
        if (isDupe) {
          console.log(`   ⏭️ CROSS-RUN DUPE: ${c.game} — "${c.pick}" already posted today`);
          skippedCrossRunDupes++;
          return false;
        }
        return true;
      })
    : validCards;

  // Filter out paused sports (system status)
  let skippedPaused = 0;
  const afterPauseFilter = pausedSports.length > 0
    ? crossRunDeduped.filter((c) => {
        if (pausedSports.includes(c.sport)) {
          console.log(`   🔴 PAUSED SPORT: ${c.sport} — skipping "${c.pick}" for ${c.game}`);
          skippedPaused++;
          return false;
        }
        return true;
      })
    : crossRunDeduped;

  // Apply caution stake override (halve stakes for sports on caution)
  if (cautionSports.length > 0) {
    for (const card of afterPauseFilter) {
      if (cautionSports.includes(card.sport)) {
        const originalStake = card.stake;
        card.stake = +(card.stake * 0.5).toFixed(1);
        console.log(`   🟡 CAUTION: ${card.sport} — stake ${originalStake}u → ${card.stake}u for "${card.pick}"`);
      }
    }
  }

  // Sort by confidence descending
  afterPauseFilter.sort((a, b) => b.confidence - a.confidence);

  // Duplicate prevention — skip cards whose event_id already has a pending pick
  let skippedDuplicates = 0;
  const deduped = existingEventIds
    ? afterPauseFilter.filter((c) => {
        if (existingEventIds.has(c.game_id)) {
          console.log(`   ⏭️ DUPLICATE: ${c.game} (${c.game_id}) — already pending`);
          skippedDuplicates++;
          return false;
        }
        return true;
      })
    : crossRunDeduped;

  // MAX_PICKS cap — keep top N by confidence, log skipped
  let skippedLowConfidence = 0;
  const capped = maxPicks && deduped.length > maxPicks
    ? (() => {
        const kept = deduped.slice(0, maxPicks);
        const dropped = deduped.slice(maxPicks);
        skippedLowConfidence = dropped.length;
        for (const d of dropped) {
          console.log(`   ⏭️ CAPPED: ${d.game} (conf: ${d.confidence}) — exceeded max ${maxPicks}/day`);
        }
        // Log skipped picks to agent_logs
        supabase.from("agent_logs").insert({
          agent_name: "sharp-picks",
          action: "max_picks_cap",
          result: JSON.stringify({
            max: maxPicks,
            kept: kept.length,
            dropped: dropped.map((d) => ({ game: d.game, confidence: d.confidence, pick: d.pick })),
          }),
          revenue_generated: 0,
        }).then(() => {}, () => {});
        return kept;
      })()
    : deduped;

  if (capped.length === 0) {
    return {
      gamesFound: games.length, cardsGenerated: 0, picksSent: 0, cards: [],
      skippedDuplicates: skippedDuplicates + skippedCrossRunDupes, skippedLowConfidence,
    };
  }

  // Exposure cap — trim picks so cumulative stakes stay within the remaining budget
  let skippedExposure = 0;
  let exposureBudgetUsed = 0;
  const exposureCapped = maxExposureUnits != null
    ? capped.filter((c) => {
        if (exposureBudgetUsed + c.stake > maxExposureUnits) {
          console.log(`   🛑 EXPOSURE CAP: ${c.game} — "${c.pick}" (${c.stake}u) would exceed ${maxExposureUnits}u remaining budget (${exposureBudgetUsed}u used)`);
          skippedExposure++;
          return false;
        }
        exposureBudgetUsed += c.stake;
        return true;
      })
    : capped;

  if (exposureCapped.length === 0) {
    return {
      gamesFound: games.length, cardsGenerated: 0, picksSent: 0, cards: [],
      skippedDuplicates: skippedDuplicates + skippedCrossRunDupes, skippedLowConfidence, skippedExposure,
    };
  }

  // Replace validCards with the final filtered list
  const finalCards = exposureCapped;

  // Step 3: Blockchain-timestamp each card, then send to Telegram
  let picksSent = 0;
  let postedVip = 0;
  let postedFree = 0;

  // Warn once if blockchain is not configured — visible in Vercel logs + agent_logs
  if (!process.env.POLYGON_WALLET_PRIVATE_KEY) {
    console.warn("🚨 POLYGON_WALLET_PRIVATE_KEY not set — all picks will have tx_hash=null. Set this in Vercel env vars.");
    supabase.from("agent_logs").insert({
      agent_name: "sharp-picks",
      action: "blockchain_not_configured",
      result: JSON.stringify({ reason: "POLYGON_WALLET_PRIVATE_KEY not set", picks_affected: finalCards.length }),
      revenue_generated: 0,
    }).then(() => {}, () => {});
  }

  // Blockchain-timestamp a card. Non-blocking — failures don't stop pick delivery.
  async function blockchainTimestamp(card: AnalysisCard): Promise<{
    pick_hash: string;
    tx_hash: string | null;
    block_number: number | null;
    block_timestamp: Date | null;
    verified: boolean;
    polygonscan_url: string | null;
  }> {
    const now = new Date().toISOString();
    const pickHash = hashPick({
      sport: card.sport,
      league: card.league,
      game: card.game,
      pick: card.pick,
      odds: card.odds,
      confidence: card.confidence,
      tier: card.tier.name,
      timestamp: now,
    });

    try {
      const result = await timestampOnChain(pickHash);
      const url = getPolygonScanUrl(result.txHash);
      console.log(`   🔗 On-chain: ${url}`);
      return {
        pick_hash: pickHash,
        tx_hash: result.txHash,
        block_number: result.blockNumber,
        block_timestamp: new Date(result.timestamp * 1000),
        verified: true,
        polygonscan_url: url,
      };
    } catch (err) {
      console.log(`   ⚠️ Blockchain failed (pick will still send): ${(err as Error).message}`);
      return {
        pick_hash: pickHash,
        tx_hash: null,
        block_number: null,
        block_timestamp: null,
        verified: false,
        polygonscan_url: null,
      };
    }
  }

  // 30-minute buffer — never send a pick for a game starting within 30 minutes
  const SEND_BUFFER_MS = 30 * 60 * 1000;
  function isGameTooSoon(gameTime: string): boolean {
    const gt = new Date(gameTime);
    return gt.getTime() - Date.now() < SEND_BUFFER_MS;
  }

  // Append on-chain badge to Telegram HTML
  function appendChainBadge(html: string, chain: Awaited<ReturnType<typeof blockchainTimestamp>>, gameTime: string): string {
    if (!chain.tx_hash) return html;
    const gameDate = new Date(gameTime);
    const blockDate = chain.block_timestamp ?? new Date();
    const minsBefore = Math.max(0, Math.round((gameDate.getTime() - blockDate.getTime()) / 60000));
    const badge = `\n🔗 Verified on-chain: ${chain.polygonscan_url}\n⏱ Timestamped ${minsBefore} min before kickoff`;
    // Insert before the last line (🦈 Sharkline)
    const lines = html.split("\n");
    const lastLine = lines.pop();
    return lines.join("\n") + badge + "\n" + lastLine;
  }

  // Helper: check if a card's sport is paper-only
  function isPaperSport(card: AnalysisCard): boolean {
    return paperMode || paperSportKeys.includes(card.sport_key);
  }

  // ── Determine channel eligibility for each pick ──
  // Sort by confidence DESC (already sorted, but ensure)
  finalCards.sort((a, b) => b.confidence - a.confidence);
  const liveCards = finalCards.filter((c) => !isPaperSport(c));

  // Separate by pool
  const safeCards = liveCards.filter((c) => c.pool === "safe");
  const edgeCards = liveCards.filter((c) => c.pool === "edge" && !c.is_underdog_alert);
  const underdogCard = liveCards.find((c) => c.is_underdog_alert);

  // Channel rules — safe and edge are completely separate pools:
  //   Safe  → "free"        (FREE channel only, never VIP/Method)
  //   Edge  → "vip+method"  (VIP + Method — analysis + staking formats)
  //   Underdog → "vip"      (VIP only — too volatile for Method bankroll)
  const METHOD_MIN_CONFIDENCE = 70;

  // ── Get bankroll context for Method format ──
  let currentBankroll = 100;
  let todayExposedUnits = 0;
  if (methodChannelId) {
    try {
      const { data: bankrollData } = await supabase
        .from("bankroll_log")
        .select("balance")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (bankrollData?.balance) currentBankroll = parseFloat(bankrollData.balance);
    } catch { /* use default */ }
    try {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const { data: todayPicks } = await supabase
        .from("picks")
        .select("stake")
        .gte("sent_at", todayStart.toISOString())
        .neq("channel", "paper");
      todayExposedUnits = (todayPicks ?? []).reduce((sum, p) => sum + (parseFloat(p.stake) || 0), 0);
    } catch { /* use default */ }
  }

  let postedMethod = 0;
  const adminTelegramId = process.env.ADMIN_TELEGRAM_ID ?? "";

  // ── Step 1: Insert picks as DRAFT + send to admin DM for approval ──
  for (const card of finalCards) {
    try {
      // Paper mode: log to Supabase but don't send to Telegram
      if (isPaperSport(card)) {
        const chain = await blockchainTimestamp(card);
        await supabase.from("picks").insert({
          sport: card.sport, sport_key: card.sport_key, league: card.league,
          game: card.game, pick: card.pick, odds: card.odds, bookmaker: card.bookmaker,
          confidence: card.confidence, tier: card.tier.name, stake: card.stake,
          scoring_factors: card.scoring.factors, scoring_weights: card.scoring.weights,
          scoring_score: card.confidence, category: card.tier.name, reasoning: card.analysis,
          channel: "paper", status: "pending", sent_at: new Date().toISOString(),
          method_eligible: card.confidence >= METHOD_MIN_CONFIDENCE,
          game_time: card.game_time, event_id: card.game_id,
          pool: card.pool,
          is_sharpest: card.is_sharpest,
          is_underdog_alert: card.is_underdog_alert,
          ...parseBetFields(card.pick, card.game),
          ...settlementFields(card.sport_key, card.game_time),
          pick_hash: chain.pick_hash, tx_hash: chain.tx_hash,
          block_number: chain.block_number,
          block_timestamp: chain.block_timestamp?.toISOString() ?? null,
          verified: chain.verified,
        });
        console.log(`   📝 PAPER: ${card.tier.emoji} ${card.sport} ${card.game}`);
        continue;
      }

      // 30-minute time guard — skip if game starts too soon
      if (isGameTooSoon(card.game_time)) {
        console.log(`   ⏰ SKIPPED (game too soon): ${card.game} starts at ${card.game_time}`);
        // Log decision
        await supabase.from("pick_decision_log").insert({
          game_id: card.game_id, sport: card.sport_key, game: card.game,
          pick: card.pick, odds: card.odds, bookmaker: card.bookmaker,
          confidence: card.confidence,
          final_decision: "rejected_time_guard",
          rejection_reason: "Game starts within 30 minutes",
        }).then(() => {}, () => {});
        continue;
      }

      // ── Pinnacle cross-check (Phase 3) ──
      const sourceGame = gameById.get(card.game_id);
      const betFields = parseBetFields(card.pick, card.game);
      const citedPrice = parseInt(card.odds, 10);

      if (pinnacleEnabled && sourceGame) {
        const [home, away] = card.game.split(" vs ").map((t) => t.trim());
        const crossCheck = await crossCheckWithPinnacle(
          supabase,
          card.game_id,
          card.sport_key,
          home,
          away,
          card.game_time,
          betFields.bet_type,
          betFields.side,
          card.bookmaker,
          betFields.line,
          isNaN(citedPrice) ? 0 : citedPrice,
        );

        if (crossCheck.result === "veto") {
          console.log(`   🚫 PINNACLE VETO: ${card.game} — ${crossCheck.reason}`);
          await supabase.from("pick_decision_log").insert({
            game_id: card.game_id, sport: card.sport_key, game: card.game,
            pick: card.pick, odds: card.odds, bookmaker: card.bookmaker,
            confidence: card.confidence,
            odds_api_payload: sourceGame,
            cross_check_result: "veto",
            final_decision: "rejected_pinnacle",
            rejection_reason: crossCheck.reason,
          }).then(() => {}, () => {});
          await sendAdminAlert(
            `[Sharkline alert] <b>PINNACLE VETO</b>\n` +
            `Game: ${card.game}\n` +
            `Pick: ${card.pick} @ ${card.odds} (${card.bookmaker})\n` +
            `Reason: ${crossCheck.reason}`,
          );
          continue;
        }

        if (crossCheck.result === "scraper_failed") {
          pinnacleScraperFailures++;
          console.log(`   ⚠️ Pinnacle scraper failed for ${card.game} — continuing (fail-open)`);
        }
      }

      // Blockchain timestamp before saving
      const chain = await blockchainTimestamp(card);

      // Channel assignment — pools never overlap between free and VIP/Method
      let channel: string;
      if (card.pool === "safe") {
        channel = "free";
      } else if (card.is_underdog_alert) {
        channel = "vip";
      } else {
        channel = "vip+method";
      }

      // Insert as DRAFT — admin must approve before publishing
      const { data: row } = await supabase.from("picks").insert({
        sport: card.sport, sport_key: card.sport_key, league: card.league,
        game: card.game, pick: card.pick, odds: card.odds, bookmaker: card.bookmaker,
        confidence: card.confidence, tier: card.tier.name, stake: card.stake,
        scoring_factors: card.scoring.factors, scoring_weights: card.scoring.weights,
        scoring_score: card.confidence, category: card.tier.name, reasoning: card.analysis,
        channel, status: "draft", sent_at: new Date().toISOString(),
        method_eligible: card.confidence >= METHOD_MIN_CONFIDENCE || card.tier.name === "FOUNDATION",
        game_time: card.game_time, event_id: card.game_id,
        pool: card.pool,
        is_sharpest: card.is_sharpest,
        is_underdog_alert: card.is_underdog_alert,
        ...betFields,
        ...settlementFields(card.sport_key, card.game_time),
        edge_percentage: card.scoring.breakdown.odds_value ?? null,
        pick_hash: chain.pick_hash, tx_hash: chain.tx_hash,
        block_number: chain.block_number,
        block_timestamp: chain.block_timestamp?.toISOString() ?? null,
        verified: chain.verified,
      }).select("id").single();

      // Log successful pick decision
      await supabase.from("pick_decision_log").insert({
        game_id: card.game_id, sport: card.sport_key, game: card.game,
        pick: card.pick, odds: card.odds, bookmaker: card.bookmaker,
        confidence: card.confidence,
        odds_api_payload: sourceGame ?? null,
        validator_result: card.validator_corrected ? "corrected" : "pass",
        validator_correction: card.validator_corrected ?? null,
        cross_check_result: pinnacleEnabled ? "pass" : "skipped",
        final_decision: "published",
        pick_id: row?.id ?? null,
      }).then(() => {}, () => {});

      // Alert admin on validator auto-correction
      if (card.validator_corrected) {
        await sendAdminAlert(
          `[Sharkline alert] <b>BOOKMAKER AUTO-CORRECTED</b>\n` +
          `Game: ${card.game}\n` +
          `Pick: ${card.pick} @ ${card.odds}\n` +
          `Claude said: ${card.original_bookmaker}\n` +
          `Corrected to: ${card.bookmaker}\n` +
          `Reason: ${card.original_bookmaker} does not offer this line in the odds payload`,
        );
      }

      if (row?.id) {
        await recordBet(supabase, row.id, card.stake);
      }

      // Send draft to admin DM for approval
      if (adminTelegramId && telegramBotToken && row?.id) {
        const emoji = getSportEmoji(card.sport_key);
        const gameTime = new Date(card.game_time);
        const kickoff = formatKickoffTime(card.game_time);
        const poolLabel = card.pool === "safe" ? "🛡️ SAFE" : "⚡ EDGE";
        const sharpLabel = card.is_sharpest ? " | 🎯 SHARPEST" : "";
        const underdogLabel = card.is_underdog_alert ? " | 🐕 UNDERDOG" : "";

        const adminMsg =
          `📋 <b>DRAFT #${row.id}</b>\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `${emoji} ${card.league} | ${poolLabel}${sharpLabel}${underdogLabel}\n` +
          `${card.game}\n` +
          `⏰ ${kickoff}\n` +
          `Pick: <b>${card.pick}</b> @ ${card.odds}\n` +
          `Confidence: ${card.confidence}% | Tier: ${card.tier.name}\n` +
          `Stake: ${card.stake}u\n\n` +
          `📊 ${card.analysis}\n\n` +
          `Channel: ${channel}\n\n` +
          `✅ <code>approve ${row.id}</code>\n` +
          `❌ <code>reject ${row.id}</code>\n` +
          `✏️ <code>edit ${row.id} odds 1.95</code>`;

        try {
          await sendTelegramHtml(adminMsg, telegramBotToken, adminTelegramId);
          console.log(`   📋 DRAFT #${row.id}: ${card.tier.emoji} ${card.sport} ${card.game} → admin DM`);
        } catch (err) {
          console.log(`   Admin DM failed for #${row.id}: ${(err as Error).message}`);
        }
      }

      picksSent++;
    } catch (err) {
      console.log(`   Pick insert failed: ${(err as Error).message}`);
    }
  }

  // ── Alert if Pinnacle scraper failed too many times ──
  if (pinnacleScraperFailures > 3) {
    await sendAdminAlert(
      `[Sharkline alert] <b>PINNACLE SCRAPER DEGRADED</b>\n` +
      `${pinnacleScraperFailures} scraper failures in this cron run.\n` +
      `Picks were allowed through (fail-open) but Pinnacle veto was not available.`,
    );
  }

  // ── Send admin summary with bulk actions ──
  if (adminTelegramId && telegramBotToken && picksSent > 0) {
    try {
      const summary =
        `📊 <b>${picksSent} DRAFTS READY</b>\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `Safe: ${safeCards.filter((c) => !isGameTooSoon(c.game_time)).length} | ` +
        `Edge: ${edgeCards.filter((c) => !isGameTooSoon(c.game_time)).length}\n\n` +
        `Bulk actions:\n` +
        `✅ <code>approve all</code>\n` +
        `❌ <code>reject all</code>`;
      await sendTelegramHtml(summary, telegramBotToken, adminTelegramId);
    } catch { /* non-critical */ }
  }

  // Log to agent_logs
  await supabase.from("agent_logs").insert({
    agent_name: "sharp-picks",
    action: "tipster_run",
    result: JSON.stringify({
      games_found: games.length,
      cards_generated: finalCards.length,
      picks_sent: picksSent,
      posted_vip: postedVip,
      posted_free: postedFree,
      posted_method: postedMethod,
      skipped_duplicates: skippedDuplicates + skippedCrossRunDupes,
      skipped_low_confidence: skippedLowConfidence,
      tiers: {
        FOUNDATION: finalCards.filter((c) => c.tier.name === "FOUNDATION").length,
        VALUE: finalCards.filter((c) => c.tier.name === "VALUE").length,
        STRONG_VALUE: finalCards.filter((c) => c.tier.name === "STRONG VALUE").length,
        MAXIMUM: finalCards.filter((c) => c.tier.name === "MAXIMUM").length,
      },
    }),
    revenue_generated: 0,
  });

  return {
    gamesFound: games.length,
    cardsGenerated: finalCards.length,
    picksSent,
    postedVip,
    postedFree,
    postedMethod,
    skippedDuplicates: skippedDuplicates + skippedCrossRunDupes,
    skippedLowConfidence,
    skippedExposure,
    cards: finalCards,
  };
}

// ─── Telegram Helpers ───

async function sendTelegramHtml(html: string, botToken: string, chatId: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: html,
      parse_mode: "HTML",
    }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(data.description);
  return String(data.result.message_id);
}

// ─── Chain Badge (used by both runTipster and publishApprovedPick) ───

interface ChainInfo {
  pick_hash: string;
  tx_hash: string | null;
  block_number: number | null;
  block_timestamp: Date | null;
  verified: boolean;
  polygonscan_url?: string | null;
}

function appendChainBadgeToHtml(html: string, chain: ChainInfo, gameTime: string): string {
  if (!chain.tx_hash) return html;
  const gameDate = new Date(gameTime);
  const blockDate = chain.block_timestamp ?? new Date();
  const minsBefore = Math.max(0, Math.round((gameDate.getTime() - blockDate.getTime()) / 60000));
  const url = chain.polygonscan_url ?? (chain.tx_hash ? getPolygonScanUrl(chain.tx_hash) : "");
  const badge = `\n🔗 Verified on-chain: ${url}\n⏱ Timestamped ${minsBefore} min before kickoff`;
  const lines = html.split("\n");
  const lastLine = lines.pop();
  return lines.join("\n") + badge + "\n" + lastLine;
}

// ─── Format Functions (per channel) ───

const SPORT_EMOJI: Record<string, string> = {
  basketball_nba: "🏀",
  soccer_epl: "⚽", soccer_spain_la_liga: "⚽", soccer_uefa_champs_league: "⚽",
  soccer_italy_serie_a: "⚽", soccer_germany_bundesliga: "⚽",
  soccer_france_ligue_one: "⚽", soccer_usa_mls: "⚽",
  icehockey_nhl: "🏒", americanfootball_nfl: "🏈", baseball_mlb: "⚾",
  mma_mixed_martial_arts: "🥊",
};

function getSportEmoji(sportKey: string): string {
  return SPORT_EMOJI[sportKey] ?? "🏅";
}

function formatFullDate(gameTime: string): string {
  const dt = new Date(gameTime);
  return dt.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function formatKickoffTime(gameTime: string): string {
  const dt = new Date(gameTime);
  const utc = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC";
  const est = dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " EST";
  return `${utc} / ${est}`;
}

// ── FREE CHANNEL: minimal, teaser, conversion-focused ──
function formatFree(card: AnalysisCard): string {
  const emoji = getSportEmoji(card.sport_key);
  let html = `🦈 <b>FREE PICK</b>\n`;
  html += `📅 ${formatFullDate(card.game_time)}\n\n`;
  html += `${emoji} ${card.league}\n`;
  html += `${card.game}\n`;
  html += `⏰ ${formatKickoffTime(card.game_time)}\n`;
  html += `Pick: <b>${card.pick}</b> @ ${card.odds}\n\n`;
  html += `Result posted after the game.\n`;
  html += `🦈 Sharkline`;
  return html;
}

// Free channel daily batch (safe picks only — no edge reveals)
function formatFreeBatch(safeCards: AnalysisCard[], edgeCount: number): string {
  const dateStr = safeCards.length > 0 ? formatFullDate(safeCards[0].game_time) : formatFullDate(new Date().toISOString());
  let html = `🦈 <b>FREE PICKS</b> — ${dateStr}\n\n`;

  for (const card of safeCards) {
    html += `🛡️ <b>FOUNDATION</b>\n`;
    html += `${card.game} — <b>${card.pick}</b> @ ${card.odds}\n\n`;
  }

  if (edgeCount > 0) {
    html += `💎 VIP has ${edgeCount} edge plays today → sharkline.ai\n`;
  }
  html += `🦈 Sharkline`;
  return html;
}

// ── VIP CHANNEL: full analysis, the sharp edge ──
function formatVip(card: AnalysisCard): string {
  const emoji = getSportEmoji(card.sport_key);
  let html = "";

  if (card.is_sharpest) {
    html += `🎯 <b>TODAY'S SHARPEST PLAY</b>\n`;
  } else {
    html += `🦈 <b>VIP EDGE PLAY</b>\n`;
  }
  html += `📅 ${formatFullDate(card.game_time)}\n\n`;
  html += `${emoji} ${card.league}\n`;
  html += `${card.game}\n`;
  html += `⏰ ${formatKickoffTime(card.game_time)}\n`;
  html += `Pick: <b>${card.pick}</b> @ ${card.odds}\n`;
  html += `Confidence: ${card.confidence}%\n`;
  html += `Tier: <b>${card.tier.name}</b>\n\n`;
  html += `📊 <b>Analysis:</b>\n`;
  html += `${card.analysis}\n\n`;
  if (card.is_sharpest) {
    html += `🔥 This is the one. Full conviction.\n`;
  }
  html += `🦈 Sharkline — on-chain before kickoff`;
  return html;
}

// VIP underdog alert format
function formatVipUnderdogAlert(card: AnalysisCard): string {
  const emoji = getSportEmoji(card.sport_key);
  let html = `🐕 <b>UNDERDOG ALERT — OPTIONAL</b>\n`;
  html += `📅 ${formatFullDate(card.game_time)}\n\n`;
  html += `${emoji} ${card.league}\n`;
  html += `${card.game}\n`;
  html += `⏰ ${formatKickoffTime(card.game_time)}\n`;
  html += `Pick: <b>${card.pick}</b> @ ${card.odds}\n`;
  html += `Confidence: ${card.confidence}%\n\n`;
  html += `📊 <b>Why this dog has value:</b>\n`;
  html += `${card.analysis}\n\n`;
  html += `⚠️ OPTIONAL high-risk/high-reward play. Standard staking does NOT apply.\n`;
  html += `Suggested: 0.5u max (half a normal unit)\n`;
  html += `Only bet this if your bankroll can absorb the loss.\n`;
  html += `🦈 Sharkline`;
  return html;
}

// ── METHOD CHANNEL: the managed system ──
function formatMethod(card: AnalysisCard, bankroll: number, exposedToday: number, systemMode?: string): string {
  const emoji = getSportEmoji(card.sport_key);
  const exposureWarning = exposedToday >= 6
    ? `\n⚠️ Exposure limit reached — no more picks today`
    : "";

  let html = `🦈 <b>SHARK METHOD</b>\n`;
  html += `📅 ${formatFullDate(card.game_time)}\n\n`;
  html += `${emoji} ${card.league}\n`;
  html += `${card.game}\n`;
  html += `⏰ ${formatKickoffTime(card.game_time)}\n`;
  html += `Pick: <b>${card.pick}</b> @ ${card.odds}\n`;
  html += `Tier: <b>${card.tier.name}</b>\n\n`;
  html += `📊 <b>STAKE:</b> ${card.stake}u\n`;
  html += `💰 Bankroll: ${bankroll.toFixed(1)}u | Exposed: ${exposedToday.toFixed(1)}/6u\n\n`;
  html += `<b>Analysis:</b>\n`;
  html += `${card.analysis}\n`;
  if (systemMode === "recovery") {
    html += `\n⚡ Recovery mode — reduced stakes active\n`;
  }
  html += `${exposureWarning}\n`;
  html += `🦈 Sharkline — on-chain before kickoff`;
  return html;
}

// ─── Admin Approval: Publish a draft pick to public channels ───

export async function publishApprovedPick(
  pickId: string,
  supabase: SupabaseClient,
  adminId: string,
): Promise<{ ok: boolean; error?: string }> {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
  const VIP_CH = process.env.TELEGRAM_VIP_CHANNEL_ID ?? process.env.VIP_CHANNEL_ID ?? "";
  const FREE_CH = process.env.TELEGRAM_CHANNEL_ID ?? "";
  const METHOD_CH = process.env.TELEGRAM_METHOD_CHANNEL_ID ?? "";

  const { data: pick, error } = await supabase
    .from("picks")
    .select("*")
    .eq("id", pickId)
    .eq("status", "draft")
    .single();

  if (error || !pick) {
    return { ok: false, error: `Pick #${pickId} not found or not in draft status` };
  }

  // Check if game starts too soon (30 min guard)
  if (pick.game_time) {
    const gameTime = new Date(pick.game_time);
    const minsUntil = (gameTime.getTime() - Date.now()) / 60000;
    if (minsUntil < 30) {
      return { ok: false, error: `Pick #${pickId}: game starts in ${Math.round(minsUntil)} min (too soon)` };
    }
  }

  // Update status to pending + mark approved
  await supabase.from("picks").update({
    status: "pending",
    approved_at: new Date().toISOString(),
    approved_by: adminId,
  }).eq("id", pickId);

  // Build a card-like object from the pick row for formatting
  const card = {
    sport: pick.sport,
    sport_key: pick.sport_key ?? "",
    league: pick.league ?? "",
    game: pick.game,
    pick: pick.pick,
    odds: pick.odds,
    bookmaker: pick.bookmaker ?? "",
    confidence: pick.confidence ?? 0,
    tier: getTier(pick.confidence ?? 0),
    stake: parseFloat(pick.stake) || 1,
    analysis: pick.reasoning ?? "",
    game_time: pick.game_time ?? new Date().toISOString(),
    game_id: pick.event_id ?? "",
    pool: pick.pool ?? "edge",
    is_sharpest: pick.is_sharpest ?? false,
    is_underdog_alert: pick.is_underdog_alert ?? false,
    scoring: { factors: pick.scoring_factors ?? {}, weights: pick.scoring_weights ?? {}, breakdown: {} },
  } as unknown as AnalysisCard;

  const channel = pick.channel ?? "vip";
  const chainInfo = {
    pick_hash: pick.pick_hash ?? "",
    tx_hash: pick.tx_hash ?? null,
    block_number: pick.block_number ?? null,
    block_timestamp: pick.block_timestamp ? new Date(pick.block_timestamp) : null,
    verified: pick.verified ?? false,
  };

  // Channel routing:
  //   "free"       → FREE channel only (minimal format)
  //   "vip"        → VIP channel only (full analysis — underdog alerts)
  //   "vip+method" → VIP (analysis) + METHOD (staking/bankroll)

  // ── Publish to FREE channel (safe picks only) ──
  if (FREE_CH && BOT_TOKEN && channel === "free") {
    try {
      const freeHtml = formatFree(card);
      await sendTelegramHtml(freeHtml, BOT_TOKEN, FREE_CH);
    } catch (err) {
      console.log(`   FREE publish failed for ${pickId}: ${(err as Error).message}`);
    }
  }

  // ── Publish to VIP channel (edge + underdog) ──
  if (VIP_CH && BOT_TOKEN && (channel === "vip" || channel === "vip+method")) {
    try {
      const vipFormatter = card.is_underdog_alert ? formatVipUnderdogAlert : formatVip;
      const vipHtml = appendChainBadgeToHtml(vipFormatter(card), chainInfo, card.game_time);
      await sendTelegramHtml(vipHtml, BOT_TOKEN, VIP_CH);
    } catch (err) {
      console.log(`   VIP publish failed for ${pickId}: ${(err as Error).message}`);
    }
  }

  // ── Publish to METHOD channel (edge picks with staking format, no underdog alerts) ──
  if (METHOD_CH && BOT_TOKEN && channel === "vip+method") {
    try {
      let bankroll = 100;
      let exposedToday = 0;
      let systemMode = "standard";
      try {
        const { data: bData } = await supabase.from("bankroll_log").select("balance").order("created_at", { ascending: false }).limit(1).single();
        if (bData?.balance) bankroll = parseFloat(bData.balance);
      } catch { /* use default */ }
      try {
        const todayStart = new Date();
        todayStart.setUTCHours(0, 0, 0, 0);
        const { data: tPicks } = await supabase.from("picks").select("stake").gte("sent_at", todayStart.toISOString()).eq("status", "pending").neq("channel", "paper");
        exposedToday = (tPicks ?? []).reduce((sum, p) => sum + (parseFloat(p.stake) || 0), 0);
      } catch { /* use default */ }
      try {
        const { data: sysStatus } = await supabase.from("system_status").select("mode").eq("id", 1).single();
        if (sysStatus?.mode) systemMode = sysStatus.mode;
      } catch { /* use default */ }

      const methodHtml = appendChainBadgeToHtml(
        formatMethod(card, bankroll, exposedToday, systemMode),
        chainInfo,
        card.game_time,
      );
      await sendTelegramHtml(methodHtml, BOT_TOKEN, METHOD_CH);
    } catch (err) {
      console.log(`   METHOD publish failed for ${pickId}: ${(err as Error).message}`);
    }
  }

  return { ok: true };
}
