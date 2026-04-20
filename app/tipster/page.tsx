"use client";

import { useEffect, useState, FormEvent } from "react";

// ─── Types ───

interface Stats {
  total_picks: number;
  wins: number;
  win_rate: number | null;
  roi: number | null;
  current_streak: number | null;
  best_streak: number | null;
  best_sport: { sport: string; win_rate: number; wins: number } | null;
  by_sport: Record<string, { wins: number; total: number; win_rate: number }>;
  by_tier: Record<string, { wins: number; total: number; win_rate: number }>;
  message: string | null;
}

interface Winner {
  sport: string;
  sport_key: string;
  league: string;
  game: string;
  pick: string;
  odds: string;
  tier: string;
  settled_at: string;
}

const SPORT_EMOJIS: Record<string, string> = {
  NBA: "🏀", NFL: "🏈", NHL: "🏒", MLB: "⚾", MMA: "🥊",
  "Premier League": "⚽", EPL: "⚽", "La Liga": "⚽",
  "Serie A": "⚽", Bundesliga: "⚽", "Ligue 1": "⚽",
  "Champions League": "⚽", MLS: "⚽", Euroleague: "🏀",
  "ATP French Open": "🎾", "ATP Wimbledon": "🎾",
  "WTA French Open": "🎾", "WTA Wimbledon": "🎾",
};

const TIER_CONFIG: Record<string, { emoji: string; color: string }> = {
  VALUE: { emoji: "✅", color: "text-emerald-400" },
  "STRONG VALUE": { emoji: "🔥", color: "text-orange-400" },
  MAXIMUM: { emoji: "💎", color: "text-purple-400" },
};

const TELEGRAM_LINK = "https://t.me/SharklineFree";

// ─── Component ───

