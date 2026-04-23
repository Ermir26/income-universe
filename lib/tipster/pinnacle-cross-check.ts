// Pinnacle cross-check — independent line source for pick veto
// Scrapes Pinnacle's public odds page. Fail-open on scraper errors.

import { type SupabaseClient } from "@supabase/supabase-js";

export interface PinnacleLine {
  line: number | null;
  price: number; // American odds
  raw: Record<string, unknown>;
}

export interface CrossCheckResult {
  result: "pass" | "veto" | "scraper_failed";
  pinnacleLine?: PinnacleLine;
  divergence?: number;
  reason?: string;
}

// In-memory cache: key = `${eventId}:${market}` → { data, ts }
const cache = new Map<string, { data: PinnacleLine | null; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Configurable thresholds
const SPREAD_TOTAL_THRESHOLD = parseFloat(process.env.PINNACLE_VETO_THRESHOLD ?? "1.0");
const PRICE_THRESHOLD = parseInt(process.env.PINNACLE_PRICE_THRESHOLD ?? "15", 10);

// Pinnacle sport key mapping
const PINNACLE_SPORT_MAP: Record<string, number> = {
  basketball_nba: 4,
  americanfootball_nfl: 1,
  icehockey_nhl: 19,
  baseball_mlb: 3,
  soccer_epl: 29,
  soccer_spain_la_liga: 29,
  soccer_italy_serie_a: 29,
  soccer_germany_bundesliga: 29,
  soccer_france_ligue_one: 29,
  soccer_usa_mls: 29,
  soccer_uefa_champs_league: 29,
  mma_mixed_martial_arts: 22,
  tennis_atp_french_open: 33,
  tennis_atp_wimbledon: 33,
  tennis_wta_french_open: 33,
  tennis_wta_wimbledon: 33,
};

/**
 * Fetch Pinnacle odds for a specific game by matching teams + time.
 * Uses Pinnacle's public matchups/odds endpoints (no API key needed).
 * Returns null on any failure — fail-open design.
 */
async function fetchPinnacleOdds(
  sportKey: string,
  homeTeam: string,
  awayTeam: string,
  commenceTime: string,
  market: string,
  side: string,
): Promise<PinnacleLine | null> {
  const cacheKey = `${homeTeam}:${awayTeam}:${market}:${side}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.data;
  }

  const pinnacleSportId = PINNACLE_SPORT_MAP[sportKey];
  if (!pinnacleSportId) {
    console.log(`   [pinnacle] No sport mapping for ${sportKey}`);
    cache.set(cacheKey, { data: null, ts: Date.now() });
    return null;
  }

  try {
    // Pinnacle public matchups endpoint
    const matchupsUrl = `https://guest.api.arcadia.pinnacle.com/0.1/sports/${pinnacleSportId}/matchups?bracket=0&limit=250`;
    const matchupsRes = await fetch(matchupsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.pinnacle.com/",
        "Origin": "https://www.pinnacle.com",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!matchupsRes.ok) {
      console.log(`   [pinnacle] Matchups fetch failed: ${matchupsRes.status}`);
      cache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    const matchups = await matchupsRes.json();
    if (!Array.isArray(matchups)) {
      cache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    // Find matching game by team name fuzzy match + time proximity
    const gameTime = new Date(commenceTime).getTime();
    const homeWords = homeTeam.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
    const awayWords = awayTeam.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);

    interface PinnacleMatchup {
      id: number;
      startTime: string;
      participants: Array<{ name: string; alignment: string }>;
      [key: string]: unknown;
    }

    const matchup = (matchups as PinnacleMatchup[]).find((m) => {
      if (!m.participants || m.participants.length < 2) return false;
      const names = m.participants.map((p) => p.name.toLowerCase());
      const allNames = names.join(" ");
      const homeMatch = homeWords.some((w: string) => allNames.includes(w));
      const awayMatch = awayWords.some((w: string) => allNames.includes(w));
      if (!homeMatch || !awayMatch) return false;
      // Time check: within 4 hours
      const mTime = new Date(m.startTime).getTime();
      return Math.abs(mTime - gameTime) < 4 * 60 * 60 * 1000;
    });

    if (!matchup) {
      console.log(`   [pinnacle] No matching game found for ${homeTeam} vs ${awayTeam}`);
      cache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    // Fetch odds for this matchup
    const oddsUrl = `https://guest.api.arcadia.pinnacle.com/0.1/matchups/${matchup.id}/markets/related/straight`;
    const oddsRes = await fetch(oddsUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": "https://www.pinnacle.com/",
        "Origin": "https://www.pinnacle.com",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!oddsRes.ok) {
      console.log(`   [pinnacle] Odds fetch failed for matchup ${matchup.id}: ${oddsRes.status}`);
      cache.set(cacheKey, { data: null, ts: Date.now() });
      return null;
    }

    const oddsData = await oddsRes.json();

    // Parse the odds response to find the matching market
    const result = extractLine(oddsData, market, side, matchup);
    cache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (err) {
    console.log(`   [pinnacle] Scraper error: ${(err as Error).message}`);
    cache.set(cacheKey, { data: null, ts: Date.now() });
    return null;
  }
}

function extractLine(
  oddsData: unknown,
  market: string,
  side: string,
  matchup: { participants: Array<{ name: string; alignment: string }> },
): PinnacleLine | null {
  if (!Array.isArray(oddsData)) return null;

  interface PinnacleMarket {
    type: string;
    key?: string;
    prices: Array<{
      designation?: string;
      participantId?: number;
      points?: number;
      price: number;
    }>;
    [key: string]: unknown;
  }

  for (const mkt of oddsData as PinnacleMarket[]) {
    if (!mkt.prices || !Array.isArray(mkt.prices)) continue;

    if (market === "total" || market === "f5_total") {
      // Totals: look for over/under
      if (mkt.type !== "total" && mkt.key !== "s;0;ou") continue;
      const sideDesignation = side === "over" ? "over" : "under";
      const price = mkt.prices.find(
        (p) => p.designation?.toLowerCase() === sideDesignation,
      );
      if (price) {
        return {
          line: price.points ?? null,
          price: decimalToAmerican(price.price),
          raw: mkt as unknown as Record<string, unknown>,
        };
      }
    } else if (market === "spread") {
      if (mkt.type !== "spread" && mkt.key !== "s;0;s") continue;
      // Match by home/away alignment
      const homeParticipant = matchup.participants.find((p) => p.alignment === "home");
      const awayParticipant = matchup.participants.find((p) => p.alignment === "away");
      const targetAlignment = side === "home" ? "home" : "away";
      const targetName = targetAlignment === "home" ? homeParticipant?.name : awayParticipant?.name;
      if (!targetName) continue;

      // Pinnacle uses participantId for spreads
      for (const p of mkt.prices) {
        if (p.designation?.toLowerCase() === targetAlignment) {
          return {
            line: p.points ?? null,
            price: decimalToAmerican(p.price),
            raw: mkt as unknown as Record<string, unknown>,
          };
        }
      }
    } else if (market === "moneyline" || market === "draw") {
      if (mkt.type !== "moneyline" && mkt.key !== "s;0;m") continue;
      if (side === "draw") {
        const price = mkt.prices.find((p) => p.designation?.toLowerCase() === "draw");
        if (price) {
          return { line: null, price: decimalToAmerican(price.price), raw: mkt as unknown as Record<string, unknown> };
        }
      } else {
        const designation = side === "home" ? "home" : "away";
        const price = mkt.prices.find((p) => p.designation?.toLowerCase() === designation);
        if (price) {
          return { line: null, price: decimalToAmerican(price.price), raw: mkt as unknown as Record<string, unknown> };
        }
      }
    }
  }

  return null;
}

/** Convert decimal odds to American */
function decimalToAmerican(decimal: number): number {
  if (decimal >= 2.0) {
    return Math.round((decimal - 1) * 100);
  }
  return Math.round(-100 / (decimal - 1));
}

/**
 * Cross-check a pick against Pinnacle's line.
 * Writes result to odds_cross_checks table.
 * Returns pass/veto/scraper_failed.
 */
export async function crossCheckWithPinnacle(
  supabase: SupabaseClient,
  gameId: string,
  sportKey: string,
  homeTeam: string,
  awayTeam: string,
  commenceTime: string,
  market: string,
  side: string,
  citedBook: string,
  citedLine: number | null,
  citedPrice: number,
): Promise<CrossCheckResult> {
  const pinnacle = await fetchPinnacleOdds(sportKey, homeTeam, awayTeam, commenceTime, market, side);

  if (!pinnacle) {
    // Fail-open: scraper failed, log and allow the pick
    await supabase.from("odds_cross_checks").insert({
      game_id: gameId,
      sport: sportKey,
      market,
      side,
      cited_book: citedBook,
      cited_line: citedLine,
      cited_price: citedPrice,
      result: "scraper_failed",
    }).then(() => {}, () => {});

    return { result: "scraper_failed", reason: "Pinnacle data unavailable" };
  }

  // Compute divergence
  let divergence = 0;
  let vetoReason: string | undefined;

  if (market === "moneyline" || market === "draw") {
    // For moneyline: compare prices only
    divergence = Math.abs(pinnacle.price - citedPrice);
    if (divergence > PRICE_THRESHOLD) {
      vetoReason = `Price divergence: cited ${citedPrice}, Pinnacle ${pinnacle.price} (diff ${divergence} > ${PRICE_THRESHOLD})`;
    }
  } else {
    // For spreads/totals: compare lines
    if (pinnacle.line != null && citedLine != null) {
      divergence = Math.abs(pinnacle.line - citedLine);
      if (divergence > SPREAD_TOTAL_THRESHOLD) {
        vetoReason = `Line divergence: cited ${citedLine}, Pinnacle ${pinnacle.line} (diff ${divergence} > ${SPREAD_TOTAL_THRESHOLD})`;
      }
    }
  }

  const result: CrossCheckResult["result"] = vetoReason ? "veto" : "pass";

  // Write to odds_cross_checks
  await supabase.from("odds_cross_checks").insert({
    game_id: gameId,
    sport: sportKey,
    market,
    side,
    cited_book: citedBook,
    cited_line: citedLine,
    cited_price: citedPrice,
    pinnacle_line: pinnacle.line,
    pinnacle_price: pinnacle.price,
    divergence,
    result,
    raw_pinnacle_payload: pinnacle.raw,
  }).then(() => {}, () => {});

  return {
    result,
    pinnacleLine: pinnacle,
    divergence,
    reason: vetoReason,
  };
}
