"use client";

import type { FeasibilityBreakdown } from "@/lib/supabase/types";

interface FeasibilityReportProps {
  breakdown: FeasibilityBreakdown;
  compact?: boolean;
}

const DIMENSIONS = [
  { key: "marketDemand" as const, label: "Market", icon: "📈", color: "text-green-400" },
  { key: "automationPotential" as const, label: "Auto", icon: "🤖", color: "text-cyan-400" },
  { key: "timeToRevenue" as const, label: "Speed", icon: "⚡", color: "text-yellow-400" },
  { key: "startupCost" as const, label: "Cost", icon: "💰", color: "text-purple-400" },
];

export default function FeasibilityReport({
  breakdown,
  compact = false,
}: FeasibilityReportProps) {
  const total = Object.values(breakdown).reduce((a, b) => a + b, 0);
  const passed = total >= 62;

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {DIMENSIONS.map((dim) => (
          <div key={dim.key} className="flex items-center gap-0.5" title={dim.label}>
            <span className="text-[9px]">{dim.icon}</span>
            <span className={`text-[10px] font-mono ${dim.color}`}>
              {breakdown[dim.key]}
            </span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
          Feasibility Analysis
        </span>
        <span
          className={`text-sm font-bold font-mono ${
            passed ? "text-green-400" : "text-red-400"
          }`}
        >
          {total}/100 {passed ? "PASS" : "FAIL"}
        </span>
      </div>

      {DIMENSIONS.map((dim) => (
        <div key={dim.key} className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {dim.icon} {dim.label}
            </span>
            <span className={`text-xs font-mono ${dim.color}`}>
              {breakdown[dim.key]}/25
            </span>
          </div>
          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${(breakdown[dim.key] / 25) * 100}%`,
                backgroundColor:
                  breakdown[dim.key] >= 18
                    ? "#22c55e"
                    : breakdown[dim.key] >= 12
                    ? "#eab308"
                    : "#ef4444",
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
