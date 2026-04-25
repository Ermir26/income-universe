import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Snapshot before state
  const { data: before } = await supabase
    .from("picks")
    .select("id, status, game, pick, odds, bookmaker")
    .eq("id", id)
    .single();

  const { publishApprovedPick } = await import("@/lib/tipster/tipster-agent");
  const result = await publishApprovedPick(id, supabase, "admin-dashboard");

  if (result.ok) {
    await writeAuditLog(supabase, {
      action: "pick_approved",
      target_type: "pick",
      target_id: id,
      before_value: before,
      after_value: { status: "pending" },
    });
    return NextResponse.json({ ok: true, message: `Pick ${id} approved and published.` });
  } else {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 400 },
    );
  }
}
