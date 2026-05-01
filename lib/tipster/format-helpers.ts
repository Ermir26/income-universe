/**
 * Shared format helpers for Sharkline pick display.
 * Used in Telegram format functions, dashboard, and public pick pages.
 */

/**
 * Format American odds with explicit sign.
 * Positive odds get a leading "+", negative already have "-", zero/invalid → "EVEN".
 */
export function formatAmericanOdds(price: string | number): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(num) || num === 0) return "EVEN";
  if (num > 0) return `+${num}`;
  return `${num}`; // already has minus sign
}

/**
 * Parse a "Home Team vs Away Team" game string into team names.
 * Returns null if the format doesn't match.
 */
export function parseGameTeams(game: string): { home: string; away: string } | null {
  const parts = game.split(" vs ");
  if (parts.length !== 2) return null;
  const home = parts[0].trim();
  const away = parts[1].trim();
  if (!home || !away) return null;
  return { home, away };
}

/**
 * Resolve the "side" field into a human-readable pick display string.
 *
 * For h2h (moneyline): home → home team name, away → away team name
 * For spreads: home → "TeamName +1.5", away → "TeamName -1.5"
 * For totals: over → "Over N", under → "Under N"
 *
 * Falls back to raw side if game can't be parsed.
 */
export function formatPickDisplay(opts: {
  side: string;
  bet_type: string;
  game: string;
  line?: number | string | null;
}): string {
  const { side, bet_type, game, line } = opts;
  const sideLower = side.toLowerCase();

  // Totals: "Over N" / "Under N"
  if (bet_type === "total" || bet_type === "totals") {
    const label = sideLower === "over" ? "Over" : sideLower === "under" ? "Under" : side;
    return line != null && line !== "" ? `${label} ${line}` : label;
  }

  // For h2h and spreads, resolve home/away to team names
  const teams = parseGameTeams(game);

  if (teams) {
    let teamName: string;
    if (sideLower === "home") {
      teamName = teams.home;
    } else if (sideLower === "away") {
      teamName = teams.away;
    } else {
      // Side might already be a team name — pass through
      teamName = side;
    }

    // Spreads: append line with sign
    if (bet_type === "spread" || bet_type === "spreads") {
      if (line != null && line !== "") {
        const lineNum = typeof line === "string" ? parseFloat(line) : line;
        if (!isNaN(lineNum)) {
          const lineStr = lineNum >= 0 ? `+${lineNum}` : `${lineNum}`;
          return `${teamName} ${lineStr}`;
        }
      }
      return teamName;
    }

    // H2H / moneyline: just team name
    return teamName;
  }

  // Fallback: can't parse game, use raw side
  if ((bet_type === "spread" || bet_type === "spreads") && line != null && line !== "") {
    const lineNum = typeof line === "string" ? parseFloat(line) : line;
    if (!isNaN(lineNum)) {
      const lineStr = lineNum >= 0 ? `+${lineNum}` : `${lineNum}`;
      return `${side} ${lineStr}`;
    }
  }

  return side;
}

/**
 * Map a canonical side value ("home"/"away") to the actual team name,
 * given a game string in "Home vs Away" format.
 * Returns the original side if mapping is not possible.
 */
export function sideToTeamName(side: string, game: string): string {
  const sideLower = side.toLowerCase();
  if (sideLower === "over" || sideLower === "under") return side;
  const teams = parseGameTeams(game);
  if (!teams) return side;
  if (sideLower === "home") return teams.home;
  if (sideLower === "away") return teams.away;
  return side;
}
