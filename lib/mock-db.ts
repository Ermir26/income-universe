// In-memory data store for mock mode (no Supabase)
// Persists across API calls within the same server process

import type {
  Galaxy,
  Planet,
  Discovery,
  AgentLog,
  RevenueEvent,
  UniverseStats,
} from "./supabase/types";

interface MockDB {
  galaxies: Galaxy[];
  planets: Planet[];
  discoveries: Discovery[];
  agentLogs: AgentLog[];
  revenueEvents: RevenueEvent[];
  stats: UniverseStats;
}

let _db: MockDB | null = null;

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getDB(): MockDB {
  if (!_db) {
    _db = {
      galaxies: [],
      planets: [],
      discoveries: [],
      agentLogs: [],
      revenueEvents: [],
      stats: {
        id: "singleton",
        total_revenue: 0,
        revenue_today: 0,
        active_planets: 0,
        total_planets: 0,
        total_galaxies: 0,
        agents_running: 0,
        last_scan: null,
        scans_today: 0,
        planets_built_today: 0,
        updated_at: new Date().toISOString(),
      },
    };
  }
  return _db;
}

// ---- Galaxies ----

export function getGalaxies(): Galaxy[] {
  return getDB().galaxies;
}

export function findOrCreateGalaxyMock(
  name: string,
  category: string,
  color: string
): Galaxy {
  const db = getDB();
  const existing = db.galaxies.find((g) => g.category === category);
  if (existing) return existing;

  const galaxy: Galaxy = {
    id: makeId(),
    name,
    category,
    color,
    description: `Income streams in ${category}`,
    status: "active",
    total_revenue: 0,
    planet_count: 0,
    created_at: new Date().toISOString(),
  };
  db.galaxies.push(galaxy);
  db.stats.total_galaxies = db.galaxies.length;
  return galaxy;
}

// ---- Planets ----

export function getPlanets(): Planet[] {
  return getDB().planets;
}

export function addPlanetMock(planet: Omit<Planet, "id" | "created_at">): Planet {
  const db = getDB();
  const full: Planet = {
    ...planet,
    id: makeId(),
    created_at: new Date().toISOString(),
  };
  db.planets.push(full);

  // Update galaxy planet count
  const galaxy = db.galaxies.find((g) => g.id === planet.galaxy_id);
  if (galaxy) galaxy.planet_count++;

  // Update stats
  db.stats.total_planets = db.planets.length;
  db.stats.active_planets = db.planets.filter((p) => p.status === "active").length;
  db.stats.planets_built_today++;
  db.stats.updated_at = new Date().toISOString();

  return full;
}

export function updatePlanetStatus(id: string, status: Planet["status"]) {
  const db = getDB();
  const planet = db.planets.find((p) => p.id === id);
  if (planet) {
    planet.status = status;
    planet.last_active = new Date().toISOString();
    db.stats.active_planets = db.planets.filter((p) => p.status === "active").length;
  }
}

// ---- Discoveries ----

export function getDiscoveries(): Discovery[] {
  return getDB().discoveries;
}

export function addDiscoveryMock(
  d: Omit<Discovery, "id" | "created_at">
): Discovery {
  const db = getDB();
  const full: Discovery = {
    ...d,
    id: makeId(),
    created_at: new Date().toISOString(),
  };
  db.discoveries.push(full);
  return full;
}

export function updateDiscoveryMock(
  id: string,
  updates: Partial<Discovery>
) {
  const db = getDB();
  const idx = db.discoveries.findIndex((d) => d.id === id);
  if (idx >= 0) {
    db.discoveries[idx] = { ...db.discoveries[idx], ...updates };
  }
}

// ---- Agent Logs ----

export function getAgentLogs(planetId?: string): AgentLog[] {
  const db = getDB();
  if (planetId) return db.agentLogs.filter((l) => l.planet_id === planetId);
  return db.agentLogs;
}

export function addAgentLogMock(log: Omit<AgentLog, "id" | "created_at">): AgentLog {
  const db = getDB();
  const full: AgentLog = {
    ...log,
    id: makeId(),
    created_at: new Date().toISOString(),
  };
  db.agentLogs.push(full);

  // Update planet last_active
  const planet = db.planets.find((p) => p.id === log.planet_id);
  if (planet) planet.last_active = new Date().toISOString();

  return full;
}

// ---- Revenue ----

export function getRevenueEvents(planetId?: string): RevenueEvent[] {
  const db = getDB();
  if (planetId) return db.revenueEvents.filter((e) => e.planet_id === planetId);
  return db.revenueEvents;
}

export function addRevenueMock(
  planetId: string,
  amount: number,
  source: string,
  description: string
): RevenueEvent {
  const db = getDB();
  const planet = db.planets.find((p) => p.id === planetId);
  const galaxyId = planet?.galaxy_id || null;

  const event: RevenueEvent = {
    id: makeId(),
    planet_id: planetId,
    galaxy_id: galaxyId,
    amount,
    source,
    description,
    created_at: new Date().toISOString(),
  };
  db.revenueEvents.push(event);

  // Update planet revenue
  if (planet) {
    planet.revenue_total += amount;
    planet.revenue_today += amount;
    planet.revenue_week += amount;
  }

  // Update galaxy revenue
  const galaxy = db.galaxies.find((g) => g.id === galaxyId);
  if (galaxy) galaxy.total_revenue += amount;

  // Update stats
  db.stats.total_revenue += amount;
  db.stats.revenue_today += amount;
  db.stats.updated_at = new Date().toISOString();

  return event;
}

// ---- Stats ----

export function getStats(): UniverseStats {
  const db = getDB();
  db.stats.agents_running = db.planets
    .filter((p) => p.status === "active")
    .reduce((sum, p) => sum + p.agents.filter((a) => a.enabled).length, 0);
  return { ...db.stats };
}

export function updateScanStats() {
  const db = getDB();
  db.stats.scans_today++;
  db.stats.last_scan = new Date().toISOString();
  db.stats.updated_at = new Date().toISOString();
}

// ---- Seed Check ----

export function isSeeded(): boolean {
  return getDB().planets.length > 0;
}
