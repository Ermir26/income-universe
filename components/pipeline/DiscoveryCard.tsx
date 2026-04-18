"use client";

import type { Discovery } from "@/lib/supabase/types";
import Card from "@/components/ui/Card";
import FeasibilityReport from "./FeasibilityReport";

interface DiscoveryCardProps {
  discovery: Discovery;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "text-yellow-400",
  passed: "text-green-400",
  rejected: "text-red-400",
};

export default function DiscoveryCard({ discovery }: DiscoveryCardProps) {
  return (
    <Card className="p-3 hover:border-slate-600 transition-colors">
      <div className="flex items-start gap-2 mb-2">
        <span className="text-lg">{discovery.icon || "💡"}</span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-slate-200 truncate">
            {discovery.name}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[10px] text-slate-500">{discovery.category}</span>
            <span className={`text-[10px] font-bold uppercase ${STATUS_COLORS[discovery.status]}`}>
              {discovery.status}
            </span>
          </div>
        </div>
      </div>

      {discovery.description && (
        <p className="text-[11px] text-slate-400 line-clamp-2 mb-2">
          {discovery.description}
        </p>
      )}

      {discovery.market_signal && (
        <div className="text-[10px] text-cyan-400/80 italic mb-2 truncate">
          Signal: {discovery.market_signal}
        </div>
      )}

      {discovery.feasibility_breakdown && (
        <FeasibilityReport breakdown={discovery.feasibility_breakdown} compact />
      )}

      {discovery.feasibility_score !== null && (
        <div className="mt-2 flex items-center gap-2">
          <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${
                discovery.feasibility_score >= 62 ? "bg-green-500" : "bg-red-500"
              }`}
              style={{ width: `${discovery.feasibility_score}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {discovery.feasibility_score}/100
          </span>
        </div>
      )}
    </Card>
  );
}
