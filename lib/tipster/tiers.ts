// Confidence Tier System — Sharkline
// Picks below 65 confidence are never sent.

export interface Tier {
  name: "FOUNDATION" | "VALUE" | "STRONG VALUE" | "MAXIMUM";
  emoji: string;
  stake: number;
  color: string;
}

export function getTier(confidence: number, pickType?: string): Tier | null {
  if (pickType === "foundation" && confidence >= 75) {
    return { name: "FOUNDATION", emoji: "🛡️", stake: 1, color: "#3b82f6" };
  }
  if (confidence >= 85) return { name: "MAXIMUM", emoji: "💎", stake: 2, color: "#a855f7" };
  if (confidence >= 75) return { name: "STRONG VALUE", emoji: "🔥", stake: 1.5, color: "#f97316" };
  if (confidence >= 65) return { name: "VALUE", emoji: "✅", stake: 1, color: "#22c55e" };
  return null; // below threshold — do not send
}

export function formatTierBadge(tier: Tier): string {
  return `${tier.emoji} ${tier.name} (${tier.stake}u)`;
}

export function getTierStakeStars(tier: Tier): string {
  if (tier.name === "FOUNDATION") return "🛡️";
  if (tier.stake === 2) return "⭐⭐⭐";
  if (tier.stake === 1.5) return "⭐⭐";
  return "⭐";
}

export const MIN_CONFIDENCE = 65;
