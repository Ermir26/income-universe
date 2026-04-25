import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // All queries in parallel
  const [
    lastCronRes,
    crossChecksRes,
    errorsRes,
    picksStatusRes,
    decisionLogRes,
  ] = await Promise.all([
    // Last cron run
    supabase
      .from("agent_logs")
      .select("action, result, created_at")
      .eq("agent_name", "daily-picks-cron")
      .order("created_at", { ascending: false })
      .limit(1),

    // Cross-check results (24h)
    supabase
      .from("odds_cross_checks")
      .select("result")
      .gte("created_at", twentyFourHoursAgo),

    // Last 10 errors
    supabase
      .from("agent_logs")
      .select("agent_name, action, result, created_at")
      .eq("action", "error")
      .order("created_at", { ascending: false })
      .limit(10),

    // Picks by status
    supabase.from("picks").select("status"),

    // Decision log by final_decision
    supabase
      .from("pick_decision_log")
      .select("final_decision"),
  ]);

  // Process last cron
  const lastCron = lastCronRes.data?.[0] ?? null;

  // Cross-check success rates
  const crossChecks = crossChecksRes.data ?? [];
  const ccTotal = crossChecks.length;
  const ccByResult: Record<string, number> = {};
  for (const cc of crossChecks) {
    ccByResult[cc.result] = (ccByResult[cc.result] ?? 0) + 1;
  }

  // Picks by status
  const picksByStatus: Record<string, number> = {};
  for (const p of picksStatusRes.data ?? []) {
    picksByStatus[p.status] = (picksByStatus[p.status] ?? 0) + 1;
  }

  // Decision log by result
  const decisionsByResult: Record<string, number> = {};
  for (const d of decisionLogRes.data ?? []) {
    decisionsByResult[d.final_decision] = (decisionsByResult[d.final_decision] ?? 0) + 1;
  }

  return NextResponse.json({
    last_cron: lastCron,
    scraper_24h: {
      total: ccTotal,
      by_result: ccByResult,
      pinnacle_success_rate:
        ccTotal > 0
          ? (((ccByResult["pass"] ?? 0) + (ccByResult["veto"] ?? 0)) / ccTotal * 100).toFixed(1)
          : "N/A",
    },
    errors: errorsRes.data ?? [],
    picks_by_status: picksByStatus,
    decisions_by_result: decisionsByResult,
    cross_checks_by_result: ccByResult,
  });
}
