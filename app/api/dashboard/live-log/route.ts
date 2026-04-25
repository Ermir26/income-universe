import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { searchParams } = request.nextUrl;
  const table = searchParams.get("table") ?? "all";
  const result = searchParams.get("result");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);

  const rows: Array<Record<string, unknown> & { _source: string }> = [];

  // Fetch from pick_decision_log
  if (table === "all" || table === "decision_log") {
    let q = supabase
      .from("pick_decision_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (result) {
      q = q.eq("final_decision", result);
    }

    const { data } = await q;
    for (const row of data ?? []) {
      rows.push({ ...row, _source: "pick_decision_log" });
    }
  }

  // Fetch from admin_audit_log
  if (table === "all" || table === "audit_log") {
    let q = supabase
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (result) {
      q = q.eq("action", result);
    }

    const { data } = await q;
    for (const row of data ?? []) {
      rows.push({ ...row, _source: "admin_audit_log" });
    }
  }

  // Sort combined results by created_at descending
  rows.sort((a, b) => {
    const ta = new Date(a.created_at as string).getTime();
    const tb = new Date(b.created_at as string).getTime();
    return tb - ta;
  });

  return NextResponse.json({ rows: rows.slice(0, limit) });
}
