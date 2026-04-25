import { SupabaseClient } from "@supabase/supabase-js";

export interface AuditEntry {
  action: string;
  target_type: string;
  target_id?: string;
  before_value?: unknown;
  after_value?: unknown;
  actor?: string;
}

export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditEntry,
): Promise<void> {
  await supabase.from("admin_audit_log").insert({
    action: entry.action,
    target_type: entry.target_type,
    target_id: entry.target_id ?? null,
    before_value: entry.before_value ?? null,
    after_value: entry.after_value ?? null,
    actor: entry.actor ?? "dashboard",
  });
}
