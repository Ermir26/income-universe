"use client";

import { useEffect, useState, useCallback } from "react";

// ─── Types ───

interface Pick {
  id: string;
  sport: string;
  sport_key: string;
  league: string;
  game: string;
  pick: string;
  odds: string;
  confidence: number;
  result: string;
  status: string;
  actual_result: string | null;
  game_time: string | null;
  sent_at: string;
  tier: string;
  stake: number;
  category: string;
  bookmaker: string;
  event_id: string | null;
}

interface DashboardInterlocks {
  graded_picks: number;
  graded_ok: boolean;
  chain_coverage: number;
  chain_ok: boolean;
  last_30_win_rate: number;
  last_30_ok: boolean;
  reveal_ready: boolean;
}

interface DashboardData {
  picks: Pick[];
  stats: {
    weekTotal: number;
    weekWins: number;
    weekLosses: number;
    weekPushes: number;
    winRate: number;
    totalSettled: number;
    units: number;
    streakCount: number;
    streakType: string;
  };
  bySport: Array<{
    sport: string;
    picks: number;
    wins: number;
    losses: number;
    pushes: number;
    winRate: number;
  }>;
  interlocks?: DashboardInterlocks;
  survival: {
    costs: number;
    subscribers: number;
    revenue: number;
    waitlist: number;
    status: string;
    totalSettled: number;
  };
}

// ─── Pick Status Logic ───

type PickStatus = "WON" | "LOST" | "PUSH" | "LIVE" | "UPCOMING" | "AWAITING" | "VOID";

function getPickStatus(pick: Pick): PickStatus {
  if (pick.result === "void") return "VOID";
  if (pick.result === "won") return "WON";
  if (pick.result === "lost") return "LOST";
  if (pick.result === "push") return "PUSH";

  // Pending — determine if live, upcoming, or awaiting
  const now = Date.now();
  const gameTime = pick.game_time ? new Date(pick.game_time).getTime() : null;

  if (!gameTime || gameTime > now) return "UPCOMING";
  const hoursSinceStart = (now - gameTime) / (1000 * 60 * 60);
  if (hoursSinceStart < 4) return "LIVE";
  return "AWAITING";
}

const STATUS_CONFIG: Record<PickStatus, { label: string; bg: string; text: string; border: string; pulse?: boolean }> = {
  WON:      { label: "WON",      bg: "bg-green-500/20",  text: "text-green-400",  border: "border-l-green-500" },
  LOST:     { label: "LOST",     bg: "bg-red-500/20",    text: "text-red-400",    border: "border-l-red-500" },
  PUSH:     { label: "PUSH",     bg: "bg-yellow-500/20", text: "text-yellow-400", border: "border-l-yellow-500" },
  LIVE:     { label: "LIVE",     bg: "bg-purple-500/20", text: "text-purple-400", border: "border-l-purple-500", pulse: true },
  UPCOMING: { label: "UPCOMING", bg: "bg-blue-500/20",   text: "text-blue-400",   border: "border-l-blue-500" },
  AWAITING: { label: "AWAITING", bg: "bg-orange-500/20", text: "text-orange-400", border: "border-l-orange-500" },
  VOID:     { label: "VOID",     bg: "bg-gray-500/20",   text: "text-gray-500",   border: "border-l-gray-600" },
};

// ─── Filter Tabs ───

type FilterTab = "all" | "settled" | "live" | "upcoming" | "void";

function filterPicks(picks: Pick[], tab: FilterTab): Pick[] {
  switch (tab) {
    case "settled": return picks.filter((p) => ["won", "lost", "push"].includes(p.result));
    case "live": return picks.filter((p) => getPickStatus(p) === "LIVE");
    case "upcoming": return picks.filter((p) => getPickStatus(p) === "UPCOMING");
    case "void": return picks.filter((p) => p.result === "void");
    default: return picks;
  }
}

function sortPicks(picks: Pick[]): Pick[] {
  const order: Record<PickStatus, number> = { LIVE: 0, UPCOMING: 1, AWAITING: 2, WON: 3, LOST: 3, PUSH: 3, VOID: 4 };
  return [...picks].sort((a, b) => {
    const statusA = getPickStatus(a);
    const statusB = getPickStatus(b);
    const orderDiff = order[statusA] - order[statusB];
    if (orderDiff !== 0) return orderDiff;
    // Within same status group, sort by game_time or sent_at
    const timeA = new Date(a.game_time || a.sent_at).getTime();
    const timeB = new Date(b.game_time || b.sent_at).getTime();
    if (statusA === "UPCOMING") return timeA - timeB; // soonest first
    return timeB - timeA; // most recent first
  });
}

// ─── Sport Emoji ───

const SPORT_EMOJI: Record<string, string> = {
  soccer_epl: "⚽", soccer_spain_la_liga: "⚽", soccer_italy_serie_a: "⚽",
  soccer_germany_bundesliga: "⚽", soccer_france_ligue_one: "⚽",
  soccer_uefa_champs_league: "⚽", soccer_usa_mls: "⚽",
  basketball_nba: "🏀", basketball_euroleague: "🏀",
  icehockey_nhl: "🏒", americanfootball_nfl: "🏈", baseball_mlb: "⚾",
  tennis_atp_monte_carlo_masters: "🎾", mma_mixed_martial_arts: "🥊",
};

