import {
  discoveryQueue,
  feasibilityQueue,
  buildQueue,
  agentQueue,
  optimizeQueue,
  scanQueue,
} from "./queues";
import type {
  DiscoveryJobPayload,
  FeasibilityJobPayload,
  BuildJobPayload,
  AgentJobPayload,
  OptimizeJobPayload,
  ScanJobPayload,
} from "./types";

export async function addDiscoveryJob(source: string, trigger: "scheduled" | "manual" = "manual") {
  const payload: DiscoveryJobPayload = { source, trigger };
  return discoveryQueue.add("discover", payload);
}

export async function addFeasibilityJob(
  discoveryId: string,
  name: string,
  description: string,
  category: string,
  source: string,
  marketSignal: string
) {
  const payload: FeasibilityJobPayload = {
    discoveryId,
    name,
    description,
    category,
    source,
    marketSignal,
  };
  return feasibilityQueue.add("test-feasibility", payload);
}

export async function addBuildJob(
  discoveryId: string,
  name: string,
  category: string,
  description: string,
  feasibilityScore: number,
  feasibilityBreakdown: BuildJobPayload["feasibilityBreakdown"]
) {
  const payload: BuildJobPayload = {
    discoveryId,
    name,
    category,
    description,
    feasibilityScore,
    feasibilityBreakdown,
  };
  return buildQueue.add("build-planet", payload);
}

export async function addAgentJob(
  planetId: string,
  agentName: string,
  task: string,
  config?: Record<string, unknown>
) {
  const payload: AgentJobPayload = { planetId, agentName, task, config };
  return agentQueue.add("run-agent", payload);
}

export async function addOptimizeJob(trigger: "scheduled" | "manual" = "manual") {
  const payload: OptimizeJobPayload = { trigger };
  return optimizeQueue.add("optimize", payload);
}

export async function addScanJob(
  sources: string[] = ["reddit", "producthunt", "hackernews", "twitter", "indiehackers"],
  trigger: "scheduled" | "manual" = "manual"
) {
  const payload: ScanJobPayload = { sources, trigger };
  return scanQueue.add("scan-all", payload);
}
