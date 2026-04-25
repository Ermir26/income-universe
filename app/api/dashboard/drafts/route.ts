import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function GET() {
  // Auth check
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Get all draft picks
  const { data: drafts, error } = await supabase
    .from("picks")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get decision log entries for these drafts
  const pickIds = (drafts ?? []).map((d) => d.id);
  let decisionLogs: Record<string, Record<string, unknown>> = {};

  if (pickIds.length > 0) {
    const { data: logs } = await supabase
      .from("pick_decision_log")
      .select("*")
      .in("pick_id", pickIds);

    if (logs) {
      decisionLogs = Object.fromEntries(
        logs.map((log) => [log.pick_id, log]),
      );
    }
  }

  // Merge decision log data into each draft
  const enrichedDrafts = (drafts ?? []).map((draft) => ({
    ...draft,
    decision_log: decisionLogs[draft.id] ?? null,
  }));

  return NextResponse.json({ drafts: enrichedDrafts });
}
