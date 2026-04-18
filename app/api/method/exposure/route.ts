import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { MAX_DAILY_EXPOSURE } from "@/lib/method/system-status";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET() {
  try {
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    const { data: picks } = await supabase
      .from("picks")
      .select("game, pick, stake, sport")
      .gte("sent_at", todayStart.toISOString())
      .eq("status", "pending");

    const pendingPicks = (picks ?? []).map((p) => ({
      game: p.game,
      pick: p.pick,
      stake: p.stake ?? 1,
      sport: p.sport,
    }));

    const exposedUnits = pendingPicks.reduce((sum, p) => sum + p.stake, 0);

    return NextResponse.json(
      { exposedUnits: +exposedUnits.toFixed(1), maxUnits: MAX_DAILY_EXPOSURE, pendingPicks },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
