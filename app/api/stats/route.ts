import { NextResponse } from "next/server";
import { getStats } from "@/lib/mock-db";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json(getStats());
    }

    const { data, error } = await supabaseAdmin
      .from("universe_stats")
      .select("*")
      .limit(1)
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    console.error("[API /stats] Error:", error);
    return NextResponse.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
}
