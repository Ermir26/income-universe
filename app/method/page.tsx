"use client";

import { useEffect, useState, useMemo } from "react";
import NavBar from "@/components/landing/NavBar";
import AnimatedBackground from "@/components/landing/AnimatedBackground";
import { XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";

const TELEGRAM_FREE = "https://t.me/SharklineFree";

/* ─── Types ─── */

interface PickDetail {
  id: string;
  sport: string;
  game: string;
  pick: string;
  odds: string;
  bookmaker: string;
  tier: string;
  stake: number;
  confidence: number;
  result: string;
  profit: number;
  sent_at: string;
  game_time: string | null;
}

interface MonthData {
  month: string;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  openingBalance: number;
  closingBalance: number;
  roi: number;
  pickDetails: PickDetail[];
}

interface Stats {
  totalPicks: number;
  wins: number;
  losses: number;
  winRate: number;
  units: number;
  bankroll: number;
}

interface TodayPick {
  id: string;
  sport: string;
  game: string;
  pick: string;
  odds: string;
  tier: string;
  stake: number;
  result: string | null;
  profit: number | null;
  sent_at: string;
}

interface SportStatus {
  sport: string;
  status: "active" | "caution" | "paused";
  streak: number;
  streakType: "win" | "loss" | "none";
  recentWinRate: number;
  stakeMod: number;
  totalPicks: number;
}

interface ExposureData {
  exposedUnits: number;
  maxUnits: number;
  pendingPicks: Array<{ game: string; pick: string; stake: number; sport: string }>;
}

interface BankrollPoint {
  pickNumber: number;
  date: string;
  game: string;
  pick: string;
  result: string;
  profit: number;
  balance: number;
}

interface BankrollSummary {
  totalPicks: number;
  wins: number;
  losses: number;
  winRate: number;
  totalWagered: number;
  totalProfit: number;
  roi: number;
  currentBalance: number;
}

interface WeeklySummary {
  wins: number;
  losses: number;
  netUnits: number;
  roi: number;
  totalPicks: number;
  bestPick: { game: string; pick: string; odds: string; profit: number } | null;
}

interface SportStat {
  sport: string;
  wins: number;
  losses: number;
  totalPicks: number;
  winRate: number;
  unitsProfit: number;
  roi: number;
  currentStreak: number;
  streakType: "win" | "loss" | "none";
  status: "active" | "caution" | "paused";
  stakeMod: number;
  recentPicks: Array<{
    game: string; pick: string; odds: string; tier: string;
    stake: number; result: string; profit: number; date: string;
  }>;
}

interface LeaderboardEntry {
  id: string;
  displayName: string;
  unitValue: number;
  totalTracked: number;
  followed: number;
  followRate: number;
  profit: number;
  roi: number;
  balance: number;
}

interface FollowerInfo {
  id: string;
  display_name: string;
  unit_value: number;
}

interface LivePickScore {
  pickId: string;
  sport: string;
  game: string;
  pick: string;
  odds: string;
  tier: string;
  stake: number;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  gameState: string;
  period: number;
  clock: string;
  statusText: string;
  onTrack: boolean | null;
}

/* ─── Constants ─── */

const TIER_COLORS: Record<string, string> = {
  VALUE: "text-emerald-400",
  "STRONG VALUE": "text-orange-400",
  MAXIMUM: "text-purple-400",
};

const TIER_BG: Record<string, string> = {
  VALUE: "bg-emerald-500/15 border-emerald-500/30",
  "STRONG VALUE": "bg-orange-500/15 border-orange-500/30",
  MAXIMUM: "bg-purple-500/15 border-purple-500/30",
};

const SPORT_EMOJIS: Record<string, string> = {
  NBA: "\u{1F3C0}", NHL: "\u{1F3D2}", MLB: "\u26BE", NFL: "\u{1F3C8}",
  Soccer: "\u26BD", Tennis: "\u{1F3BE}", MMA: "\u{1F94A}",
};

/* ─── Helpers ─── */

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ─── Main Page ─── */

export default function MethodPage() {
  const [unitValue, setUnitValue] = useState(5);
  const [budget, setBudget] = useState(500);
  const [months, setMonths] = useState<MonthData[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [todayPicks, setTodayPicks] = useState<TodayPick[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);
  const [sportStatuses, setSportStatuses] = useState<SportStatus[]>([]);
  const [exposure, setExposure] = useState<ExposureData | null>(null);
  const [bankrollHistory, setBankrollHistory] = useState<BankrollPoint[]>([]);
  const [bankrollSummary, setBankrollSummary] = useState<BankrollSummary | null>(null);
  const [whatIfBudget, setWhatIfBudget] = useState(500);
  const [whatIfDate, setWhatIfDate] = useState("");
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummary | null>(null);
  const [sportStats, setSportStats] = useState<SportStat[]>([]);
  const [expandedSport, setExpandedSport] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [follower, setFollower] = useState<FollowerInfo | null>(null);
  const [followerName, setFollowerName] = useState("");
  const [followerUnit, setFollowerUnit] = useState(5);
  const [liveScores, setLiveScores] = useState<LivePickScore[]>([]);

  // Load saved unit value + follower
  useEffect(() => {
    const saved = localStorage.getItem("shark-unit-value");
    if (saved) {
      const val = parseFloat(saved) || 5;
      setUnitValue(val);
      setBudget(val * 100);
    }
    const savedFollower = localStorage.getItem("shark-follower");
    if (savedFollower) {
      try { setFollower(JSON.parse(savedFollower)); } catch { /* ignore */ }
    }
  }, []);

  function handleBudgetChange(val: number) {
    const b = Math.max(100, val);
    setBudget(b);
    const u = +(b / 100).toFixed(2);
    setUnitValue(u);
    localStorage.setItem("shark-unit-value", String(u));
  }

  function handleUnitChange(val: number) {
    const u = Math.max(0.01, val);
    setUnitValue(u);
    setBudget(+(u * 100).toFixed(2));
    localStorage.setItem("shark-unit-value", String(u));
  }

  useEffect(() => {
    Promise.all([
      fetch("/api/method/monthly").then((r) => r.json()).catch(() => ({ months: [] })),
      fetch("/api/landing/stats").then((r) => r.json()).catch(() => null),
      fetch("/api/tipster/public/picks").then((r) => r.json()).catch(() => ({ picks: [] })),
      fetch("/api/method/status").then((r) => r.json()).catch(() => ({ sports: [] })),
      fetch("/api/method/exposure").then((r) => r.json()).catch(() => null),
      fetch("/api/method/bankroll-history").then((r) => r.json()).catch(() => ({ history: [], summary: null })),
      fetch("/api/method/weekly-summary").then((r) => r.json()).catch(() => ({ summary: null })),
      fetch("/api/method/sport-stats").then((r) => r.json()).catch(() => ({ sports: [] })),
      fetch("/api/method/followers").then((r) => r.json()).catch(() => ({ leaderboard: [] })),
      fetch("/api/live-scores").then((r) => r.json()).catch(() => ({ live: [] })),
    ]).then(([monthlyData, statsData, picksData, statusData, exposureData, bankrollData, weeklyData, sportData, followerData, liveData]) => {
      setMonths(monthlyData.months ?? []);

      if (statsData) {
        setStats({
          totalPicks: statsData.totalPicks ?? 0,
          wins: statsData.wins ?? 0,
          losses: statsData.losses ?? 0,
          winRate: statsData.winRate ?? 0,
          units: statsData.units ?? 0,
          bankroll: statsData.bankroll ?? 100,
        });
      }

      // Get today's picks (pending or settled today)
      const today = new Date().toISOString().slice(0, 10);
      const tp = (picksData.picks ?? []).filter((p: TodayPick) =>
        p.sent_at?.slice(0, 10) === today
      );
      setTodayPicks(tp);

      setSportStatuses(statusData.sports ?? []);
      if (exposureData) setExposure(exposureData);
      setBankrollHistory(bankrollData.history ?? []);
      if (bankrollData.summary) setBankrollSummary(bankrollData.summary);
      if (weeklyData.summary) setWeeklySummary(weeklyData.summary);
      setSportStats(sportData.sports ?? []);
      setLeaderboard(followerData.leaderboard ?? []);
      setLiveScores(liveData.live ?? []);

      setLoading(false);
    });
  }, []);

  // Auto-refresh live scores every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("/api/live-scores")
        .then((r) => r.json())
        .then((data) => setLiveScores(data.live ?? []))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const dollarValue = (units: number) => `$${(units * unitValue).toFixed(2)}`;

  async function registerFollower() {
    if (!followerName.trim()) return;
    const res = await fetch("/api/method/followers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ display_name: followerName.trim(), unit_value: followerUnit }),
    });
    const data = await res.json();
    if (data.follower) {
      setFollower(data.follower);
      localStorage.setItem("shark-follower", JSON.stringify(data.follower));
    }
  }

  async function toggleFollow(pickId: string, followed: boolean) {
    if (!follower) return;
    await fetch(`/api/method/followers/${follower.id}/picks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pick_id: pickId, followed }),
    });
  }

  // What If calculator
  const whatIfResult = useMemo(() => {
    if (!whatIfDate || bankrollHistory.length === 0) return null;
    const wiUnit = whatIfBudget / 100;
    // Find picks from the start date onward
    const filtered = bankrollHistory.filter((p) => p.date >= whatIfDate);
    if (filtered.length === 0) return null;
    const totalProfit = filtered.reduce((s, p) => s + p.profit, 0);
    const finalUnits = 100 + totalProfit;
    const finalDollars = finalUnits * wiUnit;
    const pctGain = ((finalUnits - 100) / 100) * 100;
    return {
      startDate: whatIfDate,
      startDollars: whatIfBudget,
      unitValue: wiUnit,
      picksCount: filtered.length,
      totalProfit,
      finalUnits,
      finalDollars,
      pctGain,
    };
  }, [whatIfBudget, whatIfDate, bankrollHistory]);


  return (
    <div className="min-h-screen bg-[#050510] text-slate-100 overflow-x-hidden">
      <AnimatedBackground />
      <NavBar />

      <div className="relative z-10 max-w-6xl mx-auto px-5 pt-24 pb-20">
        {/* Header */}
        <div className="text-center mb-14">
          <h1 className="text-4xl sm:text-5xl font-black text-white mb-3">
            The Shark Method <span className="inline-block">&#x1F988;</span>
          </h1>
          <p className="text-lg text-cyan-400 font-semibold mb-2">Your bankroll. Your rules. Full transparency.</p>
          <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
            The Shark Method is a complete bankroll management system. Set your budget, follow every pick with exact stakes,
            and track your balance in real time. Every win, every loss &mdash; nothing hidden.
          </p>
        </div>

        {/* ═══ LIVE NOW ═══ */}
        {!loading && liveScores.length > 0 && (
          <div className="mb-12">
            <div className="flex items-center gap-3 mb-5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <h2 className="font-bold text-lg text-white">Live Now</h2>
              <span className="text-xs text-slate-500">Auto-refreshes every 60s</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {liveScores.map((ls) => (
                <div key={ls.pickId} className="p-5 rounded-2xl bg-gradient-to-br from-red-500/5 to-orange-500/5 border border-red-500/20">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                      {SPORT_EMOJIS[ls.sport] ?? "\u{1F3C5}"} {ls.sport}
                    </span>
                    <span className="text-xs font-mono text-orange-400">
                      {ls.statusText}{ls.clock ? ` — ${ls.clock}` : ''}
                    </span>
                  </div>
                  <div className="flex items-center justify-center gap-4 mb-3">
                    <div className="text-right flex-1">
                      <div className="text-sm font-semibold text-white truncate">{ls.homeTeam}</div>
                    </div>
                    <div className="text-center px-4 py-2 rounded-xl bg-white/[0.06] border border-white/[0.1]">
                      <span className="text-2xl font-black text-white font-mono">{ls.homeScore}</span>
                      <span className="text-lg text-slate-500 mx-2">-</span>
                      <span className="text-2xl font-black text-white font-mono">{ls.awayScore}</span>
                    </div>
                    <div className="text-left flex-1">
                      <div className="text-sm font-semibold text-white truncate">{ls.awayTeam}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">
                      Pick: <span className="text-cyan-400 font-semibold">{ls.pick}</span> at {ls.odds}
                    </span>
                    {ls.onTrack !== null && (
                      <span className={ls.onTrack ? "text-[#00ff88] font-bold" : "text-[#ff4466] font-bold"}>
                        {ls.onTrack ? "on track ✅" : "behind ❌"}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ SYSTEM STATUS PANEL ═══ */}
        {!loading && (
          <div className="mb-12">
            <h2 className="font-bold text-lg text-white mb-5">System Status</h2>

            {/* Caution banners */}
            {sportStatuses.filter((s) => s.status === "caution").map((s) => (
              <div key={`banner-${s.sport}`} className="mb-3 px-4 py-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-300">
                {SPORT_EMOJIS[s.sport] ?? "\u{1F3C5}"} <strong>{s.sport}</strong> on reduced stakes after {s.streak}-loss streak. Stakes halved until 2 consecutive wins.
              </div>
            ))}

            {/* Paused banners */}
            {sportStatuses.filter((s) => s.status === "paused").map((s) => (
              <div key={`banner-${s.sport}`} className="mb-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">
                {SPORT_EMOJIS[s.sport] ?? "\u{1F3C5}"} <strong>{s.sport}</strong> paused &mdash; win rate {s.recentWinRate}% (below 50% threshold). No picks until performance recovers.
              </div>
            ))}

            {/* Status table */}
            <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
              {sportStatuses.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
                        <th className="px-5 py-3 text-left font-semibold">Sport</th>
                        <th className="px-3 py-3 text-center font-semibold">Status</th>
                        <th className="px-3 py-3 text-center font-semibold">Streak</th>
                        <th className="px-3 py-3 text-center font-semibold">Stake</th>
                        <th className="px-3 py-3 text-center font-semibold">Win Rate (L20)</th>
                        <th className="px-5 py-3 text-right font-semibold">Picks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sportStatuses.map((s) => (
                        <tr key={s.sport} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                          <td className="px-5 py-3 text-left font-semibold text-white">
                            {SPORT_EMOJIS[s.sport] ?? "\u{1F3C5}"} {s.sport}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <StatusBadge status={s.status} />
                          </td>
                          <td className="px-3 py-3 text-center font-mono font-bold">
                            <span className={s.streakType === "win" ? "text-[#00ff88]" : s.streakType === "loss" ? "text-[#ff4466]" : "text-slate-400"}>
                              {s.streakType === "none" ? "--" : `${s.streakType === "win" ? "W" : "L"}${s.streak}`}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center font-mono">
                            <span className={s.status === "paused" ? "text-red-400" : s.status === "caution" ? "text-yellow-400" : "text-slate-300"}>
                              {s.status === "paused" ? "Paused" : `${s.stakeMod}x`}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={s.recentWinRate >= 55 ? "text-[#00ff88]" : s.recentWinRate >= 50 ? "text-yellow-400" : "text-[#ff4466]"}>
                              {s.recentWinRate > 0 ? `${s.recentWinRate}%` : "--"}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right text-slate-400">{s.totalPicks}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="px-5 py-6 text-center">
                  <div className="inline-flex items-center gap-2 text-sm text-emerald-400 font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    All systems active
                  </div>
                  <p className="text-xs text-slate-500 mt-1">Sport statuses appear here once picks are tracked.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ═══ THIS WEEK SUMMARY ═══ */}
        {!loading && weeklySummary && (
          <div className="mb-12 p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-cyan-500/5 to-blue-500/5 border border-cyan-500/20">
            <h2 className="font-bold text-lg text-white mb-4">This Week</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-black text-white">{weeklySummary.wins}W-{weeklySummary.losses}L</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Record</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-black ${weeklySummary.netUnits >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                  {weeklySummary.netUnits >= 0 ? "+" : ""}{weeklySummary.netUnits.toFixed(1)}u
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Net Units</div>
              </div>
              <div className="text-center">
                <div className={`text-2xl font-black ${weeklySummary.roi >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                  {weeklySummary.roi >= 0 ? "+" : ""}{weeklySummary.roi}%
                </div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">ROI</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-black text-white">{weeklySummary.totalPicks}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Picks</div>
              </div>
            </div>
            {weeklySummary.bestPick && (
              <div className="px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Pick of the Week</div>
                <div className="text-sm text-white font-semibold truncate">{weeklySummary.bestPick.pick} at {weeklySummary.bestPick.odds}</div>
                <div className="text-xs text-slate-400 truncate">{weeklySummary.bestPick.game}</div>
                <div className="text-xs text-[#00ff88] font-bold mt-1">+{weeklySummary.bestPick.profit.toFixed(1)}u</div>
              </div>
            )}
          </div>
        )}

        {/* ═══ SECTION A: Bankroll Calculator ═══ */}
        <div className="mb-12 p-6 sm:p-8 rounded-2xl bg-white/[0.03] border border-cyan-500/20">
          <h2 className="font-bold text-lg text-white mb-1">Bankroll Calculator</h2>
          <p className="text-sm text-slate-400 mb-6">Your unit = 1% of your budget. This is the foundation of the method.</p>

          <div className="grid sm:grid-cols-2 gap-6">
            {/* Budget input */}
            <div>
              <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Your Budget</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                <input
                  type="number"
                  min="100"
                  step="50"
                  value={budget}
                  onChange={(e) => handleBudgetChange(parseFloat(e.target.value) || 100)}
                  className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-xl font-bold text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                />
              </div>
              <div className="flex gap-2 mt-3">
                {[100, 250, 500, 1000, 2500].map((v) => (
                  <button
                    key={v}
                    onClick={() => handleBudgetChange(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      budget === v
                        ? "bg-cyan-600 text-white"
                        : "bg-white/[0.06] text-slate-400 hover:bg-white/[0.1]"
                    }`}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {/* Result */}
            <div className="flex flex-col justify-center">
              <div className="p-5 rounded-xl bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20">
                <div className="flex items-baseline gap-3 mb-2">
                  <span className="text-3xl font-black text-white">${unitValue.toFixed(2)}</span>
                  <span className="text-sm text-cyan-400 font-semibold">per unit</span>
                </div>
                <div className="text-xs text-slate-400 space-y-1">
                  <div>Starting bankroll: 100 units = <span className="text-white font-semibold">{dollarValue(100)}</span></div>
                  <div>VALUE pick (1u): <span className="text-emerald-400 font-semibold">{dollarValue(1)}</span></div>
                  <div>STRONG VALUE pick (1.5u): <span className="text-orange-400 font-semibold">{dollarValue(1.5)}</span></div>
                  <div>MAXIMUM pick (2u): <span className="text-purple-400 font-semibold">{dollarValue(2)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ SECTION B: The Rules ═══ */}
        <div className="mb-12 p-6 sm:p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <h2 className="font-bold text-lg text-white mb-5">The Rules</h2>
          <div className="grid sm:grid-cols-2 gap-x-8 gap-y-3">
            {[
              { n: 1, rule: "Your bankroll starts at 100 units." },
              { n: 2, rule: "1 unit = 1% of your total budget." },
              { n: 3, rule: "Every pick has a fixed stake: 1u, 1.5u, or 2u." },
              { n: 4, rule: "Never change the stake. Follow exactly as posted." },
              { n: 5, rule: "Maximum daily exposure: 6 units." },
              { n: 6, rule: "Never chase losses. Stick to the plan." },
              { n: 7, rule: "Track every result. No hidden picks, no deleted losses." },
              { n: 8, rule: "Withdraw profits monthly, or compound. Your choice." },
            ].map(({ n, rule }) => (
              <div key={n} className="flex gap-3 items-start py-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-[10px] font-bold text-cyan-400">
                  {n}
                </span>
                <span className="text-sm text-slate-300 leading-relaxed">{rule}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ═══ SECTION C: Live Tracker ═══ */}
        {!loading && stats && (
          <div className="mb-12">
            <h2 className="font-bold text-lg text-white mb-5">Live Tracker</h2>

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
              <DashCard label="Starting" value="100u" sub={dollarValue(100)} color="text-slate-300" />
              <DashCard
                label="Current Balance"
                value={`${stats.bankroll.toFixed(1)}u`}
                sub={dollarValue(stats.bankroll)}
                color={stats.bankroll >= 100 ? "text-[#00ff88]" : "text-[#ff4466]"}
                big
              />
              <DashCard
                label="Total Profit"
                value={`${stats.units >= 0 ? "+" : ""}${stats.units.toFixed(1)}u`}
                sub={dollarValue(stats.units)}
                color={stats.units >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}
              />
              <DashCard label="Win Rate" value={`${stats.winRate}%`} sub={`${stats.wins}W-${stats.losses}L`} color="text-cyan-400" />
              <DashCard label="Total Picks" value={String(stats.totalPicks)} color="text-white" />
            </div>

          </div>
        )}

        {/* ═══ BANKROLL GROWTH (bet-by-bet) ═══ */}
        {!loading && (
          <div className="mb-12">
            <h2 className="font-bold text-lg text-white mb-5">Bankroll Growth</h2>

            {bankrollHistory.length > 0 && bankrollSummary ? (
              <>
                {/* Current balance highlight */}
                <div className="text-center mb-6">
                  <div className={`text-4xl sm:text-5xl font-black ${bankrollSummary.currentBalance >= 100 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                    {bankrollSummary.currentBalance.toFixed(1)}u
                  </div>
                  <div className="text-sm text-slate-400 mt-1">
                    Current Balance <span className="text-slate-500">({dollarValue(bankrollSummary.currentBalance)})</span>
                  </div>
                </div>

                {/* Bet-by-bet chart */}
                <div className="p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] mb-6">
                  <div className="h-[280px] sm:h-[340px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={bankrollHistory}>
                        <defs>
                          <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00d4ff" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#00d4ff" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis
                          dataKey="pickNumber"
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          axisLine={{ stroke: "#1e293b" }}
                          tickLine={false}
                          label={{ value: "Pick #", position: "insideBottomRight", offset: -5, fontSize: 10, fill: "#475569" }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "#64748b" }}
                          axisLine={false}
                          tickLine={false}
                          domain={["auto", "auto"]}
                        />
                        <Tooltip
                          content={({ active, payload }) => {
                            if (!active || !payload?.[0]) return null;
                            const d = payload[0].payload as BankrollPoint;
                            const profitColor = d.profit >= 0 ? "#00ff88" : "#ff4466";
                            const resultEmoji = d.result === "won" ? "W" : d.result === "lost" ? "L" : "P";
                            return (
                              <div className="p-3 rounded-xl bg-[#0f172a] border border-white/10">
                                <div className="text-[10px] text-slate-500 mb-1">Pick #{d.pickNumber} &middot; {d.date}</div>
                                <div className="text-xs text-white font-semibold truncate max-w-[250px]">{d.game}</div>
                                <div className="text-xs text-slate-300 truncate max-w-[250px]">{d.pick}</div>
                                <div className="flex items-center gap-2 mt-1.5">
                                  <span className="text-xs font-bold" style={{ color: profitColor }}>
                                    {resultEmoji} {d.profit >= 0 ? "+" : ""}{d.profit.toFixed(2)}u
                                  </span>
                                  <span className="text-xs text-slate-400">Balance: {d.balance.toFixed(1)}u</span>
                                </div>
                              </div>
                            );
                          }}
                        />
                        <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
                        <Area
                          type="monotone"
                          dataKey="balance"
                          stroke="#00d4ff"
                          strokeWidth={2}
                          fill="url(#balanceGradient)"
                          dot={{ fill: "#00d4ff", r: 2.5, strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: "#22d3ee", stroke: "#00d4ff", strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <div className="text-lg font-black text-white">{bankrollSummary.totalPicks}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Total Picks</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <div className="text-lg font-black text-cyan-400">{bankrollSummary.winRate}%</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Win Rate</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <div className="text-lg font-black text-slate-300">{bankrollSummary.totalWagered.toFixed(1)}u</div>
                    <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Total Wagered</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <div className={`text-lg font-black ${bankrollSummary.totalProfit >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                      {bankrollSummary.totalProfit >= 0 ? "+" : ""}{bankrollSummary.totalProfit.toFixed(1)}u
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">Total Profit</div>
                  </div>
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
                    <div className={`text-lg font-black ${bankrollSummary.roi >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                      {bankrollSummary.roi >= 0 ? "+" : ""}{bankrollSummary.roi}%
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wider">ROI</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center">
                <div className="text-4xl sm:text-5xl font-black text-slate-300 mb-2">100.0u</div>
                <p className="text-sm text-slate-500">Starting balance. The chart will appear once picks are settled.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ WHAT IF CALCULATOR ═══ */}
        {!loading && bankrollHistory.length > 0 && (
          <div className="mb-12 p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-indigo-500/5 to-cyan-500/5 border border-indigo-500/20">
            <h2 className="font-bold text-lg text-white mb-1">What If Calculator</h2>
            <p className="text-sm text-slate-400 mb-6">See what your balance would be if you started with a different budget or date.</p>

            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              {/* Budget input */}
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Starting Bankroll</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                  <input
                    type="number"
                    min="50"
                    step="50"
                    value={whatIfBudget}
                    onChange={(e) => setWhatIfBudget(Math.max(50, parseFloat(e.target.value) || 50))}
                    className="w-full pl-8 pr-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-xl font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
                <div className="flex gap-2 mt-3">
                  {[250, 500, 1000, 2500, 5000].map((v) => (
                    <button
                      key={v}
                      onClick={() => setWhatIfBudget(v)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                        whatIfBudget === v
                          ? "bg-indigo-600 text-white"
                          : "bg-white/[0.06] text-slate-400 hover:bg-white/[0.1]"
                      }`}
                    >
                      ${v.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date input */}
              <div>
                <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Start Date</label>
                <input
                  type="date"
                  value={whatIfDate}
                  min={bankrollHistory[0]?.date ?? ""}
                  max={bankrollHistory[bankrollHistory.length - 1]?.date ?? ""}
                  onChange={(e) => setWhatIfDate(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-lg font-bold text-white focus:outline-none focus:border-indigo-500/50 transition-colors [color-scheme:dark]"
                />
                <div className="flex gap-2 mt-3">
                  {(() => {
                    const dates: { label: string; value: string }[] = [];
                    if (bankrollHistory.length > 0) {
                      dates.push({ label: "First pick", value: bankrollHistory[0].date });
                      // 30 days ago
                      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
                      const d30s = d30.toISOString().slice(0, 10);
                      if (d30s >= bankrollHistory[0].date) dates.push({ label: "30d ago", value: d30s });
                      // 7 days ago
                      const d7 = new Date(); d7.setDate(d7.getDate() - 7);
                      const d7s = d7.toISOString().slice(0, 10);
                      if (d7s >= bankrollHistory[0].date) dates.push({ label: "7d ago", value: d7s });
                    }
                    return dates.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setWhatIfDate(d.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          whatIfDate === d.value
                            ? "bg-indigo-600 text-white"
                            : "bg-white/[0.06] text-slate-400 hover:bg-white/[0.1]"
                        }`}
                      >
                        {d.label}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            </div>

            {/* Result */}
            {whatIfResult ? (
              <div className="p-6 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                <p className="text-sm text-slate-400 mb-3">
                  If you started with <span className="text-white font-bold">${whatIfResult.startDollars.toLocaleString()}</span> on{" "}
                  <span className="text-white font-bold">{new Date(whatIfResult.startDate + "T12:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>:
                </p>
                <div className="flex flex-wrap items-baseline gap-3 mb-3">
                  <span className={`text-4xl sm:text-5xl font-black ${whatIfResult.finalDollars >= whatIfResult.startDollars ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                    ${whatIfResult.finalDollars.toFixed(2)}
                  </span>
                  <span className={`text-lg font-bold ${whatIfResult.pctGain >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                    ({whatIfResult.pctGain >= 0 ? "+" : ""}{whatIfResult.pctGain.toFixed(1)}%)
                  </span>
                </div>
                <div className="flex flex-wrap gap-4 text-xs text-slate-400">
                  <span>Unit: ${whatIfResult.unitValue.toFixed(2)}</span>
                  <span>Picks: {whatIfResult.picksCount}</span>
                  <span>Profit: {whatIfResult.totalProfit >= 0 ? "+" : ""}{whatIfResult.totalProfit.toFixed(1)}u (${(whatIfResult.totalProfit * whatIfResult.unitValue).toFixed(2)})</span>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center">
                <p className="text-sm text-slate-500">Select a start date to see your hypothetical returns.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══ SPORT ROI CARDS ═══ */}
        {!loading && sportStats.length > 0 && (
          <div className="mb-12">
            <h2 className="font-bold text-lg text-white mb-5">By Sport</h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sportStats.map((s) => (
                <div key={s.sport} className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  <button
                    onClick={() => setExpandedSport(expandedSport === s.sport ? null : s.sport)}
                    className="w-full p-5 text-left hover:bg-white/[0.02] transition-colors"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xl">{SPORT_EMOJIS[s.sport] ?? "\u{1F3C5}"}</span>
                      <span className="font-bold text-white flex-1">{s.sport}</span>
                      <StatusBadge status={s.status} />
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <div className="text-lg font-black text-cyan-400">{s.winRate}%</div>
                        <div className="text-[9px] text-slate-500 uppercase">Win Rate</div>
                      </div>
                      <div>
                        <div className={`text-lg font-black ${s.unitsProfit >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                          {s.unitsProfit >= 0 ? "+" : ""}{s.unitsProfit.toFixed(1)}u
                        </div>
                        <div className="text-[9px] text-slate-500 uppercase">Profit</div>
                      </div>
                      <div>
                        <div className={`text-lg font-black ${s.roi >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                          {s.roi >= 0 ? "+" : ""}{s.roi}%
                        </div>
                        <div className="text-[9px] text-slate-500 uppercase">ROI</div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
                      <span>{s.wins}W-{s.losses}L ({s.totalPicks} picks)</span>
                      <span className={`font-mono font-bold ${s.streakType === "win" ? "text-[#00ff88]" : s.streakType === "loss" ? "text-[#ff4466]" : "text-slate-500"}`}>
                        {s.streakType === "none" ? "--" : `${s.streakType === "win" ? "W" : "L"}${s.currentStreak}`}
                      </span>
                    </div>
                  </button>

                  {expandedSport === s.sport && s.recentPicks.length > 0 && (
                    <div className="border-t border-white/[0.06] px-4 py-3 space-y-1.5">
                      <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Recent Picks</div>
                      {s.recentPicks.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full ${p.result === "won" ? "bg-[#00ff88]" : p.result === "lost" ? "bg-[#ff4466]" : "bg-slate-500"}`} />
                          <span className="text-slate-400 font-mono text-[10px] w-16">{p.date}</span>
                          <span className="text-white font-semibold truncate flex-1">{p.pick}</span>
                          <span className="text-slate-500 font-mono">{p.odds}</span>
                          <span className={`font-bold font-mono ${p.profit >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                            {p.profit >= 0 ? "+" : ""}{p.profit.toFixed(2)}u
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ═══ SECTION D: Monthly Balance Sheets ═══ */}
        {!loading && months.length > 0 && (
          <div className="mb-12">
            <h2 className="font-bold text-lg text-white mb-5">Monthly Balance Sheets</h2>
            <div className="space-y-3">
              {[...months].reverse().map((m) => {
                const isExpanded = expandedMonth === m.month;
                const isPositive = m.units >= 0;

                return (
                  <div key={m.month} className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                    {/* Month summary row */}
                    <button
                      onClick={() => setExpandedMonth(isExpanded ? null : m.month)}
                      className="w-full px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-white">{formatMonth(m.month)}</span>
                        <span className="text-xs text-slate-500 ml-3">{m.picks} picks</span>
                      </div>
                      <div className="flex items-center gap-5 text-sm">
                        <span className="text-slate-400">{m.wins}W-{m.losses}L</span>
                        <span className={`font-bold ${isPositive ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                          {isPositive ? "+" : ""}{m.units.toFixed(1)}u
                        </span>
                        <span className="text-slate-400 font-mono text-xs">
                          {m.openingBalance.toFixed(1)} &rarr; {m.closingBalance.toFixed(1)}
                        </span>
                        <span className={`font-bold text-xs ${m.roi >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                          {m.roi >= 0 ? "+" : ""}{m.roi}%
                        </span>
                        <a
                          href={`/api/method/report/${m.month}`}
                          onClick={(e) => e.stopPropagation()}
                          className="px-2 py-1 rounded-lg bg-white/[0.06] text-[10px] font-bold text-slate-400 hover:bg-white/[0.1] hover:text-white transition-colors"
                          title="Download PDF report"
                        >
                          PDF
                        </a>
                        <svg
                          className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded pick details */}
                    {isExpanded && (
                      <div className="border-t border-white/[0.06]">
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                                <th className="px-5 py-2 text-left">Date</th>
                                <th className="px-3 py-2 text-left">Sport</th>
                                <th className="px-3 py-2 text-left">Game</th>
                                <th className="px-3 py-2 text-left">Pick</th>
                                <th className="px-3 py-2 text-center">Odds</th>
                                <th className="px-3 py-2 text-center">Tier</th>
                                <th className="px-3 py-2 text-center">Stake</th>
                                <th className="px-3 py-2 text-center">Result</th>
                                <th className="px-5 py-2 text-right">P/L</th>
                              </tr>
                            </thead>
                            <tbody>
                              {m.pickDetails.map((p) => (
                                <PickRow key={p.id} p={p} dollarValue={dollarValue} />
                              ))}
                            </tbody>
                            <tfoot>
                              <tr className="border-t border-white/[0.06] bg-white/[0.02]">
                                <td colSpan={6} className="px-5 py-3 text-xs text-slate-400 font-semibold">
                                  Monthly Total
                                </td>
                                <td className="px-3 py-3 text-center text-xs text-slate-400">
                                  {m.pickDetails.reduce((s, p) => s + p.stake, 0).toFixed(1)}u
                                </td>
                                <td className="px-3 py-3 text-center text-xs text-slate-400">
                                  {m.wins}W-{m.losses}L
                                </td>
                                <td className={`px-5 py-3 text-right font-bold text-sm ${isPositive ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                                  {isPositive ? "+" : ""}{m.units.toFixed(2)}u
                                  <span className="block text-[10px] text-slate-500">{dollarValue(m.units)}</span>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ SECTION E: Today's Exposure ═══ */}
        {!loading && (
          <div className="mb-12">
            <h2 className="font-bold text-lg text-white mb-5">Today&apos;s Exposure</h2>

            {(() => {
              const exposed = exposure?.exposedUnits ?? 0;
              const max = exposure?.maxUnits ?? 6;
              const pct = max > 0 ? exposed / max : 0;
              const atLimit = exposed >= max;
              const barColor = atLimit
                ? "bg-gradient-to-r from-red-500 to-red-600"
                : pct > 5 / 6
                  ? "bg-gradient-to-r from-orange-500 to-red-500"
                  : pct > 0.5
                    ? "bg-gradient-to-r from-yellow-500 to-orange-500"
                    : "bg-gradient-to-r from-emerald-500 to-cyan-500";

              return (
                <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
                  {/* Large exposure display */}
                  <div className="text-center mb-4">
                    <div className={`text-3xl sm:text-4xl font-black ${atLimit ? "text-red-400" : "text-white"}`}>
                      {exposed.toFixed(1)} / {max}u
                    </div>
                    <div className="text-sm text-slate-400 mt-1">
                      {atLimit ? "Daily limit reached — no more picks today" : "units exposed today"}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="h-3 bg-white/[0.06] rounded-full overflow-hidden mb-4">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                      style={{ width: `${Math.min(100, pct * 100)}%` }}
                    />
                  </div>

                  {/* Pending picks list */}
                  {exposure && exposure.pendingPicks.length > 0 && (
                    <div className="space-y-2 mb-4">
                      {exposure.pendingPicks.map((p, i) => (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04]">
                          <span className="text-sm">{SPORT_EMOJIS[p.sport] ?? "\u{1F3C5}"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-white font-semibold truncate">{p.pick}</div>
                            <div className="text-[10px] text-slate-500 truncate">{p.game}</div>
                          </div>
                          <span className="text-xs font-mono text-yellow-400 font-bold">{p.stake}u</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {exposure && exposure.pendingPicks.length === 0 && (
                    <p className="text-center text-sm text-slate-500 mb-4">No pending picks right now.</p>
                  )}

                  <p className="text-center text-[10px] text-slate-600 uppercase tracking-wider">
                    Maximum daily exposure: {max} units across all open picks
                  </p>
                </div>
              );
            })()}

            {/* Today's settled + pending picks */}
            {todayPicks.length > 0 && (
              <div className="mt-4 space-y-2">
                <h3 className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-2">All picks today</h3>
                {todayPicks.map((p) => {
                  const resultColor = p.result === "won" ? "text-[#00ff88]"
                    : p.result === "lost" ? "text-[#ff4466]"
                    : p.result === "push" ? "text-slate-400"
                    : "text-yellow-400";
                  const resultLabel = p.result === "won" ? "Won"
                    : p.result === "lost" ? "Lost"
                    : p.result === "push" ? "Push"
                    : "Pending";

                  return (
                    <div key={p.id} className="flex items-center gap-4 p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                      <span className="text-lg">{SPORT_EMOJIS[p.sport] ?? "\u{1F3C5}"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-white text-sm truncate">{p.pick}</div>
                        <div className="text-xs text-slate-500 truncate">{p.game}</div>
                      </div>
                      <span className="text-xs text-slate-400 font-mono">{p.odds}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${TIER_BG[p.tier] ?? "bg-white/5 border-white/10"} ${TIER_COLORS[p.tier] ?? "text-slate-400"}`}>
                        {p.tier}
                      </span>
                      <span className="text-xs font-mono text-slate-300">{p.stake}u</span>
                      <span className={`text-xs font-bold ${resultColor} min-w-[50px] text-right`}>{resultLabel}</span>
                      {p.profit != null && (
                        <span className={`text-xs font-bold font-mono min-w-[50px] text-right ${p.profit >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                          {p.profit >= 0 ? "+" : ""}{p.profit.toFixed(2)}u
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ TRACK YOUR RESULTS ═══ */}
        {!loading && (
          <div className="mb-12">
            <h2 className="font-bold text-lg text-white mb-5">Track Your Results</h2>

            {!follower ? (
              <div className="p-6 sm:p-8 rounded-2xl bg-white/[0.03] border border-cyan-500/20">
                <p className="text-sm text-slate-400 mb-6">Register to track which picks you follow and see your personal ROI.</p>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Display Name</label>
                    <input
                      type="text"
                      maxLength={30}
                      value={followerName}
                      onChange={(e) => setFollowerName(e.target.value)}
                      placeholder="Your name"
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 uppercase tracking-wider mb-2 font-semibold">Unit Value ($)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.5"
                      value={followerUnit}
                      onChange={(e) => setFollowerUnit(Math.max(0.01, parseFloat(e.target.value) || 0.01))}
                      className="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/10 text-white focus:outline-none focus:border-cyan-500/50 transition-colors"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={registerFollower}
                      disabled={!followerName.trim()}
                      className="w-full px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 text-white font-bold hover:shadow-lg hover:shadow-cyan-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      Start Tracking
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-2xl bg-white/[0.03] border border-cyan-500/20">
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-cyan-400 font-bold">{follower.display_name}</span>
                  <span className="text-xs text-slate-500">Unit: ${follower.unit_value}</span>
                </div>

                {todayPicks.length > 0 && (
                  <div className="mb-4">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider mb-2 font-semibold">Today&apos;s Picks — Mark as followed</div>
                    <div className="space-y-2">
                      {todayPicks.map((p) => (
                        <label key={p.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.04] cursor-pointer hover:bg-white/[0.05] transition-colors">
                          <input
                            type="checkbox"
                            defaultChecked
                            onChange={(e) => toggleFollow(p.id, e.target.checked)}
                            className="w-4 h-4 rounded accent-cyan-500"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-white font-semibold">{p.pick}</span>
                            <span className="text-[10px] text-slate-500 ml-2">{p.game}</span>
                          </div>
                          <span className="text-xs font-mono text-slate-400">{p.stake}u</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Community Leaderboard */}
            {leaderboard.length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm text-slate-400 font-bold mb-3">Community Leaderboard</h3>
                <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-[10px] text-slate-500 uppercase tracking-wider border-b border-white/[0.06]">
                          <th className="px-4 py-3 text-left font-semibold w-10">#</th>
                          <th className="px-3 py-3 text-left font-semibold">Name</th>
                          <th className="px-3 py-3 text-center font-semibold">Picks Followed</th>
                          <th className="px-3 py-3 text-center font-semibold">Follow Rate</th>
                          <th className="px-4 py-3 text-right font-semibold">ROI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((entry, i) => (
                          <tr key={entry.id} className={`border-t border-white/[0.04] ${follower?.id === entry.id ? "bg-cyan-500/5" : "hover:bg-white/[0.02]"} transition-colors`}>
                            <td className="px-4 py-2.5 text-xs text-slate-500 font-bold">{i + 1}</td>
                            <td className="px-3 py-2.5 text-xs text-white font-semibold">{entry.displayName}</td>
                            <td className="px-3 py-2.5 text-center text-xs text-slate-400">{entry.followed}/{entry.totalTracked}</td>
                            <td className="px-3 py-2.5 text-center text-xs text-cyan-400 font-bold">{entry.followRate}%</td>
                            <td className={`px-4 py-2.5 text-right text-xs font-bold ${entry.roi >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                              {entry.roi >= 0 ? "+" : ""}{entry.roi}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ SECTION F: How to Follow ═══ */}
        <div className="mb-14">
          <h2 className="text-center text-xl font-black text-white mb-8">How to Follow the Shark Method</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <StepCard
              step={1}
              title="Set Your Budget"
              desc="Decide how much you're willing to risk. Your unit = 1% of that budget. If you have $500, your unit is $5."
              color="cyan"
            />
            <StepCard
              step={2}
              title="Join the Channel"
              desc="Every pick is posted on our free Telegram channel with exact odds, stake, and reasoning. No hidden picks."
              color="indigo"
            />
            <StepCard
              step={3}
              title="Copy Every Pick"
              desc="Place the same bet at the same odds and stake. VALUE = 1 unit, STRONG VALUE = 1.5 units, MAXIMUM = 2 units."
              color="emerald"
            />
            <StepCard
              step={4}
              title="Track & Grow"
              desc="Your balance updates after every result. Review monthly P&L, adjust your unit if your budget changes. Compound or withdraw."
              color="purple"
            />
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <a
            href={TELEGRAM_FREE}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-10 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-2xl text-lg font-black hover:shadow-2xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
          >
            Follow Free on Telegram
          </a>
          <p className="text-xs text-slate-600 mt-4">Free channel &middot; Every pick posted publicly &middot; No sign-up needed</p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#030308]">
        <div className="max-w-6xl mx-auto px-5 py-8 text-center">
          <p className="text-xs text-slate-600">
            &copy; 2026 Sharkline. Past performance does not guarantee future results. Please gamble responsibly. 18+
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ═══ Sub-components ═══ */

function StatusBadge({ status }: { status: "active" | "caution" | "paused" }) {
  const config = {
    active: { label: "Active", dot: "bg-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400" },
    caution: { label: "Caution", dot: "bg-yellow-400", bg: "bg-yellow-500/15 border-yellow-500/30 text-yellow-400" },
    paused: { label: "Paused", dot: "bg-red-400", bg: "bg-red-500/15 border-red-500/30 text-red-400" },
  };
  const c = config[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${c.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot} ${status === "active" ? "animate-pulse" : ""}`} />
      {c.label}
    </span>
  );
}

function DashCard({ label, value, sub, color, big }: {
  label: string; value: string; sub?: string; color: string; big?: boolean;
}) {
  return (
    <div className={`p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] text-center ${big ? "ring-1 ring-cyan-500/20" : ""}`}>
      <div className={`${big ? "text-3xl sm:text-4xl" : "text-xl sm:text-2xl"} font-black ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
      <div className="text-[10px] text-slate-500 mt-1 font-medium uppercase tracking-wider">{label}</div>
    </div>
  );
}

function StepCard({ step, title, desc, color }: {
  step: number; title: string; desc: string; color: string;
}) {
  const accents: Record<string, { border: string; num: string; glow: string }> = {
    cyan: { border: "border-t-cyan-500/60", num: "text-cyan-400", glow: "from-cyan-500/5 to-transparent" },
    indigo: { border: "border-t-indigo-500/60", num: "text-indigo-400", glow: "from-indigo-500/5 to-transparent" },
    emerald: { border: "border-t-emerald-500/60", num: "text-emerald-400", glow: "from-emerald-500/5 to-transparent" },
    purple: { border: "border-t-purple-500/60", num: "text-purple-400", glow: "from-purple-500/5 to-transparent" },
  };
  const a = accents[color] ?? accents.cyan;

  return (
    <div className={`relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] border-t-2 ${a.border} hover:bg-white/[0.04] transition-all duration-300 overflow-hidden`}>
      <div className={`absolute inset-0 bg-gradient-to-b ${a.glow} pointer-events-none`} />
      <div className="relative">
        <div className={`text-[10px] font-bold ${a.num} uppercase tracking-widest mb-3`}>Step {step}</div>
        <h3 className="font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function PickRow({ p, dollarValue }: { p: PickDetail; dollarValue: (u: number) => string }) {
  const resultColor = p.result === "won" ? "text-[#00ff88]"
    : p.result === "lost" ? "text-[#ff4466]"
    : p.result === "push" ? "text-slate-400"
    : "text-yellow-400";
  const resultLabel = p.result === "won" ? "Won"
    : p.result === "lost" ? "Lost"
    : p.result === "push" ? "Push"
    : "Pending";

  return (
    <tr className="border-t border-white/[0.03] hover:bg-white/[0.02]">
      <td className="px-5 py-2.5 text-xs text-slate-400 whitespace-nowrap">{p.sent_at ? formatShortDate(p.sent_at) : "--"}</td>
      <td className="px-3 py-2.5 text-xs whitespace-nowrap">{SPORT_EMOJIS[p.sport] ?? "\u{1F3C5}"} {p.sport}</td>
      <td className="px-3 py-2.5 text-xs text-slate-300 max-w-[180px] truncate">{p.game}</td>
      <td className="px-3 py-2.5 text-xs font-semibold text-white max-w-[130px] truncate">{p.pick}</td>
      <td className="px-3 py-2.5 text-center text-xs text-slate-400 font-mono">{p.odds}</td>
      <td className="px-3 py-2.5 text-center">
        <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold border ${TIER_BG[p.tier] ?? "bg-white/5 border-white/10"} ${TIER_COLORS[p.tier] ?? "text-slate-400"}`}>
          {p.tier}
        </span>
      </td>
      <td className="px-3 py-2.5 text-center text-xs font-mono">{p.stake}u</td>
      <td className={`px-3 py-2.5 text-center text-xs font-semibold ${resultColor}`}>{resultLabel}</td>
      <td className={`px-5 py-2.5 text-right text-xs font-bold font-mono ${p.profit >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
        {p.profit >= 0 ? "+" : ""}{p.profit.toFixed(2)}u
        <span className="block text-[9px] text-slate-500">{dollarValue(p.profit)}</span>
      </td>
    </tr>
  );
}
