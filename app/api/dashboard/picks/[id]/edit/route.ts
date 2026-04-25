import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const EDITABLE_FIELDS = new Set([
  "line",
  "odds",
  "bookmaker",
  "bet_type",
  "side",
  "channel",
  "reasoning",
]);

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;

  let updates: Record<string, unknown> = {};
  try {
    const body = await request.json();
    updates = body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const filteredUpdates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(updates)) {
    if (EDITABLE_FIELDS.has(key)) {
      filteredUpdates[key] = value;
    }
  }

  if (Object.keys(filteredUpdates).length === 0) {
    return NextResponse.json(
      { error: "No valid fields to update. Allowed: " + Array.from(EDITABLE_FIELDS).join(", ") },
      { status: 400 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: pick } = await supabase
    .from("picks")
    .select("*")
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

  // Snapshot before values for audit
  const beforeValues: Record<string, unknown> = {};
  for (const key of Object.keys(filteredUpdates)) {
    beforeValues[key] = pick[key];
  }

  const { error } = await supabase
    .from("picks")
    .update(filteredUpdates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    action: "pick_edited",
    target_type: "pick",
    target_id: id,
    before_value: beforeValues,
    after_value: filteredUpdates,
  });

  return NextResponse.json({ ok: true, message: `Pick ${id} updated.` });
}
