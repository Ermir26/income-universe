import { type SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "./audit-log";

// ── Naming convention ──────────────────────────────────────────────
// `status` uses past-tense verbs: draft, pending, approved, rejected,
//   voided, settled, published.
// `result` uses outcome nouns:    pending, won, lost, push, void.
// They overlap but aren't the same column. A voided pick has
// status = "voided" (workflow) and result = "void" (no bet outcome).
// ────────────────────────────────────────────────────────────────────

type TerminalStatus = "rejected" | "voided";

/**
 * Atomically set a pick to a terminal non-played state.
 * Updates BOTH `status` AND `result` together so they can never desync.
 *
 * @param supabase  - Supabase client
 * @param pickId    - UUID of the pick (or null for batch operations)
 * @param terminalStatus - "rejected" or "voided"
 * @param reason    - Human-readable reason for the state change
 * @param auditAction - Optional custom audit action (defaults to "pick_{status}")
 */
export async function setPickTerminalState(
  supabase: SupabaseClient,
  pickId: string,
  terminalStatus: TerminalStatus,
  reason: string,
  auditAction?: string,
): Promise<void> {
  const reasonField =
    terminalStatus === "rejected" ? "rejection_reason" : "void_reason";

  const { error } = await supabase
    .from("picks")
    .update({
      status: terminalStatus,
      result: "void",
      [reasonField]: reason,
    })
    .eq("id", pickId);

  if (error) {
    throw new Error(
      `Failed to set pick ${pickId} to ${terminalStatus}: ${error.message}`,
    );
  }

  await writeAuditLog(supabase, {
    action: auditAction ?? `pick_${terminalStatus}`,
    target_type: "pick",
    target_id: pickId,
    before_value: null,
    after_value: { status: terminalStatus, result: "void", [reasonField]: reason },
  });
}

/**
 * Batch version: reject/void multiple picks by ID.
 * Sets both status and result atomically.
 */
export async function setPicksTerminalStateBatch(
  supabase: SupabaseClient,
  pickIds: string[],
  terminalStatus: TerminalStatus,
  reason: string,
  auditAction?: string,
): Promise<void> {
  if (pickIds.length === 0) return;

  const reasonField =
    terminalStatus === "rejected" ? "rejection_reason" : "void_reason";

  const { error } = await supabase
    .from("picks")
    .update({
      status: terminalStatus,
      result: "void",
      [reasonField]: reason,
    })
    .in("id", pickIds);

  if (error) {
    throw new Error(
      `Failed to batch set ${pickIds.length} picks to ${terminalStatus}: ${error.message}`,
    );
  }

  await writeAuditLog(supabase, {
    action: auditAction ?? `pick_${terminalStatus}_batch`,
    target_type: "pick_batch",
    target_id: undefined,
    before_value: { pick_ids: pickIds },
    after_value: {
      status: terminalStatus,
      result: "void",
      [reasonField]: reason,
      count: pickIds.length,
    },
  });
}

/**
 * Batch reject all drafts — used by bulk reject flows.
 * Filters by status=draft, then sets both status and result.
 */
export async function rejectAllDrafts(
  supabase: SupabaseClient,
  reason: string,
): Promise<number> {
  const { data: drafts } = await supabase
    .from("picks")
    .select("id")
    .eq("status", "draft");

  const count = drafts?.length ?? 0;
  if (count === 0) return 0;

  const ids = drafts!.map((d: { id: string }) => d.id);
  await setPicksTerminalStateBatch(
    supabase,
    ids,
    "rejected",
    reason,
    "pick_rejected_bulk",
  );

  return count;
}
