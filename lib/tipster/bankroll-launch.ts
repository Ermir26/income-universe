// Bankroll Launch — initializes bankroll_state for supervised launch
// DO NOT call initializeBankrollLaunch until explicitly triggered from a future prompt.

import { type SupabaseClient } from "@supabase/supabase-js";

export interface BankrollState {
  id: number;
  starting_balance: number;
  launch_timestamp: string | null;
  current_units: number | null;
  peak_units: number | null;
  drawdown_pct: number | null;
  recovery_tier: string;
  last_settled_pick_id: string | null;
  last_updated: string;
  notes: string | null;
}

/**
 * Initialize the bankroll for supervised launch.
 * Sets launch_timestamp = now(), current_units = starting_balance (100),
 * peak_units = 100, drawdown_pct = 0, recovery_tier = 'normal'.
 *
 * Writes an admin_audit_log entry with action: 'bankroll_launch_initialized'.
 */
export async function initializeBankrollLaunch(
  supabase: SupabaseClient,
): Promise<BankrollState> {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("bankroll_state")
    .update({
      launch_timestamp: now,
      current_units: 100,
      peak_units: 100,
      drawdown_pct: 0,
      recovery_tier: "normal",
      last_updated: now,
      notes: "Bankroll launched — supervised enable",
    })
    .eq("id", 1)
    .select()
    .single();

  if (error) throw new Error(`Failed to initialize bankroll launch: ${error.message}`);

  // Write audit log
  await supabase.from("admin_audit_log").insert({
    action: "bankroll_launch_initialized",
    target_type: "bankroll_state",
    target_id: "1",
    before_value: { launch_timestamp: null, current_units: null },
    after_value: {
      launch_timestamp: now,
      current_units: 100,
      peak_units: 100,
      drawdown_pct: 0,
      recovery_tier: "normal",
    },
  });

  return data as BankrollState;
}

/**
 * Check whether bankroll tracking has been launched (launch_timestamp IS NOT NULL).
 * Result is cached for 60 seconds to avoid repeated DB hits.
 */
let _cachedActive: boolean | null = null;
let _cachedAt = 0;

export async function isBankrollTrackingActive(supabase: SupabaseClient): Promise<boolean> {
  if (_cachedActive !== null && Date.now() - _cachedAt < 60_000) return _cachedActive;
  const { data } = await supabase.from('bankroll_state').select('launch_timestamp').limit(1).single();
  _cachedActive = !!data?.launch_timestamp;
  _cachedAt = Date.now();
  return _cachedActive;
}

/**
 * Compute the recovery tier based on drawdown percentage.
 */
export function computeRecoveryTier(drawdownPct: number): string {
  if (drawdownPct < 0.10) return "normal";
  if (drawdownPct < 0.25) return "recovery_25";
  if (drawdownPct < 0.40) return "recovery_50";
  return "paused";
}
