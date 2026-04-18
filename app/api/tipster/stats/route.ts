import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  if (!SUPABASE_URL) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // All completed picks
  const { data: allPicks } = await supabase
    .from("picks")
    .select("sport, sport_key, game, pick, odds, result, profit, tier, category, sent_at, settled_at")
    .neq("result", "pending")
    .order("sent_at", { ascending: false });

  if (!allPicks || allPicks.length === 0) {
    return NextResponse.json(
      {
        total_picks: 0,
        wins: 0,
        win_rate: null,
        roi: null,
        current_streak: null,
        best_streak: 0,
        best_sport: null,
        by_sport: {},
        by_tier: {},
        message: "Tracking...",
      },
      { headers: cacheHeaders() },
    );
  }

  const wins = allPicks.filter((p) => p.result === "won").length;
  const losses = allPicks.filter((p) => p.result === "lost").length;
  const total = wins + losses;
  const winRate = total > 0 ? +((wins / total) * 100).toFixed(1) : 0;
  const totalProfit = allPicks.reduce((sum, p) => sum + (parseFloat(String(p.profit)) || 0), 0);
  const roi = total > 0 ? +((totalProfit / (total * 100)) * 100).toFixed(1) : 0;

  // Current streak
  let currentStreak = 0;
  let streakType = "none";
  const settled = allPicks.filter((p) => p.result === "won" || p.result === "lost");
  if (settled.length > 0) {
    const first = settled[0].result;
    currentStreak = 1;
    for (let i = 1; i < settled.length; i++) {
      if (settled[i].result === first) currentStreak++;
      else break;
    }
    streakType = first === "won" ? "win" : "loss";
  }

  // Best streak ever
  let bestStreak = 0;
  let run = 0;
  for (const p of settled) {
    if (p.result === "won") {
      run++;
      if (run > bestStreak) bestStreak = run;
    } else {
      run = 0;
    }
  }

  // Per-sport stats — only show positive
  const bySport: Record<string, { wins: number; losses: number; total: number; win_rate: number }> = {};
  for (const p of allPicks) {
    const sport = p.sport || p.sport_key || "Unknown";
    if (!bySport[sport]) bySport[sport] = { wins: 0, losses: 0, total: 0, win_rate: 0 };
    if (p.result === "won") bySport[sport].wins++;
    if (p.result === "lost") bySport[sport].losses++;
    bySport[sport].total = bySport[sport].wins + bySport[sport].losses;
    bySport[sport].win_rate = bySport[sport].total > 0
      ? +((bySport[sport].wins / bySport[sport].total) * 100).toFixed(1)
      : 0;
  }

  // Filter: only show sports with win_rate > 55%
  const positiveSports: Record<string, { wins: number; total: number; win_rate: number }> = {};
  for (const [sport, r] of Object.entries(bySport)) {
    if (r.win_rate > 55 && r.total >= 3) {
      positiveSports[sport] = { wins: r.wins, total: r.total, win_rate: r.win_rate };
    }
  }

  // Best sport
  const bestSportEntry = Object.entries(bySport)
    .filter(([, r]) => r.total >= 3)
    .sort((a, b) => b[1].win_rate - a[1].win_rate)[0];
  const bestSport = bestSportEntry && bestSportEntry[1].win_rate > 55
    ? { sport: bestSportEntry[0], win_rate: bestSportEntry[1].win_rate, wins: bestSportEntry[1].wins }
    : null;

  // Per-tier stats
  const byTier: Record<string, { wins: number; total: number; win_rate: number }> = {};
  for (const p of allPicks) {
    const tier = p.tier || p.category || "VALUE";
    if (!byTier[tier]) byTier[tier] = { wins: 0, total: 0, win_rate: 0 };
    if (p.result === "won") byTier[tier].wins++;
    byTier[tier].total++;
    byTier[tier].win_rate = +((byTier[tier].wins / byTier[tier].total) * 100).toFixed(1);
  }

  // ═══ NEVER SHOW BAD STATS ═══
  return NextResponse.json(
    {
      total_picks: total,
      wins,
      win_rate: winRate > 55 ? winRate : null,
      roi: roi > 0 ? roi : null,
      current_streak: streakType === "win" && currentStreak >= 2 ? currentStreak : null,
      best_streak: bestStreak >= 3 ? bestStreak : null,
      best_sport: bestSport,
      by_sport: positiveSports,
      by_tier: byTier,
      message: winRate <= 55 ? "Tracking..." : null,
    },
    { headers: cacheHeaders() },
  );
}

function cacheHeaders(): HeadersInit {
  return {
    "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
  };
}
