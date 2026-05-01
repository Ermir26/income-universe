import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { createClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/admin/audit-log";
import { getBrandPromptRules } from "@/lib/tipster/brand";
import Anthropic from "@anthropic-ai/sdk";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await ctx.params;
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  const { data: pick } = await supabase
    .from("picks")
    .select("*")
    .eq("id", id)
    .single();

  if (!pick) {
    return NextResponse.json({ error: `Pick ${id} not found` }, { status: 404 });
  }

  // Accept optional override fields from request body (used by structural edits)
  let overrides: Record<string, string | number | null> = {};
  try {
    const body = await request.json();
    if (body && typeof body === "object") {
      overrides = body as Record<string, string | number | null>;
    }
  } catch {
    // No body or invalid JSON — that's fine, use pick's current values
  }

  const effectiveBetType = (overrides.bet_type as string) ?? pick.bet_type ?? "N/A";
  const effectiveSide = (overrides.side as string) ?? pick.side ?? "N/A";
  const effectiveLine = overrides.line != null ? String(overrides.line) : (pick.line != null ? String(pick.line) : "N/A");
  const effectiveOdds = overrides.odds != null ? String(overrides.odds) : (pick.odds != null ? String(pick.odds) : "N/A");

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const prompt = `${getBrandPromptRules()}

You are writing a reasoning paragraph for a Sharkline pick card.

Game: ${pick.game}
Sport: ${pick.sport}
League: ${pick.league ?? "N/A"}
Market: ${effectiveBetType}
Side: ${effectiveSide}
Line: ${effectiveLine}
Odds: ${effectiveOdds}
Bookmaker: ${pick.bookmaker ?? "N/A"}
Confidence: ${pick.confidence}%

Write a concise 2-3 sentence reasoning paragraph explaining WHY this pick has value. Focus on matchup analysis, form, and situational factors. Reference why the odds represent value — not just why the team will win.

Do NOT embed specific odds numbers or bookmaker names in the reasoning — those are displayed separately on the card.

Keep it under 100 words. Write in Sharkline voice: analytical, confident, data-driven, never emotional. Use "we" not "I".`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const reasoning = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!reasoning) {
      return NextResponse.json({ error: "Empty reasoning generated" }, { status: 500 });
    }

    // Build reasoning history entry
    const oldReasoning = pick.reasoning ?? "";
    const existingHistory = Array.isArray(pick.reasoning_history) ? pick.reasoning_history : [];
    const historyEntry = {
      reasoning: oldReasoning,
      replaced_at: new Date().toISOString(),
      trigger: overrides.bet_type ? "structural" : overrides.side ? "directional" : "manual",
    };
    const updatedHistory = [...existingHistory, historyEntry];

    // Update the pick with new reasoning, history, and clear stale reasoning markers
    await supabase.from("picks").update({
      reasoning,
      reasoning_history: updatedHistory,
      reasoning_bookmaker: null,
      reasoning_line: null,
      reasoning_odds: null,
    }).eq("id", id);

    // Audit log
    await writeAuditLog(supabase, {
      action: "reasoning_regenerated",
      target_type: "pick",
      target_id: id,
      before_value: oldReasoning,
      after_value: reasoning,
    });

    return NextResponse.json({ ok: true, reasoning });
  } catch (err) {
    return NextResponse.json(
      { error: `Claude API error: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
