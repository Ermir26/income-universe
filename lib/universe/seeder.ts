import { supabaseAdmin } from "../supabase/server";
import type { GalaxyInsert, PlanetInsert, AgentConfig } from "../supabase/types";
import { GALAXY_COLORS } from "../claude/builder";

interface SeedPlanet {
  name: string;
  icon: string;
  category: string;
  galaxyName: string;
  description: string;
  agents: AgentConfig[];
  firstTask: string;
  monthlyTarget: string;
}

const SEED_PLANETS: SeedPlanet[] = [
  {
    name: "Sharkline",
    icon: "🎯",
    category: "Trading",
    galaxyName: "Trading Galaxy",
    description: "Telegram sports picks bot. AI analyzes odds, finds value bets, posts 2x daily.",
    agents: [
      { name: "odds-scanner", type: "analytics", schedule: "0 8,18 * * *", enabled: true },
      { name: "tipster-poster", type: "social", schedule: "0 9,19 * * *", enabled: true },
    ],
    firstTask: "Scan today's odds across major sports, identify top 3 value plays, post to Telegram",
    monthlyTarget: "$200-500",
  },
  {
    name: "Etsy Empire",
    icon: "🛍️",
    category: "Digital Products",
    galaxyName: "Digital Products Galaxy",
    description: "Auto-generates and lists digital products on Etsy. Planners, templates, printables.",
    agents: [
      { name: "product-generator", type: "content", schedule: "0 6 * * 1", enabled: true },
      { name: "listing-manager", type: "sales", schedule: "0 10 * * *", enabled: true },
      { name: "trend-researcher", type: "research", schedule: "0 7 * * 1,4", enabled: true },
    ],
    firstTask: "Research top-selling Etsy digital product niches, generate 3 starter products",
    monthlyTarget: "$500-2000",
  },
  {
    name: "AI Agency Prospector",
    icon: "🤖",
    category: "Services",
    galaxyName: "Services Galaxy",
    description: "Finds businesses needing AI automation, sends personalized cold emails via Resend.",
    agents: [
      { name: "lead-finder", type: "research", schedule: "0 8 * * 1-5", enabled: true },
      { name: "email-sender", type: "outreach", schedule: "0 10 * * 1-5", enabled: true },
      { name: "follow-up", type: "outreach", schedule: "0 14 * * 2,4", enabled: true },
    ],
    firstTask: "Research 20 SMBs needing AI automation, draft personalized outreach templates",
    monthlyTarget: "$1000-5000",
  },
  {
    name: "Content Engine",
    icon: "✍️",
    category: "Content",
    galaxyName: "Content Galaxy",
    description: "Writes newsletter content + social media posts. Monetizes via sponsorships and affiliates.",
    agents: [
      { name: "newsletter-writer", type: "content", schedule: "0 6 * * 3", enabled: true },
      { name: "social-poster", type: "social", schedule: "0 9,15 * * 1-5", enabled: true },
      { name: "topic-researcher", type: "research", schedule: "0 7 * * 1", enabled: true },
    ],
    firstTask: "Select newsletter niche, write first issue, set up social media scheduling",
    monthlyTarget: "$300-1500",
  },
  {
    name: "Sharp Bettor",
    icon: "📊",
    category: "Trading",
    galaxyName: "Trading Galaxy",
    description: "Scans odds across bookmakers for value discrepancies. Alerts on Telegram.",
    agents: [
      { name: "odds-scanner", type: "analytics", schedule: "0 */4 * * *", enabled: true },
      { name: "value-alerter", type: "social", schedule: "0 */4 * * *", enabled: true },
    ],
    firstTask: "Set up odds API scanning for NFL, NBA, EPL. Find first value bet opportunity",
    monthlyTarget: "$100-400",
  },
  {
    name: "Lead Machine",
    icon: "🔗",
    category: "Services",
    galaxyName: "Services Galaxy",
    description: "B2B referral connector. Matches service providers with businesses needing help.",
    agents: [
      { name: "lead-scraper", type: "research", schedule: "0 8 * * 1-5", enabled: true },
      { name: "match-maker", type: "outreach", schedule: "0 11 * * 1-5", enabled: true },
    ],
    firstTask: "Identify 5 service niches with referral potential, build initial provider database",
    monthlyTarget: "$500-2000",
  },
  {
    name: "Micro Newsletter",
    icon: "📬",
    category: "Content",
    galaxyName: "Content Galaxy",
    description: "Ultra-niche curated newsletter with affiliate links. Weekly send via Resend.",
    agents: [
      { name: "curator", type: "research", schedule: "0 7 * * 1,3,5", enabled: true },
      { name: "writer", type: "content", schedule: "0 8 * * 5", enabled: true },
      { name: "sender", type: "outreach", schedule: "0 10 * * 6", enabled: true },
    ],
    firstTask: "Pick a micro-niche topic, curate first 10 links, write intro newsletter",
    monthlyTarget: "$200-800",
  },
];

