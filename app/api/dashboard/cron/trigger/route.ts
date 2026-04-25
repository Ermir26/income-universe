import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  await writeAuditLog(supabase, {
    action: "cron_triggered",
    target_type: "cron",
    target_id: "daily-picks",
    before_value: null,
    after_value: { triggered_at: new Date().toISOString() },
  });

  // Call the cron endpoint server-side
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  try {
    const start = Date.now();
    const res = await fetch(`${baseUrl}/api/cron/daily-picks`, {
      method: "GET",
      headers: {
        Authorization: process.env.CRON_SECRET
          ? `Bearer ${process.env.CRON_SECRET}`
          : "",
      },
    });

    const data = await res.json();
    const durationMs = Date.now() - start;

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      duration_ms: durationMs,
      result: data,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
