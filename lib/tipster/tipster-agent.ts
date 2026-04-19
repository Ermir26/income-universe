// Upgraded Tipster Agent — Sharkline
// Orchestrates: Odds API → Claude analysis → Scoring Engine → Tier Filter → Analysis Cards → Telegram

import { type SupabaseClient } from "@supabase/supabase-js";
import { getTier, MIN_CONFIDENCE } from "./tiers";
import { calculateConfidence, loadWeights, type ScoringWeights } from "./scoring-engine";
import { generateCandidates, generateAnalysisCard, formatWinnerMessage, type AnalysisCard, type GameData } from "./analysis-card";
import { recordBet } from "./bankroll";
import { hashPick, timestampOnChain, getPolygonScanUrl } from "./blockchain";
import { enforceSportSafety } from "./safety";
import { getActiveSportKeys, SPORT_CATEGORY_KEYS } from "./brand";
import { getEstimatedDurationMinutes, SETTLEMENT_GRACE_MINUTES, SPORT_KEY_TO_ESPN } from "../sports-data/espn-leagues";

/** Parse pick string into structured bet fields */
function parseBetFields(pickStr: string, game: string): { bet_type: string; line: number | null; side: string } {
  const trimmed = pickStr.trim();
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

  // Deduplicate and filter to upcoming only
  const seen = new Set<string>();
  return allGames
    .filter((g) => {
      if (seen.has(g.id)) return false;
      seen.add(g.id);
      const gameTime = new Date(g.commence_time);
      return gameTime > now && gameTime < cutoff;
    })
    .sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());
}

