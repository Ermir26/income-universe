"use client";

import { useUniverseStore } from "@/store/universe";
import GalaxyCluster from "./GalaxyCluster";
import StarField from "./StarField";
import NebulaBackground from "./NebulaBackground";

// Pre-defined galaxy positions (spread across viewport)
const GALAXY_POSITIONS = [
  { x: 20, y: 25 },
  { x: 50, y: 15 },
  { x: 80, y: 30 },
  { x: 15, y: 60 },
  { x: 45, y: 55 },
  { x: 75, y: 65 },
  { x: 30, y: 80 },
  { x: 65, y: 85 },
];

export default function UniverseMap() {
  const { galaxies, planets, setSelectedPlanet } = useUniverseStore();

  return (
    <div className="relative w-full h-[calc(100vh-120px)] overflow-hidden">
      <StarField />
      <NebulaBackground />

      {/* Connection lines between galaxies */}
      <svg className="absolute inset-0 w-full h-full z-[1] pointer-events-none">
        {galaxies.map((g, i) => {
          const next = galaxies[(i + 1) % galaxies.length];
          if (!next || i === galaxies.length - 1) return null;
          const pos1 = GALAXY_POSITIONS[i % GALAXY_POSITIONS.length];
          const pos2 = GALAXY_POSITIONS[(i + 1) % GALAXY_POSITIONS.length];
          return (
            <line
              key={`line-${i}`}
              x1={`${pos1.x}%`}
              y1={`${pos1.y}%`}
              x2={`${pos2.x}%`}
              y2={`${pos2.y}%`}
              stroke="rgba(148, 163, 184, 0.06)"
              strokeWidth="1"
              strokeDasharray="4 8"
            />
          );
        })}
      </svg>

      {/* Galaxy clusters */}
      <div className="relative z-10 w-full h-full">
        {galaxies.map((galaxy, i) => {
          const galaxyPlanets = planets.filter((p) => p.galaxy_id === galaxy.id);
          const position = GALAXY_POSITIONS[i % GALAXY_POSITIONS.length];
          return (
            <GalaxyCluster
              key={galaxy.id}
              galaxy={galaxy}
              planets={galaxyPlanets}
              position={position}
              onPlanetClick={setSelectedPlanet}
            />
          );
        })}
      </div>

      {/* Empty state */}
      {galaxies.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center z-20">
          <div className="text-center">
            <div className="text-6xl mb-4">🌌</div>
            <h2 className="text-xl font-bold text-slate-300 font-[Orbitron]">
              Universe is empty
            </h2>
            <p className="text-sm text-slate-500 mt-2">
              Run a scan to discover income opportunities
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
