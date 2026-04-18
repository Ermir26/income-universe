import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET() {
  try {
    const { data: picks } = await supabase
      .from("picks")
      .select("id, sport, game, pick, odds, bookmaker, tier, category, stake, confidence, result, profit, sent_at, game_time")
      .not("result", "is", null)
      .neq("result", "pending")
      .neq("result", "void")
      .neq("result", "needs_manual_review")
      .order("sent_at", { ascending: true });

    if (!picks || picks.length === 0) {
      return NextResponse.json({ months: [] });
    }

    // Group picks by month
    const monthMap: Record<string, typeof picks> = {};
    for (const p of picks) {
      const month = p.sent_at?.slice(0, 7);
      if (!month) continue;
      if (!monthMap[month]) monthMap[month] = [];
      monthMap[month].push(p);
    }

    // Build monthly summaries with individual picks
    let runningBalance = 100;
    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, monthPicks]) => {
        let wins = 0, losses = 0, pushes = 0, profit = 0;

        const pickDetails = monthPicks.map((p) => {
          const pProfit = parseFloat(String(p.profit)) || 0;
          profit += pProfit;
          if (p.result === "won") wins++;
          else if (p.result === "lost") losses++;
          else if (p.result === "push") pushes++;

          return {
            id: p.id,
            sport: p.sport,
            game: p.game,
            pick: p.pick,
            odds: p.odds,
            bookmaker: p.bookmaker,
            tier: p.tier || p.category || "VALUE",
            stake: p.stake ?? 1,
            confidence: p.confidence,
            result: p.result,
            profit: +pProfit.toFixed(2),
            sent_at: p.sent_at,
            game_time: p.game_time,
          };
        });

        const openingBalance = +runningBalance.toFixed(2);
        runningBalance += profit;
        const closingBalance = +runningBalance.toFixed(2);
        const totalDecided = wins + losses;
        const roi = totalDecided > 0 ? +((profit / totalDecided) * 100).toFixed(1) : 0;

        return {
          month,
          picks: wins + losses + pushes,
          wins,
          losses,
          pushes,
          units: +profit.toFixed(2),
          openingBalance,
          closingBalance,
          roi,
          pickDetails,
        };
      });

    return NextResponse.json(
      { months },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
