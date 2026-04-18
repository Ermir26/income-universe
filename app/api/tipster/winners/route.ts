import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  if (!SUPABASE_URL) {
    return NextResponse.json({ winners: [] }, { status: 503 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: winners } = await supabase
    .from("picks")
    .select("sport, sport_key, league, game, pick, odds, tier, category, settled_at, confidence")
    .eq("result", "won")
    .order("settled_at", { ascending: false })
    .limit(20);

  return NextResponse.json(
    {
      winners: (winners ?? []).map((w) => ({
        sport: w.sport,
        sport_key: w.sport_key,
        league: w.league,
        game: w.game,
        pick: w.pick,
        odds: w.odds,
        tier: w.tier || w.category || "VALUE",
        settled_at: w.settled_at,
      })),
    },
    {
      headers: {
        "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    },
  );
}
