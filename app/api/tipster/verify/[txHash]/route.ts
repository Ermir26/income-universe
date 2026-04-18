import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyOnChain, getPolygonScanUrl } from "@/lib/tipster/blockchain";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ txHash: string }> },
) {
  const { txHash } = await params;

  if (!txHash || txHash.length < 10) {
    return NextResponse.json({ error: "Invalid transaction hash" }, { status: 400 });
  }

  // Find the pick in Supabase
  const { data: pick } = await supabase
    .from("picks")
    .select("id, sport, league, game, pick, odds, tier, confidence, pick_hash, tx_hash, block_number, block_timestamp, verified, result, actual_result, game_time, sent_at")
    .eq("tx_hash", txHash)
    .single();

  if (!pick) {
    return NextResponse.json({ error: "No pick found for this transaction" }, { status: 404 });
  }

  // Verify on-chain
  let onChainResult;
  try {
    onChainResult = await verifyOnChain(txHash, pick.pick_hash ?? "");
  } catch {
    onChainResult = { verified: false, blockTimestamp: 0, pickHash: "" };
  }

  const polygonscanUrl = getPolygonScanUrl(txHash);

  // Calculate how far before game the pick was timestamped
  let minutesBeforeGame: number | null = null;
  if (pick.block_timestamp && pick.game_time) {
    const blockTime = new Date(pick.block_timestamp).getTime();
    const gameTime = new Date(pick.game_time).getTime();
    minutesBeforeGame = Math.max(0, Math.round((gameTime - blockTime) / 60000));
  }

  return NextResponse.json({
    verified: onChainResult.verified,
    pick_hash: pick.pick_hash,
    tx_hash: txHash,
    block_number: pick.block_number,
    block_timestamp: pick.block_timestamp,
    on_chain_hash: onChainResult.pickHash,
    polygonscan_url: polygonscanUrl,
    minutes_before_game: minutesBeforeGame,
    pick: {
      id: pick.id,
      sport: pick.sport,
      league: pick.league,
      game: pick.game,
      pick: pick.pick,
      odds: pick.odds,
      tier: pick.tier,
      confidence: pick.confidence,
      result: pick.result,
      actual_result: pick.actual_result,
      game_time: pick.game_time,
      created_at: pick.sent_at,
    },
  }, {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200" },
  });
}
