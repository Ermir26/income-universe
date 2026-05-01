import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";
import {
  validatePickAgainstPayload,
  TRUSTED_BOOKS,
  type GameData,
} from "@/lib/tipster/analysis-card";
import { SPORT_CATEGORY_KEYS } from "@/lib/tipster/brand";
import { fetchUpcomingGamesFromESPN } from "@/lib/tipster/tipster-agent";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const ODDS_API_KEY = process.env.ODDS_API_KEY || "";

const VALID_CHANNELS = new Set(["free", "vip", "method"]);
const VALID_MARKETS = new Set(["h2h", "spreads", "totals"]);

interface ManualPickBody {
  sport: string;
  game: string;
  game_id?: string;
  sport_key?: string;
  home_team?: string;
  away_team?: string;
  market: string;
  side: string;
  line?: number | string | null;
  odds: number;
  bookmaker: string;
  channels: string[];
  reasoning: string;
  game_time: string;
  force_unverified?: boolean;
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ManualPickBody;
  try {
    body = (await request.json()) as ManualPickBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Validate required fields ──
  const { sport, game, market, side, odds, bookmaker, channels, reasoning, game_time } = body;

  if (!sport || !game || !market || !side || !bookmaker || !reasoning || !game_time) {
    return NextResponse.json({ error: "Missing required fields: sport, game, market, side, odds, bookmaker, reasoning, game_time" }, { status: 400 });
  }

  if (odds == null || isNaN(Number(odds))) {
    return NextResponse.json({ error: "odds must be a valid number (American format)" }, { status: 400 });
  }

  if (!VALID_MARKETS.has(market)) {
    return NextResponse.json({ error: `Invalid market: ${market}. Valid: h2h, spreads, totals` }, { status: 400 });
  }

  if (!Array.isArray(channels) || channels.length === 0) {
    return NextResponse.json({ error: "At least one channel is required" }, { status: 400 });
  }

  const invalidChannels = channels.filter((c) => !VALID_CHANNELS.has(c.toLowerCase()));
  if (invalidChannels.length > 0) {
    return NextResponse.json({ error: `Invalid channel(s): ${invalidChannels.join(", ")}` }, { status: 400 });
  }

  // Line required for spreads/totals
  if ((market === "spreads" || market === "totals") && (body.line == null || body.line === "")) {
    return NextResponse.json({ error: "Line is required for spread/total markets" }, { status: 400 });
  }

  // ── Validate kickoff time is in the future ──
  const kickoffDate = new Date(game_time);
  if (isNaN(kickoffDate.getTime())) {
    return NextResponse.json({ error: "Invalid game_time format" }, { status: 400 });
  }
  if (kickoffDate.getTime() <= Date.now()) {
    return NextResponse.json({ error: "Kickoff time must be in the future" }, { status: 400 });
  }

  // ── Resolve team names for pick string ──
  // If home_team/away_team provided from game dropdown, use them.
  // Otherwise parse from game string "Home vs Away" format.
  let homeTeam = body.home_team ?? null;
  let awayTeam = body.away_team ?? null;
  if (!homeTeam || !awayTeam) {
    const parts = game.split(" vs ");
    if (parts.length === 2) {
      homeTeam = parts[0].trim();
      awayTeam = parts[1].trim();
    }
  }

  // Ensure game field is in canonical "Home vs Away" format
  const canonicalGame = homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : game;

  // ── Build pick string with team names (not "Home"/"Away") ──
  let pickString: string;
  const lineNum = body.line != null ? parseFloat(String(body.line)) : null;
  const sideLower = side.toLowerCase();
  if (market === "totals") {
    const label = sideLower === "over" ? "Over" : sideLower === "under" ? "Under" : side;
    pickString = `${label} ${lineNum ?? ""}`.trim();
  } else if (market === "spreads") {
    // Resolve home/away to team name
    let teamName = side;
    if (sideLower === "home" && homeTeam) teamName = homeTeam;
    else if (sideLower === "away" && awayTeam) teamName = awayTeam;
    pickString = `${teamName} ${lineNum != null && lineNum >= 0 ? "+" : ""}${lineNum ?? ""}`.trim();
  } else {
    // h2h: resolve home/away to team name
    let teamName = side;
    if (sideLower === "home" && homeTeam) teamName = homeTeam;
    else if (sideLower === "away" && awayTeam) teamName = awayTeam;
    pickString = teamName;
  }

  // ── Channel-tiered validation ──
  const normalizedChannels = channels.map((c) => c.toLowerCase());
  const channelStr = normalizedChannels.join(",");
  const needsValidation = normalizedChannels.includes("free") || normalizedChannels.includes("vip");
  const methodOnly = normalizedChannels.length === 1 && normalizedChannels[0] === "method";

  let source: "manual_validated" | "manual_unverified" = "manual_unverified";
  let validationWarning: { message: string; actual_line?: number | null; actual_price?: number | null } | null = null;
  let validationSource: "odds_api" | "espn" | "none" = "none";

  if (needsValidation && !body.force_unverified) {
    // Fetch live odds for the game's sport
    const sportKeys = SPORT_CATEGORY_KEYS[sport.toLowerCase()] ?? [];
    let matchedGame: GameData | null = null;
    let oddsApiReturned = false;

    if (ODDS_API_KEY && sportKeys.length > 0) {
      // If we have a game_id and sport_key from the autocomplete, fetch that specific game
      if (body.game_id && body.sport_key && !body.game_id.startsWith("espn_")) {
        try {
          const url = `https://api.the-odds-api.com/v4/sports/${body.sport_key}/odds/?apiKey=${ODDS_API_KEY}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso&eventIds=${body.game_id}`;
          const res = await fetch(url, { cache: "no-store" });
          if (res.ok) {
            const games = await res.json();
            if (Array.isArray(games) && games.length > 0) {
              matchedGame = games[0] as GameData;
              oddsApiReturned = true;
              validationSource = "odds_api";
            }
          }
        } catch {
          // Fall through to team name search or ESPN
        }
      }

      // If we didn't match by ID, try to find by team names via Odds API
      if (!matchedGame) {
        const gameLower = game.toLowerCase();
        for (const sportKey of sportKeys) {
          try {
            const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
            const res = await fetch(url, { cache: "no-store" });
            if (!res.ok) continue;
            const games = (await res.json()) as GameData[];
            oddsApiReturned = true;
            for (const g of games) {
              const homeL = g.home_team.toLowerCase();
              const awayL = g.away_team.toLowerCase();
              if (gameLower.includes(homeL) || gameLower.includes(awayL) || homeL.includes(gameLower.split(" vs ")[0]?.trim().toLowerCase() ?? "")) {
                matchedGame = g;
                validationSource = "odds_api";
                break;
              }
            }
            if (matchedGame) break;
          } catch {
            continue;
          }
        }
      }
    }

    // ESPN fallback — if Odds API returned no data (credits out, error, empty)
    if (!matchedGame && !oddsApiReturned && sportKeys.length > 0) {
      console.log("[manual] Odds API returned no data — trying ESPN fallback for validation");
      try {
        const espnGames = await fetchUpcomingGamesFromESPN(sportKeys, 72);
        const gameLower = game.toLowerCase();
        for (const g of espnGames) {
          const homeL = g.home_team.toLowerCase();
          const awayL = g.away_team.toLowerCase();
          if (gameLower.includes(homeL) || gameLower.includes(awayL) || homeL.includes(gameLower.split(" vs ")[0]?.trim().toLowerCase() ?? "")) {
            matchedGame = g;
            validationSource = "espn";
            break;
          }
        }
      } catch {
        console.log("[manual] ESPN fallback failed");
      }
    }

    if (matchedGame && matchedGame.bookmakers && matchedGame.bookmakers.length > 0) {
      // Run validator
      const validatorResult = validatePickAgainstPayload(
        { game, pick: pickString, odds: String(odds), bookmaker },
        matchedGame,
        TRUSTED_BOOKS,
        5, // price tolerance ±5 cents
      );

      if (validatorResult.status === "pass") {
        source = "manual_validated";
      } else if (validatorResult.status === "corrected") {
        // Validator found a match at a different bookmaker — still validated
        source = "manual_validated";
      } else {
        // Rejected — find the actual offered values for the warning
        let actualPrice: number | null = null;
        let actualLine: number | null = null;
        for (const bm of matchedGame.bookmakers ?? []) {
          for (const mkt of bm.markets) {
            if (mkt.key !== market) continue;
            for (const o of mkt.outcomes) {
              const nameLower = o.name.toLowerCase();
              const sideLower = side.toLowerCase();
              if (nameLower.includes(sideLower) || sideLower.includes(nameLower)) {
                actualPrice = o.price;
                actualLine = o.point ?? null;
                break;
              }
            }
            if (actualPrice !== null) break;
          }
          if (actualPrice !== null) break;
        }

        validationWarning = {
          message: validatorResult.reason ?? "Line/price not confirmed by any trusted bookmaker",
          actual_line: actualLine,
          actual_price: actualPrice,
        };

        return NextResponse.json({
          ok: false,
          validation_warning: validationWarning,
          validation_source: validationSource,
          message: "Validation failed — the cited line/price does not match live odds. You can save as unverified.",
        }, { status: 422 });
      }
    } else {
      // No live data available — cannot validate
      source = "manual_unverified";
      validationSource = "none";
    }
  }

  // If method-only or force_unverified, skip validation
  if (methodOnly || body.force_unverified) {
    source = "manual_unverified";
  }

  // ── Insert pick ──
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const pickPayload = {
    sport,
    sport_key: body.sport_key ?? null,
    game: canonicalGame,
    pick: pickString,
    odds: String(odds),
    bookmaker,
    channel: channelStr,
    reasoning,
    game_time: kickoffDate.toISOString(),
    status: "draft",
    source,
    bet_type: market,
    side: side.toLowerCase(),
    line: lineNum,
    confidence: 0, // manual picks don't have system confidence
    event_id: body.game_id ?? null,
  };

  const { data: inserted, error } = await supabase
    .from("picks")
    .insert(pickPayload)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: `Insert failed: ${error.message}` }, { status: 500 });
  }

  const pickId = inserted.id;

  // Write decision log entry for manual picks
  await supabase.from("pick_decision_log").insert({
    pick_id: pickId,
    game: canonicalGame,
    sport,
    pick: pickString,
    odds: String(odds),
    bookmaker,
    final_decision: source === "manual_validated" ? "manual_validated" : "manual_unverified",
    validator_result: source,
    validation_source: validationSource,
    rejection_reason: source === "manual_unverified" ? "Manual insert — no live validation or validation skipped" : null,
  });

  // Audit log
  await writeAuditLog(supabase, {
    action: "pick_manual_insert",
    target_type: "pick",
    target_id: pickId,
    before_value: null,
    after_value: pickPayload,
  });

  return NextResponse.json({
    ok: true,
    pick_id: pickId,
    source,
    message: `Manual pick inserted as draft with source: ${source}`,
  });
}
