"use client";

import { useUniverseStore } from "@/store/universe";
import TopBar from "@/components/dashboard/TopBar";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import LiveFeed from "@/components/dashboard/LiveFeed";

export default function GalaxiesPage() {
  const { galaxies, planets } = useUniverseStore();

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          <h2 className="text-lg font-bold text-slate-200 mb-4 font-[Orbitron]">
            All Galaxies
          </h2>
          {galaxies.length === 0 ? (
            <div className="text-center py-16 text-slate-600">
              No galaxies yet. Run a scan to discover opportunities.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {galaxies.map((galaxy) => {
                const galaxyPlanets = planets.filter(
                  (p) => p.galaxy_id === galaxy.id
                );
                return (
                  <Card key={galaxy.id} className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div
                        className="w-4 h-4 rounded-full"
                        style={{
                          backgroundColor: galaxy.color,
                          boxShadow: `0 0 12px ${galaxy.color}60`,
                        }}
                      />
                      <h3 className="text-sm font-bold" style={{ color: galaxy.color }}>
                        {galaxy.name}
                      </h3>
                      <Badge color={galaxy.status === "active" ? "green" : "yellow"}>
                        {galaxy.status}
                      </Badge>
                    </div>
                    {galaxy.description && (
                      <p className="text-xs text-slate-400 mb-3">
                        {galaxy.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-slate-500">
                      <span className="font-mono text-green-400">
                        ${galaxy.total_revenue.toFixed(2)}
                      </span>
                      <span>{galaxy.planet_count} planets</span>
                    </div>
                    {galaxyPlanets.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {galaxyPlanets.map((p) => (
                          <span
                            key={p.id}
                            className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400"
                          >
                            {p.icon} {p.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        <LiveFeed />
      </div>
    </div>
  );
}
