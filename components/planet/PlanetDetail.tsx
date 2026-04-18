"use client";

import type { Planet, Galaxy } from "@/lib/supabase/types";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import AgentList from "./AgentList";
import RevenueHistory from "./RevenueHistory";
import FeasibilityReport from "@/components/pipeline/FeasibilityReport";

interface PlanetDetailProps {
  planet: Planet;
  galaxy?: Galaxy;
  onClose: () => void;
  onToggleStatus: (planetId: string, status: Planet["status"]) => void;
}

const STATUS_COLORS: Record<string, "green" | "cyan" | "yellow" | "red" | "purple"> = {
  active: "green",
  testing: "cyan",
  building: "purple",
  discovered: "yellow",
  paused: "yellow",
  failed: "red",
};

export default function PlanetDetail({
  planet,
  galaxy,
  onClose,
  onToggleStatus,
}: PlanetDetailProps) {
  const isPaused = planet.status === "paused";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-8">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{planet.icon}</span>
              <div>
                <h2 className="text-lg font-bold text-slate-100">{planet.name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {galaxy && (
                    <span className="text-[10px] font-mono" style={{ color: galaxy.color }}>
                      {galaxy.name}
                    </span>
                  )}
                  <Badge color={STATUS_COLORS[planet.status]}>
                    {planet.status}
                  </Badge>
                  <span className="text-[10px] text-slate-500">
                    Score: {planet.feasibility_score}/100
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 text-xl"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 p-6 border-b border-slate-800">
          <Card className="p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase">Total Revenue</div>
            <div className="text-lg font-bold font-mono text-green-400">
              ${planet.revenue_total.toFixed(2)}
            </div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase">Today</div>
            <div className="text-lg font-bold font-mono text-cyan-400">
              ${planet.revenue_today.toFixed(2)}
            </div>
          </Card>
          <Card className="p-3 text-center">
            <div className="text-[10px] text-slate-500 uppercase">This Week</div>
            <div className="text-lg font-bold font-mono text-purple-400">
              ${planet.revenue_week.toFixed(2)}
            </div>
          </Card>
        </div>

        {/* Description & signals */}
        <div className="p-6 border-b border-slate-800 space-y-3">
          {planet.description && (
            <p className="text-sm text-slate-300">{planet.description}</p>
          )}
          {planet.market_signal && (
            <div className="text-xs text-cyan-400/80 italic">
              Market signal: {planet.market_signal}
            </div>
          )}
          {planet.first_task && (
            <div className="text-xs text-yellow-400/80">
              First task: {planet.first_task}
            </div>
          )}
          {planet.monthly_target && (
            <div className="text-xs text-slate-400">
              Monthly target: {planet.monthly_target}
            </div>
          )}
        </div>

        {/* Agents */}
        <div className="p-6 border-b border-slate-800">
          <AgentList agents={planet.agents} planetId={planet.id} />
        </div>

        {/* Revenue chart */}
        <div className="p-6 border-b border-slate-800">
          <RevenueHistory planetId={planet.id} />
        </div>

        {/* Actions */}
        <div className="p-6 flex items-center gap-3">
          <Button
            variant={isPaused ? "primary" : "secondary"}
            size="sm"
            onClick={() =>
              onToggleStatus(planet.id, isPaused ? "active" : "paused")
            }
          >
            {isPaused ? "Resume Planet" : "Pause Planet"}
          </Button>
          {planet.status === "failed" && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => onToggleStatus(planet.id, "testing")}
            >
              Retry
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
