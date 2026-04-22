import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

const MONTHLY_COSTS = 15;

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
  try {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ─── All picks from last 7 days (for the predictions table) ───
    const { data: recentPicks } = await supabase
      .from("picks")
      .select("id, sport, sport_key, league, game, pick, odds, confidence, result, status, actual_result, game_time, sent_at, tier, stake, category, bookmaker, event_id")
      .gte("sent_at", weekAgo.toISOString())
      .not("status", "in", "(draft,rejected)")
      .order("sent_at", { ascending: false });

    // ─── All settled picks (for stats) ───
    const { data: settledPicks } = await supabase
      .from("picks")
      .select("result, profit, sport, sport_key, sent_at")
      .not("result", "in", "(pending,void)")
      .order("sent_at", { ascending: false });

    const picks = settledPicks ?? [];
    const wins = picks.filter((p) => p.result === "won").length;
    const losses = picks.filter((p) => p.result === "lost").length;
    const pushes = picks.filter((p) => p.result === "push").length;
    const totalSettled = wins + losses + pushes;
    const winRate = (wins + losses) > 0 ? +((wins / (wins + losses)) * 100).toFixed(1) : 0;
    const totalProfit = picks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
    const units = +(totalProfit / 100).toFixed(2);

    // Week stats
    const weekPicks = picks.filter((p) => new Date(p.sent_at) >= weekAgo);
    const weekWins = weekPicks.filter((p) => p.result === "won").length;
    const weekLosses = weekPicks.filter((p) => p.result === "lost").length;
    const weekPushes = weekPicks.filter((p) => p.result === "push").length;
    const weekTotal = weekPicks.length;

    // Current streak
    let streakCount = 0;
    let streakType = "none";
    const wl = picks.filter((p) => p.result === "won" || p.result === "lost");
    if (wl.length > 0) {
      const first = wl[0].result;
      streakType = first === "won" ? "win" : "loss";
      for (const p of wl) {
        if (p.result === first) streakCount++;
        else break;
      }
    }

    // ─── Per-sport breakdown ───
    const sportMap: Record<string, { label: string; wins: number; losses: number; pushes: number }> = {};
    for (const p of picks) {
      const key = normalizeSport(p.sport || p.sport_key || "Unknown");
      if (!sportMap[key]) sportMap[key] = { label: key, wins: 0, losses: 0, pushes: 0 };
      if (p.result === "won") sportMap[key].wins++;
      else if (p.result === "lost") sportMap[key].losses++;
      else if (p.result === "push") sportMap[key].pushes++;
    }

    const bySport = Object.values(sportMap).map((s) => ({
      sport: s.label,
      picks: s.wins + s.losses + s.pushes,
      wins: s.wins,
      losses: s.losses,
      pushes: s.pushes,
      winRate: (s.wins + s.losses) > 0 ? +((s.wins / (s.wins + s.losses)) * 100).toFixed(1) : 0,
    })).sort((a, b) => b.picks - a.picks);

    // ─── Survival ───
    const { count: waitlistCount } = await supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true });

    const { count: subCount } = await supabase
      .from("subscribers")
      .select("id", { count: "exact", head: true })
      .eq("status", "active");

    const subscribers = subCount ?? 0;
    const revenue = 0; // No paying subscribers yet
    const survivalStatus = totalSettled < 50 ? "BUILDING RECORD" : winRate >= 55 ? "READY TO LAUNCH" : "NEEDS IMPROVEMENT";

    // ─── Dashboard reveal interlocks ───
    const { data: chainCheck } = await supabase
      .from("picks")
      .select("tx_hash")
      .in("result", ["won", "lost", "push"]);

    const chainPicks = chainCheck ?? [];
    const withTxHash = chainPicks.filter((p) => p.tx_hash != null).length;
    const chainCoverage = chainPicks.length > 0 ? +(withTxHash / chainPicks.length * 100).toFixed(1) : 0;

    const last30 = wl.slice(0, 30);
    const last30Wins = last30.filter((p) => p.result === "won").length;
    const last30WinRate = last30.length > 0 ? +(last30Wins / last30.length * 100).toFixed(1) : 0;

    const interlocks = {
      graded_picks: totalSettled,
      graded_ok: totalSettled >= 50,
      chain_coverage: chainCoverage,
      chain_ok: chainCoverage >= 80,
      last_30_win_rate: last30WinRate,
      last_30_ok: last30WinRate >= 52,
      reveal_ready: totalSettled >= 50 && chainCoverage >= 80 && last30WinRate >= 52,
    };

    return NextResponse.json({
      picks: recentPicks ?? [],
      stats: {
        weekTotal,
        weekWins,
        weekLosses,
        weekPushes,
        winRate,
        totalSettled,
        units,
        streakCount,
        streakType,
      },
      bySport,
      survival: {
        costs: MONTHLY_COSTS,
        subscribers,
        revenue,
        waitlist: waitlistCount ?? 0,
        status: survivalStatus,
        totalSettled,
      },
      interlocks,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
