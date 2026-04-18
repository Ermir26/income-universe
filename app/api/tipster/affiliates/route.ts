import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET() {
  try {
    const { data: affiliates } = await supabase
      .from("affiliates")
      .select("id, bookmaker, commission_per_signup, status")
      .eq("status", "active");

    if (!affiliates || affiliates.length === 0) {
      return NextResponse.json({ affiliates: [], totals: { clicks: 0, signups: 0, revenue: 0 } });
    }

    const stats = [];
    let totalClicks = 0;
    let totalRevenue = 0;

    for (const aff of affiliates) {
      const { count } = await supabase
        .from("affiliate_clicks")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_id", aff.id);

      const clicks = count ?? 0;
      const signups = Math.round(clicks * 0.3);
      const revenue = signups * (aff.commission_per_signup || 0);

      totalClicks += clicks;
      totalRevenue += revenue;

      stats.push({
        bookmaker: aff.bookmaker,
        clicks,
        estimated_signups: signups,
        estimated_revenue: revenue,
      });
    }

    return NextResponse.json({
      affiliates: stats,
      totals: {
        clicks: totalClicks,
        signups: Math.round(totalClicks * 0.3),
        revenue: totalRevenue,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
