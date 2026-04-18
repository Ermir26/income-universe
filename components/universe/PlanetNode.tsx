"use client";

import type { Planet } from "@/lib/supabase/types";

interface PlanetNodeProps {
  planet: Planet;
  galaxyColor: string;
  onClick: () => void;
  orbitRadius: number;
  orbitAngle: number;
}

const STATUS_COLORS: Record<string, string> = {
  active: "#4ade80",
  testing: "#fbbf24",
  building: "#38bdf8",
  discovered: "#94a3b8",
  paused: "#64748b",
  failed: "#f87171",
};

export default function PlanetNode({
  planet,
  galaxyColor,
  onClick,
  orbitRadius,
  orbitAngle,
}: PlanetNodeProps) {
  const x = Math.cos(orbitAngle) * orbitRadius;
  const y = Math.sin(orbitAngle) * orbitRadius;
  const statusColor = STATUS_COLORS[planet.status] || "#94a3b8";
  const isActive = planet.status === "active";

  return (
    <div
      className="absolute cursor-pointer group transition-transform duration-300 hover:scale-125"
      style={{
        transform: `translate(${x}px, ${y}px)`,
      }}
      onClick={onClick}
    >
      {/* Glow ring */}
      <div
        className="absolute -inset-2 rounded-full opacity-30"
        style={{
          background: `radial-gradient(circle, ${galaxyColor}40, transparent 70%)`,
        }}
      />

      {/* Planet body */}
      <div
        className="relative w-10 h-10 rounded-full flex items-center justify-center text-lg border-2"
        style={{
          borderColor: statusColor,
          backgroundColor: `${galaxyColor}15`,
          boxShadow: isActive ? `0 0 12px ${statusColor}40` : undefined,
        }}
      >
        {planet.icon}
      </div>

      {/* Revenue float */}
      {planet.revenue_today > 0 && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-green-400 font-mono whitespace-nowrap">
          +${planet.revenue_today.toFixed(0)}
        </div>
      )}

      {/* Tooltip */}
      <div className="absolute left-1/2 -translate-x-1/2 top-14 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 whitespace-nowrap z-20 pointer-events-none">
        <div className="text-sm font-semibold text-slate-100">{planet.name}</div>
        <div className="text-xs text-slate-400">
          {planet.status} &middot; ${planet.revenue_total.toFixed(0)} total
        </div>
      </div>
    </div>
  );
}
