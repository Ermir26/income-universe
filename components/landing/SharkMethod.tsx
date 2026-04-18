"use client";

import { useEffect, useState } from "react";

interface MonthRow {
  month: string;
  picks: number;
  wins: number;
  losses: number;
  pushes: number;
  units: number;
  balance: number;
  roi: number;
}

interface MethodStats {
  startingBalance: number;
  currentBalance: number;
  totalPicks: number;
  winRate: number;
  monthlyRoi: number;
}

const TELEGRAM_FREE = "https://t.me/SharklineFree";

function formatMonth(ym: string): string {
  const [y, m] = ym.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m, 10) - 1]} ${y}`;
}

export default function SharkMethod() {
  const [months, setMonths] = useState<MonthRow[]>([]);
  const [methodStats, setMethodStats] = useState<MethodStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/tipster/public/monthly").then((r) => r.json()).catch(() => ({ months: [] })),
      fetch("/api/landing/stats").then((r) => r.json()).catch(() => null),
    ]).then(([monthlyData, statsData]) => {
      const rows: MonthRow[] = monthlyData.months ?? [];
      setMonths(rows);

      if (statsData) {
        const lastBalance = rows.length > 0 ? rows[rows.length - 1]?.balance ?? 100 : 100;
        const totalUnits = rows.reduce((s: number, r: MonthRow) => s + r.units, 0);
        const totalPicks = statsData.totalPicks ?? rows.reduce((s: number, r: MonthRow) => s + r.picks, 0);
        const avgRoi = rows.length > 0 ? +(totalUnits / rows.length).toFixed(1) : 0;
        setMethodStats({
          startingBalance: 100,
          currentBalance: lastBalance,
          totalPicks,
          winRate: statsData.winRate ?? 0,
          monthlyRoi: avgRoi,
        });
      }
      setLoading(false);
    });
  }, []);

  return (
    <section id="method" className="relative z-10 max-w-5xl mx-auto px-5 mb-24 scroll-mt-20">
      {/* Header */}
      <div className="text-center mb-12">
        <h2 className="text-3xl sm:text-4xl font-black text-white mb-3">
          The Shark Method{" "}
          <span className="inline-block animate-pulse">&#x1F988;</span>
        </h2>
        <p className="text-lg text-cyan-400 font-semibold mb-2">Follow the units. Track the gains.</p>
        <p className="text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed">
          The Shark Method is Sharkline&apos;s transparent betting system. Set your unit value,
          follow every pick exactly as posted, and watch your balance grow &mdash; tracked in real time.
        </p>
      </div>

      {/* 3-Step Cards */}
      <div className="grid sm:grid-cols-3 gap-5 mb-12">
        <StepCard
          step={1}
          icon="&#x1F4B0;"
          title="Set Your Unit"
          desc="Choose a unit value that fits your budget ($1, $5, $10, $50). Your starting bankroll = 100 units. Never risk what you can't afford."
          color="cyan"
        />
        <StepCard
          step={2}
          icon="&#x1F3AF;"
          title="Follow Every Pick"
          desc="Each pick comes with an exact stake (1, 1.5, or 2 units). Copy what we post &mdash; same pick, same stake. No guessing."
          color="indigo"
        />
        <StepCard
          step={3}
          icon="&#x1F4C8;"
          title="Track Your Growth"
          desc="Your balance updates automatically after every result. Check your monthly P&amp;L anytime. Full transparency, no hidden losses."
          color="emerald"
        />
      </div>

      {/* Live Stats Panel */}
      {!loading && methodStats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-10">
          <StatBox label="Starting" value="100u" color="text-slate-300" />
          <StatBox
            label="Current"
            value={`${methodStats.currentBalance.toFixed(1)}u`}
            color={methodStats.currentBalance >= 100 ? "text-[#00ff88]" : "text-[#ff4466]"}
          />
          <StatBox label="Total Picks" value={methodStats.totalPicks > 0 ? String(methodStats.totalPicks) : "--"} color="text-cyan-300" />
          <StatBox
            label="Win Rate"
            value={methodStats.winRate > 0 ? `${methodStats.winRate}%` : "--"}
            color="text-cyan-400"
          />
          <StatBox
            label="Avg Monthly"
            value={methodStats.monthlyRoi > 0 ? `+${methodStats.monthlyRoi}u` : "--"}
            color="text-[#00ff88]"
          />
        </div>
      )}

      {/* Monthly Breakdown Table */}
      {!loading && months.length > 0 && (
        <div className="rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden mb-10">
          <div className="px-5 py-4 border-b border-white/[0.06]">
            <h3 className="font-bold text-sm text-slate-300">Monthly Breakdown</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-500 uppercase tracking-wider">
                  <th className="px-5 py-3 text-left font-semibold">Month</th>
                  <th className="px-3 py-3 text-center font-semibold">Picks</th>
                  <th className="px-3 py-3 text-center font-semibold">W</th>
                  <th className="px-3 py-3 text-center font-semibold">L</th>
                  <th className="px-3 py-3 text-center font-semibold">Units +/-</th>
                  <th className="px-3 py-3 text-center font-semibold">Balance</th>
                  <th className="px-5 py-3 text-right font-semibold">ROI %</th>
                </tr>
              </thead>
              <tbody>
                {months.map((row) => (
                  <tr key={row.month} className="border-t border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-left font-semibold text-slate-200">{formatMonth(row.month)}</td>
                    <td className="px-3 py-3 text-center text-slate-400">{row.picks}</td>
                    <td className="px-3 py-3 text-center text-[#00ff88]">{row.wins}</td>
                    <td className="px-3 py-3 text-center text-[#ff4466]">{row.losses}</td>
                    <td className={`px-3 py-3 text-center font-bold ${row.units >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                      {row.units >= 0 ? "+" : ""}{row.units.toFixed(1)}
                    </td>
                    <td className="px-3 py-3 text-center text-slate-300 font-mono">{row.balance.toFixed(1)}</td>
                    <td className={`px-5 py-3 text-right font-bold ${row.roi >= 0 ? "text-[#00ff88]" : "text-[#ff4466]"}`}>
                      {row.roi >= 0 ? "+" : ""}{row.roi}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <a
          href={TELEGRAM_FREE}
          target="_blank"
          rel="noopener noreferrer"
          className="px-8 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-2xl text-lg font-bold text-center hover:shadow-2xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300"
        >
          Follow Free on Telegram
        </a>
        <a
          href="/method"
          className="px-8 py-4 bg-white/[0.06] backdrop-blur-sm text-cyan-400 rounded-2xl text-lg font-semibold border border-cyan-500/30 text-center hover:bg-cyan-500/10 hover:border-cyan-500/50 transition-all duration-300"
        >
          See the Full Method &rarr;
        </a>
      </div>
    </section>
  );
}

