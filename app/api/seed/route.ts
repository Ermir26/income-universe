import { NextResponse } from "next/server";
import {
  findOrCreateGalaxyMock,
  addPlanetMock,
  isSeeded,
  getGalaxies,
  getPlanets,
  getStats,
} from "@/lib/mock-db";
import { SEED_PLANETS } from "@/lib/universe/seeder";
import { GALAXY_COLORS } from "@/lib/claude/builder";

export async function POST() {
  try {
    if (isSeeded()) {
      return NextResponse.json({
        galaxies: getGalaxies(),
        planets: getPlanets(),
        stats: getStats(),
        message: "Already seeded",
      });
    }

    for (const seed of SEED_PLANETS) {
      const galaxy = findOrCreateGalaxyMock(
        seed.galaxyName,
        seed.category,
        GALAXY_COLORS[seed.category] || GALAXY_COLORS.Other
      );

      addPlanetMock({
        galaxy_id: galaxy.id,
        name: seed.name,
        icon: seed.icon,
        category: seed.category,
        status: "active",
        feasibility_score: 75,
        monthly_target: seed.monthlyTarget,
        revenue_total: 0,
        revenue_today: 0,
        revenue_week: 0,
        agents: seed.agents,
        config: { seeded: true },
        source_url: null,
        market_signal: "Seed planet — pre-validated idea",
        description: seed.description,
        first_task: seed.firstTask,
        activated_at: new Date().toISOString(),
        last_active: new Date().toISOString(),
      });
    }

    return NextResponse.json({
      galaxies: getGalaxies(),
      planets: getPlanets(),
      stats: getStats(),
    });
  } catch (error) {
    console.error("[API /seed] Error:", error);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
