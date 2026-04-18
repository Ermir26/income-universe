export default function StatCard({
  label,
  value,
  icon,
  trend,
  glow,
}: {
  label: string;
  value: string;
  icon: string;
  trend?: { direction: "up" | "down"; value: string };
  glow?: "emerald" | "indigo" | "orange" | "cyan";
}) {
  const glowShadow = glow === "emerald" ? "hover:shadow-emerald-500/10"
    : glow === "indigo" ? "hover:shadow-indigo-500/10"
    : glow === "orange" ? "hover:shadow-orange-500/10"
    : glow === "cyan" ? "hover:shadow-cyan-500/10"
    : "";

  return (
    <div className={`group relative p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-300 hover:shadow-xl ${glowShadow}`}>
      <div className="absolute inset-0 rounded-2xl animate-shimmer pointer-events-none" />
      <div className="relative">
        <div className="text-2xl mb-2">{icon}</div>
        <div className="text-2xl sm:text-3xl font-black text-white">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-slate-500 font-medium uppercase tracking-wider">{label}</span>
          {trend && (
            <span className={`text-xs font-bold ${trend.direction === "up" ? "text-emerald-400" : "text-red-400"}`}>
              {trend.direction === "up" ? "\u2191" : "\u2193"} {trend.value}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
