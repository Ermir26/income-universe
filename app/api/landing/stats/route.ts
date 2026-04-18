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
  try {
    const { data: allPicks } = await supabase
      .from("picks")
      .select("sport, sport_key, result, profit, tier, stake, odds")
      .not("result", "in", "(pending,void,needs_manual_review)")
      .order("sent_at", { ascending: false });

    const picks = allPicks ?? [];
    const wins = picks.filter((p) => p.result === "won").length;
    const losses = picks.filter((p) => p.result === "lost").length;
    const pushes = picks.filter((p) => p.result === "push").length;
    const total = wins + losses;
    const winRate = total > 0 ? +((wins / total) * 100).toFixed(1) : 0;
    const totalProfit = picks.reduce((s, p) => s + (parseFloat(String(p.profit)) || 0), 0);
    const units = +totalProfit.toFixed(1);
    const bankroll = +(100 + totalProfit).toFixed(1);

    // Streak
    let streak = 0;
    let streakType = "none";
    const settled = picks.filter((p) => p.result === "won" || p.result === "lost");
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
    const sportMap: Record<string, { wins: number; losses: number; total: number }> = {};
    for (const p of picks) {
      const k = normalizeSport(p.sport || p.sport_key || "Unknown");
      if (!sportMap[k]) sportMap[k] = { wins: 0, losses: 0, total: 0 };
      sportMap[k].total++;
      if (p.result === "won") sportMap[k].wins++;
      if (p.result === "lost") sportMap[k].losses++;
    }

    const bySport = Object.entries(sportMap)
      .map(([sport, r]) => ({
        sport,
        picks: r.wins + r.losses,
        wins: r.wins,
        losses: r.losses,
        winRate: (r.wins + r.losses) > 0 ? +((r.wins / (r.wins + r.losses)) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.picks - a.picks);

    // Recent chronological results (last 20 settled)
    const recentResults = settled.slice(0, 20).map((p) => p.result as "won" | "lost");

    // Waitlist count
    const { count: waitlistCount } = await supabase
      .from("waitlist")
      .select("id", { count: "exact", head: true });

    return NextResponse.json(
      {
        totalPicks: total + pushes,
        wins,
        losses,
        pushes,
        winRate,
        units,
        bankroll,
        streak: streakType === "win" && streak >= 2 ? streak : null,
        streakType,
        bySport,
        recentResults,
        waitlist: waitlistCount ?? 0,
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
