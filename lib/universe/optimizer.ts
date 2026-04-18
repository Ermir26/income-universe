import { supabaseAdmin } from "../supabase/server";
import type { Planet } from "../supabase/types";

// Daily optimizer: reviews planet performance, pauses failures, grows winners
export async function optimizeUniverse(): Promise<{
  paused: string[];
  boosted: string[];
  unchanged: string[];
}> {
  console.log("[Optimizer] Running daily optimization...");

  const paused: string[] = [];
  const boosted: string[] = [];
  const unchanged: string[] = [];

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log("[Optimizer] Mock mode — simulating optimization");
    return {
      paused: ["mock-planet-stale"],
      boosted: ["mock-planet-growing"],
      unchanged: ["mock-planet-1", "mock-planet-2"],
    };
  }

  // Get all active planets
  const { data: planets, error } = await supabaseAdmin
    .from("planets")
    .select("*")
    .eq("status", "active");

  if (error || !planets) {
    console.error("[Optimizer] Failed to fetch planets:", error?.message);
    return { paused, boosted, unchanged };
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  for (const planet of planets as Planet[]) {
    const activatedAt = planet.activated_at ? new Date(planet.activated_at) : new Date(planet.created_at);
    const ageInDays = (Date.now() - activatedAt.getTime()) / (1000 * 60 * 60 * 24);

    // Rule 1: Zero revenue after 30 days → pause
    if (ageInDays >= 30 && planet.revenue_total === 0) {
      await supabaseAdmin
        .from("planets")
        .update({ status: "paused" })
        .eq("id", planet.id);
      paused.push(planet.name);
      console.log(`[Optimizer] Paused: ${planet.name} (0 revenue after ${Math.round(ageInDays)} days)`);
      continue;
    }

    // Rule 2: Growing revenue (week > 0 and increasing) → boost
    if (planet.revenue_week > 0 && planet.revenue_total > 0) {
      const weeklyRate = planet.revenue_week;
      const avgRate = planet.revenue_total / Math.max(ageInDays / 7, 1);

      if (weeklyRate > avgRate * 1.1) {
        boosted.push(planet.name);
        console.log(`[Optimizer] Boosted: ${planet.name} (growing ${Math.round((weeklyRate / avgRate - 1) * 100)}%)`);
        // Could increase agent frequency, spawn variants, etc.
        continue;
      }
    }

    unchanged.push(planet.name);
  }

  // Update universe stats
  const { count: activePlanets } = await supabaseAdmin
    .from("planets")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  await supabaseAdmin
    .from("universe_stats")
    .update({
      active_planets: activePlanets || 0,
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);

  console.log(
    `[Optimizer] Done: ${paused.length} paused, ${boosted.length} boosted, ${unchanged.length} unchanged`
  );

  return { paused, boosted, unchanged };
}