// ─── Dashboard Page ───

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  const fetchData = useCallback(() => {
    fetch("/api/dashboard/overview")
      .then((res) => res.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else { setData(d); setError(null); }
        setLastUpdated(new Date());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a1a" }}>
        <div className="text-xl text-gray-400">Loading dashboard...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#0a0a1a" }}>
        <div className="text-red-400">Error: {error || "Failed to load"}</div>
      </div>
    );
  }

  const { stats, picks, bySport, survival, interlocks } = data;
  const filtered = sortPicks(filterPicks(picks, activeTab));
  const winRateColor = stats.winRate > 55 ? "text-green-400" : stats.winRate < 50 ? "text-red-400" : "text-yellow-400";

  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: picks.length },
    { key: "settled", label: "Settled", count: picks.filter((p) => ["won", "lost", "push"].includes(p.result)).length },
    { key: "live", label: "In Play", count: picks.filter((p) => getPickStatus(p) === "LIVE").length },
    { key: "upcoming", label: "Upcoming", count: picks.filter((p) => getPickStatus(p) === "UPCOMING").length },
    { key: "void", label: "Void", count: picks.filter((p) => p.result === "void").length },
  ];

  return (
    <div className="min-h-screen text-white" style={{ background: "#0a0a1a" }}>
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            <span style={{ color: "#00d4ff" }}>🦈</span> Sharkline — Command Center
          </h1>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-gray-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={fetchData}
              className="px-3 py-1.5 text-xs rounded-lg border border-gray-700 hover:border-gray-500 text-gray-400 hover:text-white transition-colors"
            >
              ↻ Refresh
            </button>
          </div>
        </div>

        {/* Top Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="This Week" value={`${stats.weekTotal} picks`} />
          <StatCard
            label="Record"
            value={`${stats.weekWins}W-${stats.weekLosses}L-${stats.weekPushes}P`}
          />
          <StatCard
            label="Win Rate"
            value={`${stats.winRate}%`}
            valueColor={winRateColor}
          />
          <StatCard
            label="Units"
            value={`${stats.units >= 0 ? "+" : ""}${stats.units}u`}
            valueColor={stats.units >= 0 ? "text-green-400" : "text-red-400"}
          />
          <StatCard
            label="50-Pick Threshold"
            value={`${stats.totalSettled}/50`}
            sub={stats.totalSettled >= 50 ? "Ready to launch" : `${50 - stats.totalSettled} more needed`}
          />
        </div>

        {/* Dashboard Reveal Interlocks */}
        {interlocks && !interlocks.reveal_ready && (
          <div className="rounded-xl border border-yellow-600/50 p-4 space-y-2" style={{ background: "rgba(234,179,8,0.08)" }}>
            <h3 className="text-sm font-semibold text-yellow-400">Public Dashboard Locked</h3>
            <p className="text-xs text-gray-400">All interlocks must pass before /public reveals:</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
              <div className={interlocks.graded_ok ? "text-green-400" : "text-red-400"}>
                {interlocks.graded_ok ? "PASS" : "FAIL"} Graded picks: {interlocks.graded_picks}/50
              </div>
              <div className={interlocks.chain_ok ? "text-green-400" : "text-red-400"}>
                {interlocks.chain_ok ? "PASS" : "FAIL"} Blockchain coverage: {interlocks.chain_coverage}% (need 80%)
              </div>
              <div className={interlocks.last_30_ok ? "text-green-400" : "text-red-400"}>
                {interlocks.last_30_ok ? "PASS" : "FAIL"} Last 30 win rate: {interlocks.last_30_win_rate}% (need 52%)
              </div>
            </div>
          </div>
        )}
        {interlocks?.reveal_ready && (
          <div className="rounded-xl border border-green-600/50 p-4" style={{ background: "rgba(34,197,94,0.08)" }}>
            <span className="text-sm font-semibold text-green-400">Public dashboard is LIVE</span>
            <span className="text-xs text-gray-400 ml-2">All interlocks passed</span>
          </div>
        )}

        {/* Weekly Predictions — Main Feature */}
        <div className="rounded-xl border border-gray-800 overflow-hidden" style={{ background: "#12122a" }}>
          <div className="p-4 border-b border-gray-800">
            <h2 className="text-lg font-semibold mb-3">Weekly Predictions</h2>
            <div className="flex gap-2 flex-wrap">
              {tabs.map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
                    activeTab === tab.key
                      ? "text-white border"
                      : "text-gray-500 border border-transparent hover:text-gray-300"
                  }`}
                  style={activeTab === tab.key ? { borderColor: "#00d4ff", background: "rgba(0,212,255,0.1)" } : {}}
                >
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No picks in this category</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs uppercase tracking-wider border-b border-gray-800">
                    <th className="text-left py-3 px-4">Sport</th>
                    <th className="text-left py-3 px-2">Game</th>
                    <th className="text-left py-3 px-2">Pick</th>
                    <th className="text-right py-3 px-2">Odds</th>
                    <th className="text-right py-3 px-2">Conf</th>
                    <th className="text-center py-3 px-2">Status</th>
                    <th className="text-left py-3 px-2">Result / Score</th>
                    <th className="text-right py-3 px-4">Game Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((pick) => {
                    const status = getPickStatus(pick);
                    const cfg = STATUS_CONFIG[status];
                    const emoji = SPORT_EMOJI[pick.sport_key] || "🏅";
                    const gameTime = pick.game_time
                      ? new Date(pick.game_time).toLocaleString("en-US", {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
                        })
                      : "—";

                    return (
                      <tr
                        key={pick.id}
                        className={`border-b border-gray-800/50 hover:bg-white/[0.02] border-l-4 ${cfg.border}`}
                      >
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="mr-1">{emoji}</span>
                          <span className="text-gray-300">{pick.league || pick.sport}</span>
                        </td>
                        <td className="py-3 px-2 text-gray-200 max-w-[200px] truncate">{pick.game}</td>
                        <td className="py-3 px-2 font-medium text-white whitespace-nowrap">{pick.pick}</td>
                        <td className="py-3 px-2 text-right text-gray-300 font-mono text-xs">{pick.odds}</td>
                        <td className="py-3 px-2 text-right">
                          <span className={`font-mono text-xs ${
                            pick.confidence >= 85 ? "text-purple-400" :
                            pick.confidence >= 75 ? "text-orange-400" :
                            "text-gray-400"
                          }`}>
                            {pick.confidence}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-center">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                            {cfg.pulse && <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />}
                            {cfg.label}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-gray-400 text-xs max-w-[200px] truncate">
                          {status === "VOID" && pick.actual_result
                            ? pick.actual_result
                            : pick.actual_result || "—"}
                        </td>
                        <td className="py-3 px-4 text-right text-gray-500 text-xs whitespace-nowrap">{gameTime}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Record by Sport — with Win % Progress Bars */}
        <div className="rounded-xl border border-gray-800 p-4" style={{ background: "#12122a" }}>
          <h2 className="text-lg font-semibold mb-3">Record by Sport</h2>
          {bySport.length === 0 ? (
            <div className="text-gray-500 text-sm">No settled picks yet</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...bySport].sort((a, b) => b.winRate - a.winRate).map((s) => {
                const barColor = s.winRate >= 60 ? "#22c55e" : s.winRate >= 50 ? "#eab308" : "#ef4444";
                const emoji = SPORT_EMOJI[
                  Object.keys(SPORT_EMOJI).find((k) =>
                    s.sport.toLowerCase().includes(SPORT_EMOJI[k] === "⚽" ? "league" : s.sport.toLowerCase())
                  ) || ""
                ] || "🏅";
                return (
                  <div key={s.sport} className="rounded-lg border border-gray-800 p-4" style={{ background: "#0d0d22" }}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-sm font-medium text-gray-200">{s.sport}</div>
                      <span
                        className="text-lg font-bold"
                        style={{ color: barColor }}
                      >
                        {s.winRate}%
                      </span>
                    </div>
                    {/* Win rate progress bar */}
                    <div className="w-full h-2 rounded-full bg-gray-800 mb-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(s.winRate, 100)}%`,
                          background: `linear-gradient(90deg, ${barColor}88, ${barColor})`,
                        }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-white">
                        {s.wins}W-{s.losses}L
                        {s.pushes > 0 && <span className="text-gray-500">-{s.pushes}P</span>}
                      </span>
                      <span className="text-xs text-gray-500">{s.picks} picks</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Survival Indicator */}
        <div className="rounded-xl border border-gray-800 p-4" style={{ background: "#12122a" }}>
          <h2 className="text-lg font-semibold mb-3">Survival Indicator</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase">Monthly Costs</div>
              <div className="text-lg font-bold text-red-400">${survival.costs}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Subscribers</div>
              <div className="text-lg font-bold">{survival.subscribers}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Revenue</div>
              <div className="text-lg font-bold">${survival.revenue}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Waitlist</div>
              <div className="text-lg font-bold" style={{ color: "#00d4ff" }}>{survival.waitlist}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">Status</div>
              <div className={`text-lg font-bold ${
                survival.status === "READY TO LAUNCH" ? "text-green-400" :
                survival.status === "NEEDS IMPROVEMENT" ? "text-red-400" :
                "text-yellow-400"
              }`}>
                {survival.status}
              </div>
              <div className="text-xs text-gray-600 mt-0.5">
                {survival.totalSettled}/50 settled
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-gray-600 text-xs py-4">
          🦈 Sharkline — Private Dashboard
        </div>
      </div>
    </div>
  );
}

// ─── Components ───

function StatCard({ label, value, sub, valueColor }: {
  label: string; value: string; sub?: string; valueColor?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-800 p-4" style={{ background: "#12122a" }}>
      <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-xl md:text-2xl font-bold mt-1 ${valueColor || "text-white"}`}>{value}</div>
      {sub && <div className="text-xs text-gray-600 mt-1">{sub}</div>}
    </div>
  );
}
