"use client";

import { useUniverseStore } from "@/store/universe";
import TopBar from "@/components/dashboard/TopBar";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import LiveFeed from "@/components/dashboard/LiveFeed";
import PlanetDetail from "@/components/planet/PlanetDetail";

const STATUS_COLORS: Record<string, "green" | "cyan" | "yellow" | "red" | "purple"> = {
  active: "green",
  testing: "cyan",
  building: "purple",
  discovered: "yellow",
  paused: "yellow",
  failed: "red",
};

export default function PlanetsPage() {
  const {
    planets,
    galaxies,
    selectedPlanetId,
    setSelectedPlanet,
    updatePlanet,
  } = useUniverseStore();

  const selectedPlanet = planets.find((p) => p.id === selectedPlanetId);
  const selectedGalaxy = selectedPlanet
    ? galaxies.find((g) => g.id === selectedPlanet.galaxy_id)
    : undefined;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-lg font-bold text-slate-200 mb-4 font-[Orbitron]">
            All Planets
          </h2>
          {planets.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              No planets yet. Run a scan to discover opportunities.
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3">
              {planets.map((planet) => {
                const galaxy = galaxies.find((g) => g.id === planet.galaxy_id);
                return (
                  <Card
                    key={planet.id}
                    className="p-4 cursor-pointer hover:border-slate-600 transition-colors"
                    onClick={() => setSelectedPlanet(planet.id)}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-2xl">{planet.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-slate-200 truncate">
                          {planet.name}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {galaxy && (
                            <span
                              className="text-[9px] font-mono"
                              style={{ color: galaxy.color }}
                            >
                              {galaxy.name}
                            </span>
                          )}
                          <Badge color={STATUS_COLORS[planet.status]}>
                            {planet.status}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-2">
                      <span className="font-mono text-green-400">
                        ${planet.revenue_total.toFixed(2)}
                      </span>
                      <span className="text-slate-500">
                        {planet.agents.length} agents
                      </span>
                      <span className="text-cyan-400 font-mono">
                        {planet.feasibility_score}/100
                      </span>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        <LiveFeed />
      </div>

      {selectedPlanet && (
        <PlanetDetail
          planet={selectedPlanet}
          galaxy={selectedGalaxy}
          onClose={() => setSelectedPlanet(null)}
          onToggleStatus={(id, status) => updatePlanet(id, { status })}
        />
      )}
    </div>
  );
}
