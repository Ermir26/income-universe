// Database types matching the Supabase schema

export interface Galaxy {
  id: string;
  name: string;
  category: string;
  color: string;
  description: string | null;
  status: "active" | "paused" | "archived";
  total_revenue: number;
  planet_count: number;
  created_at: string;
}

export interface Planet {
  id: string;
  galaxy_id: string | null;
  name: string;
  icon: string;
  category: string | null;
  status: "discovered" | "testing" | "building" | "active" | "paused" | "failed";
  feasibility_score: number;
  monthly_target: string | null;
  revenue_total: number;
  revenue_today: number;
  revenue_week: number;
  agents: AgentConfig[];
  config: Record<string, unknown>;
  source_url: string | null;
  market_signal: string | null;
  description: string | null;
  first_task: string | null;
  created_at: string;
  activated_at: string | null;
  last_active: string | null;
}

export interface AgentConfig {
  name: string;
  type: string;
  schedule: string; // cron expression
  enabled: boolean;
  lastRun?: string;
}

export interface PipelineItem {
  id: string;
  name: string | null;
  icon: string | null;
  category: string | null;
  description: string | null;
  stage: "discovered" | "testing" | "building" | "deploying" | "deployed";
  feasibility: FeasibilityBreakdown | null;
  source: string | null;
  market_signal: string | null;
  created_at: string;
}

export interface AgentLog {
  id: string;
  planet_id: string;
  agent_name: string;
  action: string;
  result: string | null;
  revenue_generated: number;
  created_at: string;
}

export interface RevenueEvent {
  id: string;
  planet_id: string | null;
  galaxy_id: string | null;
  amount: number;
  source: string | null;
  description: string | null;
  created_at: string;
}

export interface Discovery {
  id: string;
  name: string | null;
  icon: string | null;
  category: string | null;
  description: string | null;
  source: string | null;
  market_signal: string | null;
  feasibility_score: number | null;
  feasibility_breakdown: FeasibilityBreakdown | null;
  status: "pending" | "passed" | "rejected";
  created_at: string;
}

export interface FeasibilityBreakdown {
  marketDemand: number;
  automationPotential: number;
  timeToRevenue: number;
  startupCost: number;
}

export interface UniverseStats {
  id: string;
  total_revenue: number;
  revenue_today: number;
  active_planets: number;
  total_planets: number;
  total_galaxies: number;
  agents_running: number;
  last_scan: string | null;
  scans_today: number;
  planets_built_today: number;
  updated_at: string;
}

export interface ScanHistory {
  id: string;
  source: string | null;
  ideas_found: number;
  ideas_passed: number;
  ideas_failed: number;
  planets_created: number;
  duration_seconds: number;
  created_at: string;
}

// Insert/update types (omit auto-generated fields)
export type GalaxyInsert = Omit<Galaxy, "id" | "created_at" | "total_revenue" | "planet_count">;
export type PlanetInsert = Omit<Planet, "id" | "created_at" | "revenue_total" | "revenue_today" | "revenue_week">;
export type DiscoveryInsert = Omit<Discovery, "id" | "created_at">;
export type AgentLogInsert = Omit<AgentLog, "id" | "created_at">;
export type RevenueEventInsert = Omit<RevenueEvent, "id" | "created_at">;
