import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySessionToken } from "@/lib/admin/auth";
import { getBrandPromptRules } from "@/lib/tipster/brand";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const session = cookieStore.get("admin_session");
  if (!session?.value || !(await verifySessionToken(session.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const notes = body.notes as string;
  const game = body.game as string;
  const sport = body.sport as string;
  const market = body.market as string;
  const side = body.side as string;
  const line = body.line as string | undefined;
  const odds = body.odds as string | undefined;

  if (!notes || !game) {
    return NextResponse.json({ error: "notes and game are required" }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
  }

  const client = new Anthropic({ apiKey });

  const prompt = `${getBrandPromptRules()}

You are a writing assistant for Sharkline's operator. The operator has bullet-point notes about a pick. Your job is to polish these into a Sharkline-voice reasoning paragraph.

The operator's analysis and judgment are the content — you are only polishing the prose. Do NOT add new analysis or facts. Transform the notes into fluid, confident copy.

Game: ${game}
Sport: ${sport || "N/A"}
Market: ${market || "N/A"}
Side: ${side || "N/A"}
${line ? `Line: ${line}` : ""}
${odds ? `Odds: ${odds}` : ""}

Operator's notes:
${notes}

Write a concise 2-4 sentence reasoning paragraph. Do NOT embed specific odds numbers or bookmaker names — those are displayed separately on the card. Keep it under 120 words. Write in Sharkline voice: analytical, confident, data-driven, never emotional. Use "we" not "I".`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 250,
      messages: [{ role: "user", content: prompt }],
    });

    const reasoning = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!reasoning) {
      return NextResponse.json({ error: "Empty reasoning generated" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, reasoning });
  } catch (err) {
    return NextResponse.json(
      { error: `Claude API error: ${(err as Error).message}` },
      { status: 500 },
    );
  }
}
