import cron from "node-cron";
import { runFullPipeline } from "./pipeline";
import { optimizeUniverse } from "./optimizer";
import { executeAgent } from "../claude/agents";
import { supabaseAdmin } from "../supabase/server";
import type { Planet, AgentConfig } from "../supabase/types";

let scheduledTasks: ReturnType<typeof cron.schedule>[] = [];

export function startScheduler() {
  console.log("[Scheduler] Starting all cron jobs...");

  // Pipeline scan every 2 hours
  const scanJob = cron.schedule("0 */2 * * *", async () => {
    console.log("[Scheduler] Running pipeline scan...");
    try {
      await runFullPipeline();
    } catch (err) {
      console.error("[Scheduler] Pipeline scan failed:", err);
    }
  });
  scheduledTasks.push(scanJob);

  // Daily optimization at midnight
  const optimizeJob = cron.schedule("0 0 * * *", async () => {
    console.log("[Scheduler] Running daily optimization...");
    try {
      await optimizeUniverse();
    } catch (err) {
      console.error("[Scheduler] Optimization failed:", err);
    }
  });
  scheduledTasks.push(optimizeJob);

  // Agent runner: check every 5 minutes for agents that need to run
  const agentRunner = cron.schedule("*/5 * * * *", async () => {
    try {
      await runDueAgents();
    } catch (err) {
      console.error("[Scheduler] Agent runner failed:", err);
    }
  });
  scheduledTasks.push(agentRunner);

  console.log("[Scheduler] Scheduled: pipeline scan (every 2h), optimizer (midnight), agent runner (every 5m)");
}

export function stopScheduler() {
  scheduledTasks.forEach((task) => task.stop());
  scheduledTasks = [];
  console.log("[Scheduler] All cron jobs stopped");
}

async function runDueAgents() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    // Mock mode: simulate agent runs
    return;
  }

  const { data: planets } = await supabaseAdmin
    .from("planets")
    .select("*")
    .eq("status", "active");

  if (!planets) return;

  for (const planet of planets as Planet[]) {
    const agents = planet.agents as AgentConfig[];
    if (!agents || agents.length === 0) continue;

    for (const agent of agents) {
      if (!agent.enabled) continue;

      // Check if agent is due based on its cron schedule
      if (cron.validate(agent.schedule) && shouldRunNow(agent)) {
        try {
          await executeAgent(
            planet.id,
            agent.name,
            planet.first_task || `Run ${agent.type} tasks`,
            planet.config as Record<string, unknown>
          );
        } catch (err) {
          console.error(`[Scheduler] Agent ${agent.name} failed on ${planet.name}:`, err);
        }
      }
    }
  }
}

function shouldRunNow(agent: AgentConfig): boolean {
  // Simple check: if lastRun is undefined or older than the schedule interval, run
  if (!agent.lastRun) return true;

  const lastRun = new Date(agent.lastRun);
  const now = new Date();
  const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);

  // Parse cron to estimate interval (simplified)
  const parts = agent.schedule.split(" ");
  const minutePart = parts[0];
  const hourPart = parts[1];

  if (minutePart.startsWith("*/")) {
    const interval = parseInt(minutePart.replace("*/", ""));
    return minutesSinceLastRun >= interval;
  }
  if (hourPart.startsWith("*/")) {
    const interval = parseInt(hourPart.replace("*/", "")) * 60;
    return minutesSinceLastRun >= interval;
  }

  // Default: run if more than 60 minutes since last run
  return minutesSinceLastRun >= 60;
}
