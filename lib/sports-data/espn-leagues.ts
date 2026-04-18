// ESPN league slug mapping for scoreboard API
// URL pattern: https://site.api.espn.com/apis/site/v2/sports/{sport}/{slug}/scoreboard

export const ESPN_SOCCER_LEAGUES = {
  // UEFA club
  'UEFA Champions League': 'uefa.champions',
  'UEFA Europa League': 'uefa.europa',
  'UEFA Europa Conference League': 'uefa.europa.conf',
  'UEFA Super Cup': 'uefa.super_cup',
  // UEFA national teams
  'UEFA Euro': 'uefa.euro',
  'UEFA Euro Qualifying': 'uefa.euroq',
  'UEFA Nations League': 'uefa.nations',
  // FIFA
  'FIFA World Cup': 'fifa.world',
  'FIFA Club World Cup': 'fifa.cwc',
  "FIFA Women's World Cup": 'fifa.wwc',
  'FIFA U-20 World Cup': 'fifa.world.u20',
  'FIFA U-17 World Cup': 'fifa.world.u17',
  'World Cup Qualifying (UEFA)': 'fifa.worldq.uefa',
  'World Cup Qualifying (Global)': 'fifa.worldq',
  // Top 5 European leagues
  'Premier League': 'eng.1',
  'La Liga': 'esp.1',
  'Serie A': 'ita.1',
  'Bundesliga': 'ger.1',
  'Ligue 1': 'fra.1',
  // Other leagues
  'MLS': 'usa.1',
  'Eredivisie': 'ned.1',
  'Primeira Liga': 'por.1',
  'Scottish Premiership': 'sco.1',
  'EFL Championship': 'eng.2',
} as const;

// Map sport_key (Odds API format) → ESPN sport/league path
export const SPORT_KEY_TO_ESPN: Record<string, { sport: string; league: string }> = {
  // Soccer
  soccer_epl: { sport: 'soccer', league: 'eng.1' },
  soccer_spain_la_liga: { sport: 'soccer', league: 'esp.1' },
  soccer_italy_serie_a: { sport: 'soccer', league: 'ita.1' },
  soccer_germany_bundesliga: { sport: 'soccer', league: 'ger.1' },
  soccer_france_ligue_one: { sport: 'soccer', league: 'fra.1' },
  soccer_usa_mls: { sport: 'soccer', league: 'usa.1' },
  soccer_uefa_champs_league: { sport: 'soccer', league: 'uefa.champions' },
  soccer_uefa_europa_league: { sport: 'soccer', league: 'uefa.europa' },
  // Basketball (no league slug — uses /basketball/nba/scoreboard)
  basketball_nba: { sport: 'basketball', league: 'nba' },
  basketball_euroleague: { sport: 'basketball', league: 'eur.euroleague' },
  // Ice Hockey
  icehockey_nhl: { sport: 'hockey', league: 'nhl' },
  // Baseball
  baseball_mlb: { sport: 'baseball', league: 'mlb' },
  // American Football
  americanfootball_nfl: { sport: 'football', league: 'nfl' },
  // MMA
  mma_mixed_martial_arts: { sport: 'mma', league: 'ufc' },
};

// Map league display name → ESPN soccer slug (for picks that store league name, not sport_key)
export const LEAGUE_NAME_TO_ESPN_SLUG: Record<string, string> = {
  'Premier League': 'eng.1',
  'EPL': 'eng.1',
  'English Premier League': 'eng.1',
  'La Liga': 'esp.1',
  'Spanish La Liga': 'esp.1',
  'Serie A': 'ita.1',
  'Italian Serie A': 'ita.1',
  'Bundesliga': 'ger.1',
  'German Bundesliga': 'ger.1',
  'Ligue 1': 'fra.1',
  'French Ligue 1': 'fra.1',
  'MLS': 'usa.1',
  'Champions League': 'uefa.champions',
  'UEFA Champions League': 'uefa.champions',
  'Europa League': 'uefa.europa',
  'UEFA Europa League': 'uefa.europa',
  'NBA': 'nba',
  'NHL': 'nhl',
  'MLB': 'mlb',
  'NFL': 'nfl',
};

// Estimated game duration in minutes by sport_key prefix
export function getEstimatedDurationMinutes(sportKey: string): number {
  if (sportKey.startsWith('soccer_')) return 115;
  if (sportKey.startsWith('basketball_')) return 140;
  if (sportKey.startsWith('icehockey_')) return 150;
  if (sportKey.startsWith('baseball_')) return 195;
  if (sportKey.startsWith('americanfootball_')) return 195;
  if (sportKey.startsWith('mma_')) return 120;
  return 150; // safe default
}

// Grace period before first settlement check (minutes after estimated end)
export const SETTLEMENT_GRACE_MINUTES = 5;
