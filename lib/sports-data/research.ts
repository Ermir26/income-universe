// Multi-source research module — Sharkline
// Gathers ESPN team data, injuries, form, weather for deep analysis

import { SPORT_KEY_TO_ESPN } from "./espn-leagues";

// ─── Types ───

export interface TeamResearch {
  name: string;
  record: string;
  position: string;
  fightingFor: string;
  lastFive: string[];
  homeRecord: string;
  awayRecord: string;
  injuries: string[];
  recentGoalsScored: number;
  recentGoalsConceded: number;
  streak: string;
}

export interface ProbablePitcher {
  name: string;
  stats: string; // e.g. "3.25 ERA, 1.12 WHIP, 9.2 K/9"
}

export interface GameResearch {
  game: string;
  league: string;
  sportKey: string;
  gameTime: string;
  homeTeam: TeamResearch;
  awayTeam: TeamResearch;
  h2h: string;
  weather: string;
  contextNotes: string;
  probablePitchers?: { home: ProbablePitcher | null; away: ProbablePitcher | null };
}

// ─── Cache ───

const cache = new Map<string, { data: unknown; fetchedAt: number }>();
const TEAM_CACHE_TTL = 2 * 60 * 60 * 1000; // 2 hours
const WEATHER_CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

function getCached<T>(key: string, ttl: number): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() - entry.fetchedAt < ttl) return entry.data as T;
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, fetchedAt: Date.now() });
}

// ─── ESPN Helpers ───

async function espnFetch(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Sharkline/1.0" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Team ID Resolution ───

interface ESPNTeam {
  id: string;
  displayName: string;
  abbreviation: string;
}

interface ESPNEvent {
  id: string;
  date: string;
  shortName?: string;
  competitions?: Array<{
    competitors?: Array<{
      homeAway: string;
      team?: ESPNTeam;
      records?: Array<{ summary: string; type?: string }>;
      probables?: Array<{
        playerId: number;
        athlete?: { displayName?: string; shortName?: string };
        statistics?: Array<{ displayValue?: string; abbreviation?: string }>;
      }>;
    }>;
  }>;
  status?: { type?: { description?: string; completed?: boolean } };
}

async function getTeamIdsFromScoreboard(
  sport: string,
  league: string,
): Promise<Map<string, { id: string; record: string }>> {
  const cacheKey = `team_ids_${sport}_${league}`;
  const cached = getCached<Map<string, { id: string; record: string }>>(cacheKey, TEAM_CACHE_TTL);
  if (cached) return cached;

  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
  const data = await espnFetch(url) as { events?: ESPNEvent[] } | null;
  if (!data?.events) return new Map();

  const map = new Map<string, { id: string; record: string }>();
  for (const event of data.events) {
    const comp = event.competitions?.[0];
    if (!comp?.competitors) continue;
    for (const c of comp.competitors) {
      if (c.team?.id && c.team?.displayName) {
        map.set(c.team.displayName, {
          id: c.team.id,
          record: c.records?.[0]?.summary ?? "",
        });
      }
    }
  }

  setCache(cacheKey, map);
  return map;
}

// ─── Injuries ───

interface InjuryEntry {
  player: string;
  status: string;
  details: string;
}

async function fetchInjuries(
  sport: string,
  league: string,
  teamId: string,
): Promise<InjuryEntry[]> {
  const cacheKey = `injuries_${teamId}`;
  const cached = getCached<InjuryEntry[]>(cacheKey, TEAM_CACHE_TTL);
  if (cached) return cached;

  // Try the injuries endpoint (works for NBA, NFL, NHL, MLB)
  const injUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}/injuries`;
  const data = await espnFetch(injUrl) as {
    items?: Array<{
      athlete?: { displayName?: string };
      status?: string;
      details?: { detail?: string; type?: string };
    }>;
  } | null;

  const injuries: InjuryEntry[] = [];

  if (data?.items) {
    for (const item of data.items.slice(0, 8)) {
      const name = item.athlete?.displayName ?? "Unknown";
      const status = item.status ?? item.details?.type ?? "Unknown";
      const detail = item.details?.detail ?? "";
      injuries.push({ player: name, status, details: detail });
    }
  }

  setCache(cacheKey, injuries);
  return injuries;
}

// ─── Recent Form (Schedule) ───

interface FormResult {
  opponent: string;
  result: "W" | "L" | "D";
  score: string;
  isHome: boolean;
}

async function fetchRecentForm(
  sport: string,
  league: string,
  teamId: string,
  teamName: string,
): Promise<FormResult[]> {
  const cacheKey = `form_${teamId}`;
  const cached = getCached<FormResult[]>(cacheKey, TEAM_CACHE_TTL);
  if (cached) return cached;

  const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}/schedule`;
  const data = await espnFetch(url) as {
    events?: Array<{
      competitions?: Array<{
        competitors?: Array<{
          homeAway: string;
          team?: { displayName?: string };
          score?: { displayValue?: string; value?: number };
          winner?: boolean;
        }>;
        status?: { type?: { completed?: boolean } };
      }>;
    }>;
  } | null;

  const results: FormResult[] = [];
  if (!data?.events) { setCache(cacheKey, results); return results; }

  // Get completed games, most recent first
  const completed = data.events
    .filter((e) => e.competitions?.[0]?.status?.type?.completed)
    .reverse();

  for (const event of completed.slice(0, 5)) {
    const comp = event.competitions?.[0];
    if (!comp?.competitors) continue;

    const us = comp.competitors.find(
      (c) => c.team?.displayName?.toLowerCase() === teamName.toLowerCase(),
    ) ?? comp.competitors.find(
      (c) => c.team?.displayName?.toLowerCase().includes(teamName.split(" ").pop()?.toLowerCase() ?? ""),
    );
    const them = comp.competitors.find((c) => c !== us);
    if (!us || !them) continue;

    const ourScore = parseInt(us.score?.displayValue ?? "0", 10);
    const theirScore = parseInt(them.score?.displayValue ?? "0", 10);

    let result: "W" | "L" | "D" = "D";
    if (us.winner === true) result = "W";
    else if (us.winner === false) result = "L";
    else if (ourScore > theirScore) result = "W";
    else if (ourScore < theirScore) result = "L";

    results.push({
      opponent: them.team?.displayName ?? "?",
      result,
      score: `${ourScore}-${theirScore}`,
      isHome: us.homeAway === "home",
    });
  }

  setCache(cacheKey, results);
  return results;
}

