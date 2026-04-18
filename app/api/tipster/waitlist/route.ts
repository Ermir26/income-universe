import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(request: Request) {
  if (!SUPABASE_URL) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const body = await request.json();
  const email = body.email?.trim()?.toLowerCase();
  const sportInterest = body.sport_interest ?? [];
  const source = body.source ?? "landing_page";

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { error } = await supabase.from("waitlist").upsert(
    {
      email,
      sport_interest: sportInterest,
      source,
    },
    { onConflict: "email" },
  );

  if (error) {
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  return NextResponse.json({ success: true, message: "You're on the list!" });
}
