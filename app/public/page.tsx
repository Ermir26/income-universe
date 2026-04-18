"use client";

import { useEffect, useState, FormEvent } from "react";
import dynamic from "next/dynamic";

const BankrollChart = dynamic(() => import("./BankrollChart"), { ssr: false });
const SportChart = dynamic(() => import("./SportChart"), { ssr: false });
const MonthlyChart = dynamic(() => import("./MonthlyChart"), { ssr: false });

// ─── Types ───

interface Interlocks {
  graded_picks: number;
  graded_ok: boolean;
  chain_coverage: number;
  chain_ok: boolean;
  last_30_win_rate: number;
  last_30_ok: boolean;
  reveal_ready: boolean;
}

interface Stats {
  total: number;
  wins: number;
  losses: number;
  pushes: number;
  win_rate: number | null;
  roi: number | null;
  current_streak: number | null;
  units_profit: number | null;
  best_sport: { sport: string; win_rate: number; picks: number } | null;
  by_sport: Array<{
    sport: string;
    picks: number;
    wins: number;
    losses: number;
    win_rate: number;
    roi: number;
    units_pl: number;
  }>;
  interlocks?: Interlocks;
}

interface Pick {
  id: string;
  sport: string;
  sport_key: string;
  league: string;
  game: string;
  pick: string;
  odds: string;
  tier: string;
  stake: number;
  confidence: number;
  result: string;
  actual_result: string;
  settled_at: string;
  created_at: string;
  tx_hash: string | null;
  verified: boolean;
}

interface BankrollEntry {
  balance: number;
  date: string;
}

interface MonthlyPL {
  month: string;
  profit: number;
  units: number;
}

const SPORT_EMOJI: Record<string, string> = {
  NBA: "🏀", NFL: "🏈", NHL: "🏒", MLB: "⚾", MMA: "🥊",
  "Premier League": "⚽", EPL: "⚽", "La Liga": "⚽",
  "Serie A": "⚽", Bundesliga: "⚽", "Ligue 1": "⚽",
  "Champions League": "⚽", MLS: "⚽", Euroleague: "🏀",
};

const TIER_STYLE: Record<string, { emoji: string; cls: string }> = {
  VALUE: { emoji: "✅", cls: "text-emerald-400 bg-emerald-500/15 border-emerald-500/30" },
  "STRONG VALUE": { emoji: "🔥", cls: "text-orange-400 bg-orange-500/15 border-orange-500/30" },
  MAXIMUM: { emoji: "💎", cls: "text-purple-400 bg-purple-500/15 border-purple-500/30" },
};

const TG_LINK = "https://t.me/SharklineFree";

// ─── Page ───

const DASHBOARD_THRESHOLD = 50;

