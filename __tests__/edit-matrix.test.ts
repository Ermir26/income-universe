// Phase 3.2 — Edit Matrix Route Verification
// Tests that the edit route returns correct edit_category in the response
// and applies the right behavior per category (cosmetic: save, directional: save,
// structural: auto-regenerate reasoning).

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ──
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockSinglePick = vi.fn();
const mockDecisionLogSingle = vi.fn();

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "picks") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: mockSinglePick,
            }),
          }),
          update: mockUpdate,
        };
      }
      if (table === "pick_decision_log") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  single: mockDecisionLogSingle,
                }),
              }),
            }),
          }),
        };
      }
      // audit_log
      return { insert: mockInsert };
    },
  }),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => ({ value: "valid-session" }),
  }),
}));

vi.mock("@/lib/admin/auth", () => ({
  verifySessionToken: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/admin/audit-log", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/tipster/analysis-card", () => ({
  validatePickAgainstPayload: vi.fn().mockReturnValue({ status: "pass" }),
  TRUSTED_BOOKS: ["DraftKings", "FanDuel"],
}));

const basePick = {
  id: "test-pick-1",
  game: "Phillies vs Giants",
  bet_type: "h2h",
  side: "away",
  odds: "-150",
  line: null,
  bookmaker: "DraftKings",
  channel: "vip,method",
  reasoning: "Original reasoning.",
  status: "draft",
  pick: "Giants",
  confidence: 72,
  reasoning_line: null,
  reasoning_odds: null,
  reasoning_bookmaker: null,
};

describe("Edit Matrix — Route Response Categories", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSinglePick.mockResolvedValue({ data: { ...basePick }, error: null });
    mockDecisionLogSingle.mockResolvedValue({ data: null, error: null });
  });

  it("cosmetic edit (odds change) → edit_category: 'cosmetic'", async () => {
    const { PATCH } = await import("@/app/api/dashboard/picks/[id]/edit/route");
    const req = new Request("http://localhost/api/dashboard/picks/test-pick-1/edit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ odds: "-145" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "test-pick-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.edit_category).toBe("cosmetic");
  });

  it("directional edit (side flip) → edit_category: 'directional'", async () => {
    const { PATCH } = await import("@/app/api/dashboard/picks/[id]/edit/route");
    const req = new Request("http://localhost/api/dashboard/picks/test-pick-1/edit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ side: "home" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "test-pick-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.edit_category).toBe("directional");
  });

  it("structural edit (market change) → edit_category: 'structural', reasoning regenerated", async () => {
    // Mock fetch for the auto-regenerate call
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ reasoning: "New reasoning for totals market." }),
    }));

    const { PATCH } = await import("@/app/api/dashboard/picks/[id]/edit/route");
    const req = new Request("http://localhost/api/dashboard/picks/test-pick-1/edit", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Origin": "http://localhost:3000" },
      body: JSON.stringify({ bet_type: "totals" }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: "test-pick-1" }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.edit_category).toBe("structural");
    expect(body.regenerated_reasoning).toBe("New reasoning for totals market.");

    vi.unstubAllGlobals();
  });
});
