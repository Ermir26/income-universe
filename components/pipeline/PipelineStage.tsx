"use client";

interface PipelineStageProps {
  name: string;
  icon: string;
  count: number;
  isActive: boolean;
  color: string;
}

export default function PipelineStage({
  name,
  icon,
  count,
  isActive,
  color,
}: PipelineStageProps) {
  return (
    <div
      className={`flex flex-col items-center gap-1 px-4 py-3 rounded-lg border transition-all ${
        isActive
          ? `border-${color}-500/30 bg-${color}-500/10`
          : "border-slate-800 bg-slate-900/40"
      }`}
    >
      <span className="text-xl">{icon}</span>
      <span
        className={`text-[10px] font-bold uppercase tracking-wider ${
          isActive ? `text-${color}-400` : "text-slate-500"
        }`}
      >
        {name}
      </span>
      <span
        className={`text-lg font-bold font-mono ${
          isActive ? `text-${color}-400` : "text-slate-600"
        }`}
      >
        {count}
      </span>
      {isActive && (
        <div className={`w-2 h-2 rounded-full bg-${color}-400 animate-pulse`} />
      )}
    </div>
  );
}
