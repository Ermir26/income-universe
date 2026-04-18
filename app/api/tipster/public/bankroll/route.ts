import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET() {
  const { data: entries } = await supabase
    .from("bankroll_log")
    .select("action, units, balance, created_at")
    .order("created_at", { ascending: true })
    .limit(500);

  // Also get monthly P&L
  const { data: monthlyPicks } = await supabase
    .from("picks")
    .select("result, profit, sent_at")
    .neq("result", "pending")
    .order("sent_at", { ascending: true });

  const monthlyPL: Record<string, number> = {};
  for (const p of monthlyPicks ?? []) {
    const month = (p.sent_at ?? "").substring(0, 7); // "2026-04"
    if (month) {
      monthlyPL[month] = (monthlyPL[month] || 0) + (parseFloat(String(p.profit)) || 0);
    }
  }

  return NextResponse.json(
    {
      bankroll: (entries ?? []).map((e) => ({
        action: e.action,
        units: e.units,
        balance: e.balance,
        date: e.created_at,
      })),
      monthly_pl: Object.entries(monthlyPL).map(([month, profit]) => ({
        month,
        profit: +profit.toFixed(2),
        units: +(profit / 100).toFixed(1),
      })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
