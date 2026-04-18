-- Income Universe — Initial Schema
-- All 8 tables + indexes + RLS policies

-- Galaxies: category groupings for planets
CREATE TABLE galaxies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  color text NOT NULL DEFAULT '#38bdf8',
  description text,
  status text NOT NULL DEFAULT 'active',
  total_revenue numeric NOT NULL DEFAULT 0,
  planet_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Planets: individual income streams
CREATE TABLE planets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  galaxy_id uuid REFERENCES galaxies(id) ON DELETE SET NULL,
  name text NOT NULL,
  icon text DEFAULT '🪐',
  category text,
  status text NOT NULL DEFAULT 'discovered',
  feasibility_score int DEFAULT 0,
  monthly_target text,
  revenue_total numeric NOT NULL DEFAULT 0,
  revenue_today numeric NOT NULL DEFAULT 0,
  revenue_week numeric NOT NULL DEFAULT 0,
  agents jsonb NOT NULL DEFAULT '[]',
  config jsonb NOT NULL DEFAULT '{}',
  source_url text,
  market_signal text,
  description text,
  first_task text,
  created_at timestamptz NOT NULL DEFAULT now(),
  activated_at timestamptz,
  last_active timestamptz
);

CREATE INDEX idx_planets_galaxy ON planets(galaxy_id);
CREATE INDEX idx_planets_status ON planets(status);

-- Pipeline items: ideas moving through stages
CREATE TABLE pipeline_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  icon text,
  category text,
  description text,
  stage text NOT NULL DEFAULT 'discovered',
  feasibility jsonb,
  source text,
  market_signal text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pipeline_stage ON pipeline_items(stage);

-- Agent logs: activity log for planet agents
CREATE TABLE agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  action text NOT NULL,
  result text,
  revenue_generated numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_logs_planet ON agent_logs(planet_id);
CREATE INDEX idx_agent_logs_created ON agent_logs(created_at DESC);

-- Revenue events: individual revenue entries
CREATE TABLE revenue_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id uuid REFERENCES planets(id) ON DELETE SET NULL,
  galaxy_id uuid REFERENCES galaxies(id) ON DELETE SET NULL,
  amount numeric NOT NULL,
  source text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_revenue_planet ON revenue_events(planet_id);
CREATE INDEX idx_revenue_created ON revenue_events(created_at DESC);

-- Discoveries: raw ideas from scanner
CREATE TABLE discoveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  icon text,
  category text,
  description text,
  source text,
  market_signal text,
  feasibility_score int,
  feasibility_breakdown jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_discoveries_status ON discoveries(status);

-- Universe stats: singleton aggregate row
CREATE TABLE universe_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  total_revenue numeric NOT NULL DEFAULT 0,
  revenue_today numeric NOT NULL DEFAULT 0,
  active_planets int NOT NULL DEFAULT 0,
  total_planets int NOT NULL DEFAULT 0,
  total_galaxies int NOT NULL DEFAULT 0,
  agents_running int NOT NULL DEFAULT 0,
  last_scan timestamptz,
  scans_today int NOT NULL DEFAULT 0,
  planets_built_today int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert singleton stats row
INSERT INTO universe_stats (id) VALUES (gen_random_uuid());

-- Scan history: log of each scanner run
CREATE TABLE scan_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text,
  ideas_found int NOT NULL DEFAULT 0,
  ideas_passed int NOT NULL DEFAULT 0,
  ideas_failed int NOT NULL DEFAULT 0,
  planets_created int NOT NULL DEFAULT 0,
  duration_seconds int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable Realtime for key tables
ALTER PUBLICATION supabase_realtime ADD TABLE planets;
ALTER PUBLICATION supabase_realtime ADD TABLE agent_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE revenue_events;
ALTER PUBLICATION supabase_realtime ADD TABLE universe_stats;
ALTER PUBLICATION supabase_realtime ADD TABLE pipeline_items;
ALTER PUBLICATION supabase_realtime ADD TABLE discoveries;
