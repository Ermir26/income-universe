// Job payload types for all queues

export interface DiscoveryJobPayload {
  source: string; // e.g. "reddit", "producthunt", "hackernews", "twitter", "indiehackers"
  trigger: "scheduled" | "manual";
}

export interface FeasibilityJobPayload {
  discoveryId: string;
  name: string;
  description: string;
  category: string;
  source: string;
  marketSignal: string;
}

export interface BuildJobPayload {
  discoveryId: string;
  name: string;
  category: string;
  description: string;
  feasibilityScore: number;
  feasibilityBreakdown: {
    marketDemand: number;
    automationPotential: number;
    timeToRevenue: number;
    startupCost: number;
  };
}

export interface AgentJobPayload {
  planetId: string;
  agentName: string;
  task: string;
  config?: Record<string, unknown>;
}

export interface OptimizeJobPayload {
  trigger: "scheduled" | "manual";
}

export interface ScanJobPayload {
  sources: string[];
  trigger: "scheduled" | "manual";
}

export type JobPayload =
  | DiscoveryJobPayload
  | FeasibilityJobPayload
  | BuildJobPayload
  | AgentJobPayload
  | OptimizeJobPayload
  | ScanJobPayload;