export default function PublicDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [bankroll, setBankroll] = useState<BankrollEntry[]>([]);
  const [monthlyPL, setMonthlyPL] = useState<MonthlyPL[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [wlStatus, setWlStatus] = useState<"idle" | "loading" | "done" | "error">("idle");

  useEffect(() => {
    Promise.all([
      fetch("/api/tipster/public/stats").then((r) => r.json()),
      fetch("/api/tipster/public/picks").then((r) => r.json()),
      fetch("/api/tipster/public/bankroll").then((r) => r.json()),
    ])
      .then(([s, p, b]) => {
        setStats(s);
        setPicks(p.picks ?? []);
        setBankroll(b.bankroll ?? []);
        setMonthlyPL(b.monthly_pl ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Safety interlocks: reveal only when ALL conditions are met
  const interlocks = stats?.interlocks;
  const revealReady = interlocks?.reveal_ready ?? false;

  if (!loading && !revealReady) {
    return <TeaserPage settledCount={interlocks?.graded_picks ?? 0} email={email} setEmail={setEmail} wlStatus={wlStatus} setWlStatus={setWlStatus} />;
  }

  async function submitWaitlist(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setWlStatus("loading");
    try {
      const r = await fetch("/api/tipster/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "public_dashboard" }),
      });
      setWlStatus(r.ok ? "done" : "error");
    } catch {
      setWlStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#080814] text-slate-200 antialiased">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08)_0%,_transparent_50%)] pointer-events-none" />

      {/* ═══ HERO ═══ */}
      <section className="relative text-center px-5 pt-14 pb-10 max-w-3xl mx-auto">
        <div className="text-4xl mb-2">⚡</div>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight bg-gradient-to-r from-indigo-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent leading-tight mb-2">
          Sharkline
        </h1>
        <p className="text-base sm:text-lg text-slate-400 mb-1">
          The World&apos;s Most Transparent Sports Tipster
        </p>
        <p className="text-sm text-slate-500 mb-2">
          Every pick tracked. Every result verified. Full analysis on every game.
        </p>
        <p className="text-xs text-slate-600 mb-6">
          🔗 Every pick is hashed and timestamped on Polygon before kickoff
        </p>
        <a
          href={TG_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-7 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-lg shadow-indigo-500/20"
        >
          Join Free Channel →
        </a>
      </section>

      {/* ═══ LIVE STATS BAR ═══ */}
      <section className="relative max-w-3xl mx-auto mb-10 px-5">
        {loading ? (
          <div className="text-center text-slate-500 py-6">Loading...</div>
        ) : stats && stats.total > 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <Stat label="Total Picks" value={String(stats.total)} />
            <Stat label="Wins" value={String(stats.wins)} hl />
            <Stat label="Win Rate" value={stats.win_rate ? `${stats.win_rate}%` : "Tracking..."} hl={!!stats.win_rate} />
            <Stat label="ROI" value={stats.roi ? `+${stats.roi}%` : "Tracking..."} hl={!!stats.roi} />
            <Stat label="Units P/L" value={stats.units_profit ? `+${stats.units_profit}u` : "—"} hl={!!stats.units_profit} />
            <Stat label="Streak" value={stats.current_streak ? `🔥 ${stats.current_streak}` : "—"} hl={!!stats.current_streak} />
          </div>
        ) : (
          <div className="text-center py-6 bg-indigo-500/10 rounded-2xl border border-indigo-500/15">
            <p className="text-slate-400">Picks dropping daily. Join to follow along.</p>
          </div>
        )}
      </section>

      {/* ═══ RECENT RESULTS ═══ */}
      {picks.length > 0 && (
        <section className="relative max-w-3xl mx-auto mb-10 px-5">
          <h2 className="text-xl font-bold mb-4 text-slate-100">Recent Results</h2>
          <div className="flex flex-col gap-1.5">
            {picks.slice(0, 20).map((p) => {
              const tier = TIER_STYLE[p.tier] ?? TIER_STYLE.VALUE;
              const isWin = p.result === "won";
              const isLoss = p.result === "lost";
              const rowBg = isWin
                ? "bg-emerald-500/5 border-emerald-500/15"
                : isLoss
                  ? "bg-red-500/5 border-red-500/15"
                  : "bg-white/[0.02] border-white/[0.06]";
              const resultText = isWin ? "✅ WON" : isLoss ? "❌ LOST" : "➖ PUSH";
              const resultColor = isWin ? "text-emerald-400" : isLoss ? "text-red-400" : "text-slate-400";
              const time = p.settled_at
                ? new Date(p.settled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "";

              return (
                <a
                  key={p.id}
                  href={`/public/pick/${p.id}`}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-xl border ${rowBg} hover:bg-white/[0.04] transition-colors`}
                >
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <span className="text-base shrink-0">{SPORT_EMOJI[p.sport] ?? "🏅"}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{p.game}</div>
                      <div className="text-slate-400 text-xs flex items-center gap-1.5">
                        <span>{p.pick} ({p.odds})</span>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${tier.cls}`}>
                          {tier.emoji} {p.tier}
                        </span>
                        {p.tx_hash && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold border text-emerald-400 bg-emerald-500/15 border-emerald-500/30">
                            🔗
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-2">
                    <div className={`font-bold text-sm ${resultColor}`}>{resultText}</div>
                    <div className="text-[10px] text-slate-500">{time}</div>
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ CHARTS ═══ */}
      {(bankroll.length > 0 || (stats?.by_sport && stats.by_sport.length > 0)) && (
        <section className="relative max-w-3xl mx-auto mb-10 px-5">
          <h2 className="text-xl font-bold mb-4 text-slate-100">Performance</h2>
          <div className="grid gap-4">
            {bankroll.length > 2 && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Bankroll Growth</h3>
                <BankrollChart data={bankroll} />
              </div>
            )}
            {stats?.by_sport && stats.by_sport.length > 1 && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Win Rate by Sport</h3>
                <SportChart data={stats.by_sport} />
              </div>
            )}
            {monthlyPL.length > 0 && (
              <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-3">Monthly P&L</h3>
                <MonthlyChart data={monthlyPL} />
              </div>
            )}
          </div>
        </section>
      )}

      {/* ═══ SPORT BREAKDOWN TABLE ═══ */}
      {stats?.by_sport && stats.by_sport.length > 0 && (
        <section className="relative max-w-3xl mx-auto mb-10 px-5">
          <h2 className="text-xl font-bold mb-4 text-slate-100">Sport Breakdown</h2>
          <div className="overflow-x-auto rounded-2xl border border-white/[0.06]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06] text-slate-400 text-xs">
                  <th className="text-left px-3 py-2.5 font-medium">Sport</th>
                  <th className="text-center px-2 py-2.5 font-medium">Picks</th>
                  <th className="text-center px-2 py-2.5 font-medium">W</th>
                  <th className="text-center px-2 py-2.5 font-medium">L</th>
                  <th className="text-center px-2 py-2.5 font-medium">Win%</th>
                  <th className="text-center px-2 py-2.5 font-medium">ROI</th>
                  <th className="text-right px-3 py-2.5 font-medium">Units</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_sport.map((s) => (
                  <tr key={s.sport} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 font-medium">
                      {SPORT_EMOJI[s.sport] ?? "🏅"} {s.sport}
                    </td>
                    <td className="text-center px-2 py-2.5 text-slate-400">{s.picks}</td>
                    <td className="text-center px-2 py-2.5 text-emerald-400">{s.wins}</td>
                    <td className="text-center px-2 py-2.5 text-red-400">{s.losses}</td>
                    <td className="text-center px-2 py-2.5">{s.win_rate}%</td>
                    <td className={`text-center px-2 py-2.5 ${s.roi >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {s.roi >= 0 ? "+" : ""}{s.roi}%
                    </td>
                    <td className={`text-right px-3 py-2.5 font-semibold ${s.units_pl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {s.units_pl >= 0 ? "+" : ""}{s.units_pl}u
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ═══ PRICING ═══ */}
      <PricingSection onNotify={submitWaitlistDirect} />

      {/* ═══ WAITLIST ═══ */}
      <section className="relative max-w-md mx-auto mb-10 px-5">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 text-center">
          <h3 className="font-bold text-base mb-1">Get Notified When VIP Launches</h3>
          <p className="text-xs text-slate-400 mb-3">Early subscribers get a discount.</p>
          {wlStatus === "done" ? (
            <p className="py-2 text-emerald-400 font-semibold">✅ You&apos;re on the list!</p>
          ) : (
            <form onSubmit={submitWaitlist} className="flex gap-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" required
                className="flex-1 px-3 py-2 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50" />
              <button type="submit" disabled={wlStatus === "loading"}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">
                {wlStatus === "loading" ? "..." : "Notify Me"}
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="text-center py-6 border-t border-white/5 text-slate-500 text-sm px-5">
        <p className="mb-1">🦈 Sharkline — sharkline.ai</p>
        <div className="flex gap-3 justify-center mb-2">
          <a href={TG_LINK} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:underline">Telegram</a>
        </div>
        <p className="text-xs text-slate-600">
          Gamble responsibly. 18+ (21+ in some jurisdictions). Past performance does not guarantee future results.
        </p>
      </footer>
    </div>
  );

  async function submitWaitlistDirect(emailVal: string) {
    setEmail(emailVal);
    setWlStatus("loading");
    try {
      const r = await fetch("/api/tipster/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, source: "public_pricing" }),
      });
      setWlStatus(r.ok ? "done" : "error");
    } catch {
      setWlStatus("error");
    }
  }
}

// ─── Teaser Page (< 50 picks) ───

function TeaserPage({ settledCount, email, setEmail, wlStatus, setWlStatus }: {
  settledCount: number; email: string; setEmail: (v: string) => void;
  wlStatus: "idle" | "loading" | "done" | "error"; setWlStatus: (v: "idle" | "loading" | "done" | "error") => void;
}) {
  const pct = Math.min(100, Math.round((settledCount / DASHBOARD_THRESHOLD) * 100));

  async function submitWaitlist(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setWlStatus("loading");
    try {
      const r = await fetch("/api/tipster/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "teaser_page" }),
      });
      setWlStatus(r.ok ? "done" : "error");
    } catch {
      setWlStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[#080814] text-slate-200 antialiased flex flex-col items-center justify-center px-5">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08)_0%,_transparent_50%)] pointer-events-none" />
      <div className="relative max-w-md w-full text-center">
        <div className="text-4xl mb-3">⚡</div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight bg-gradient-to-r from-indigo-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent leading-tight mb-2">
          Sharkline
        </h1>
        <p className="text-lg text-slate-300 font-semibold mb-1">Building Our Verified Record</p>
        <p className="text-sm text-slate-500 mb-8">
          Every pick blockchain-timestamped before kickoff. Full transparent dashboard launches after {DASHBOARD_THRESHOLD} verified picks.
        </p>

        {/* Progress bar */}
        <div className="mb-8">
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>{settledCount} picks verified</span>
            <span>{DASHBOARD_THRESHOLD} target</span>
          </div>
          <div className="w-full h-3 bg-white/[0.06] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-500 mt-1.5">{pct}% complete</p>
        </div>

        {/* Waitlist */}
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 mb-6">
          <h3 className="font-bold text-sm mb-1">Get Notified When Dashboard Launches</h3>
          <p className="text-xs text-slate-400 mb-3">Early subscribers get a discount on VIP.</p>
          {wlStatus === "done" ? (
            <p className="py-2 text-emerald-400 font-semibold">You&apos;re on the list!</p>
          ) : (
            <form onSubmit={submitWaitlist} className="flex gap-2">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" required
                className="flex-1 px-3 py-2 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50" />
              <button type="submit" disabled={wlStatus === "loading"}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50">
                {wlStatus === "loading" ? "..." : "Notify Me"}
              </button>
            </form>
          )}
        </div>

        {/* CTA */}
        <a
          href={TG_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-7 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-lg shadow-indigo-500/20 mb-6"
        >
          Join Free Channel →
        </a>

        <footer className="text-slate-600 text-xs mt-4">
          <p>🦈 Sharkline — sharkline.ai</p>
          <p className="mt-1">Gamble responsibly. 18+ (21+ in some jurisdictions).</p>
        </footer>
      </div>
    </div>
  );
}

// ─── Pricing Section with Annual Toggle ───

const PRICING = {
  singleSport: { monthly: 19, annual: 149, savings: 79 },
  threeSports: { monthly: 39, annual: 349, savings: 119 },
  allSports: { monthly: 69, annual: 499, savings: 329 },
};

function PricingSection({ onNotify }: { onNotify: (email: string) => void }) {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="relative max-w-3xl mx-auto mb-10 px-5 scroll-mt-16">
      <h2 className="text-2xl font-bold mb-3 text-center text-slate-100">VIP Packages</h2>

      {/* Toggle */}
      <div className="flex items-center justify-center gap-3 mb-6">
        <span className={`text-sm ${!annual ? "text-slate-100 font-semibold" : "text-slate-500"}`}>Monthly</span>
        <button
          onClick={() => setAnnual(!annual)}
          className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-indigo-600" : "bg-slate-700"}`}
        >
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${annual ? "translate-x-[26px]" : "translate-x-0.5"}`} />
        </button>
        <span className={`text-sm ${annual ? "text-slate-100 font-semibold" : "text-slate-500"}`}>Annual</span>
        {annual && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">SAVE MORE</span>}
      </div>

      <div className="grid sm:grid-cols-3 gap-3">
        <PriceCard name="Single Sport" icon="🏀" desc="Pick any one sport"
          price={annual ? PRICING.singleSport.annual : PRICING.singleSport.monthly}
          period={annual ? "/yr" : "/mo"}
          savings={annual ? PRICING.singleSport.savings : undefined}
          features={["All picks for your sport", "Full analysis cards", "Blockchain verification", "Private VIP channel"]}
          onNotify={onNotify} />
        <PriceCard name="3 Sports" icon="⚽🏒🏀" desc="Pick any three sports"
          price={annual ? PRICING.threeSports.annual : PRICING.threeSports.monthly}
          period={annual ? "/yr" : "/mo"} featured badge="BEST VALUE"
          savings={annual ? PRICING.threeSports.savings : undefined}
          features={["All picks for 3 sports", "Full analysis cards", "Blockchain verification", "Private VIP channel", "Priority support"]}
          onNotify={onNotify} />
        <PriceCard name="All Sports Pass" icon="🌍" desc="Every sport, every pick"
          price={annual ? PRICING.allSports.annual : PRICING.allSports.monthly}
          period={annual ? "/yr" : "/mo"} amber
          savings={annual ? PRICING.allSports.savings : undefined}
          features={["ALL sports, ALL picks", "Full analysis cards", "Blockchain verification", "MAXIMUM plays first", "Priority support"]}
          onNotify={onNotify} />
      </div>
    </section>
  );
}

// ─── Small components ───

function Stat({ label, value, hl = false }: { label: string; value: string; hl?: boolean }) {
  return (
    <div className={`px-2.5 py-3 rounded-xl text-center border ${hl ? "bg-indigo-500/10 border-indigo-500/20" : "bg-white/[0.02] border-white/[0.05]"}`}>
      <div className={`text-lg sm:text-xl font-extrabold ${hl ? "text-indigo-300" : "text-slate-100"}`}>{value}</div>
      <div className="text-[10px] text-slate-500 mt-0.5">{label}</div>
    </div>
  );
}

function PriceCard({ name, icon, desc, price, period, features, featured, badge, amber, savings, onNotify }: {
  name: string; icon: string; desc: string; price: number; period: string; features: string[];
  featured?: boolean; badge?: string; amber?: boolean; savings?: number;
  onNotify: (email: string) => void;
}) {
  const [cardEmail, setCardEmail] = useState("");
  const [show, setShow] = useState(false);
  const border = featured ? "border-2 border-indigo-500/50" : amber ? "border border-amber-500/30" : "border border-slate-700";
  const bg = featured ? "bg-gradient-to-b from-indigo-900/30 to-slate-900/80" : "bg-slate-900/80";
  const pc = featured ? "text-indigo-300" : amber ? "text-amber-300" : "text-slate-100";
  const nc = amber ? "text-amber-300" : "text-slate-100";

  return (
    <div className={`${bg} ${border} rounded-2xl p-5 text-center relative`}>
      {badge && <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full">{badge}</div>}
      <div className="text-2xl mb-1">{icon}</div>
      <h3 className={`text-base font-bold ${nc} mb-0.5`}>{name}</h3>
      <p className="text-xs text-slate-400 mb-3">{desc}</p>
      <div className={`text-2xl font-extrabold ${pc} mb-1`}>${price}<span className="text-xs font-normal text-slate-400">{period}</span></div>
      {savings && <div className="text-[10px] text-emerald-400 font-bold mb-1">Save ${savings}/year</div>}
      <ul className="text-left text-xs text-slate-300 mt-3 space-y-1.5">
        {features.map((f) => <li key={f}>✅ {f}</li>)}
      </ul>
      {show ? (
        <div className="mt-3 flex gap-1">
          <input type="email" value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="your@email.com"
            className="flex-1 px-2.5 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none" />
          <button onClick={() => onNotify(cardEmail)} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Go</button>
        </div>
      ) : (
        <button onClick={() => setShow(true)}
          className={`mt-4 w-full py-2 rounded-xl font-semibold text-xs border ${featured ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/30" : amber ? "bg-amber-700/20 text-amber-300 border-amber-500/30" : "bg-slate-700/50 text-slate-300 border-slate-600"}`}>
          Notify Me — Coming Soon
        </button>
      )}
    </div>
  );
}
