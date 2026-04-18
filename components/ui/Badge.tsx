"use client";

interface BadgeProps {
  children: React.ReactNode;
  color?: "cyan" | "green" | "yellow" | "red" | "purple" | "gray";
  pulse?: boolean;
}

const colors = {
  cyan: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  red: "bg-red-500/20 text-red-400 border-red-500/30",
  purple: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  gray: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

export default function Badge({ children, color = "cyan", pulse }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors[color]}`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-current opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
