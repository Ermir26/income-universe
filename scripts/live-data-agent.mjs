// Live data agent — fetches scores and odds WITHOUT paid APIs
// Replaces Odds API dependency with ESPN free API + web search fallback
//
// Scores: ESPN free scoreboard API (unlimited, no key needed)
// Odds:   Web search + Claude parsing (flashscore, bet365, oddsportal, etc.)

import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import { SPORT_LABELS } from "./tipster-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const anthropic = new Anthropic();

// ═══════════════════════════════════════════
// ESPN FREE API — Sport Key Mapping
// ═══════════════════════════════════════════
const ESPN_SPORT_MAP = {
  soccer_epl: "soccer/eng.1",
  soccer_spain_la_liga: "soccer/esp.1",
  soccer_italy_serie_a: "soccer/ita.1",
  soccer_germany_bundesliga: "soccer/ger.1",
  soccer_france_ligue_one: "soccer/fra.1",
  soccer_usa_mls: "soccer/usa.1",
  soccer_uefa_champs_league: "soccer/uefa.champions",
  basketball_nba: "basketball/nba",
  basketball_euroleague: "basketball/eur.euroleague",
  icehockey_nhl: "hockey/nhl",
  baseball_mlb: "baseball/mlb",
  americanfootball_nfl: "football/nfl",
  mma_mixed_martial_arts: "mma/ufc",
};

