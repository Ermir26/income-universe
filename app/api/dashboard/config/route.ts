import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const ALLOWED_KEYS = new Set([
  "TIPSTER_ENABLED",
  "PINNACLE_CROSSCHECK_ENABLED",
  "ADMIN_TELEGRAM_ID",
  "TELEGRAM_ADMIN_CHAT_ID",
]);

export async function GET() {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: configs } = await supabase
    .from("system_config")
    .select("key, value, updated_at, updated_by")
    .order("key");

  return NextResponse.json({ configs: configs ?? [] });
}

export async function PUT(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { key?: string; value?: string };
  try {
    body = (await request.json()) as { key?: string; value?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || value === undefined) {
    return NextResponse.json({ error: "key and value are required" }, { status: 400 });
  }

  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json(
      { error: `Key '${key}' is not configurable. Allowed: ${Array.from(ALLOWED_KEYS).join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Get current value for audit
  const { data: current } = await supabase
    .from("system_config")
    .select("value")
    .eq("key", key)
    .single();

  const { error } = await supabase
    .from("system_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: "dashboard" },
      { onConflict: "key" },
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    action: "flag_flipped",
    target_type: "flag",
    target_id: key,
    before_value: { value: current?.value ?? null },
    after_value: { value },
  });

  return NextResponse.json({ ok: true, message: `${key} updated to '${value}'.` });
}
