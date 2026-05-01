import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { SPORT_CATEGORY_KEYS } from "@/lib/tipster/brand";
import { fetchUpcomingGamesFromESPN } from "@/lib/tipster/tipster-agent";

const ODDS_API_KEY = process.env.ODDS_API_KEY || "";

interface GameResult {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: unknown;
  source: "odds_api" | "espn";
}

export async function GET(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const sport = url.searchParams.get("sport") || "";
  const search = (url.searchParams.get("search") || "").toLowerCase().trim();

  if (!sport) {
    return NextResponse.json({ error: "sport parameter required" }, { status: 400 });
  }

  const sportKeys = SPORT_CATEGORY_KEYS[sport.toLowerCase()] ?? [];
  if (sportKeys.length === 0) {
    return NextResponse.json({ error: `Unknown sport category: ${sport}` }, { status: 400 });
  }

  try {
    const allGames: GameResult[] = [];
    let oddsApiFailed = false;

    // Step 1: Try Odds API first
    if (ODDS_API_KEY) {
      const failedKeys: string[] = [];

      const results = await Promise.allSettled(
        sportKeys.map(async (sportKey) => {
          const apiUrl = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=us,eu&markets=h2h,spreads,totals&oddsFormat=american&dateFormat=iso`;
          const res = await fetch(apiUrl, { cache: "no-store" });
          if (!res.ok) {
            // Check for OUT_OF_USAGE_CREDITS or any error
            const body = await res.text().catch(() => "");
            if (body.includes("OUT_OF_USAGE_CREDITS") || res.status === 401 || res.status === 429) {
              console.log(`[games] Odds API credits exhausted for ${sportKey}`);
            }
            failedKeys.push(sportKey);
            return [];
          }
          const games = await res.json();
          return (games as Array<Record<string, unknown>>).map((g) => ({
            id: g.id as string,
            sport_key: g.sport_key as string,
            home_team: g.home_team as string,
            away_team: g.away_team as string,
            commence_time: g.commence_time as string,
            bookmakers: g.bookmakers,
            source: "odds_api" as const,
          }));
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled" && Array.isArray(r.value)) {
          allGames.push(...r.value);
        }
      }

      // If all sport keys failed, mark as full failure for ESPN fallback
      if (failedKeys.length === sportKeys.length) {
        oddsApiFailed = true;
      } else if (failedKeys.length > 0) {
        // Partial failure — ESPN fallback for failed keys only
        const espnGames = await fetchUpcomingGamesFromESPN(failedKeys, 72);
        for (const g of espnGames) {
          allGames.push({
            id: g.id,
            sport_key: g.sport_key,
            home_team: g.home_team,
            away_team: g.away_team,
            commence_time: g.commence_time,
            bookmakers: g.bookmakers,
            source: "espn",
          });
        }
      }
    } else {
      oddsApiFailed = true;
    }

    // Step 2: ESPN fallback — if Odds API fully failed or returned empty
    if (oddsApiFailed || allGames.length === 0) {
      console.log(`[games] ESPN fallback — Odds API ${oddsApiFailed ? "failed" : "returned empty"}`);
      const espnGames = await fetchUpcomingGamesFromESPN(sportKeys, 72);
      for (const g of espnGames) {
        allGames.push({
          id: g.id,
          sport_key: g.sport_key,
          home_team: g.home_team,
          away_team: g.away_team,
          commence_time: g.commence_time,
          bookmakers: g.bookmakers,
          source: "espn",
        });
      }
    }

    // Filter to future games only
    const now = Date.now();
    let filtered = allGames.filter((g) => new Date(g.commence_time).getTime() > now);

    // Filter by search string if provided
    if (search) {
      filtered = filtered.filter((g) => {
        const homeL = g.home_team.toLowerCase();
        const awayL = g.away_team.toLowerCase();
        return homeL.includes(search) || awayL.includes(search) || search.includes(homeL) || search.includes(awayL);
      });
    }

    // Sort by commence_time ascending
    filtered.sort((a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime());

    // Deduplicate by home_team + away_team (prefer odds_api over espn)
    const seen = new Set<string>();
    const deduped = filtered.filter((g) => {
      const key = `${g.home_team.toLowerCase()}|${g.away_team.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Limit to 20 results
    return NextResponse.json({ games: deduped.slice(0, 20) });
  } catch (err) {
    return NextResponse.json(
      { error: `Game search error: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