// ═══════════════════════════════════════════
// SCORES — ESPN Free API (primary)
// ═══════════════════════════════════════════
// Returns data in Odds API-compatible format so existing matching code works unchanged
export async function fetchLiveScores(sportKeys, daysBack = 3) {
  if (sportKeys.length === 0) return [];
  const allScores = [];
  const today = new Date();

  console.log(`   📡 Fetching scores from ESPN (free, no quota)...`);

  for (const sportKey of sportKeys) {
    const espnPath = ESPN_SPORT_MAP[sportKey];
    if (!espnPath) {
      console.log(`   ⚠️ No ESPN mapping for ${sportKey} — will try web search`);
      continue;
    }

    for (let d = 0; d <= daysBack; d++) {
      const date = new Date(today);
      date.setDate(date.getDate() - d);
      const dateStr = date.toISOString().split("T")[0].replace(/-/g, "");

      try {
        const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard?dates=${dateStr}`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) continue;

        const data = await res.json();
        const events = data.events || [];

        for (const event of events) {
          const comp = event.competitions?.[0];
          if (!comp) continue;

          const competitors = comp.competitors || [];
          const home = competitors.find((c) => c.homeAway === "home");
          const away = competitors.find((c) => c.homeAway === "away");
          if (!home || !away) continue;

          const completed = event.status?.type?.completed || false;
          const homeName = home.team?.displayName || home.team?.shortDisplayName || "";
          const awayName = away.team?.displayName || away.team?.shortDisplayName || "";

          allScores.push({
            id: `espn_${event.id}`,
            sport_key: sportKey,
            home_team: homeName,
            away_team: awayName,
            commence_time: event.date || comp.date,
            completed,
            scores: [
              { name: homeName, score: home.score || "0" },
              { name: awayName, score: away.score || "0" },
            ],
          });
        }
      } catch (err) {
        // Silent — ESPN is best-effort per date
      }
    }
  }

  console.log(`   📡 ESPN: ${allScores.length} games found (${allScores.filter((s) => s.completed).length} completed)`);
  return allScores;
}

// ═══════════════════════════════════════════
// SCORES — Web Search Fallback
// ═══════════════════════════════════════════
// For sports not covered by ESPN or when ESPN misses a game
export async function searchScoresOnWeb(unmatchedPicks) {
  if (unmatchedPicks.length === 0) return [];
  console.log(`   🔍 Web search fallback for ${unmatchedPicks.length} unmatched picks...`);

  const results = [];

  // Batch picks by sport for efficient searching
  const bySport = {};
  for (const pick of unmatchedPicks) {
    const sport = pick.sport || "Unknown";
    if (!bySport[sport]) bySport[sport] = [];
    bySport[sport].push(pick);
  }

  for (const [sport, picks] of Object.entries(bySport)) {
    const gameNames = picks.map((p) => p.game).join(", ");
    const searchResults = await webSearch(`${sport} scores results today ${gameNames}`);

    if (searchResults.length === 0) continue;

    // Try regex extraction first (fast, no API cost)
    for (const pick of picks) {
      const teams = pick.game?.split(" vs ").map((t) => t.trim()) || [];
      if (teams.length < 2) continue;

      const score = extractScoreFromSnippets(searchResults, teams[0], teams[1]);
      if (score) {
        results.push({
          pick_id: pick.id,
          sport_key: pick.sport_key,
          home_team: teams[0],
          away_team: teams[1],
          completed: true,
          commence_time: pick.game_time,
          ...score,
        });
      }
    }

    // If regex failed, try Claude parsing for remaining unmatched
    const stillUnmatched = picks.filter((p) => !results.find((r) => r.pick_id === p.id));
    if (stillUnmatched.length > 0 && searchResults.length > 0) {
      try {
        const parsed = await parseScoresWithClaude(searchResults, stillUnmatched);
        results.push(...parsed);
      } catch (err) {
        console.log(`   ⚠️ Claude parse error for ${sport}: ${err.message}`);
      }
    }
  }

  console.log(`   🔍 Web search: found ${results.length} scores`);
  return results;
}

// ═══════════════════════════════════════════
// ODDS — Web Search + Page Fetch for upcoming games + odds
// ═══════════════════════════════════════════

// Map sport keys to ESPN odds page paths
const ESPN_ODDS_MAP = {
  soccer_epl: "soccer/eng.1",
  soccer_spain_la_liga: "soccer/esp.1",
  soccer_italy_serie_a: "soccer/ita.1",
  soccer_germany_bundesliga: "soccer/ger.1",
  soccer_france_ligue_one: "soccer/fra.1",
  soccer_usa_mls: "soccer/usa.1",
  soccer_uefa_champs_league: "soccer/uefa.champions",
  basketball_nba: "basketball/nba",
  basketball_euroleague: "basketball/eur.euroleague",
  icehockey_nhl: "hockey/nhl",
  baseball_mlb: "baseball/mlb",
  americanfootball_nfl: "football/nfl",
  mma_mixed_martial_arts: "mma/ufc",
};

// Fetch upcoming games with odds via ESPN API (free, no key needed)
export async function searchOddsOnWeb(sportKey) {
  const label = SPORT_LABELS[sportKey] || sportKey;
  const espnPath = ESPN_ODDS_MAP[sportKey];

  if (!espnPath) {
    console.log(`   ⚠️ No ESPN mapping for ${sportKey} — trying web search`);
    return searchOddsViaWebSearch(sportKey, label);
  }

  console.log(`   🔍 Fetching ${label} games from ESPN...`);

  try {
    // ESPN scoreboard gives us upcoming games
    const today = new Date().toISOString().split("T")[0].replace(/-/g, "");
    const url = `https://site.api.espn.com/apis/site/v2/sports/${espnPath}/scoreboard?dates=${today}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return searchOddsViaWebSearch(sportKey, label);
    const data = await res.json();
    const events = data.events || [];
    const games = [];

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;

      const home = comp.competitors?.find((c) => c.homeAway === "home");
      const away = comp.competitors?.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      // Only include upcoming (not completed) games
      if (event.status?.type?.completed) continue;

      const homeName = home.team?.displayName || "";
      const awayName = away.team?.displayName || "";
      const oddsData = comp.odds?.[0];

      // Build bookmaker data from ESPN odds if available
      const bookmakers = [];
      if (oddsData) {
        const markets = [];
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
              { name: awayName, price: oddsData.awayTeamOdds?.spreadOdds || 0, point: -spread },
            ],
          });
        }
        // Total
        if (oddsData.overOdds && oddsData.overUnder) {
          markets.push({
            key: "totals",
            outcomes: [
              { name: "Over", price: oddsData.overOdds, point: parseFloat(oddsData.overUnder) },
              { name: "Under", price: oddsData.underOdds || 0, point: parseFloat(oddsData.overUnder) },
            ],
          });
        }
        if (markets.length > 0) {
          bookmakers.push({ key: "espn", title: oddsData.provider?.name || "ESPN", markets });
        }
      }

      games.push({
        id: `espn_${event.id}`,
        sport_key: sportKey,
        sport_title: label,
        home_team: homeName,
        away_team: awayName,
        commence_time: event.date || comp.date,
        bookmakers,
      });
    }

    console.log(`   🔍 ESPN: ${games.length} upcoming ${label} games (${games.filter((g) => g.bookmakers.length > 0).length} with odds)`);
    return games;
  } catch (err) {
    console.log(`   ⚠️ ESPN odds error: ${err.message}`);
    return searchOddsViaWebSearch(sportKey, label);
  }
}