function StepCard({ step, icon, title, desc, color }: {
  step: number; icon: string; title: string; desc: string; color: string;
}) {
  const accents: Record<string, { border: string; num: string; glow: string }> = {
    cyan: { border: "border-t-cyan-500/60", num: "text-cyan-400", glow: "from-cyan-500/5 to-transparent" },
    indigo: { border: "border-t-indigo-500/60", num: "text-indigo-400", glow: "from-indigo-500/5 to-transparent" },
    emerald: { border: "border-t-emerald-500/60", num: "text-emerald-400", glow: "from-emerald-500/5 to-transparent" },
  };
  const a = accents[color] ?? accents.cyan;

  return (
    <div className={`relative p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] border-t-2 ${a.border} hover:bg-white/[0.04] transition-all duration-300 overflow-hidden`}>
      <div className={`absolute inset-0 bg-gradient-to-b ${a.glow} pointer-events-none`} />
      <div className="relative">
        <div className={`text-[10px] font-bold ${a.num} uppercase tracking-widest mb-3`}>Step {step}</div>
        <div className="text-2xl mb-3" dangerouslySetInnerHTML={{ __html: icon }} />
        <h3 className="font-bold text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center">
      <div className={`text-xl sm:text-2xl font-black ${color}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-1 font-medium uppercase tracking-wider">{label}</div>
    </div>
  );
}