// ─── Standings Context ───

async function fetchStandingsContext(
  sport: string,
  league: string,
  teamName: string,
): Promise<{ position: string; fightingFor: string }> {
  const cacheKey = `standings_${sport}_${league}`;
  const cached = getCached<Array<{ team: string; pos: number; total: number }>>(cacheKey, TEAM_CACHE_TTL);

  let entries: Array<{ team: string; pos: number; total: number }> = cached ?? [];

  if (!cached) {
    const url = `https://site.api.espn.com/apis/v2/sports/${sport}/${league}/standings`;
    const data = await espnFetch(url) as {
      children?: Array<{
        standings?: {
          entries?: Array<{
            team?: { displayName?: string };
          }>;
        };
      }>;
    } | null;

    if (data?.children) {
      let pos = 0;
      const allEntries: Array<{ team: string; pos: number; total: number }> = [];
      // Flatten all groups
      for (const group of data.children) {
        const groupEntries = group.standings?.entries ?? [];
        for (const entry of groupEntries) {
          pos++;
          allEntries.push({
            team: entry.team?.displayName ?? "",
            pos,
            total: groupEntries.length,
          });
        }
      }
      entries = allEntries;
      setCache(cacheKey, entries);
    }
  }

  const teamEntry = entries.find(
    (e) => e.team.toLowerCase() === teamName.toLowerCase(),
  ) ?? entries.find(
    (e) => e.team.toLowerCase().includes(teamName.split(" ").pop()?.toLowerCase() ?? ""),
  );

  if (!teamEntry) return { position: "?", fightingFor: "unknown" };

  const pos = teamEntry.pos;
  const total = entries.length || 20;
  const posStr = `${pos}${pos === 1 ? "st" : pos === 2 ? "nd" : pos === 3 ? "rd" : "th"}`;

  // Determine what they're fighting for based on position
  let fightingFor = "mid-table";
  if (sport === "soccer") {
    if (pos <= 1) fightingFor = "League title";
    else if (pos <= 4) fightingFor = "Champions League qualification";
    else if (pos <= 6) fightingFor = "Europa League qualification";
    else if (pos <= 7) fightingFor = "Conference League qualification";
    else if (pos >= total - 2) fightingFor = "Avoiding relegation — must win";
    else if (pos >= total - 4) fightingFor = "Relegation danger";
    else fightingFor = "Mid-table — nothing to play for";
  } else if (sport === "basketball" || sport === "hockey") {
    if (pos <= 1) fightingFor = "Conference #1 seed";
    else if (pos <= 3) fightingFor = "Top seed / home court advantage";
    else if (pos <= 6) fightingFor = "Secure playoff position";
    else if (pos <= 8) fightingFor = "Playoff bubble — must win";
    else if (pos <= 10) fightingFor = "Play-in tournament contention";
    else fightingFor = "Out of contention — nothing to play for";
  } else if (sport === "baseball") {
    if (pos <= 1) fightingFor = "Division lead";
    else if (pos <= 3) fightingFor = "Wild card contention";
    else fightingFor = "Out of contention";
  }

  return { position: posStr, fightingFor };
}

