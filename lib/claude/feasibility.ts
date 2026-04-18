import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../supabase/server";
import type { FeasibilityBreakdown } from "../supabase/types";

const PASS_THRESHOLD = 62;

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("FEASIBILITY: Mock mode — no ANTHROPIC_API_KEY");
    return null;
  }
  return new Anthropic();
}

function mockFeasibility(name: string): { score: number; breakdown: FeasibilityBreakdown } {
  // Generate semi-random but deterministic scores based on name length
  const seed = name.length % 10;
  const breakdown: FeasibilityBreakdown = {
    marketDemand: 12 + (seed % 13),
    automationPotential: 15 + ((seed * 3) % 10),
    timeToRevenue: 10 + ((seed * 7) % 15),
    startupCost: 14 + ((seed * 5) % 11),
  };
  const score = breakdown.marketDemand + breakdown.automationPotential + breakdown.timeToRevenue + breakdown.startupCost;
  return { score, breakdown };
}

export async function testFeasibility(
  discoveryId: string,
  name: string,
  description: string,
  category: string,
  marketSignal: string
): Promise<{ passed: boolean; score: number; breakdown: FeasibilityBreakdown }> {
  const client = getClient();

  let score: number;
  let breakdown: FeasibilityBreakdown;

  if (!client) {
    console.log(`[Feasibility] Mock testing: ${name}`);
    const result = mockFeasibility(name);
    score = result.score;
    breakdown = result.breakdown;
  } else {
    console.log(`[Feasibility] Testing: ${name}`);

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Score this passive income idea for automation feasibility.

Name: ${name}
Category: ${category}
Description: ${description}
Market Signal: ${marketSignal}

Score each dimension 0-25:
1. Market Demand (0-25): Is there proven demand? Are people paying for similar things?
2. Automation Potential (0-25): Can AI fully automate this with no human input?
3. Time to Revenue (0-25): How quickly can this generate first dollar? (25 = days, 0 = years)
4. Startup Cost (0-25): How cheap to start? (25 = free, 0 = expensive)

Return ONLY this JSON:
{"marketDemand": N, "automationPotential": N, "timeToRevenue": N, "startupCost": N}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No response from Claude");
    }

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }

    breakdown = JSON.parse(jsonStr) as FeasibilityBreakdown;
    score = breakdown.marketDemand + breakdown.automationPotential + breakdown.timeToRevenue + breakdown.startupCost;
  }

  const passed = score >= PASS_THRESHOLD;

  // Update discovery in database
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    await supabaseAdmin
      .from("discoveries")
      .update({
        feasibility_score: score,
        feasibility_breakdown: breakdown,
        status: passed ? "passed" : "rejected",
      })
      .eq("id", discoveryId);
  }

  console.log(
    `[Feasibility] ${name}: ${score}/100 ${passed ? "PASS ✓" : "FAIL ✗"} (MD:${breakdown.marketDemand} AP:${breakdown.automationPotential} TTR:${breakdown.timeToRevenue} SC:${breakdown.startupCost})`
  );

  return { passed, score, breakdown };
}

export { PASS_THRESHOLD };
