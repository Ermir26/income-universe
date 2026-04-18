"use client";

import type { AgentConfig } from "@/lib/supabase/types";

interface AgentListProps {
  agents: AgentConfig[];
  planetId: string;
}

const TYPE_ICONS: Record<string, string> = {
  tipster: "💡",
  researcher: "🔬",
  executor: "⚡",
  content: "✍️",
  outreach: "📧",
  social: "📱",
  sales: "💰",
  analytics: "📊",
  scraper: "🕷️",
  monitor: "👁️",
};

export default function AgentList({ agents }: AgentListProps) {
  return (
    <div>
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">
        Agents ({agents.length})
      </h3>
      {agents.length === 0 ? (
        <div className="text-sm text-slate-600 text-center py-4">
          No agents configured
        </div>
      ) : (
        <div className="space-y-2">
          {agents.map((agent) => (
            <div
              key={agent.name}
              className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/50 border border-slate-700/50"
            >
              <span className="text-lg">
                {TYPE_ICONS[agent.type] || "🤖"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-200">
                  {agent.name}
                </div>
                <div className="text-[10px] text-slate-500 font-mono">
                  {agent.type} &middot; {agent.schedule}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {agent.lastRun && (
                  <span className="text-[10px] text-slate-600">
                    {new Date(agent.lastRun).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
                <div
                  className={`w-2 h-2 rounded-full ${
                    agent.enabled
                      ? "bg-green-400 shadow-[0_0_6px_rgba(34,197,94,0.5)]"
                      : "bg-slate-600"
                  }`}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
