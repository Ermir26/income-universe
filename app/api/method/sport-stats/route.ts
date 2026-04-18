import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSystemStatus } from "@/lib/method/system-status";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET() {
  try {
    const [systemStatus, picksRes] = await Promise.all([
      getSystemStatus(supabase),
      supabase
        .from("picks")
        .select("sport, game, pick, odds, tier, stake, result, profit, sent_at")
        .in("result", ["won", "lost", "push"])
        .order("sent_at", { ascending: false }),
    ]);

    const picks = picksRes.data ?? [];
    if (picks.length === 0) {
      return NextResponse.json(
        { sports: [] },
        { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
      );
    }

    // Group by sport
    const bySport: Record<string, typeof picks> = {};
    for (const p of picks) {
      const sport = p.sport || "Unknown";
      if (!bySport[sport]) bySport[sport] = [];
      bySport[sport].push(p);
    }

    const sports = Object.entries(bySport).map(([sport, sportPicks]) => {
      const wins = sportPicks.filter((p) => p.result === "won").length;
      const losses = sportPicks.filter((p) => p.result === "lost").length;
      const totalPicks = sportPicks.length;
      const decided = wins + losses;
      const winRate = decided > 0 ? +((wins / decided) * 100).toFixed(1) : 0;
      const unitsProfit = sportPicks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
      const totalWagered = sportPicks.reduce((s, p) => s + (parseFloat(p.stake) || 1), 0);
      const roi = totalWagered > 0 ? +((unitsProfit / totalWagered) * 100).toFixed(1) : 0;

      // Current streak (most recent first, already sorted desc)
      let streak = 0;
      let streakType: "win" | "loss" | "none" = "none";
      for (const p of sportPicks) {
        if (p.result === "push") continue;
        if (streakType === "none") {
          streakType = p.result === "won" ? "win" : "loss";
          streak = 1;
        } else if ((streakType === "win" && p.result === "won") || (streakType === "loss" && p.result === "lost")) {
          streak++;
        } else {
          break;
        }
      }

      const ss = systemStatus.find((s) => s.sport === sport);

      return {
        sport,
        wins,
        losses,
        totalPicks,
        winRate,
        unitsProfit: +unitsProfit.toFixed(2),
        roi,
        currentStreak: streak,
        streakType,
        status: ss?.status ?? "active" as const,
        stakeMod: ss?.stakeMod ?? 1,
        recentPicks: sportPicks.slice(0, 10).map((p) => ({
          game: p.game,
          pick: p.pick,
          odds: p.odds,
          tier: p.tier,
          stake: p.stake,
          result: p.result,
          profit: parseFloat(p.profit) || 0,
          date: p.sent_at?.slice(0, 10) ?? "",
        })),
      };
    });

    // Sort by ROI descending
    sports.sort((a, b) => b.roi - a.roi);

    return NextResponse.json(
      { sports },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
