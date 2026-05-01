import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const ODDS_API_KEY = process.env.ODDS_API_KEY || "";

// Simple in-memory cache for Odds API status (5-minute TTL)
let oddsApiStatusCache: {
  status: "available" | "credits_exhausted" | "error" | "not_configured";
  remaining?: string;
  checkedAt: number;
} | null = null;
const ODDS_API_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function checkOddsApiStatus(): Promise<typeof oddsApiStatusCache> {
  // Return cached if fresh
  if (oddsApiStatusCache && Date.now() - oddsApiStatusCache.checkedAt < ODDS_API_CACHE_TTL) {
    return oddsApiStatusCache;
  }

  if (!ODDS_API_KEY) {
    oddsApiStatusCache = { status: "not_configured", checkedAt: Date.now() };
    return oddsApiStatusCache;
  }

  try {
    // Cheap call: fetch sports list (costs 0 credits)
    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`,
      { cache: "no-store", signal: AbortSignal.timeout(8000) },
    );

    const remaining = res.headers.get("x-requests-remaining") ?? undefined;

    if (res.ok) {
      // Check if remaining credits is 0 or negative (sports endpoint succeeds with 0 credits)
      const remainingNum = remaining ? parseInt(remaining, 10) : null;
      if (remainingNum !== null && remainingNum <= 0) {
        oddsApiStatusCache = { status: "credits_exhausted", remaining: remaining ?? "0", checkedAt: Date.now() };
      } else {
        oddsApiStatusCache = { status: "available", remaining, checkedAt: Date.now() };
      }
    } else {
      const body = await res.text().catch(() => "");
      if (body.includes("OUT_OF_USAGE_CREDITS") || res.status === 401 || res.status === 429) {
        oddsApiStatusCache = { status: "credits_exhausted", remaining: "0", checkedAt: Date.now() };
      } else {
        oddsApiStatusCache = { status: "error", checkedAt: Date.now() };
      }
    }
  } catch {
    oddsApiStatusCache = { status: "error", checkedAt: Date.now() };
  }

  return oddsApiStatusCache;
}

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // All queries in parallel (including Odds API status check)
  const [
    lastCronRes,
    crossChecksRes,
    errorsRes,
    picksStatusRes,
    decisionLogRes,
    oddsApiStatus,
    bankrollStateRes,
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

    // Odds API status
    checkOddsApiStatus(),

    // Bankroll state
    supabase.from("bankroll_state").select("*").eq("id", 1).single(),
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
    odds_api_status: oddsApiStatus,
    bankroll_state: bankrollStateRes.data ?? null,
  });
}
