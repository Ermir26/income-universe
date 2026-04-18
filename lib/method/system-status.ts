// Shark Method — System Status & Streak Tracking
// Monitors per-sport streaks, enforces caution/pause modes, and calculates stake modifiers.

import { type SupabaseClient } from "@supabase/supabase-js";

export interface SportStatus {
  sport: string;
  status: "active" | "caution" | "paused";
  streak: number;
  streakType: "win" | "loss" | "none";
  recentWinRate: number;
  stakeMod: number;
  totalPicks: number;
}

const CAUTION_LOSS_STREAK = 3;  // 3+ consecutive losses → caution
const CAUTION_CLEAR_WINS = 2;   // 2 consecutive wins → clear caution
const PAUSE_WIN_RATE = 50;      // Below 50% over last 20 → paused
const RECENT_WINDOW = 20;       // Last 20 settled picks for win rate

/**
 * Get system status for all sports with settled picks.
 * Returns per-sport streak, win rate, and status (active/caution/paused).
 */
export async function getSystemStatus(supabase: SupabaseClient): Promise<SportStatus[]> {
  // Fetch all settled picks grouped by sport, ordered by sent_at desc
  const { data: picks } = await supabase
    .from("picks")
    .select("sport, result, sent_at")
    .in("result", ["won", "lost", "push"])
    .order("sent_at", { ascending: false });

  if (!picks || picks.length === 0) return [];

  // Group by sport
  const bySport: Record<string, Array<{ result: string; sent_at: string }>> = {};
  for (const p of picks) {
    if (!p.sport) continue;
    if (!bySport[p.sport]) bySport[p.sport] = [];
    bySport[p.sport].push(p);
  }

  const statuses: SportStatus[] = [];

  for (const [sport, sportPicks] of Object.entries(bySport)) {
    // sportPicks are already ordered desc by sent_at (most recent first)
    const totalPicks = sportPicks.length;

    // Calculate current streak (consecutive wins or losses from most recent)
    let streak = 0;
    let streakType: "win" | "loss" | "none" = "none";
    for (const p of sportPicks) {
      if (p.result === "push") continue; // skip pushes for streak
      if (streakType === "none") {
        streakType = p.result === "won" ? "win" : "loss";
        streak = 1;
      } else if ((streakType === "win" && p.result === "won") || (streakType === "loss" && p.result === "lost")) {
        streak++;
      } else {
        break;
      }
    }

    // Calculate recent win rate (last N decided picks, excluding pushes)
    const decided = sportPicks.filter((p) => p.result === "won" || p.result === "lost");
    const recent = decided.slice(0, RECENT_WINDOW);
    const recentWins = recent.filter((p) => p.result === "won").length;
    const recentWinRate = recent.length > 0 ? +((recentWins / recent.length) * 100).toFixed(1) : 0;

    // Determine status
    let status: "active" | "caution" | "paused" = "active";
    let stakeMod = 1.0;

    // Paused: below 50% win rate over last 20 (only if we have enough data)
    if (recent.length >= 10 && recentWinRate < PAUSE_WIN_RATE) {
      status = "paused";
      stakeMod = 0;
    }
    // Caution: 3+ consecutive losses (but only if not already paused)
    else if (streakType === "loss" && streak >= CAUTION_LOSS_STREAK) {
      status = "caution";
      stakeMod = 0.5;
    }
    // Caution clears after 2 consecutive wins
    // (If we're on a win streak of 2+, we're definitely not in caution)

    statuses.push({
      sport,
      status,
      streak,
      streakType,
      recentWinRate,
      stakeMod,
      totalPicks,
    });
  }

  // Sort: paused first, then caution, then active
  const statusOrder = { paused: 0, caution: 1, active: 2 };
  statuses.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

  return statuses;
}

/**
 * Get today's total pending exposure (units staked on pending picks today).
 */
export async function getTodayExposure(supabase: SupabaseClient): Promise<number> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data } = await supabase
    .from("picks")
    .select("stake")
    .gte("sent_at", todayStart.toISOString())
    .eq("status", "pending");

  return (data ?? []).reduce((sum, p) => sum + (p.stake ?? 1), 0);
}

export const MAX_DAILY_EXPOSURE = 6;
