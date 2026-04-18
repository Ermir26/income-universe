"use client";

import { usePipelineStore } from "@/store/pipeline";
import PipelineStage from "./PipelineStage";
import DiscoveryCard from "./DiscoveryCard";
import Card from "@/components/ui/Card";

const STAGES = [
  { key: "discovered", name: "Scan", icon: "🔭", color: "yellow" },
  { key: "testing", name: "Test", icon: "🧪", color: "cyan" },
  { key: "building", name: "Build", icon: "🔨", color: "purple" },
  { key: "deploying", name: "Deploy", icon: "🚀", color: "orange" },
  { key: "deployed", name: "Live", icon: "🌍", color: "green" },
] as const;

export default function PipelineView() {
  const { items, discoveries, currentStage } = usePipelineStore();

  const stageCounts = STAGES.map((s) => ({
    ...s,
    count: items.filter((i) => i.stage === s.key).length,
  }));

  return (
    <div className="p-6 space-y-6">
      {/* Stage indicators */}
      <div className="flex items-center gap-2">
        {stageCounts.map((stage, i) => (
          <div key={stage.key} className="flex items-center gap-2 flex-1">
            <PipelineStage
              name={stage.name}
              icon={stage.icon}
              count={stage.count}
              isActive={currentStage === stage.key}
              color={stage.color}
            />
            {i < stageCounts.length - 1 && (
              <div className="flex-1 h-px bg-slate-800" />
            )}
          </div>
        ))}
      </div>

      {/* Active pipeline items */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Pipeline Items ({items.length})
        </h3>
        {items.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            No items in pipeline. Run a scan to discover opportunities.
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const stage = STAGES.find((s) => s.key === item.stage);
              return (
                <div
                  key={item.id}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50"
                >
                  <span className="text-lg">{item.icon || stage?.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">
                      {item.name}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {item.category} &middot; {item.stage}
                    </div>
                  </div>
                  {item.feasibility && (
                    <div className="text-xs font-mono text-cyan-400">
                      {Object.values(item.feasibility).reduce((a, b) => a + b, 0)}/100
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Recent discoveries */}
      <Card className="p-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
          Recent Discoveries ({discoveries.length})
        </h3>
        {discoveries.length === 0 ? (
          <div className="text-center py-8 text-slate-600 text-sm">
            No discoveries yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {discoveries.slice(0, 6).map((discovery) => (
              <DiscoveryCard key={discovery.id} discovery={discovery} />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
