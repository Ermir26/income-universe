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
      .select("game, pick, result, profit, stake, sent_at")
      .in("result", ["won", "lost", "push"])
      .order("sent_at", { ascending: true });

    if (!picks || picks.length === 0) {
      return NextResponse.json({ history: [], summary: null });
    }

    let balance = 100;
    let totalWagered = 0;
    let totalProfit = 0;
    let wins = 0;
    let losses = 0;

    const history = picks.map((p, i) => {
      const profit = parseFloat(String(p.profit)) || 0;
      const stake = p.stake ?? 1;
      balance += profit;
      totalWagered += stake;
      totalProfit += profit;
      if (p.result === "won") wins++;
      else if (p.result === "lost") losses++;

      return {
        pickNumber: i + 1,
        date: p.sent_at?.slice(0, 10) ?? "",
        game: p.game,
        pick: p.pick,
        result: p.result,
        profit: +profit.toFixed(2),
        balance: +balance.toFixed(2),
      };
    });

    const decided = wins + losses;
    const summary = {
      totalPicks: picks.length,
      wins,
      losses,
      winRate: decided > 0 ? +((wins / decided) * 100).toFixed(1) : 0,
      totalWagered: +totalWagered.toFixed(1),
      totalProfit: +totalProfit.toFixed(2),
      roi: totalWagered > 0 ? +((totalProfit / totalWagered) * 100).toFixed(1) : 0,
      currentBalance: +balance.toFixed(2),
    };

    return NextResponse.json(
      { history, summary },
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
