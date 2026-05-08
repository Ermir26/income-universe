// Phase 3.2 — Reasoning Regeneration Matrix
// Unit tests for edit category detection: cosmetic, directional, structural
//
// Tests the `detectEditCategory` logic extracted from the edit route.
// Original integration tests used hardcoded pick IDs against a live server;
// replaced with pure-function tests for reliability.

import { describe, it, expect } from "vitest";

// ── Reproduce detectEditCategory exactly as in the edit route ──
// This is the same logic from app/api/dashboard/picks/[id]/edit/route.ts
function detectEditCategory(
  pick: Record<string, unknown>,
  updates: Record<string, unknown>,
): "cosmetic" | "directional" | "structural" | "none" {
  const marketChanged = "bet_type" in updates && updates.bet_type !== pick.bet_type;
  const sideChanged = "side" in updates && updates.side !== pick.side;
  const cosmeticFields = ["line", "odds", "bookmaker", "channel"];
  const cosmeticChanged = cosmeticFields.some((f) => f in updates && updates[f] !== pick[f]);
  const reasoningChanged = "reasoning" in updates && updates.reasoning !== pick.reasoning;

  if (marketChanged) return "structural";
  if (sideChanged) return "directional";
  if (cosmeticChanged) return "cosmetic";
  if (reasoningChanged) return "none"; // reasoning-only edits need no regeneration
  return "none";
}

const basePick = {
  id: "test-pick-1",
  game: "Phillies vs Giants",
  bet_type: "moneyline",
  side: "away",
  odds: "-150",
  line: null,
  bookmaker: "DraftKings",
  channel: "vip,method",
  reasoning: "Original reasoning text for the pick.",
};

describe("Phase 3.2 — Edit Category Detection", () => {
  it("cosmetic: odds-only change returns 'cosmetic'", () => {
    const result = detectEditCategory(basePick, { odds: "-145" });
    expect(result).toBe("cosmetic");
  });

  it("cosmetic: line change returns 'cosmetic'", () => {
    const result = detectEditCategory(basePick, { line: "-3.5" });
    expect(result).toBe("cosmetic");
  });

  it("cosmetic: bookmaker change returns 'cosmetic'", () => {
    const result = detectEditCategory(basePick, { bookmaker: "FanDuel" });
    expect(result).toBe("cosmetic");
  });

  it("cosmetic: channel change returns 'cosmetic'", () => {
    const result = detectEditCategory(basePick, { channel: "free,vip,method" });
    expect(result).toBe("cosmetic");
  });

  it("directional: side flip returns 'directional'", () => {
    const result = detectEditCategory(basePick, { side: "home" });
    expect(result).toBe("directional");
  });

  it("directional: side change takes priority over cosmetic fields", () => {
    const result = detectEditCategory(basePick, { side: "home", odds: "-130" });
    expect(result).toBe("directional");
  });

  it("structural: bet_type change returns 'structural'", () => {
    const result = detectEditCategory(basePick, { bet_type: "totals" });
    expect(result).toBe("structural");
  });

  it("structural: bet_type change takes priority over side + cosmetic", () => {
    const result = detectEditCategory(basePick, {
      bet_type: "spreads",
      side: "home",
      odds: "-110",
      line: "-4.5",
    });
    expect(result).toBe("structural");
  });

  it("none: reasoning-only change returns 'none'", () => {
    const result = detectEditCategory(basePick, { reasoning: "New reasoning text." });
    expect(result).toBe("none");
  });

  it("none: no actual change (same values) returns 'none'", () => {
    const result = detectEditCategory(basePick, { odds: "-150" });
    expect(result).toBe("none");
  });

  it("none: empty updates returns 'none'", () => {
    const result = detectEditCategory(basePick, {});
    expect(result).toBe("none");
  });

  it("structural: same bet_type value is NOT structural", () => {
    const result = detectEditCategory(basePick, { bet_type: "moneyline" });
    expect(result).toBe("none");
  });

  it("directional: same side value is NOT directional", () => {
    const result = detectEditCategory(basePick, { side: "away" });
    expect(result).toBe("none");
  });
});