// Fallback: search the web for odds using DuckDuckGo + Claude parsing
async function searchOddsViaWebSearch(sportKey, label) {
  const searchResults = await webSearch(`${label} odds today upcoming games moneyline`);
  if (searchResults.length === 0) return [];

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [
        {
          role: "user",
          content: `Extract upcoming game odds for ${label} from these search results.

SEARCH RESULTS:
${searchResults.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join("\n")}

For each game found, return JSON:
[{"id":"web_1","sport_key":"${sportKey}","sport_title":"${label}","home_team":"...","away_team":"...","commence_time":"ISO date","bookmakers":[{"key":"web","title":"Web","markets":[{"key":"h2h","outcomes":[{"name":"Team1","price":-150},{"name":"Team2","price":130}]}]}]}]

Only include games with REAL odds from the snippets. Return [] if none found.`,
        },
      ],
    });

    const text = response.content[0]?.text?.trim() || "[]";
    const jsonStr = text.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

// ─── Fetch upcoming games with odds from web search (all sports) ───
export async function fetchUpcomingGamesFromWeb(sportKeys) {
  const allGames = [];
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  for (const sportKey of sportKeys) {
    try {
      const games = await searchOddsOnWeb(sportKey);
      for (const game of games) {
        game.sport_key_original = sportKey;
        const gameTime = game.commence_time ? new Date(game.commence_time) : null;
        // Only include upcoming games
        if (!gameTime || (gameTime > now && gameTime < tomorrow)) {
          allGames.push(game);
        }
      }
    } catch (err) {
      console.log(`   ⚠️ Web odds error for ${sportKey}: ${err.message}`);
    }
  }

  // Deduplicate by team names
  const seen = new Set();
  const unique = allGames.filter((g) => {
    const key = `${g.home_team}-${g.away_team}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(a.commence_time || 0) - new Date(b.commence_time || 0));
  return unique;
}

// ═══════════════════════════════════════════
// INTERNAL HELPERS
// ═══════════════════════════════════════════

// ─── DuckDuckGo HTML search ───
async function webSearch(query) {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();

    // Parse DuckDuckGo HTML results
    const results = [];
    const blocks = html.split(/class="result\s/);

    for (let i = 1; i < blocks.length && results.length < 10; i++) {
      const block = blocks[i];
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/);
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

      if (titleMatch || snippetMatch) {
        results.push({
          title: (titleMatch?.[1] || "").replace(/<[^>]+>/g, "").trim(),
          snippet: (snippetMatch?.[1] || "").replace(/<[^>]+>/g, "").trim(),
        });
      }
    }

    return results;
  } catch (err) {
    console.log(`   🔍 Web search error: ${err.message}`);
    return [];
  }
}

// ─── Extract score from search snippets using regex ───
function extractScoreFromSnippets(searchResults, team1, team2) {
  const t1Words = team1.toLowerCase().split(" ").filter((w) => w.length > 3);
  const t2Words = team2.toLowerCase().split(" ").filter((w) => w.length > 3);

  for (const result of searchResults) {
    const text = `${result.title} ${result.snippet}`;
    const textLower = text.toLowerCase();

    // Check if both teams are mentioned
    const t1Found = t1Words.some((w) => textLower.includes(w));
    const t2Found = t2Words.some((w) => textLower.includes(w));
    if (!t1Found || !t2Found) continue;

    // Common score patterns: "Team1 2-1 Team2", "Team1 2 - 1 Team2", "(2-1)"
    const scorePatterns = [
      /(\d+)\s*[-–:]\s*(\d+)/g,
      /\((\d+)\s*[-–:]\s*(\d+)\)/g,
    ];

    for (const pattern of scorePatterns) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const score1 = parseInt(match[1]);
        const score2 = parseInt(match[2]);
        // Sanity check — scores shouldn't be absurdly high for most sports
        if (score1 <= 20 && score2 <= 20) {
          return {
            scores: [
              { name: team1, score: String(score1) },
              { name: team2, score: String(score2) },
            ],
          };
        }
      }
    }
  }

  return null;
}

// ─── Parse scores with Claude (fallback for complex cases) ───
async function parseScoresWithClaude(searchResults, picks) {
  const gamesStr = picks.map((p) => `- "${p.game}" (${p.sport})`).join("\n");
  const resultsStr = searchResults.map((r, i) => `${i + 1}. ${r.title}\n   ${r.snippet}`).join("\n");

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `Extract final scores for these games from the search results.

GAMES:
${gamesStr}

SEARCH RESULTS:
${resultsStr}

Return ONLY a JSON array (no markdown):
[{"pick_id": "use_game_name", "home_team": "...", "away_team": "...", "completed": true, "sport_key": "...", "scores": [{"name": "Team1", "score": "2"}, {"name": "Team2", "score": "1"}]}]

Only include games where you found a confirmed final score. Return [] if none found.`,
      },
    ],
  });

  const text = response.content[0]?.text?.trim() || "[]";
  const jsonStr = text.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
  try {
    return JSON.parse(jsonStr);
  } catch {
    return [];
  }
}

export { webSearch };
