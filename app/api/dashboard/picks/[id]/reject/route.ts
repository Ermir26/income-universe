import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let reason = "";
  try {
    const body = await request.json();
    reason = (body as { reason?: string }).reason ?? "";
  } catch {
    // No body or invalid JSON
  }

  if (!reason.trim()) {
    return NextResponse.json(
      { error: "Rejection reason is required" },
      { status: 400 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: pick } = await supabase
    .from("picks")
    .select("id, status, game, pick, odds, bookmaker")
    .eq("id", id)
    .single();

  if (!pick) {
    return NextResponse.json({ error: `Pick ${id} not found` }, { status: 404 });
  }
  if (pick.status !== "draft") {
    return NextResponse.json(
      { error: `Pick ${id} is not a draft (status: ${pick.status})` },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("picks")
    .update({ status: "rejected", rejection_reason: reason })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    action: "pick_rejected",
    target_type: "pick",
    target_id: id,
    before_value: pick,
    after_value: { status: "rejected", rejection_reason: reason },
  });

  return NextResponse.json({ ok: true, message: `Pick ${id} rejected.` });
}
