// Dashboard manual "Run Daily Picks Now" button.
// Auth: admin session cookie (verifySessionToken).
// Calls the shared pick generation service directly (no internal fetch).
// MUST always return JSON — never throw to Next.js default error page.

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { runPickGeneration } from "@/lib/tipster/run-pick-generation";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

function safeStringify(value: unknown, maxLen = 4000): string {
  try {
    const json = JSON.stringify(value, (_key, v) => {
      if (v instanceof Error) return { name: v.name, message: v.message, stack: v.stack };
      return v;
    });
    return json.length > maxLen ? json.slice(0, maxLen) + "…[truncated]" : json;
  } catch {
    return '{"stringify_error":true}';
  }
}

async function auditLog(
  action: string,
  data: Record<string, unknown>,
): Promise<string | null> {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: row } = await supabase.from("agent_logs").insert({
      agent_name: "manual-pick-run",
      action,
      result: safeStringify(data),
      revenue_generated: 0,
    }).select("id").single();
    return row?.id ?? null;
  } catch {
    return null;
  }
}

export async function POST() {
  // Auth — wrapped so even auth errors return JSON
  try {
    const cookieStore = await cookies();
    const session = cookieStore.get("admin_session");
    if (!session?.value || !(await verifySessionToken(session.value))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: "Auth check failed" }, { status: 401 });
  }

  try {
    const result = await runPickGeneration("manual");

    // Sanitize errors array — guard against non-string values at runtime
    const safeErrors = (result.errors ?? []).map((e: unknown) =>
      typeof e === "string" ? e : e instanceof Error ? e.message : String(e),
    );

    await auditLog("manual_pick_run", {
      generated: result.generated,
      posted_free: result.posted_free,
      posted_vip: result.posted_vip,
      skipped: result.skipped ?? null,
      errors: safeErrors.length,
    });

    return NextResponse.json({ ...result, errors: safeErrors });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const logId = await auditLog("manual_pick_error", {
      error: error.message,
      name: error.name,
      stack: error.stack,
    });

    return NextResponse.json(
      { ok: false, error: error.message, exception_id: logId },
      { status: 500 },
    );
  }
}
