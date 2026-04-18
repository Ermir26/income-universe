import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const ODDS_API_KEY = process.env.ODDS_API_KEY || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // Check Supabase
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { error } = await supabase.from("picks").select("id").limit(1);
    checks.supabase = error ? { status: "error", detail: error.message } : { status: "ok" };
  } catch (e: unknown) {
    checks.supabase = { status: "error", detail: e instanceof Error ? e.message : "Unknown error" };
  }

  // Check Telegram Bot
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`);
    const data = await res.json();
    checks.telegram = data.ok ? { status: "ok", detail: data.result.username } : { status: "error", detail: data.description };
  } catch (e: unknown) {
    checks.telegram = { status: "error", detail: e instanceof Error ? e.message : "Unknown error" };
  }

  // Check Odds API
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/?apiKey=${ODDS_API_KEY}`);
    checks.odds_api = res.ok ? { status: "ok" } : { status: "error", detail: `HTTP ${res.status}` };
  } catch (e: unknown) {
    checks.odds_api = { status: "error", detail: e instanceof Error ? e.message : "Unknown error" };
  }

  // Check Claude API (just verify key format)
  checks.claude_api = ANTHROPIC_API_KEY.startsWith("sk-ant-")
    ? { status: "ok" }
    : { status: "error", detail: "Missing or invalid API key" };

  // Get last pick time + current record
  let lastPickTime = null;
  let record = { wins: 0, losses: 0, pending: 0 };
  let activeSubscribers = 0;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data: lastPick } = await supabase.from("picks")
      .select("sent_at").order("sent_at", { ascending: false }).limit(1).single();
    lastPickTime = lastPick?.sent_at || null;

    const { data: allPicks } = await supabase.from("picks")
      .select("result").neq("result", "pending");
    if (allPicks) {
      record.wins = allPicks.filter((p) => p.result === "won").length;
      record.losses = allPicks.filter((p) => p.result === "lost").length;
    }

    const { data: pending } = await supabase.from("picks")
      .select("id").eq("result", "pending");
    record.pending = pending?.length || 0;

    const { count } = await supabase.from("subscribers")
      .select("id", { count: "exact", head: true }).eq("status", "active");
    activeSubscribers = count || 0;
  } catch {
    // ignore
  }

  // Next scheduled runs (EST)
  const now = new Date();
  const estHour = parseInt(now.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", hour12: false }));
  const schedule = [
    { hour: 9, label: "Morning picks" },
    { hour: 11, label: "Marketing posts" },
    { hour: 18, label: "Evening picks" },
    { hour: 22, label: "Daily record" },
    { hour: 23, label: "Results checker" },
  ];
  const nextRun = schedule.find((s) => s.hour > estHour) || schedule[0];

  const allOk = Object.values(checks).every((c) => c.status === "ok");

  return NextResponse.json({
    status: allOk ? "healthy" : "degraded",
    checks,
    last_pick: lastPickTime,
    next_run: `${nextRun.label} at ${nextRun.hour > 12 ? nextRun.hour - 12 : nextRun.hour}:00 ${nextRun.hour >= 12 ? "PM" : "AM"} EST`,
    record,
    active_subscribers: activeSubscribers,
    timestamp: new Date().toISOString(),
  });
}
