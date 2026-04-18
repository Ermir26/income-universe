import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

// POST — register a new follower
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const displayName = (body.display_name || "").trim().slice(0, 30);
    const unitValue = Math.max(0.01, parseFloat(body.unit_value) || 5);

    if (!displayName) {
      return NextResponse.json({ error: "display_name required" }, { status: 400 });
    }

    const { data, error } = await supabase.from("method_followers").insert({
      display_name: displayName,
      unit_value: unitValue,
    }).select("id, display_name, unit_value, start_date").single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ follower: data });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

// GET — leaderboard: top 20 followers by follow rate
export async function GET() {
  try {
    const { data: followers } = await supabase
      .from("method_followers")
      .select("id, display_name, unit_value, start_date");

    if (!followers || followers.length === 0) {
      return NextResponse.json({ leaderboard: [] });
    }

    // Get all follower_picks
    const { data: allFP } = await supabase
      .from("follower_picks")
      .select("follower_id, pick_id, followed");

    // Get all settled picks for ROI calc
    const { data: allPicks } = await supabase
      .from("picks")
      .select("id, result, profit, stake")
      .in("result", ["won", "lost", "push"]);

    const pickMap = new Map((allPicks ?? []).map((p) => [p.id, p]));

    const leaderboard = followers.map((f) => {
      const fpicks = (allFP ?? []).filter((fp) => fp.follower_id === f.id);
      const totalTracked = fpicks.length;
      const followed = fpicks.filter((fp) => fp.followed).length;
      const followRate = totalTracked > 0 ? +((followed / totalTracked) * 100).toFixed(1) : 0;

      // Calculate ROI for followed picks only
      let profit = 0;
      let wagered = 0;
      for (const fp of fpicks) {
        if (!fp.followed) continue;
        const pick = pickMap.get(fp.pick_id);
        if (!pick) continue;
        profit += parseFloat(pick.profit) || 0;
        wagered += parseFloat(pick.stake) || 1;
      }
      const roi = wagered > 0 ? +((profit / wagered) * 100).toFixed(1) : 0;

      return {
        id: f.id,
        displayName: f.display_name,
        unitValue: f.unit_value,
        totalTracked,
        followed,
        followRate,
        profit: +profit.toFixed(2),
        roi,
        balance: +(100 + profit).toFixed(2),
      };
    });

    // Sort by follow rate descending, take top 20
    leaderboard.sort((a, b) => b.followRate - a.followRate || b.roi - a.roi);

    return NextResponse.json(
      { leaderboard: leaderboard.slice(0, 20) },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
