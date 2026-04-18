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
      .select("sent_at, result, profit, stake")
      .not("result", "is", null)
      .neq("result", "pending")
      .neq("result", "void")
      .order("sent_at", { ascending: true });

    if (!picks || picks.length === 0) {
      return NextResponse.json({ months: [] });
    }

    const monthMap: Record<string, { wins: number; losses: number; pushes: number; profit: number; balance: number }> = {};

    for (const p of picks) {
      const month = p.sent_at?.slice(0, 7); // "YYYY-MM"
      if (!month) continue;

      if (!monthMap[month]) {
        monthMap[month] = { wins: 0, losses: 0, pushes: 0, profit: 0, balance: 0 };
      }

      if (p.result === "won") monthMap[month].wins++;
      else if (p.result === "lost") monthMap[month].losses++;
      else if (p.result === "push") monthMap[month].pushes++;

      monthMap[month].profit += parseFloat(String(p.profit)) || 0;
    }

    // Calculate running balance starting at 100 units
    let runningBalance = 100;
    const months = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        runningBalance += data.profit;
        const totalDecided = data.wins + data.losses;
        // ROI = profit / total staked. Approximate total staked as totalDecided * avg stake (1u)
        const roi = totalDecided > 0 ? +((data.profit / totalDecided) * 100).toFixed(1) : 0;
        return {
          month,
          picks: data.wins + data.losses + data.pushes,
          wins: data.wins,
          losses: data.losses,
          pushes: data.pushes,
          units: +data.profit.toFixed(2),
          balance: +runningBalance.toFixed(2),
          roi,
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