// ─── Weather ───

// Major venue coordinates (approximate)
const VENUE_COORDS: Record<string, { lat: number; lon: number }> = {
  // MLB
  "New York Yankees": { lat: 40.829, lon: -73.926 },
  "New York Mets": { lat: 40.757, lon: -73.846 },
  "Boston Red Sox": { lat: 42.346, lon: -71.098 },
  "Chicago Cubs": { lat: 41.948, lon: -87.656 },
  "Chicago White Sox": { lat: 41.830, lon: -87.634 },
  "Los Angeles Dodgers": { lat: 34.074, lon: -118.240 },
  "San Francisco Giants": { lat: 37.778, lon: -122.389 },
  "Houston Astros": { lat: 29.757, lon: -95.355 },
  "Philadelphia Phillies": { lat: 39.906, lon: -75.166 },
  "Atlanta Braves": { lat: 33.891, lon: -84.468 },
  "Seattle Mariners": { lat: 47.591, lon: -122.332 },
  "Cleveland Guardians": { lat: 41.496, lon: -81.685 },
  "Detroit Tigers": { lat: 42.339, lon: -83.049 },
  "Minnesota Twins": { lat: 44.982, lon: -93.278 },
  "Milwaukee Brewers": { lat: 43.028, lon: -87.971 },
  "St. Louis Cardinals": { lat: 38.623, lon: -90.193 },
  "Pittsburgh Pirates": { lat: 40.447, lon: -80.006 },
  "Cincinnati Reds": { lat: 39.097, lon: -84.507 },
  "Colorado Rockies": { lat: 39.756, lon: -104.994 },
  "Arizona Diamondbacks": { lat: 33.445, lon: -112.067 },
  "San Diego Padres": { lat: 32.707, lon: -117.157 },
  "Los Angeles Angels": { lat: 33.800, lon: -117.883 },
  "Texas Rangers": { lat: 32.751, lon: -97.083 },
  "Kansas City Royals": { lat: 39.051, lon: -94.480 },
  "Tampa Bay Rays": { lat: 27.768, lon: -82.653 },
  "Baltimore Orioles": { lat: 39.284, lon: -76.622 },
  "Washington Nationals": { lat: 38.873, lon: -77.008 },
  "Miami Marlins": { lat: 25.778, lon: -80.220 },
  "Athletics": { lat: 37.752, lon: -122.201 },
  "Toronto Blue Jays": { lat: 43.641, lon: -79.389 },
  // EPL
  "Arsenal": { lat: 51.555, lon: -0.108 },
  "Manchester City": { lat: 53.483, lon: -2.200 },
  "Liverpool": { lat: 53.431, lon: -2.961 },
  "Chelsea": { lat: 51.482, lon: -0.191 },
  "Manchester United": { lat: 53.463, lon: -2.291 },
  "Tottenham Hotspur": { lat: 51.604, lon: -0.066 },
  "Newcastle United": { lat: 54.976, lon: -1.622 },
  "Aston Villa": { lat: 52.509, lon: -1.885 },
  // NBA / NHL — indoor, weather irrelevant
  // Soccer — general European cities
  "Real Madrid": { lat: 40.453, lon: -3.688 },
  "Barcelona": { lat: 41.381, lon: 2.123 },
  "AC Milan": { lat: 45.478, lon: 9.124 },
  "Inter Milan": { lat: 45.478, lon: 9.124 },
  "Juventus": { lat: 45.110, lon: 7.641 },
  "Bayern Munich": { lat: 48.219, lon: 11.625 },
  "Borussia Dortmund": { lat: 51.493, lon: 7.451 },
  "Paris Saint-Germain": { lat: 48.842, lon: 2.253 },
};

// Sports where weather matters
const OUTDOOR_SPORTS = new Set(["soccer", "baseball"]);