export default function TipsterLanding() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/tipster/stats").then((r) => r.json()),
      fetch("/api/tipster/winners").then((r) => r.json()),
    ])
      .then(([statsData, winnersData]) => {
        setStats(statsData);
        setWinners(winnersData.winners ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleWaitlist(e: FormEvent) {
    e.preventDefault();
    if (!email) return;
    setWaitlistStatus("loading");
    try {
      const res = await fetch("/api/tipster/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sport_interest: selectedSports }),
      });
      if (res.ok) setWaitlistStatus("done");
      else setWaitlistStatus("error");
    } catch {
      setWaitlistStatus("error");
    }
  }

  function toggleSport(sport: string) {
    setSelectedSports((prev) =>
      prev.includes(sport) ? prev.filter((s) => s !== sport) : [...prev, sport],
    );
  }

  return (
    <div className="min-h-screen bg-[#080814] text-slate-200 antialiased">
      {/* Gradient overlays */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.12)_0%,_transparent_50%)] pointer-events-none" />
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_rgba(16,185,129,0.06)_0%,_transparent_50%)] pointer-events-none" />

      {/* ═══ HERO ═══ */}
      <section className="relative text-center px-5 pt-16 pb-12 max-w-3xl mx-auto">
        <div className="text-5xl mb-3">⚡</div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight bg-gradient-to-r from-indigo-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent leading-tight mb-3">
          Sharkline
        </h1>
        <p className="text-lg sm:text-xl text-slate-400 mb-6 leading-relaxed max-w-lg mx-auto">
          Sports predictions that actually win.
          <br />
          Real odds. Real results. Real profit.
        </p>

        {/* Live badges */}
        {!loading && stats && (
          <div className="flex flex-wrap gap-2 justify-center mb-8">
            {stats.win_rate && (
              <span className="px-3 py-1.5 bg-emerald-500/15 border border-emerald-500/30 rounded-full text-sm font-semibold text-emerald-400">
                {stats.win_rate}% Win Rate
              </span>
            )}
            {stats.current_streak && stats.current_streak >= 3 && (
              <span className="px-3 py-1.5 bg-orange-500/15 border border-orange-500/30 rounded-full text-sm font-semibold text-orange-400">
                🔥 {stats.current_streak} Win Streak
              </span>
            )}
            {stats.roi && (
              <span className="px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/30 rounded-full text-sm font-semibold text-indigo-400">
                +{stats.roi}% ROI
              </span>
            )}
          </div>
        )}

        <div className="flex gap-3 justify-center flex-wrap">
          <a
            href={TELEGRAM_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-3.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl text-lg font-bold hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-lg shadow-indigo-500/20"
          >
            Join Free Channel
          </a>
          <a
            href="#pricing"
            className="px-8 py-3.5 bg-white/[0.06] text-slate-300 rounded-xl text-lg font-semibold border border-white/10 hover:bg-white/[0.1] transition-colors"
          >
            See Pricing
          </a>
        </div>
      </section>

      {/* ═══ LIVE STATS BAR ═══ */}
      <section className="relative max-w-2xl mx-auto mb-14 px-5">
        {loading ? (
          <div className="text-center text-slate-500 py-8">Loading stats...</div>
        ) : stats && stats.total_picks > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total Picks" value={String(stats.total_picks)} />
            <StatCard
              label="Win Rate"
              value={stats.win_rate ? `${stats.win_rate}%` : "Tracking..."}
              highlight={!!stats.win_rate}
            />
            {stats.current_streak && stats.current_streak >= 2 ? (
              <StatCard label="Win Streak" value={`🔥 ${stats.current_streak}`} highlight />
            ) : (
              <StatCard label="Verified Wins" value={`✅ ${stats.wins}`} highlight />
            )}
            {stats.roi ? (
              <StatCard label="ROI" value={`+${stats.roi}%`} highlight />
            ) : stats.best_sport ? (
              <StatCard
                label="Best Sport"
                value={`${SPORT_EMOJIS[stats.best_sport.sport] ?? "🏅"} ${stats.best_sport.win_rate}%`}
              />
            ) : (
              <StatCard label="Verified Wins" value={`✅ ${stats.wins}`} />
            )}
          </div>
        ) : (
          <div className="text-center py-8 bg-indigo-500/10 rounded-2xl border border-indigo-500/20">
            <p className="text-lg text-slate-400">
              Picks dropping daily. Join to follow along.
            </p>
          </div>
        )}
      </section>

      {/* ═══ WINNING SPORTS ═══ */}
      {stats && Object.keys(stats.by_sport).length > 0 && (
        <section className="relative max-w-2xl mx-auto mb-14 px-5">
          <h2 className="text-center text-xl font-bold mb-5 text-slate-100">
            Sports We Dominate
          </h2>
          <div className="flex flex-wrap gap-2.5 justify-center">
            {Object.entries(stats.by_sport).map(([sport, r]) => (
              <div
                key={sport}
                className="px-4 py-2.5 bg-emerald-500/8 border border-emerald-500/25 rounded-xl text-center"
              >
                <span className="text-lg mr-1.5">{SPORT_EMOJIS[sport] ?? "🏅"}</span>
                <span className="font-bold text-sm">{sport}</span>
                <span className="text-emerald-400 font-semibold text-sm ml-2">
                  {r.wins}W ({r.win_rate}%)
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ═══ RECENT WINNERS ═══ */}
      {winners.length > 0 && (
        <section className="relative max-w-2xl mx-auto mb-14 px-5">
          <h2 className="text-center text-xl font-bold mb-5 text-slate-100">
            Recent Winners
          </h2>
          <div className="flex flex-col gap-2">
            {winners.slice(0, 10).map((w, i) => {
              const tierCfg = TIER_CONFIG[w.tier] ?? TIER_CONFIG.VALUE;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className="text-lg shrink-0">
                      {SPORT_EMOJIS[w.sport] ?? SPORT_EMOJIS[w.league] ?? "🏅"}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{w.game}</div>
                      <div className="text-slate-400 text-xs flex items-center gap-2">
                        <span>{w.pick} ({w.odds})</span>
                        <span className={`${tierCfg.color} font-semibold`}>
                          {tierCfg.emoji} {w.tier}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="text-emerald-400 font-bold text-sm shrink-0 ml-3">
                    ✅ WON
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ═══ HOW IT WORKS ═══ */}
      <section className="relative max-w-2xl mx-auto mb-14 px-5">
        <h2 className="text-center text-xl font-bold mb-8 text-slate-100">
          How It Works
        </h2>
        <div className="grid sm:grid-cols-3 gap-6 text-center">
          <Step
            icon="📲"
            title="Join the Channel"
            desc="Free picks every day. No signup, no payment required."
          />
          <Step
            icon="📊"
            title="Follow the Picks"
            desc="Each pick has full analysis, odds, and confidence tier."
          />
          <Step
            icon="💰"
            title="Win Money"
            desc="Upgrade to unlock all sports and MAXIMUM confidence plays."
          />
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <LandingPricingSection onNotify={(e: string, tier: string) => {
        setEmail(e);
        setSelectedSports([tier]);
        handleWaitlistDirect(e, [tier]);
      }} />

      {/* ═══ WAITLIST FORM ═══ */}
      <section className="relative max-w-md mx-auto mb-14 px-5">
        <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 text-center">
          <h3 className="font-bold text-lg mb-2">Get Notified When VIP Launches</h3>
          <p className="text-sm text-slate-400 mb-4">
            Be first in line. Early subscribers get a discount.
          </p>

          {waitlistStatus === "done" ? (
            <div className="py-3 text-emerald-400 font-semibold">
              ✅ You&apos;re on the list!
            </div>
          ) : (
            <form onSubmit={handleWaitlist} className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                className="flex-1 px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
              />
              <button
                type="submit"
                disabled={waitlistStatus === "loading"}
                className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-500 transition-colors disabled:opacity-50"
              >
                {waitlistStatus === "loading" ? "..." : "Notify Me"}
              </button>
            </form>
          )}
          {waitlistStatus === "error" && (
            <p className="text-red-400 text-sm mt-2">Something went wrong. Try again.</p>
          )}

          {/* Sport interest pills */}
          <div className="flex flex-wrap gap-2 justify-center mt-4">
            {["NBA", "NFL", "NHL", "MLB", "Soccer", "Tennis", "MMA"].map((sport) => (
              <button
                key={sport}
                type="button"
                onClick={() => toggleSport(sport)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedSports.includes(sport)
                    ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300"
                    : "bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20"
                }`}
              >
                {SPORT_EMOJIS[sport] ?? "🏅"} {sport}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ SOCIAL PROOF ═══ */}
      <section className="relative max-w-xl mx-auto mb-14 px-5 text-center">
        <div className="bg-gradient-to-r from-indigo-500/10 to-emerald-500/10 border border-indigo-500/15 rounded-2xl py-8 px-6">
          <p className="text-2xl font-bold text-slate-100 mb-2">
            Join the movement
          </p>
          <p className="text-slate-400">
            Free picks daily. Verified results. No fluff.
          </p>
          <a
            href={TELEGRAM_LINK}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-5 px-8 py-3 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold hover:scale-[1.03] active:scale-[0.98] transition-transform shadow-lg shadow-indigo-500/20"
          >
            Join Free on Telegram
          </a>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="text-center py-8 border-t border-white/5 text-slate-500 text-sm px-5">
        <p className="mb-1">🦈 Sharkline — sharkline.ai</p>
        <p className="text-xs text-slate-600">
          Gamble responsibly. Past performance does not guarantee future results.
          <br />
          Must be 18+ (21+ in some jurisdictions). If you have a gambling problem, call 1-800-GAMBLER.
        </p>
      </footer>
    </div>
  );

  async function handleWaitlistDirect(emailVal: string, sports: string[]) {
    if (!emailVal) return;
    setWaitlistStatus("loading");
    try {
      const res = await fetch("/api/tipster/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailVal, sport_interest: sports }),
      });
      if (res.ok) setWaitlistStatus("done");
      else setWaitlistStatus("error");
    } catch {
      setWaitlistStatus("error");
    }
  }
}

// ─── Sub-components ───

function StatCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`px-4 py-4 rounded-2xl text-center border ${
        highlight
          ? "bg-indigo-500/10 border-indigo-500/25"
          : "bg-white/[0.03] border-white/[0.06]"
      }`}
    >
      <div
        className={`text-xl sm:text-2xl font-extrabold ${
          highlight ? "text-indigo-300" : "text-slate-100"
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function Step({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: string;
  desc: string;
}) {
  return (
    <div>
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className="font-bold text-sm mb-1">{title}</h3>
      <p className="text-xs text-slate-400">{desc}</p>
    </div>
  );
}

function LandingPricingSection({ onNotify }: { onNotify: (email: string, tier: string) => void }) {
  return (
    <section id="pricing" className="relative max-w-3xl mx-auto mb-14 px-5 scroll-mt-20">
      <h2 className="text-center text-2xl font-bold mb-2 text-slate-100">Choose Your Edge</h2>
      <p className="text-center text-sm text-slate-400 mb-8">Weekend and weekly passes. No contracts.</p>

      <div className="grid sm:grid-cols-2 gap-5">
        {/* VIP */}
        <div className="rounded-2xl border border-slate-700 bg-slate-900/80 p-6">
          <div className="text-center mb-5">
            <div className="text-2xl mb-1">⚡</div>
            <h3 className="text-lg font-bold text-slate-100">VIP</h3>
            <p className="text-xs text-slate-400">All picks. Full analysis.</p>
          </div>
          <ul className="text-xs text-slate-300 space-y-1.5 mb-5">
            <li>✅ 8-10 daily picks across all sports</li>
            <li>✅ Full analysis with 17-dimension research</li>
            <li>✅ Confidence tiers and reasoning</li>
            <li>✅ Live score updates</li>
          </ul>
          <LandingPriceTier label="Weekend Pass" price={37} sub="One winning pick covers your pass" onNotify={(e) => onNotify(e, "vip-weekend")} />
          <LandingPriceTier label="Weekly Pass" price={67} sub="All sports. All picks. Full analysis." onNotify={(e) => onNotify(e, "vip-weekly")} />
        </div>

        {/* Method */}
        <div className="relative rounded-2xl border-2 border-cyan-500/40 bg-gradient-to-b from-cyan-900/20 to-slate-900/80 p-6">
          <div className="text-center mb-5">
            <div className="text-2xl mb-1">🦈</div>
            <h3 className="text-lg font-bold text-slate-100">Shark Method</h3>
            <p className="text-xs text-cyan-400">The complete system.</p>
          </div>
          <ul className="text-xs text-slate-300 space-y-1.5 mb-5">
            <li>✅ Everything in VIP</li>
            <li>✅ Curated top 2-3 picks (highest confidence)</li>
            <li>✅ Exact unit staking with every pick</li>
            <li>✅ Daily bankroll &amp; exposure tracking</li>
            <li>✅ Streak alerts &amp; system status</li>
            <li>✅ &ldquo;No edge&rdquo; days — bankroll protection</li>
            <li>✅ Sport ROI breakdown</li>
            <li>✅ Monthly performance reports</li>
          </ul>
          <LandingPriceTier label="Weekend Pass" price={67} sub="The full system for the weekend slate" onNotify={(e) => onNotify(e, "method-weekend")} />
          <LandingPriceTier label="Weekly Pass" price={117} sub="Elite access. Curated picks. Bankroll protection." badge="MOST POPULAR" onNotify={(e) => onNotify(e, "method-weekly")} />
        </div>
      </div>
    </section>
  );
}

function LandingPriceTier({ label, price, sub, badge, onNotify }: {
  label: string; price: number; sub: string; badge?: string;
  onNotify: (email: string) => void;
}) {
  const [cardEmail, setCardEmail] = useState("");
  const [showForm, setShowForm] = useState(false);

  return (
    <div className={`relative rounded-xl border ${badge ? "border-cyan-500/40 bg-cyan-500/5" : "border-white/[0.08] bg-white/[0.02]"} p-3 mb-3`}>
      {badge && <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-cyan-600 to-indigo-600 text-white text-[9px] font-bold px-2.5 py-0.5 rounded-full">{badge}</div>}
      <div className="flex items-center justify-between mb-0.5">
        <span className="text-xs font-semibold text-slate-300">{label}</span>
        <span className="text-xl font-black text-white">${price}</span>
      </div>
      <p className="text-[10px] text-slate-500 mb-2">{sub}</p>
      {showForm ? (
        <div className="flex gap-1">
          <input type="email" value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="your@email.com"
            className="flex-1 px-2.5 py-1.5 bg-white/[0.06] border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none" />
          <button onClick={() => onNotify(cardEmail)} className="px-2.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Go</button>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className="w-full py-2 rounded-lg font-semibold text-xs bg-slate-700/50 text-slate-300 border border-slate-600 hover:bg-slate-700 transition-colors">
          Join Waitlist
        </button>
      )}
    </div>
  );
}
