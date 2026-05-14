// Dashboard manual "Run Daily Picks Now" button.
// Auth: admin session cookie (verifySessionToken).
// Calls the shared pick generation service directly (no internal fetch).

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { runPickGeneration } from "@/lib/tipster/run-pick-generation";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  try {
    const result = await runPickGeneration("manual");

    // Audit log — record every manual trigger
    await supabase.from("agent_logs").insert({
      agent_name: "manual-pick-run",
      action: "manual_pick_run",
      result: JSON.stringify({
        generated: result.generated,
        posted_free: result.posted_free,
        posted_vip: result.posted_vip,
        skipped: result.skipped ?? null,
        errors: result.errors.length,
      }),
      revenue_generated: 0,
    }).then(() => {}, () => {});

    return NextResponse.json(result);
  } catch (err) {
    const errorMsg = (err as Error).message;

    // Audit log — failed generation
    await supabase.from("agent_logs").insert({
      agent_name: "manual-pick-run",
      action: "manual_pick_run",
      result: JSON.stringify({ error: errorMsg }),
      revenue_generated: 0,
    }).then(() => {}, () => {});

    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