/**
 * ESPN free API — fetch upcoming games with odds (no key, no quota).
 * Returns data in the same GameData format as The Odds API.
 */
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
          const bookmakers: GameData["bookmakers"] = [];
          if (oddsData) {
            const markets: Array<{ key: string; outcomes: Array<{ name: string; price: number; point?: number }> }> = [];

            // Moneyline
            if (oddsData.homeTeamOdds?.moneyLine && oddsData.awayTeamOdds?.moneyLine) {
              markets.push({
                key: "h2h",
                outcomes: [
                  { name: homeName, price: oddsData.homeTeamOdds.moneyLine },
                  { name: awayName, price: oddsData.awayTeamOdds.moneyLine },
                ],
              });
            }

            // Spread
            if (oddsData.homeTeamOdds?.spreadOdds && oddsData.spread) {
              const spread = parseFloat(oddsData.spread);
              markets.push({
                key: "spreads",
                outcomes: [
                  { name: homeName, price: oddsData.homeTeamOdds.spreadOdds, point: spread },
                  { name: awayName, price: oddsData.awayTeamOdds?.spreadOdds || -110, point: -spread },
                ],
              });
            }

            // Totals
            if (oddsData.overOdds && oddsData.overUnder) {
              markets.push({
                key: "totals",
                outcomes: [
                  { name: "Over", price: oddsData.overOdds, point: parseFloat(oddsData.overUnder) },
                  { name: "Under", price: oddsData.underOdds || -110, point: parseFloat(oddsData.overUnder) },
                ],
              });
            }

            if (markets.length > 0) {
              bookmakers.push({ key: "espn", title: oddsData.provider?.name || "ESPN BET", markets });
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

  console.log(`   📡 ESPN: ${allGames.length} upcoming games (${allGames.filter((g) => (g.bookmakers?.length ?? 0) > 0).length} with odds)`);
  return allGames;
}

/**
 * Main tipster run: fetch games → analyze → score → filter → send.
 */
export async function runTipster(config: TipsterConfig): Promise<TipsterResult> {
  const {
    oddsApiKey, anthropicApiKey, telegramBotToken, telegramChannelId,
    vipChannelId, supabase, sportKeys, minHoursAhead = 24, paperMode = false,
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

  // Pre-determine which cards will also go to the free channel:
  // Foundation picks + one VALUE pick go to both channels.
  const preLiveCards = finalCards.filter((c) => !isPaperSport(c));
  const freeCardGameIds = new Set<string>();
  // All FOUNDATION picks go to free channel
  for (const c of preLiveCards) {
    if (c.tier.name === "FOUNDATION") freeCardGameIds.add(c.game_id);
  }
  // Plus one VALUE pick (the teaser)
  const valueTeaser = preLiveCards.find((c) => c.tier.name === "VALUE") ?? preLiveCards.find((c) => c.tier.name !== "FOUNDATION");
  if (valueTeaser) freeCardGameIds.add(valueTeaser.game_id);

  // VIP channel gets all cards
  if (vipChannelId) {
    for (const card of finalCards) {
      try {
        // Paper mode: log to Supabase but don't send to Telegram
        if (isPaperSport(card)) {
          const chain = await blockchainTimestamp(card);
          await supabase.from("picks").insert({
            sport: card.sport, sport_key: card.sport_key, league: card.league,
            game: card.game, pick: card.pick, odds: card.odds, bookmaker: card.bookmaker,
            pick_type: card.pickType,
            confidence: card.confidence, tier: card.tier.name, stake: card.stake,
            scoring_factors: card.scoring.factors, scoring_weights: card.scoring.weights,
            scoring_score: card.confidence, category: card.tier.name, reasoning: card.analysis,
            channel: "paper", status: "pending", sent_at: new Date().toISOString(),
            game_time: card.game_time, event_id: card.game_id,
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

        // Blockchain timestamp before sending
        const chain = await blockchainTimestamp(card);
        const html = appendChainBadge(card.telegram_html, chain, card.game_time);

        const msgId = await sendTelegramHtml(html, telegramBotToken, vipChannelId);
        console.log(`   📤 VIP: ${card.tier.emoji} ${card.sport} ${card.game} → msg:${msgId}`);
        postedVip++;

        // Log to Supabase
        const { data: row } = await supabase.from("picks").insert({
          sport: card.sport,
          sport_key: card.sport_key,
          league: card.league,
          game: card.game,
          pick: card.pick,
          odds: card.odds,
          bookmaker: card.bookmaker,
          pick_type: card.pickType,
          confidence: card.confidence,
          tier: card.tier.name,
          stake: card.stake,
          scoring_factors: card.scoring.factors,
          scoring_weights: card.scoring.weights,
          scoring_score: card.confidence,
          category: card.tier.name,
          reasoning: card.analysis,
          telegram_message_id: msgId,
          channel: freeCardGameIds.has(card.game_id) ? "both" : "vip",
          status: "pending",
          sent_at: new Date().toISOString(),
          game_time: card.game_time,
          event_id: card.game_id,
          ...parseBetFields(card.pick, card.game),
          ...settlementFields(card.sport_key, card.game_time),
          edge_percentage: card.scoring.breakdown.odds_value ?? null,
          pick_hash: chain.pick_hash,
          tx_hash: chain.tx_hash,
          block_number: chain.block_number,
          block_timestamp: chain.block_timestamp?.toISOString() ?? null,
          verified: chain.verified,
        }).select("id").single();

        // Record bet in bankroll
        if (row?.id) {
          await recordBet(supabase, row.id, card.stake);
        }

        picksSent++;
      } catch (err) {
        console.log(`   VIP send failed: ${(err as Error).message}`);
      }
    }
  }

  // Free channel: send ALL foundation picks (full card) + one VALUE pick (stripped)
  const liveCards = finalCards.filter((c) => !isPaperSport(c));

  // Send foundation picks to free channel (full format — they're the hook)
  const foundationCards = liveCards.filter((c) => c.tier.name === "FOUNDATION");
  for (const card of foundationCards) {
    try {
      const chain = await blockchainTimestamp(card);
      const html = appendChainBadge(card.telegram_html, chain, card.game_time);
      const msgId = await sendTelegramHtml(html, telegramBotToken, telegramChannelId);
      console.log(`   📤 FREE (FOUNDATION): 🛡️ ${card.sport} ${card.game} → msg:${msgId}`);
      postedFree++;
    } catch (err) {
      console.log(`   FREE foundation send failed: ${(err as Error).message}`);
    }
  }

  // Send one VALUE pick to free channel (stripped format)
  const freeCard = liveCards.find((c) => c.tier.name === "VALUE") ?? liveCards.find((c) => c.tier.name !== "FOUNDATION");
  if (freeCard) {
    const freeChain = await blockchainTimestamp(freeCard);
    const freeHtml = appendChainBadge(buildFreeCardHtml(freeCard, finalCards.length), freeChain, freeCard.game_time);
    try {
      const msgId = await sendTelegramHtml(freeHtml, telegramBotToken, telegramChannelId);
      console.log(`   📤 FREE: ${freeCard.tier.emoji} ${freeCard.sport} ${freeCard.game} → msg:${msgId}`);
      postedFree++;

      // Log free pick if no VIP channel
      if (!vipChannelId) {
        const { data: row } = await supabase.from("picks").insert({
          sport: freeCard.sport, sport_key: freeCard.sport_key, league: freeCard.league,
          game: freeCard.game, pick: freeCard.pick, odds: freeCard.odds, bookmaker: freeCard.bookmaker,
          pick_type: freeCard.pickType, confidence: freeCard.confidence, tier: freeCard.tier.name,
          stake: freeCard.stake, scoring_factors: freeCard.scoring.factors, scoring_weights: freeCard.scoring.weights,
          scoring_score: freeCard.confidence, category: freeCard.tier.name, reasoning: freeCard.analysis,
          telegram_message_id: msgId, channel: "free", status: "pending",
          sent_at: new Date().toISOString(), game_time: freeCard.game_time, event_id: freeCard.game_id,
          ...parseBetFields(freeCard.pick, freeCard.game),
          ...settlementFields(freeCard.sport_key, freeCard.game_time),
          pick_hash: freeChain.pick_hash, tx_hash: freeChain.tx_hash,
          block_number: freeChain.block_number,
          block_timestamp: freeChain.block_timestamp?.toISOString() ?? null,
          verified: freeChain.verified,
        }).select("id").single();

        if (row?.id) {
          await recordBet(supabase, row.id, freeCard.stake);
        }
      }
      picksSent++;
    } catch (err) {
      console.log(`   FREE send failed: ${(err as Error).message}`);
    }
  }

  // Send MAX teasers to free channel for MAXIMUM picks
  for (const card of finalCards.filter((c) => c.tier.name === "MAXIMUM")) {
    try {
      const teaser = `🚨 <b>MAX PLAY</b> just dropped for ${card.sport} subscribers.\n🦈 Unlock → sharkline.ai`;
      await sendTelegramHtml(teaser, telegramBotToken, telegramChannelId);
      console.log(`   🚨 MAX teaser sent for ${card.sport}`);
    } catch (err) {
      console.log(`   MAX teaser failed: ${(err as Error).message}`);
    }
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

function buildFreeCardHtml(card: AnalysisCard, _totalVipPicks: number): string {
  const sportEmoji: Record<string, string> = {
    basketball_nba: "🏀",
    soccer_epl: "⚽", soccer_spain_la_liga: "⚽", soccer_uefa_champs_league: "⚽",
    soccer_italy_serie_a: "⚽", soccer_germany_bundesliga: "⚽",
    soccer_france_ligue_one: "⚽", soccer_usa_mls: "⚽",
    icehockey_nhl: "🏒", americanfootball_nfl: "🏈", baseball_mlb: "⚾",
  };
  const emoji = sportEmoji[card.sport_key] ?? "🏅";

  // Stripped down — pick only, no analysis, no data, no blockchain
  let html = `${emoji} ${card.sport} | ${card.league}\n`;
  html += `${card.game}\n`;
  html += `Pick: <b>${card.pick}</b> @ ${card.odds}\n\n`;
  html += `🔐 Full analysis + blockchain proof → VIP only\n`;
  html += `Join VIP: sharkline.ai`;

  return html;
}
