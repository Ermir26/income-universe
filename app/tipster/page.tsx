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

const LP = {
  singleSport: { monthly: 19, annual: 149, savings: 79 },
  threeSports: { monthly: 39, annual: 349, savings: 119 },
  allSports: { monthly: 69, annual: 499, savings: 329 },
};

function LandingPricingSection({ onNotify }: { onNotify: (email: string, tier: string) => void }) {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="relative max-w-3xl mx-auto mb-14 px-5 scroll-mt-20">
      <h2 className="text-center text-2xl font-bold mb-3 text-slate-100">VIP Packages</h2>
      <div className="flex items-center justify-center gap-3 mb-8">
        <span className={`text-sm ${!annual ? "text-slate-100 font-semibold" : "text-slate-500"}`}>Monthly</span>
        <button onClick={() => setAnnual(!annual)}
          className={`relative w-12 h-6 rounded-full transition-colors ${annual ? "bg-indigo-600" : "bg-slate-700"}`}>
          <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${annual ? "translate-x-[26px]" : "translate-x-0.5"}`} />
        </button>
        <span className={`text-sm ${annual ? "text-slate-100 font-semibold" : "text-slate-500"}`}>Annual</span>
        {annual && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold">SAVE MORE</span>}
      </div>
      <div className="grid sm:grid-cols-3 gap-4">
        <LandingPriceCard icon="🏀" name="Single Sport" desc="Pick any one sport"
          price={annual ? LP.singleSport.annual : LP.singleSport.monthly}
          period={annual ? "/yr" : "/mo"} savings={annual ? LP.singleSport.savings : undefined}
          features={["All picks for your sport", "Full analysis cards", "Blockchain verification", "Private VIP channel"]}
          onNotify={(e) => onNotify(e, "single")} />
        <LandingPriceCard icon="⚽🏒🏀" name="3 Sports" desc="Pick any three sports"
          price={annual ? LP.threeSports.annual : LP.threeSports.monthly}
          period={annual ? "/yr" : "/mo"} featured badge="BEST VALUE"
          savings={annual ? LP.threeSports.savings : undefined}
          features={["All picks for 3 sports", "Full analysis cards", "Blockchain verification", "Private VIP channel", "Priority support"]}
          onNotify={(e) => onNotify(e, "three")} />
        <LandingPriceCard icon="🌍" name="All Sports Pass" desc="Every sport, every pick"
          price={annual ? LP.allSports.annual : LP.allSports.monthly}
          period={annual ? "/yr" : "/mo"} amber
          savings={annual ? LP.allSports.savings : undefined}
          features={["ALL sports, ALL picks", "Full analysis cards", "Blockchain verification", "MAXIMUM plays first", "Priority support"]}
          onNotify={(e) => onNotify(e, "all")} />
      </div>
    </section>
  );
}

function LandingPriceCard({ icon, name, desc, price, period, features, featured, badge, amber, savings, onNotify }: {
  icon: string; name: string; desc: string; price: number; period: string; features: string[];
  featured?: boolean; badge?: string; amber?: boolean; savings?: number;
  onNotify: (email: string) => void;
}) {
  const [cardEmail, setCardEmail] = useState("");
  const [showForm, setShowForm] = useState(false);
  const borderClass = featured ? "border-2 border-indigo-500/50" : amber ? "border border-amber-500/30" : "border border-slate-700";
  const bgClass = featured ? "bg-gradient-to-b from-indigo-900/30 to-slate-900/80" : "bg-slate-900/80";
  const priceColor = featured ? "text-indigo-300" : amber ? "text-amber-300" : "text-slate-100";
  const nameColor = amber ? "text-amber-300" : "text-slate-100";

  return (
    <div className={`${bgClass} ${borderClass} rounded-2xl p-6 text-center relative`}>
      {badge && <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full">{badge}</div>}
      <div className="text-3xl mb-2">{icon}</div>
      <h3 className={`text-lg font-bold ${nameColor} mb-1`}>{name}</h3>
      <p className="text-sm text-slate-400 mb-4">{desc}</p>
      <div className={`text-3xl font-extrabold ${priceColor} mb-1`}>${price}<span className="text-base font-normal text-slate-400">{period}</span></div>
      {savings && <div className="text-xs text-emerald-400 font-bold mb-1">Save ${savings}/year</div>}
      <ul className="text-left text-sm text-slate-300 mt-4 space-y-2">
        {features.map((f) => <li key={f}>✅ {f}</li>)}
      </ul>
      {showForm ? (
        <div className="mt-4 flex gap-1.5">
          <input type="email" value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="your@email.com"
            className="flex-1 px-3 py-2 bg-white/[0.06] border border-white/10 rounded-lg text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50" />
          <button onClick={() => onNotify(cardEmail)} className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold">Go</button>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className={`mt-6 w-full py-2.5 rounded-xl font-semibold text-sm border transition-colors ${featured ? "bg-indigo-600/30 text-indigo-300 border-indigo-500/30 hover:bg-indigo-600/50" : amber ? "bg-amber-700/20 text-amber-300 border-amber-500/30 hover:bg-amber-700/40" : "bg-slate-700/50 text-slate-300 border-slate-600 hover:bg-slate-700"}`}>
          Notify Me — Coming Soon
        </button>
      )}
    </div>
  );
}
