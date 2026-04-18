import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSystemStatus, getTodayExposure, MAX_DAILY_EXPOSURE } from "@/lib/method/system-status";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
);

export async function GET() {
  try {
    const [sports, todayExposure] = await Promise.all([
      getSystemStatus(supabase),
      getTodayExposure(supabase),
    ]);

    return NextResponse.json(
      {
        sports,
        todayExposure,
        maxDailyExposure: MAX_DAILY_EXPOSURE,
      },
      { headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" } },
    );
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
