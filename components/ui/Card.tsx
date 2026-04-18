"use client";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  glow?: string; // glow color
}

export default function Card({ children, className = "", onClick, glow }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm p-4
        ${onClick ? "cursor-pointer hover:border-slate-600" : ""}
        ${className}`}
      style={glow ? { boxShadow: `0 0 20px ${glow}20, 0 0 40px ${glow}10` } : undefined}
    >
      {children}
    </div>
  );
}
