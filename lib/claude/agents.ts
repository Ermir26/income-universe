import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../supabase/server";
import type { AgentLogInsert } from "../supabase/types";

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  return new Anthropic();
}

interface AgentResult {
  action: string;
  result: string;
  revenueGenerated: number;
}

// Mock agent execution
function mockExecute(agentName: string, task: string): AgentResult {
  const actions: Record<string, AgentResult> = {
    tipster: {
      action: "Posted daily pick to Telegram",
      result: "NFL Week 14: Chiefs -3.5 vs Raiders — Value play at -110",
      revenueGenerated: 0,
    },
    researcher: {
      action: "Researched market trends",
      result: "Found 3 trending niches with low competition",
      revenueGenerated: 0,
    },
    executor: {
      action: "Executed automation task",
      result: `Completed: ${task}`,
      revenueGenerated: Math.random() > 0.7 ? Math.round(Math.random() * 50 * 100) / 100 : 0,
    },
    content: {
      action: "Generated content piece",
      result: "Created blog post: '10 AI Tools That Actually Save Time'",
      revenueGenerated: 0,
    },
    outreach: {
      action: "Sent outreach emails",
      result: "Emailed 15 prospects, 3 opened, 1 replied",
      revenueGenerated: 0,
    },
    social: {
      action: "Published social media post",
      result: "Posted to Twitter + Buffer scheduled for Instagram",
      revenueGenerated: 0,
    },
    sales: {
      action: "Processed sales tasks",
      result: "Listed 2 new products, updated 5 existing listings",
      revenueGenerated: Math.random() > 0.5 ? Math.round(Math.random() * 30 * 100) / 100 : 0,
    },
    analytics: {
      action: "Ran analytics review",
      result: "Revenue up 12% WoW, top performer: premium template pack",
      revenueGenerated: 0,
    },
  };

  return actions[agentName] || {
    action: `Ran ${agentName} agent`,
    result: `Completed task: ${task}`,
    revenueGenerated: 0,
  };
}

export async function executeAgent(
  planetId: string,
  agentName: string,
  task: string,
  config?: Record<string, unknown>
): Promise<AgentResult> {
  const client = getClient();

  let result: AgentResult;

  if (!client) {
    console.log(`[Agent] Mock executing: ${agentName} on planet ${planetId}`);
    result = mockExecute(agentName, task);
  } else {
    console.log(`[Agent] Executing: ${agentName} on planet ${planetId}`);

    const response = await client.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `You are an AI agent named "${agentName}" working on an automated income planet.

Your task: ${task}
${config ? `Config: ${JSON.stringify(config)}` : ""}

Execute this task and report:
1. What action you took
2. The result
3. Any revenue generated (number, 0 if none)

Return ONLY this JSON:
{"action": "...", "result": "...", "revenueGenerated": 0}`,
        },
      ],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") throw new Error("No response from Claude");

    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }
    result = JSON.parse(jsonStr) as AgentResult;
  }

  // Log the agent action
  await logAgentAction(planetId, agentName, result);

  // If revenue was generated, record it
  if (result.revenueGenerated > 0) {
    await recordRevenue(planetId, agentName, result.revenueGenerated, result.result);
  }

  console.log(
    `[Agent] ${agentName}: ${result.action}${result.revenueGenerated > 0 ? ` (+$${result.revenueGenerated})` : ""}`
  );

  return result;
}

async function logAgentAction(planetId: string, agentName: string, result: AgentResult) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log(`[Agent] Mock log: ${agentName} → ${result.action}`);
    return;
  }

  const log: AgentLogInsert = {
    planet_id: planetId,
    agent_name: agentName,
    action: result.action,
    result: result.result,
    revenue_generated: result.revenueGenerated,
  };

  await supabaseAdmin.from("agent_logs").insert(log);

  // Update planet last_active
  await supabaseAdmin
    .from("planets")
    .update({ last_active: new Date().toISOString() })
    .eq("id", planetId);
}

async function recordRevenue(planetId: string, source: string, amount: number, description: string) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log(`[Revenue] Mock: +$${amount} from ${source}`);
    return;
  }

  // Get planet's galaxy
  const { data: planet } = await supabaseAdmin
    .from("planets")
    .select("galaxy_id")
    .eq("id", planetId)
    .single();

  // Insert revenue event
  await supabaseAdmin.from("revenue_events").insert({
    planet_id: planetId,
    galaxy_id: planet?.galaxy_id,
    amount,
    source,
    description,
  });

  // Update planet revenue
  await supabaseAdmin.rpc("add_planet_revenue", {
    planet_id_param: planetId,
    amount_param: amount,
  });

  // Update galaxy revenue
  if (planet?.galaxy_id) {
    await supabaseAdmin
      .from("galaxies")
      .update({ total_revenue: amount }) // Will need RPC for atomic increment
      .eq("id", planet.galaxy_id);
  }

  // Update universe stats
  await supabaseAdmin
    .from("universe_stats")
    .update({
      total_revenue: amount, // Will need RPC for atomic increment
      revenue_today: amount,
      updated_at: new Date().toISOString(),
    })
    .not("id", "is", null);
}
