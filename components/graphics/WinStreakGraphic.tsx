"use client";

import React from "react";

type Result = "won" | "lost" | "push";

interface WinStreakGraphicProps {
  results: Result[];
}

const resultStyles: Record<Result, { bg: string; shadow: string }> = {
  won: { bg: "#22c55e", shadow: "0 0 8px 2px rgba(34,197,94,0.5)" },
  lost: { bg: "#ef4444", shadow: "0 0 8px 2px rgba(239,68,68,0.5)" },
  push: { bg: "#6b7280", shadow: "none" },
};

export default function WinStreakGraphic({ results }: WinStreakGraphicProps) {
  if (!results || results.length === 0) {
    return (
      <p className="text-white/40 text-sm font-mono">No results to display</p>
    );
  }

  return (
    <>
      <style>{`
        @keyframes streak-fade-in {
          from {
            opacity: 0;
            transform: scale(0.5);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .streak-dot {
          animation: streak-fade-in 0.3s ease-out both;
        }
      `}</style>
      <div className="flex flex-wrap gap-2">
        {results.map((result, i) => {
          const style = resultStyles[result];
          return (
            <div
              key={i}
              className="streak-dot rounded-full"
              style={{
                width: 20,
                height: 20,
                backgroundColor: style.bg,
                boxShadow: style.shadow,
                animationDelay: `${i * 100}ms`,
              }}
              title={result}
            />
          );
        })}
      </div>
    </>
  );
}
