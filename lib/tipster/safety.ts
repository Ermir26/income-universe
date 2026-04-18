// Auto-Pause Safety Net — Sharkline
// Monitors sport performance and auto-pauses underperforming sports.

import { type SupabaseClient } from "@supabase/supabase-js";
import { recalibrateWeights } from "./scoring-engine";

interface SportHealth {
  healthy: boolean;
  winRate: number;
  totalPicks: number;
  action: "active" | "pause" | "paper" | "resume";
}

const MIN_PICKS_FOR_PAUSE = 30;
const PAUSE_THRESHOLD = 52;
const PAPER_RESUME_THRESHOLD = 56;
const PAPER_MIN_PICKS = 10;

/**
 * Check if a sport is healthy enough to keep sending live picks.
 */
export async function checkSportHealth(
  supabase: SupabaseClient,
  sport: string,
): Promise<SportHealth> {
  // Check if sport is in paused_sports table
  const { data: pausedEntry } = await supabase
    .from("agent_logs")
    .select("id, result")
    .eq("agent_name", "safety-net")
    .eq("action", `pause_${sport}`)
    .order("created_at", { ascending: false })
    .limit(1)
    .single() as { data: { id: string; result: string } | null };

  const isPaused = !!pausedEntry;

  if (isPaused) {
    // Check paper trade performance
    const { data: paperPicks } = await supabase
      .from("picks")
      .select("result")
      .eq("channel", "paper")
      .ilike("sport_key", `%${sport}%`)
      .neq("result", "pending");

    const paperTotal = paperPicks?.length ?? 0;

    if (paperTotal >= PAPER_MIN_PICKS) {
      const paperWins = paperPicks?.filter((p) => p.result === "won").length ?? 0;
      const paperWinRate = paperTotal > 0 ? (paperWins / paperTotal) * 100 : 0;

      if (paperWinRate >= PAPER_RESUME_THRESHOLD) {
        return { healthy: true, winRate: paperWinRate, totalPicks: paperTotal, action: "resume" };
      }
    }

    return { healthy: false, winRate: 0, totalPicks: paperTotal, action: "paper" };
  }

  // Check live performance
  const { data: picks } = await supabase
    .from("picks")
    .select("result")
    .ilike("sport_key", `%${sport}%`)
    .neq("result", "pending")
    .neq("channel", "paper");

  const total = picks?.length ?? 0;

  if (total < MIN_PICKS_FOR_PAUSE) {
    return { healthy: true, winRate: 0, totalPicks: total, action: "active" };
  }

  const wins = picks?.filter((p) => p.result === "won").length ?? 0;
  const settled = picks?.filter((p) => p.result === "won" || p.result === "lost").length ?? 0;
  const winRate = settled > 0 ? (wins / settled) * 100 : 0;

  if (winRate < PAUSE_THRESHOLD) {
    return { healthy: false, winRate, totalPicks: total, action: "pause" };
  }

  return { healthy: true, winRate, totalPicks: total, action: "active" };
}

/**
 * Run health check for a sport and take action if needed.
 * Returns true if sport is healthy and picks should be sent live.
 */
export async function enforceSportSafety(
  supabase: SupabaseClient,
  sportCategory: string,
): Promise<{ live: boolean; paper: boolean }> {
  const health = await checkSportHealth(supabase, sportCategory);

  if (health.action === "pause") {
    console.log(`   🛑 PAUSING ${sportCategory}: ${health.winRate.toFixed(1)}% win rate over ${health.totalPicks} picks`);

    // Log the pause
    await supabase.from("agent_logs").insert({
      agent_name: "safety-net",
      action: `pause_${sportCategory}`,
      result: JSON.stringify({
        reason: `Win rate ${health.winRate.toFixed(1)}% < ${PAUSE_THRESHOLD}% threshold`,
        total_picks: health.totalPicks,
        severity: "critical",
      }),
      revenue_generated: 0,
    });

    // Trigger recalibration
    try {
      await recalibrateWeights(supabase, sportCategory);
      console.log(`   🔄 Weights recalibrated for ${sportCategory}`);
    } catch (err) {
      console.log(`   ⚠️ Recalibration failed: ${(err as Error).message}`);
    }

    return { live: false, paper: true };
  }

  if (health.action === "resume") {
    console.log(`   ✅ RESUMING ${sportCategory}: paper trades at ${health.winRate.toFixed(1)}% over ${health.totalPicks} picks`);

    // Remove pause log by logging a resume
    await supabase.from("agent_logs").insert({
      agent_name: "safety-net",
      action: `resume_${sportCategory}`,
      result: JSON.stringify({
        reason: `Paper trade win rate ${health.winRate.toFixed(1)}% >= ${PAPER_RESUME_THRESHOLD}%`,
        paper_picks: health.totalPicks,
      }),
      revenue_generated: 0,
    });

    return { live: true, paper: false };
  }

  if (health.action === "paper") {
    console.log(`   📝 ${sportCategory} still in paper mode (${health.totalPicks}/${PAPER_MIN_PICKS} paper picks)`);
    return { live: false, paper: true };
  }

  // active
  return { live: true, paper: false };
}