async function fetchWeather(
  homeTeam: string,
  sport: string,
): Promise<string> {
  if (!OUTDOOR_SPORTS.has(sport)) return "";

  const coords = VENUE_COORDS[homeTeam];
  if (!coords) return "";

  const cacheKey = `weather_${coords.lat}_${coords.lon}`;
  const cached = getCached<string>(cacheKey, WEATHER_CACHE_TTL);
  if (cached) return cached;

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true&hourly=precipitation_probability`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
    });
    if (!res.ok) return "";

    const data = await res.json() as {
      current_weather?: {
        temperature?: number;
        windspeed?: number;
        weathercode?: number;
      };
      hourly?: { precipitation_probability?: number[] };
    };

    const cw = data.current_weather;
    if (!cw) return "";

    const temp = Math.round(cw.temperature ?? 0);
    const wind = Math.round(cw.windspeed ?? 0);
    const rainProb = data.hourly?.precipitation_probability?.[0] ?? 0;

    const weatherCode = cw.weathercode ?? 0;
    let condition = "Clear";
    if (weatherCode >= 61) condition = "Rain";
    else if (weatherCode >= 51) condition = "Drizzle";
    else if (weatherCode >= 45) condition = "Fog";
    else if (weatherCode >= 3) condition = "Overcast";
    else if (weatherCode >= 2) condition = "Partly cloudy";

    const result = `${temp}°C, ${condition}, ${wind}km/h wind${rainProb > 30 ? `, ${rainProb}% rain chance` : ""}`;
    setCache(cacheKey, result);
    return result;
  } catch {
    return "";
  }
}

// ─── Main Research Function ───

export async function buildResearchPackets(
  sportKeys: string[],
): Promise<GameResearch[]> {
  const packets: GameResearch[] = [];
  const seenLeagues = new Set<string>();
  let requestCount = 0;
  const MAX_REQUESTS = 30;

  for (const sportKey of sportKeys) {
    const espn = SPORT_KEY_TO_ESPN[sportKey];
    if (!espn) continue;
    const leagueId = `${espn.sport}/${espn.league}`;
    if (seenLeagues.has(leagueId)) continue;
    seenLeagues.add(leagueId);

    // Get today's games and team IDs
    const teamMap = await getTeamIdsFromScoreboard(espn.sport, espn.league);
    requestCount++;
    if (teamMap.size === 0) continue;

    // Get scoreboard for game list
    const scoreUrl = `https://site.api.espn.com/apis/site/v2/sports/${espn.sport}/${espn.league}/scoreboard`;
    const scoreData = await espnFetch(scoreUrl) as { events?: ESPNEvent[] } | null;
    requestCount++;
    if (!scoreData?.events) continue;

    const leagueName = getLeagueName(sportKey);

    for (const event of scoreData.events) {
      if (requestCount >= MAX_REQUESTS) break;

      const comp = event.competitions?.[0];
      if (!comp?.competitors) continue;
      if (event.status?.type?.completed) continue;

      const homeComp = comp.competitors.find((c) => c.homeAway === "home");
      const awayComp = comp.competitors.find((c) => c.homeAway === "away");
      if (!homeComp?.team || !awayComp?.team) continue;

      const homeName = homeComp.team.displayName ?? "";
      const awayName = awayComp.team.displayName ?? "";
      const homeId = homeComp.team.id ?? teamMap.get(homeName)?.id;
      const awayId = awayComp.team.id ?? teamMap.get(awayName)?.id;

      // Build research for each team (parallel where possible)
      const [homeInjuries, awayInjuries, homeForm, awayForm, homeStandings, awayStandings, weather] =
        await Promise.all([
          homeId ? fetchInjuries(espn.sport, espn.league, homeId) : Promise.resolve([]),
          awayId ? fetchInjuries(espn.sport, espn.league, awayId) : Promise.resolve([]),
          homeId ? fetchRecentForm(espn.sport, espn.league, homeId, homeName) : Promise.resolve([]),
          awayId ? fetchRecentForm(espn.sport, espn.league, awayId, awayName) : Promise.resolve([]),
          fetchStandingsContext(espn.sport, espn.league, homeName),
          fetchStandingsContext(espn.sport, espn.league, awayName),
          fetchWeather(homeName, espn.sport),
        ]);
      requestCount += 4; // injuries x2 + form x2 (standings & weather cached)

      // Compute form stats
      const homeGoalsScored = homeForm.length > 0
        ? homeForm.reduce((s, r) => s + parseInt(r.score.split("-")[0], 10), 0) / homeForm.length
        : 0;
      const homeGoalsConceded = homeForm.length > 0
        ? homeForm.reduce((s, r) => s + parseInt(r.score.split("-")[1], 10), 0) / homeForm.length
        : 0;
      const awayGoalsScored = awayForm.length > 0
        ? awayForm.reduce((s, r) => s + parseInt(r.score.split("-")[0], 10), 0) / awayForm.length
        : 0;
      const awayGoalsConceded = awayForm.length > 0
        ? awayForm.reduce((s, r) => s + parseInt(r.score.split("-")[1], 10), 0) / awayForm.length
        : 0;

      // Compute home/away records from form
      const homeHomeGames = homeForm.filter((r) => r.isHome);
      const homeHomeRecord = homeHomeGames.length > 0
        ? `${homeHomeGames.filter((r) => r.result === "W").length}W-${homeHomeGames.filter((r) => r.result === "D").length}D-${homeHomeGames.filter((r) => r.result === "L").length}L (last ${homeHomeGames.length})`
        : "";
      const awayAwayGames = awayForm.filter((r) => !r.isHome);
      const awayAwayRecord = awayAwayGames.length > 0
        ? `${awayAwayGames.filter((r) => r.result === "W").length}W-${awayAwayGames.filter((r) => r.result === "D").length}D-${awayAwayGames.filter((r) => r.result === "L").length}L (last ${awayAwayGames.length})`
        : "";

      // Streak
      const computeStreak = (form: FormResult[]): string => {
        if (form.length === 0) return "";
        const first = form[0].result;
        let count = 0;
        for (const r of form) {
          if (r.result === first) count++;
          else break;
        }
        return `${first}${count}`;
      };

      // Context notes
      const notes: string[] = [];
      if (homeStandings.fightingFor.includes("relegation")) notes.push(`${homeName} in relegation danger`);
      if (awayStandings.fightingFor.includes("relegation")) notes.push(`${awayName} in relegation danger`);
      if (homeStandings.fightingFor.includes("title")) notes.push(`${homeName} in title race`);
      if (awayStandings.fightingFor.includes("nothing")) notes.push(`${awayName} has nothing to play for`);
      if (homeInjuries.length >= 3) notes.push(`${homeName} has ${homeInjuries.length} injuries`);
      if (awayInjuries.length >= 3) notes.push(`${awayName} has ${awayInjuries.length} injuries`);

      // Extract probable pitchers for MLB games
      let probablePitchers: { home: ProbablePitcher | null; away: ProbablePitcher | null } | undefined;
      if (sportKey === "baseball_mlb") {
        const extractPitcher = (competitor: typeof homeComp): ProbablePitcher | null => {
          const probable = competitor?.probables?.[0];
          if (!probable?.athlete?.displayName) return null;
          const stats = (probable.statistics ?? [])
            .map((s) => `${s.displayValue ?? ""} ${s.abbreviation ?? ""}`.trim())
            .filter(Boolean)
            .join(", ");
          return { name: probable.athlete.displayName, stats: stats || "stats unavailable" };
        };
        probablePitchers = {
          home: extractPitcher(homeComp),
          away: extractPitcher(awayComp),
        };
      }

      packets.push({
        game: `${homeName} vs ${awayName}`,
        league: leagueName,
        sportKey,
        gameTime: event.date ?? "",
        homeTeam: {
          name: homeName,
          record: teamMap.get(homeName)?.record ?? homeComp.records?.[0]?.summary ?? "",
          position: homeStandings.position,
          fightingFor: homeStandings.fightingFor,
          lastFive: homeForm.map((r) => r.result),
          homeRecord: homeHomeRecord,
          awayRecord: "",
          injuries: homeInjuries.map((i) => `${i.player} (${i.status}${i.details ? `: ${i.details}` : ""})`),
          recentGoalsScored: Math.round(homeGoalsScored * 10) / 10,
          recentGoalsConceded: Math.round(homeGoalsConceded * 10) / 10,
          streak: computeStreak(homeForm),
        },
        awayTeam: {
          name: awayName,
          record: teamMap.get(awayName)?.record ?? awayComp.records?.[0]?.summary ?? "",
          position: awayStandings.position,
          fightingFor: awayStandings.fightingFor,
          lastFive: awayForm.map((r) => r.result),
          homeRecord: "",
          awayRecord: awayAwayRecord,
          injuries: awayInjuries.map((i) => `${i.player} (${i.status}${i.details ? `: ${i.details}` : ""})`),
          recentGoalsScored: Math.round(awayGoalsScored * 10) / 10,
          recentGoalsConceded: Math.round(awayGoalsConceded * 10) / 10,
          streak: computeStreak(awayForm),
        },
        h2h: "", // ESPN doesn't have a clean h2h endpoint — Claude can reference from knowledge
        weather,
        contextNotes: notes.join(". ") || "",
        probablePitchers,
      });
    }
  }

  return packets;
}

