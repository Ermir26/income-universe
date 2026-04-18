import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const sport = searchParams.get("sport");

  let query = supabase
    .from("picks")
    .select("id, sport, sport_key, league, game, pick, odds, bookmaker, tier, category, stake, confidence, scoring_factors, reasoning, result, profit, status, actual_result, settled_at, sent_at, game_time, tx_hash, verified")
    .not("result", "in", "(void,needs_manual_review)")
    .order("sent_at", { ascending: false })
    .limit(100);

  if (sport) {
    query = query.ilike("sport_key", `%${sport}%`);
  }

  const { data: picks } = await query;

  return NextResponse.json(
    {
      picks: (picks ?? []).map((p) => ({
        id: p.id,
        sport: p.sport,
        sport_key: p.sport_key,
        league: p.league,
        game: p.game,
        pick: p.pick,
        odds: p.odds,
        bookmaker: p.bookmaker,
        tier: p.tier || p.category || "VALUE",
        stake: p.stake,
        confidence: p.confidence,
        scoring_factors: p.scoring_factors,
        reasoning: p.reasoning,
        result: p.result,
        profit: p.profit != null ? parseFloat(String(p.profit)) : null,
        actual_result: p.actual_result,
        settled_at: p.settled_at,
        sent_at: p.sent_at,
        created_at: p.sent_at,
        game_time: p.game_time,
        tx_hash: p.tx_hash,
        verified: p.verified ?? false,
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
