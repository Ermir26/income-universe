// Dashboard proxy for manual "Run Daily Picks Now" button.
// Authenticates via admin session cookie, then calls the cron endpoint
// with CRON_SECRET so the operator doesn't need to know the secret.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Build absolute URL to cron endpoint
  const url = new URL("/api/cron/daily-picks", request.url);

  let data: Record<string, unknown>;
  let status: number;

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers: CRON_SECRET
        ? { Authorization: `Bearer ${CRON_SECRET}` }
        : {},
    });

    status = res.status;
    data = await res.json();
  } catch (err) {
    const errorMsg = (err as Error).message;

    // Audit log — failed proxy
    await supabase.from("agent_logs").insert({
      agent_name: "manual-pick-run",
      action: "manual_pick_run",
      result: JSON.stringify({ error: errorMsg }),
      revenue_generated: 0,
    }).then(() => {}, () => {});

    return NextResponse.json(
      { error: `Failed to reach cron endpoint: ${errorMsg}` },
      { status: 502 },
    );
  }

  // Audit log — record every manual trigger
  await supabase.from("agent_logs").insert({
    agent_name: "manual-pick-run",
    action: "manual_pick_run",
    result: JSON.stringify({
      generated: data.generated ?? 0,
      posted_free: data.posted_free ?? 0,
      posted_vip: data.posted_vip ?? 0,
      skipped: data.skipped ?? null,
      errors: Array.isArray(data.errors) ? data.errors.length : 0,
    }),
    revenue_generated: 0,
  }).then(() => {}, () => {});

  return NextResponse.json({ ...data, triggered_by: "manual" }, { status });
}
