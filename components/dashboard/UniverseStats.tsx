"use client";

import { useUniverseStore } from "@/store/universe";
import Card from "@/components/ui/Card";

export default function UniverseStats() {
  const { stats } = useUniverseStore();
  if (!stats) return null;

  const statCards = [
    { label: "Total Revenue", value: `$${stats.total_revenue.toFixed(2)}`, color: "text-green-400" },
    { label: "Today", value: `$${stats.revenue_today.toFixed(2)}`, color: "text-cyan-400" },
    { label: "Active Planets", value: String(stats.active_planets), color: "text-purple-400" },
    { label: "Scans Today", value: String(stats.scans_today), color: "text-yellow-400" },
    { label: "Built Today", value: String(stats.planets_built_today), color: "text-orange-400" },
    { label: "Agents Running", value: String(stats.agents_running), color: "text-cyan-400" },
  ];

  return (
    <div className="grid grid-cols-6 gap-3 px-6 py-3">
      {statCards.map((stat) => (
        <Card key={stat.label} className="p-3">
          <div className="text-[10px] text-slate-500 uppercase tracking-wider">{stat.label}</div>
          <div className={`text-lg font-bold font-mono ${stat.color}`}>{stat.value}</div>
        </Card>
      ))}
    </div>
  );
}
