import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../supabase/server";
import type { FeasibilityBreakdown, PlanetInsert, GalaxyInsert, AgentConfig } from "../supabase/types";

const GALAXY_COLORS: Record<string, string> = {
  SaaS: "#38bdf8",
  "Digital Products": "#a78bfa",
  Content: "#4ade80",
  Services: "#fb923c",
  Trading: "#f87171",
  Affiliate: "#fbbf24",
  Other: "#94a3b8",
};

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("BUILDER: Mock mode — no ANTHROPIC_API_KEY");
    return null;
  }
  return new Anthropic();
}

interface PlanetConfig {
  name: string;
  icon: string;
  category: string;
  description: string;
  agents: AgentConfig[];
  firstTask: string;
  monthlyTarget: string;
}

function mockBuild(name: string, category: string, description: string): PlanetConfig {
  return {
    name,
    icon: "🪐",
    category,
    description,
    agents: [
      { name: "researcher", type: "research", schedule: "0 */6 * * *", enabled: true },
      { name: "executor", type: "execute", schedule: "0 */12 * * *", enabled: true },
    ],
    firstTask: `Initialize ${name}: research market, set up automation pipeline, create first deliverable`,
    monthlyTarget: "$500-2000",
  };
}

export async function buildPlanet(
  discoveryId: string,
  name: string,
  category: string,
  description: string,
  feasibilityScore: number,
  feasibilityBreakdown: FeasibilityBreakdown
): Promise<{ planetId: string; galaxyId: string } | null> {
  const client = getClient();

  let config: PlanetConfig;

  if (!client) {
    config = mockBuild(name, category, description);
  } else {
    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 2048,
      messages: [
        {
          role: "user",
          content: `Design an autonomous income planet for this idea:

Name: ${name}
Category: ${category}
Description: ${description}
Feasibility Score: ${feasibilityScore}/100

Design the planet config:
1. Name (catchy brand name)
2. Icon (single emoji)
3. Agents needed (each with name, type, cron schedule)
4. First task to execute
5. Realistic monthly revenue target

Agent types: research, content, outreach, sales, social, analytics

Return ONLY this JSON:
{
  "name": "...",
  "icon": "...",
  "category": "${category}",
  "description": "...",
  "agents": [{"name": "...", "type": "...", "schedule": "0 */6 * * *", "enabled": true}],
  "firstTask": "...",
  "monthlyTarget": "$X-Y"
}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No response from Claude");

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }
    config = JSON.parse(jsonStr) as PlanetConfig;
  }

  // Find or create galaxy
  const galaxyId = await findOrCreateGalaxy(category);

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    const mockPlanetId = `mock-planet-${Date.now()}`;
    console.log(`[Builder] Mock built planet: ${config.name} (${mockPlanetId}) in galaxy ${galaxyId}`);
    return { planetId: mockPlanetId, galaxyId };
  }

  // Create planet
  const planet: PlanetInsert = {
    galaxy_id: galaxyId,
    name: config.name,
    icon: config.icon,
    category: config.category,
    status: "active",
    feasibility_score: feasibilityScore,
    monthly_target: config.monthlyTarget,
    agents: config.agents,
    config: { feasibilityBreakdown, discoveryId },
    source_url: null,
    market_signal: null,
    description: config.description,
    first_task: config.firstTask,
    activated_at: new Date().toISOString(),
    last_active: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("planets")
    .insert(planet)
    .select("id")
    .single();

  if (error) {
    console.error("[Builder] Failed to create planet:", error.message);
    return null;
  }

  // Update galaxy planet count
  await supabaseAdmin.rpc("increment_planet_count", { galaxy_id_param: galaxyId });

  // Update universe stats
  await supabaseAdmin
    .from("universe_stats")
    .update({
      total_planets: await getCount("planets"),
      active_planets: await getCount("planets", "status", "active"),
      planets_built_today: await getTodayCount("planets"),
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  // Update discovery status
  await supabaseAdmin.from("discoveries").update({ status: "passed" }).eq("id", discoveryId);

  console.log(`[Builder] Planet deployed: ${config.name} (${data.id})`);
  return { planetId: data.id, galaxyId };
}

async function findOrCreateGalaxy(category: string): Promise<string> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return `mock-galaxy-${category}`;
  }

  const { data: existing } = await supabaseAdmin
    .from("galaxies")
    .select("id")
    .eq("category", category)
    .single();

  if (existing) return existing.id;

  const galaxy: GalaxyInsert = {
    name: `${category} Galaxy`,
    category,
    color: GALAXY_COLORS[category] || GALAXY_COLORS.Other,
    description: `Income streams in the ${category} category`,
    status: "active",
  };

  const { data, error } = await supabaseAdmin
    .from("galaxies")
    .insert(galaxy)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create galaxy: ${error.message}`);

  // Update universe stats
  await supabaseAdmin
    .from("universe_stats")
    .update({
      total_galaxies: await getCount("galaxies"),
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  return data.id;
}

async function getCount(table: string, field?: string, value?: string): Promise<number> {
  let query = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  if (field && value) query = query.eq(field, value);
  const { count } = await query;
  return count || 0;
}

async function getTodayCount(table: string): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count } = await supabaseAdmin
    .from(table)
    .select("id", { count: "exact", head: true })
    .gte("created_at", today.toISOString());
  return count || 0;
}

export { GALAXY_COLORS };
