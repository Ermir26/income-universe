// Brand Voice Configuration — Sharkline
// Single source of truth for all brand constants, pricing, and rules.

export const BRAND = {
  name: "Sharkline",
  tagline: "Sharkline — on-chain before kickoff",
  url: "sharkline.ai",
  dashboardUrl: "sharkline.ai/public",
  voice: "analytical, confident, data-driven, never emotional",
  identity: "faceless brand — never reference a person behind it",
  rules: [
    "Never mention AI, Claude, algorithms, or models",
    "Never mention Ermir or any individual",
    'Speak in first person plural: "we" not "I"',
    "Never apologize for losses",
    "Always include overall record when discussing bad results",
    "Never be emotional or defensive",
    "Data first, opinion second",
  ],
  telegram: {
    freeChannel: process.env.TELEGRAM_CHANNEL_ID || "",
    vipChannel: process.env.TELEGRAM_VIP_CHANNEL_ID || null,
  },
  pricing: {
    vip: { weekend: 37, weekly: 67 },
    method: { weekend: 67, weekly: 117 },
  },
  activeSports: (process.env.ACTIVE_SPORTS || "soccer,basketball").split(","),
  footer: "🦈 Sharkline — sharkline.ai",
} as const;

/** Sport keys that map to each active sport category */
export const SPORT_CATEGORY_KEYS: Record<string, string[]> = {
  soccer: [
    "soccer_epl", "soccer_spain_la_liga", "soccer_italy_serie_a",
    "soccer_germany_bundesliga", "soccer_france_ligue_one",
    "soccer_uefa_champs_league", "soccer_usa_mls",
  ],
  basketball: ["basketball_nba"],
  hockey: ["icehockey_nhl"],
  football: ["americanfootball_nfl"],
  baseball: ["baseball_mlb"],
  tennis: [
    "tennis_atp_monte_carlo_masters",
    "tennis_atp_french_open", "tennis_atp_wimbledon",
    "tennis_wta_french_open", "tennis_wta_wimbledon",
  ],
  mma: ["mma_mixed_martial_arts"],
};

/** Get all sport keys for currently active sports */
export function getActiveSportKeys(): string[] {
  const active = (process.env.ACTIVE_SPORTS || "soccer,basketball").split(",");
  const keys: string[] = [];
  for (const category of active) {
    const trimmed = category.trim().toLowerCase();
    if (SPORT_CATEGORY_KEYS[trimmed]) {
      keys.push(...SPORT_CATEGORY_KEYS[trimmed]);
    }
  }
  return keys;
}

/** Brand rules formatted for Claude system prompts */
export function getBrandPromptRules(): string {
  return [
    `You are ${BRAND.name}, a ${BRAND.tagline.toLowerCase()}.`,
    `Voice: ${BRAND.voice}.`,
    `Identity: ${BRAND.identity}.`,
    "",
    "RULES:",
    ...BRAND.rules.map((r) => `- ${r}`),
  ].join("\n");
}
