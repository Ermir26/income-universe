import { NextResponse } from "next/server";
import { getPlanets, getGalaxies } from "@/lib/mock-db";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function GET() {
  try {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return NextResponse.json({
        planets: getPlanets(),
        galaxies: getGalaxies(),
      });
    }

    const [planetsRes, galaxiesRes] = await Promise.all([
      supabaseAdmin.from("planets").select("*").order("created_at", { ascending: false }),
      supabaseAdmin.from("galaxies").select("*").order("created_at", { ascending: false }),
    ]);

    if (planetsRes.error) throw planetsRes.error;
    if (galaxiesRes.error) throw galaxiesRes.error;

    return NextResponse.json({
      planets: planetsRes.data,
      galaxies: galaxiesRes.data,
    });
  } catch (error) {
    console.error("[API /planets] Error:", error);
    return NextResponse.json({ error: "Failed to fetch planets" }, { status: 500 });
  }
}
