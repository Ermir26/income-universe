import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

const SOCCER_KEYS = new Set([
  "Premier League", "EPL", "La Liga", "Serie A", "Bundesliga",
  "Ligue 1", "Champions League", "MLS", "soccer", "Soccer",
]);

function normalizeSport(raw: string): string {
  if (SOCCER_KEYS.has(raw)) return "Soccer";
  if (raw.startsWith("soccer_")) return "Soccer";
  return raw;
}

export async function GET() {
  const [{ data: allPicks }, { data: chainData }] = await Promise.all([
    supabase
      .from("picks")
      .select("sport, sport_key, result, profit, tier, category, stake")
      .neq("result", "pending")
      .order("sent_at", { ascending: false }),
    // For blockchain interlock: count picks with tx_hash vs total
    supabase
      .from("picks")
      .select("tx_hash, result")
      .in("result", ["won", "lost", "push"]),
  ]);

  if (!allPicks || allPicks.length === 0) {
    return NextResponse.json(
      { total: 0, wins: 0, losses: 0, win_rate: null, roi: null, streak: null, units_profit: null, best_sport: null, by_sport: [] },
      { headers: cache() },
    );
  }

  const wins = allPicks.filter((p) => p.result === "won").length;
  const losses = allPicks.filter((p) => p.result === "lost").length;
  const pushes = allPicks.filter((p) => p.result === "push").length;
  const total = wins + losses;
  const winRate = total > 0 ? +((wins / total) * 100).toFixed(1) : 0;
  const totalProfit = allPicks.reduce((s, p) => s + (parseFloat(String(p.profit)) || 0), 0);
  const roi = total > 0 ? +((totalProfit / (total * 100)) * 100).toFixed(1) : 0;

  // Units P&L from stake-based calculation
  const unitsProfit = allPicks.reduce((s, p) => {
    const pr = parseFloat(String(p.profit)) || 0;
    const st = parseFloat(String(p.stake)) || 1;
    return s + pr / 100; // convert dollar profit to units
  }, 0);

  // Streak
  let streak = 0;
  let streakType = "none";
  const settled = allPicks.filter((p) => p.result === "won" || p.result === "lost");
  if (settled.length > 0) {
    const first = settled[0].result;
    streak = 1;
    for (let i = 1; i < settled.length; i++) {
      if (settled[i].result === first) streak++;
      else break;
    }
    streakType = first === "won" ? "win" : "loss";
  }

  // Per-sport
  const sportMap: Record<string, { wins: number; losses: number; pushes: number; profit: number }> = {};
  for (const p of allPicks) {
    const k = normalizeSport(p.sport || p.sport_key || "Unknown");
    if (!sportMap[k]) sportMap[k] = { wins: 0, losses: 0, pushes: 0, profit: 0 };
    if (p.result === "won") sportMap[k].wins++;
    if (p.result === "lost") sportMap[k].losses++;
    if (p.result === "push") sportMap[k].pushes++;
    sportMap[k].profit += parseFloat(String(p.profit)) || 0;
  }

  const bySport = Object.entries(sportMap)
    .map(([sport, r]) => {
      const t = r.wins + r.losses;
      return {
        sport,
        picks: t + r.pushes,
        wins: r.wins,
        losses: r.losses,
        pushes: r.pushes,
        win_rate: t > 0 ? +((r.wins / t) * 100).toFixed(1) : 0,
        roi: t > 0 ? +((r.profit / (t * 100)) * 100).toFixed(1) : 0,
        units_pl: +(r.profit / 100).toFixed(1),
      };
    })
    .sort((a, b) => b.roi - a.roi);

  const bestSport = bySport.find((s) => s.picks >= 3 && s.win_rate > 55) ?? null;

  // ─── Dashboard reveal interlocks ───
  const gradedPicks = allPicks?.filter((p) => p.result === "won" || p.result === "lost" || p.result === "push") ?? [];
  const gradedCount = gradedPicks.length;

  // Blockchain coverage: % of graded picks with tx_hash
  const chainPicks = chainData ?? [];
  const withTxHash = chainPicks.filter((p) => p.tx_hash != null).length;
  const chainCoverage = chainPicks.length > 0 ? +(withTxHash / chainPicks.length * 100).toFixed(1) : 0;

  // Win rate over last 30 graded picks (same threshold as auto-pause)
  const last30 = settled.slice(0, 30);
  const last30Wins = last30.filter((p) => p.result === "won").length;
  const last30WinRate = last30.length > 0 ? +(last30Wins / last30.length * 100).toFixed(1) : 0;

  const interlocks = {
    graded_picks: gradedCount,
    graded_ok: gradedCount >= 50,
    chain_coverage: chainCoverage,
    chain_ok: chainCoverage >= 80,
    last_30_win_rate: last30WinRate,
    last_30_ok: last30WinRate >= 52,
    reveal_ready: gradedCount >= 50 && chainCoverage >= 80 && last30WinRate >= 52,
  };

  return NextResponse.json(
    {
      total: total + pushes,
      wins,
      losses,
      pushes,
      win_rate: winRate > 55 ? winRate : null,
      roi: roi > 0 ? roi : null,
      current_streak: streakType === "win" && streak >= 2 ? streak : null,
      units_profit: unitsProfit > 0 ? +unitsProfit.toFixed(1) : null,
      best_sport: bestSport,
      by_sport: bySport,
      interlocks,
    },
    { headers: cache() },
  );
}

function cache(): HeadersInit {
  return { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };
}