// ─── Format Research for Claude Prompt ───

export function formatResearchForPrompt(packets: GameResearch[]): string {
  if (packets.length === 0) return "(No research data available)";

  return packets.map((p, i) => {
    const lines: string[] = [
      `\n═══ GAME ${i + 1}: ${p.game} ═══`,
      `League: ${p.league} | Kickoff: ${p.gameTime}`,
    ];

    // Home team
    lines.push(`\n📊 ${p.homeTeam.name} (HOME):`);
    lines.push(`  Record: ${p.homeTeam.record} | Position: ${p.homeTeam.position}`);
    lines.push(`  Fighting for: ${p.homeTeam.fightingFor}`);
    if (p.homeTeam.lastFive.length > 0) lines.push(`  Last 5: ${p.homeTeam.lastFive.join("-")} (${p.homeTeam.streak})`);
    if (p.homeTeam.homeRecord) lines.push(`  Home form: ${p.homeTeam.homeRecord}`);
    lines.push(`  Goals/game (last 5): ${p.homeTeam.recentGoalsScored} scored, ${p.homeTeam.recentGoalsConceded} conceded`);
    if (p.homeTeam.injuries.length > 0) {
      lines.push(`  🏥 Injuries: ${p.homeTeam.injuries.join("; ")}`);
    }

    // Away team
    lines.push(`\n📊 ${p.awayTeam.name} (AWAY):`);
    lines.push(`  Record: ${p.awayTeam.record} | Position: ${p.awayTeam.position}`);
    lines.push(`  Fighting for: ${p.awayTeam.fightingFor}`);
    if (p.awayTeam.lastFive.length > 0) lines.push(`  Last 5: ${p.awayTeam.lastFive.join("-")} (${p.awayTeam.streak})`);
    if (p.awayTeam.awayRecord) lines.push(`  Away form: ${p.awayTeam.awayRecord}`);
    lines.push(`  Goals/game (last 5): ${p.awayTeam.recentGoalsScored} scored, ${p.awayTeam.recentGoalsConceded} conceded`);
    if (p.awayTeam.injuries.length > 0) {
      lines.push(`  🏥 Injuries: ${p.awayTeam.injuries.join("; ")}`);
    }

    // Probable pitchers (MLB)
    if (p.probablePitchers) {
      lines.push(`\n⚾ Probable Pitchers:`);
      if (p.probablePitchers.away) {
        lines.push(`  Away: ${p.probablePitchers.away.name} (${p.probablePitchers.away.stats})`);
      }
      if (p.probablePitchers.home) {
        lines.push(`  Home: ${p.probablePitchers.home.name} (${p.probablePitchers.home.stats})`);
      }
      if (!p.probablePitchers.home && !p.probablePitchers.away) {
        lines.push(`  TBD — use rotation knowledge to identify starters`);
      }
    }

    if (p.h2h) lines.push(`\n🔄 H2H: ${p.h2h}`);
    if (p.weather) lines.push(`🌤️ Weather: ${p.weather}`);
    if (p.contextNotes) lines.push(`📌 Context: ${p.contextNotes}`);

    return lines.join("\n");
  }).join("\n");
}

// ─── Helper ───

function getLeagueName(sportKey: string): string {
  const names: Record<string, string> = {
    soccer_epl: "Premier League", soccer_spain_la_liga: "La Liga",
    soccer_italy_serie_a: "Serie A", soccer_germany_bundesliga: "Bundesliga",
    soccer_france_ligue_one: "Ligue 1", soccer_usa_mls: "MLS",
    soccer_uefa_champs_league: "Champions League",
    basketball_nba: "NBA", icehockey_nhl: "NHL",
    baseball_mlb: "MLB", americanfootball_nfl: "NFL",
    mma_mixed_martial_arts: "UFC",
  };
  return names[sportKey] ?? sportKey;
}