export async function seedUniverse(): Promise<{ galaxies: number; planets: number }> {
  console.log("[Seeder] Deploying 7 seed planets...");

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log("[Seeder] Mock mode — simulating seed deployment");
    SEED_PLANETS.forEach((p) => console.log(`  Deployed: ${p.icon} ${p.name} (${p.category})`));
    return { galaxies: 4, planets: 7 };
  }

  const galaxyIds: Record<string, string> = {};

  // Create galaxies first
  const uniqueGalaxies = [...new Set(SEED_PLANETS.map((p) => p.category))];
  for (const category of uniqueGalaxies) {
    const planet = SEED_PLANETS.find((p) => p.category === category);
    if (!planet) continue;

    const galaxy: GalaxyInsert = {
      name: planet.galaxyName,
      category,
      color: GALAXY_COLORS[category] || GALAXY_COLORS.Other,
      description: `Income streams in ${category}`,
      status: "active",
    };

    const { data, error } = await supabaseAdmin
      .from("galaxies")
      .insert(galaxy)
      .select("id")
      .single();

    if (error) {
      console.error(`[Seeder] Failed to create galaxy ${category}:`, error.message);
      continue;
    }
    galaxyIds[category] = data.id;
    console.log(`  Galaxy: ${planet.galaxyName} (${category})`);
  }

  // Create planets
  let planetCount = 0;
  for (const seed of SEED_PLANETS) {
    const galaxyId = galaxyIds[seed.category];
    if (!galaxyId) continue;

    const planet: PlanetInsert = {
      galaxy_id: galaxyId,
      name: seed.name,
      icon: seed.icon,
      category: seed.category,
      status: "active",
      feasibility_score: 75, // Pre-seeded as viable
      monthly_target: seed.monthlyTarget,
      agents: seed.agents,
      config: { seeded: true },
      source_url: null,
      market_signal: "Seed planet — pre-validated idea",
      description: seed.description,
      first_task: seed.firstTask,
      activated_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin.from("planets").insert(planet);
    if (error) {
      console.error(`[Seeder] Failed to create planet ${seed.name}:`, error.message);
      continue;
    }
    planetCount++;
    console.log(`  Planet: ${seed.icon} ${seed.name}`);
  }

  // Update galaxy planet counts
  for (const [category, galaxyId] of Object.entries(galaxyIds)) {
    const count = SEED_PLANETS.filter((p) => p.category === category).length;
    await supabaseAdmin
      .from("galaxies")
      .update({ planet_count: count })
      .eq("id", galaxyId);
  }

  // Update universe stats
  await supabaseAdmin
    .from("universe_stats")
    .update({
      total_planets: planetCount,
      active_planets: planetCount,
      total_galaxies: Object.keys(galaxyIds).length,
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  console.log(
    `[Seeder] Complete: ${Object.keys(galaxyIds).length} galaxies, ${planetCount} planets deployed`
  );

  return { galaxies: Object.keys(galaxyIds).length, planets: planetCount };
}

export { SEED_PLANETS };
