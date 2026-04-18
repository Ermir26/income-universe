"use client";

import React from "react";
import {
  SoccerIcon,
  BasketballIcon,
  HockeyIcon,
  BaseballIcon,
  TennisIcon,
  MMAIcon,
  TrophyIcon,
} from "./SportIcons";

interface SportStat {
  sport: string;
  wins: number;
  losses?: number;
  picks: number;
  winRate: number;
}

interface SportHeroCardsProps {
  sports: SportStat[];
}

const sportAccentColors: Record<string, string> = {
  soccer: "#06b6d4",
  football: "#06b6d4",
  nfl: "#06b6d4",
  basketball: "#f97316",
  nba: "#f97316",
  hockey: "#06b6d4",
  nhl: "#06b6d4",
  baseball: "#dc2626",
  mlb: "#dc2626",
  tennis: "#84cc16",
  mma: "#8b5cf6",
  ufc: "#8b5cf6",
};

function getSportIcon(sport: string): React.ComponentType<{ size?: number }> {
  const key = sport.toLowerCase();
  if (key === "soccer" || key === "football") return SoccerIcon;
  if (key === "basketball" || key === "nba") return BasketballIcon;
  if (key === "hockey" || key === "nhl") return HockeyIcon;
  if (key === "baseball" || key === "mlb") return BaseballIcon;
  if (key === "tennis") return TennisIcon;
  if (key === "mma" || key === "ufc") return MMAIcon;
  if (key === "nfl") return SoccerIcon; // football
  return TrophyIcon;
}

function getAccentColor(sport: string): string {
  const key = sport.toLowerCase();
  return sportAccentColors[key] ?? "#3b82f6";
}

export default function SportHeroCards({ sports }: SportHeroCardsProps) {
  return (
    <div className="space-y-3">
      {sports.map((stat) => {
        const Icon = getSportIcon(stat.sport);
        const accent = getAccentColor(stat.sport);
        const losses = stat.losses ?? (stat.picks - stat.wins);

        return (
          <div
            key={stat.sport}
            className="relative rounded-xl overflow-hidden
              bg-white/[0.02] border border-white/[0.06]
              transition-all duration-300 ease-out
              hover:border-white/[0.15]
              flex items-center gap-3 p-3"
            style={{
              background: `linear-gradient(135deg, #0a0a0f 0%, ${accent}12 100%)`,
            }}
          >
            <div className="flex-shrink-0">
              <Icon size={36} />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-white font-semibold text-sm">
                {stat.sport}
              </h3>
              <p className="text-white/50 text-xs font-mono">
                {stat.wins}W-{losses}L
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <span className="text-sm font-bold text-emerald-400">{stat.winRate.toFixed(1)}%</span>
              <p className="text-[10px] text-slate-500">{stat.picks} picks</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
