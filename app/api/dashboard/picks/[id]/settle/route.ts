// Manual settlement endpoint — operator grades picks the system couldn't auto-settle.
// POST { result: "won" | "lost" | "push" }

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const SETTLEABLE_STATUSES = new Set(["pending", "needs_manual_review"]);
const VALID_RESULTS = new Set(["won", "lost", "push"]);

function americanToDecimal(odds: string): number {
  const num = parseInt(odds, 10);
  if (isNaN(num)) return 2.0;
  if (num > 0) return +(1 + num / 100).toFixed(4);
  return +(1 + 100 / Math.abs(num)).toFixed(4);
}

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let result: string;
  try {
    const body = await request.json();
    result = (body as { result?: string }).result ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!VALID_RESULTS.has(result)) {
    return NextResponse.json(
      { error: `Invalid result. Must be: won, lost, or push` },
      { status: 400 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: pick } = await supabase
    .from("picks")
    .select("id, status, game, pick, odds, stake")
    .eq("id", id)
    .single();

  if (!pick) {
    return NextResponse.json({ error: `Pick ${id} not found` }, { status: 404 });
  }

  if (!SETTLEABLE_STATUSES.has(pick.status)) {
    return NextResponse.json(
      { error: `Pick ${id} cannot be settled (status: ${pick.status})` },
      { status: 400 },
    );
  }

  // Calculate profit
  const stake = parseFloat(pick.stake) || 1;
  let profit = 0;
  if (result === "won") {
    const decOdds = americanToDecimal(pick.odds ?? "100");
    profit = +(stake * (decOdds - 1)).toFixed(2);
  } else if (result === "lost") {
    profit = -stake;
  }

  // Update pick
  const { error: updateErr } = await supabase.from("picks").update({
    result,
    status: result,
    profit,
    settled_at: new Date().toISOString(),
  }).eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  // Bankroll log
  const { data: lastEntry } = await supabase.from("bankroll_log")
    .select("balance").eq("voided", false)
    .order("created_at", { ascending: false }).limit(1).single();
  const curBalance = lastEntry?.balance ?? 100;

  if (result === "won") {
    await supabase.from("bankroll_log").insert({
      pick_id: id, action: "win", units: profit, balance: +(parseFloat(curBalance) + profit).toFixed(2),
    });
  } else if (result === "lost") {
    // Bet was already deducted when placed — record 0 additional units
    await supabase.from("bankroll_log").insert({
      pick_id: id, action: "loss", units: 0, balance: parseFloat(curBalance),
    });
  } else {
    await supabase.from("bankroll_log").insert({
      pick_id: id, action: "push", units: stake, balance: +(parseFloat(curBalance) + stake).toFixed(2),
    });
  }

  // Update bankroll_state
  try {
    const { data: bState } = await supabase.from("bankroll_state")
      .select("*").eq("id", 1).single();
    if (bState?.launch_timestamp) {
      const newUnits = result === "push"
        ? bState.current_units
        : +(parseFloat(bState.current_units) + profit).toFixed(2);
      const newPeak = Math.max(parseFloat(bState.peak_units) || 0, newUnits);
      await supabase.from("bankroll_state").update({
        current_units: newUnits,
        peak_units: newPeak,
        last_settled_pick_id: id,
        last_updated: new Date().toISOString(),
      }).eq("id", 1);
    }
  } catch { /* best effort */ }

  // Audit log
  await supabase.from("agent_logs").insert({
    agent_name: "manual-settle",
    action: "manual_settlement",
    result: JSON.stringify({ pick_id: id, game: pick.game, pick: pick.pick, result, profit }),
    revenue_generated: 0,
  }).then(() => {}, () => {});

  return NextResponse.json({ ok: true, result, profit, message: `Pick settled as ${result}` });
}
