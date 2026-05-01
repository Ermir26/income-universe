import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const { data: pick, error } = await supabase
    .from("picks")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !pick) {
    return NextResponse.json({ error: "Pick not found" }, { status: 404 });
  }

  return NextResponse.json({
    pick: {
      id: pick.id,
      sport: pick.sport,
      sport_key: pick.sport_key,
      league: pick.league,
      game: pick.game,
      pick: pick.pick,
      odds: pick.odds,
      tier: pick.tier || pick.category || "VALUE",
      stake: pick.stake,
      confidence: pick.confidence,
      scoring_factors: pick.scoring_factors,
      scoring_weights: pick.scoring_weights,
      scoring_score: pick.scoring_score,
      reasoning: pick.reasoning,
      result: pick.result,
      actual_result: pick.actual_result,
      settled_at: pick.settled_at,
      created_at: pick.sent_at || pick.created_at,
      game_time: pick.game_time,
      edge_percentage: pick.edge_percentage,
      research_data: pick.research_data,
      profit: pick.profit,
      pick_hash: pick.pick_hash,
      tx_hash: pick.tx_hash,
      block_number: pick.block_number,
      block_timestamp: pick.block_timestamp,
      verified: pick.verified ?? false,
    },
  });
}
