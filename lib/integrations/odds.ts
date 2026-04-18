const ODDS_API_KEY = process.env.ODDS_API_KEY || "";
const isMock = !ODDS_API_KEY;

interface OddsEvent {
  id: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  commenceTime: string;
  bookmakers: BookmakerOdds[];
}

interface BookmakerOdds {
  name: string;
  homeOdds: number;
  awayOdds: number;
  drawOdds?: number;
}

interface ValueBet {
  event: string;
  market: string;
  bookmaker: string;
  odds: number;
  impliedProbability: number;
  edgePercent: number;
}

export async function getOdds(sport = "upcoming"): Promise<OddsEvent[]> {
  if (isMock) {
    console.log(`[Odds/Mock] Fetching odds for: ${sport}`);
    return [
      {
        id: "mock-1",
        sport: "basketball_nba",
        homeTeam: "Lakers",
        awayTeam: "Celtics",
        commenceTime: new Date(Date.now() + 86400000).toISOString(),
        bookmakers: [
          { name: "DraftKings", homeOdds: 2.1, awayOdds: 1.8 },
          { name: "FanDuel", homeOdds: 2.15, awayOdds: 1.75 },
          { name: "BetMGM", homeOdds: 2.05, awayOdds: 1.85 },
        ],
      },
    ];
  }

  try {
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h&oddsFormat=decimal`
    );

    if (!res.ok) {
      console.error("[Odds] Fetch failed:", await res.text());
      return [];
    }

    const data = await res.json();
    return (data as Record<string, unknown>[]).map((event) => ({
      id: event.id as string,
      sport: event.sport_key as string,
      homeTeam: event.home_team as string,
      awayTeam: event.away_team as string,
      commenceTime: event.commence_time as string,
      bookmakers: ((event.bookmakers as Record<string, unknown>[]) || []).map((bm) => {
        const markets = bm.markets as Record<string, unknown>[];
        const h2h = markets?.find((m) => m.key === "h2h");
        const outcomes = (h2h?.outcomes as Record<string, unknown>[]) || [];
        return {
          name: bm.title as string,
          homeOdds: (outcomes.find((o) => o.name === event.home_team)?.price as number) || 0,
          awayOdds: (outcomes.find((o) => o.name === event.away_team)?.price as number) || 0,
          drawOdds: (outcomes.find((o) => o.name === "Draw")?.price as number) || undefined,
        };
      }),
    }));
  } catch (err) {
    console.error("[Odds] Error:", err);
    return [];
  }
}

export function findValueBets(events: OddsEvent[], edgeThreshold = 3): ValueBet[] {
  const valueBets: ValueBet[] = [];

  for (const event of events) {
    if (event.bookmakers.length < 2) continue;

    // Find best odds for each outcome
    let bestHome = { odds: 0, bookmaker: "" };
    let bestAway = { odds: 0, bookmaker: "" };

    for (const bm of event.bookmakers) {
      if (bm.homeOdds > bestHome.odds) {
        bestHome = { odds: bm.homeOdds, bookmaker: bm.name };
      }
      if (bm.awayOdds > bestAway.odds) {
        bestAway = { odds: bm.awayOdds, bookmaker: bm.name };
      }
    }

    // Calculate average implied probability
    const avgHomeProb =
      event.bookmakers.reduce((s, b) => s + 1 / b.homeOdds, 0) /
      event.bookmakers.length;
    const avgAwayProb =
      event.bookmakers.reduce((s, b) => s + 1 / b.awayOdds, 0) /
      event.bookmakers.length;

    const homeEdge = ((1 / avgHomeProb - bestHome.odds) / bestHome.odds) * -100;
    const awayEdge = ((1 / avgAwayProb - bestAway.odds) / bestAway.odds) * -100;

    if (homeEdge >= edgeThreshold) {
      valueBets.push({
        event: `${event.homeTeam} vs ${event.awayTeam}`,
        market: event.homeTeam,
        bookmaker: bestHome.bookmaker,
        odds: bestHome.odds,
        impliedProbability: avgHomeProb * 100,
        edgePercent: homeEdge,
      });
    }

    if (awayEdge >= edgeThreshold) {
      valueBets.push({
        event: `${event.homeTeam} vs ${event.awayTeam}`,
        market: event.awayTeam,
        bookmaker: bestAway.bookmaker,
        odds: bestAway.odds,
        impliedProbability: avgAwayProb * 100,
        edgePercent: awayEdge,
      });
    }
  }

  return valueBets.sort((a, b) => b.edgePercent - a.edgePercent);
}
