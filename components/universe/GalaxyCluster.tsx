"use client";

import type { Galaxy, Planet } from "@/lib/supabase/types";
import PlanetNode from "./PlanetNode";

interface GalaxyClusterProps {
  galaxy: Galaxy;
  planets: Planet[];
  position: { x: number; y: number };
  onPlanetClick: (planetId: string) => void;
}

export default function GalaxyCluster({
  galaxy,
  planets,
  position,
  onPlanetClick,
}: GalaxyClusterProps) {
  return (
    <div
      className="absolute"
      style={{
        left: `${position.x}%`,
        top: `${position.y}%`,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Galaxy core glow */}
      <div
        className="absolute -inset-16 rounded-full blur-3xl opacity-20"
        style={{ backgroundColor: galaxy.color }}
      />

      {/* Galaxy label */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 text-center whitespace-nowrap">
        <div className="text-xs font-bold tracking-wider uppercase" style={{ color: galaxy.color }}>
          {galaxy.name}
        </div>
        <div className="text-[10px] text-slate-500 font-mono">
          {galaxy.planet_count} planets &middot; ${galaxy.total_revenue.toFixed(0)}
        </div>
      </div>

      {/* Galaxy core */}
      <div
        className="w-6 h-6 rounded-full relative"
        style={{
          backgroundColor: galaxy.color,
          boxShadow: `0 0 30px ${galaxy.color}60, 0 0 60px ${galaxy.color}30`,
        }}
      />

      {/* Orbit ring */}
      <div
        className="absolute -inset-20 rounded-full border border-dashed opacity-10"
        style={{ borderColor: galaxy.color }}
      />

      {/* Planets in orbit */}
      <div className="absolute inset-0 flex items-center justify-center">
        {planets.map((planet, i) => {
          const angle = (i / Math.max(planets.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const radius = 60 + (i % 2) * 25;
          return (
            <PlanetNode
              key={planet.id}
              planet={planet}
              galaxyColor={galaxy.color}
              onClick={() => onPlanetClick(planet.id)}
              orbitRadius={radius}
              orbitAngle={angle}
            />
          );
        })}
      </div>
    </div>
  );
}
