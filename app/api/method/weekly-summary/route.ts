import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET() {
  try {
    const weekStart = new Date();
    weekStart.setUTCDate(weekStart.getUTCDate() - 7);
    weekStart.setUTCHours(0, 0, 0, 0);

    const { data: weekPicks } = await supabase.from("picks")
      .select("sport, game, pick, odds, result, profit, stake")
      .gte("settled_at", weekStart.toISOString())
      .in("result", ["won", "lost", "push"]);

    if (!weekPicks || weekPicks.length === 0) {
      return NextResponse.json(
        { summary: null },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
      );
    }

    const wins = weekPicks.filter((p) => p.result === "won").length;
    const losses = weekPicks.filter((p) => p.result === "lost").length;
    const netUnits = weekPicks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
    const totalWagered = weekPicks.reduce((s, p) => s + (parseFloat(p.stake) || 1), 0);
    const roi = totalWagered > 0 ? +((netUnits / totalWagered) * 100).toFixed(1) : 0;

    // Best pick of the week
    const bestPick = weekPicks
      .filter((p) => p.result === "won")
      .sort((a, b) => (parseFloat(b.profit) || 0) - (parseFloat(a.profit) || 0))[0] ?? null;

    return NextResponse.json(
      {
        summary: {
          wins,
          losses,
          netUnits: +netUnits.toFixed(2),
          roi,
          totalPicks: weekPicks.length,
          bestPick: bestPick ? {
            game: bestPick.game,
            pick: bestPick.pick,
            odds: bestPick.odds,
            profit: parseFloat(bestPick.profit) || 0,
          } : null,
        },
      },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
