import { NextResponse } from "next/server";
import { updatePlanetStatus } from "@/lib/mock-db";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { status } = (await request.json()) as { status: string };

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      updatePlanetStatus(id, status as "active" | "paused");
      return NextResponse.json({ success: true });
    }

    const { error } = await supabaseAdmin
      .from("planets")
      .update({ status, last_active: new Date().toISOString() })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[API /planets/status] Error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
