// Confidence Tier System — Sharkline
//
// 2026-05-08 decision: collapsed to VALUE + FOUNDATION only.
// STRONG VALUE (≥75) and MAXIMUM (≥85) were unreachable — the scoring engine
// produces scores in a 62-74 band due to prompt factor anchoring at 55-80.
// Reintroduce upper tiers when confidence calibration is rebuilt (requires
// external probability signal, not Claude self-graded factors).
//
// Historical picks may still have tier='STRONG VALUE' or 'MAXIMUM' in the DB.
// Those are preserved for audit reads; this code no longer produces them.

export interface Tier {
  name: "FOUNDATION" | "VALUE";
  emoji: string;
  stake: number;
  color: string;
}

/** Historical tier names that may exist in DB but are no longer produced. */
export type LegacyTierName = "STRONG VALUE" | "MAXIMUM";
export type AnyTierName = Tier["name"] | LegacyTierName | "MANUAL";

export function getTier(confidence: number, pickType?: string): Tier | null {
  if (pickType === "foundation" && confidence >= 65) {
    return { name: "FOUNDATION", emoji: "🛡️", stake: 1, color: "#3b82f6" };
  }
  if (confidence >= 60) return { name: "VALUE", emoji: "✅", stake: 1, color: "#22c55e" };
  return null; // below threshold — do not send
}

export function formatTierBadge(tier: Tier): string {
  return `${tier.emoji} ${tier.name} (${tier.stake}u)`;
}

export function getTierStakeStars(tier: Tier): string {
  if (tier.name === "FOUNDATION") return "🛡️";
  return "⭐";
}

export const MIN_CONFIDENCE = 60;
