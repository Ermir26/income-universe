import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";
import {
  validatePickAgainstPayload,
  TRUSTED_BOOKS,
  type GameData,
} from "@/lib/tipster/analysis-card";

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

// Determine edit severity category based on what changed
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

// Valid channel tokens for multi-select
const VALID_CHANNELS = new Set(["free", "vip", "method"]);

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

  // Validate channel format if provided — must be comma-separated valid tokens
  if ("channel" in filteredUpdates && typeof filteredUpdates.channel === "string") {
    const tokens = (filteredUpdates.channel as string).split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const invalid = tokens.filter((t) => !VALID_CHANNELS.has(t));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `Invalid channel(s): ${invalid.join(", ")}. Valid: ${Array.from(VALID_CHANNELS).join(", ")}` },
        { status: 400 },
      );
    }
    filteredUpdates.channel = tokens.join(",");
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

  // ── Market change: auto-clear line + odds so operator must re-fill ──
  if ("bet_type" in filteredUpdates && filteredUpdates.bet_type !== pick.bet_type) {
    if (!("line" in filteredUpdates)) {
      filteredUpdates.line = null;
      beforeValues.line = pick.line;
    }
    if (!("odds" in filteredUpdates)) {
      filteredUpdates.odds = null;
      beforeValues.odds = pick.odds;
    }
  }

  // ── Side change: re-run validator against odds payload ──
  if ("side" in filteredUpdates && filteredUpdates.side !== pick.side) {
    const { data: decisionLog } = await supabase
      .from("pick_decision_log")
      .select("odds_api_payload")
      .eq("pick_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (decisionLog?.odds_api_payload) {
      const newSide = filteredUpdates.side as string;
      const newLine = (filteredUpdates.line ?? pick.line) as string | null;
      const newOdds = String(filteredUpdates.odds ?? pick.odds ?? "");

      // Reconstruct pick string for validator
      const betType = (filteredUpdates.bet_type ?? pick.bet_type) as string | null;
      let reconstructedPick: string;
      if (betType === "totals" || betType === "total") {
        reconstructedPick = `${newSide} ${newLine ?? ""}`.trim();
      } else if (betType === "spreads" || betType === "spread") {
        reconstructedPick = `${newSide} ${newLine ?? ""}`.trim();
      } else {
        reconstructedPick = newSide;
      }

      const validatorResult = validatePickAgainstPayload(
        { game: pick.game, pick: reconstructedPick, odds: newOdds, bookmaker: pick.bookmaker ?? "" },
        decisionLog.odds_api_payload as GameData,
        TRUSTED_BOOKS,
      );

      if (validatorResult.status === "rejected") {
        return NextResponse.json(
          { error: `Validator rejected side change: ${validatorResult.reason}` },
          { status: 400 },
        );
      }

      // If validator corrected the bookmaker, apply the correction
      if (validatorResult.status === "corrected") {
        filteredUpdates.bookmaker = validatorResult.newBookmaker;
        filteredUpdates.odds = validatorResult.newOdds;
        beforeValues.bookmaker = pick.bookmaker;
        beforeValues.odds = pick.odds;
      }
    }
    // If no decision log payload, allow the side change without validation
  }

  // Track original reasoning context: when line/odds/bookmaker are edited,
  // record what the reasoning was originally written for (only set once).
  const REASONING_TRACKED = ["line", "odds", "bookmaker"] as const;
  for (const field of REASONING_TRACKED) {
    if (field in filteredUpdates && !pick[`reasoning_${field}`]) {
      filteredUpdates[`reasoning_${field}`] = pick[field];
    }
  }

  // Detect edit category before saving
  const editCategory = detectEditCategory(pick, filteredUpdates);

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

  // For structural edits, auto-regenerate reasoning server-side
  if (editCategory === "structural") {
    try {
      // Determine base URL: prefer origin/referer, fall back to host header, then localhost
      let baseUrl = request.headers.get("origin")
        || request.headers.get("referer")?.replace(/\/[^/]*$/, "")
        || "";
      if (!baseUrl) {
        const host = request.headers.get("host") || "localhost:3000";
        const proto = request.headers.get("x-forwarded-proto") || "http";
        baseUrl = `${proto}://${host}`;
      }
      const cookieHeader = request.headers.get("cookie") || "";
      const regenRes = await fetch(`${baseUrl}/api/dashboard/picks/${id}/regenerate-reasoning`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": cookieHeader,
        },
        body: JSON.stringify({
          bet_type: filteredUpdates.bet_type,
          side: filteredUpdates.side,
          line: filteredUpdates.line,
          odds: filteredUpdates.odds,
        }),
      });
      const regenData = await regenRes.json();
      if (regenRes.ok && regenData.reasoning) {
        return NextResponse.json({
          ok: true,
          message: `Pick ${id} updated. Reasoning regenerated to match new market.`,
          edit_category: editCategory,
          regenerated_reasoning: regenData.reasoning,
        });
      }
    } catch {
      // If regeneration fails, still return success for the edit itself
    }
  }

  return NextResponse.json({
    ok: true,
    message: `Pick ${id} updated.`,
    edit_category: editCategory,
  });
}
