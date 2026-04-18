import { NextResponse } from "next/server";
import { getRevenueEvents } from "@/lib/mock-db";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      const events = getRevenueEvents(id);
      return NextResponse.json({
        data: events.map((e) => ({ time: e.created_at, revenue: e.amount })),
      });
    }

    const { data, error } = await supabaseAdmin
      .from("revenue_events")
      .select("amount, created_at")
      .eq("planet_id", id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;

    return NextResponse.json({
      data: (data || []).map((d) => ({
        time: d.created_at,
        revenue: d.amount,
      })),
    });
  } catch (error) {
    console.error("[API /planets/revenue] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
