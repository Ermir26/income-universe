"use client";

import { useEffect, useState, useRef, FormEvent } from "react";
import dynamic from "next/dynamic";
import NavBar from "@/components/landing/NavBar";
import AnimatedBackground from "@/components/landing/AnimatedBackground";
import FreeVsVip from "@/components/landing/FreeVsVip";
import Image from "next/image";
import SportHeroCards from "@/components/graphics/SportHeroCards";
import EdgeVisualization from "@/components/graphics/EdgeVisualization";
import WinStreakGraphic from "@/components/graphics/WinStreakGraphic";
import BlockchainProof from "@/components/graphics/BlockchainProof";
import SharkMethod from "@/components/landing/SharkMethod";

const PicksTable = dynamic(() => import("@/components/landing/PicksTable"), {
  loading: () => <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />)}</div>,
});
const BankrollChart = dynamic(() => import("@/components/landing/BankrollChart"), {
  loading: () => <div className="h-64 rounded-lg bg-white/[0.03] animate-pulse" />,
});

// ─── Types ───

interface LandingStats {
  totalPicks: number;
  wins: number;
  losses: number;
  pushes: number;
  winRate: number;
  units: number;
  streak: number | null;
  streakType: string;
  bySport: { sport: string; picks: number; wins: number; losses?: number; winRate: number }[];
  recentResults: ("won" | "lost")[];
  waitlist: number;
}

interface BankrollPoint {
  date: string;
  units: number;
}

// ─── Constants ───

const TELEGRAM_FREE = "https://t.me/SharklineFree";
const TELEGRAM_VIP = "https://t.me/SharklineVIP";

const SPORT_EMOJIS: Record<string, string> = {
  NBA: "\u{1F3C0}", NFL: "\u{1F3C8}", NHL: "\u{1F3D2}", MLB: "\u26BE", MMA: "\u{1F94A}",
  "Premier League": "\u26BD", EPL: "\u26BD", "La Liga": "\u26BD",
  "Serie A": "\u26BD", Bundesliga: "\u26BD", "Ligue 1": "\u26BD",
  "Champions League": "\u26BD", MLS: "\u26BD", Soccer: "\u26BD",
  Tennis: "\u{1F3BE}", "ATP French Open": "\u{1F3BE}", "ATP Wimbledon": "\u{1F3BE}",
};

const AFFILIATE_BOOKS = [
  { name: "Bet365", color: "#127b47", url: "#" },
  { name: "DraftKings", color: "#53b94e", url: "https://www.draftkings.com" },
  { name: "FanDuel", color: "#1493ff", url: "https://www.fanduel.com" },
  { name: "Betway", color: "#00a3e0", url: "#" },
];

const LP = {
  starter: { monthly: 19, annual: 149, savings: 79 },
  pro: { monthly: 39, annual: 349, savings: 119 },
  method: { monthly: 59, annual: 499, savings: 209 },
  elite: { monthly: 99, annual: 899, savings: 289 },
};

// ─── Main Component ───

export default function SharklineLanding() {
  const [stats, setStats] = useState<LandingStats | null>(null);
  const [bankroll, setBankroll] = useState<BankrollPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [waitlistStatus, setWaitlistStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [selectedSports, setSelectedSports] = useState<string[]>([]);
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/landing/stats").then((r) => r.json()),
      fetch("/api/tipster/public/bankroll").then((r) => r.json()).catch(() => ({ points: [] })),
    ]).then(([statsData, bankrollData]) => {
      setStats(statsData);
      setBankroll(bankrollData.points ?? []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  // Parallax mouse tracking on hero
  useEffect(() => {
    function handleMouse(e: MouseEvent) {
      if (!heroRef.current) return;
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      heroRef.current.style.setProperty("--mx", `${x}px`);
      heroRef.current.style.setProperty("--my", `${y}px`);
    }
    window.addEventListener("mousemove", handleMouse);
    return () => window.removeEventListener("mousemove", handleMouse);
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
      setWaitlistStatus(res.ok ? "done" : "error");
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
    <div className="min-h-screen bg-[#050510] text-slate-100 overflow-x-hidden">
      <AnimatedBackground />
      <NavBar />

      {/* ═══ HERO ═══ */}
      <section data-section="hero" ref={heroRef} className="relative z-10 px-5 pt-24 pb-20 max-w-6xl mx-auto" style={{ "--mx": "0px", "--my": "0px" } as React.CSSProperties}>
        {/* Floating orbs */}
        <div className="absolute top-10 left-[10%] w-72 h-72 bg-indigo-500/20 rounded-full blur-[100px] animate-pulse-slow" style={{ transform: "translate(var(--mx), var(--my))" }} />
        <div className="absolute top-20 right-[10%] w-56 h-56 bg-cyan-500/15 rounded-full blur-[80px] animate-pulse-slow animation-delay-2000" style={{ transform: "translate(calc(var(--mx) * -1), calc(var(--my) * -1))" }} />

        <div className="relative flex flex-col lg:flex-row items-center gap-12">
          {/* Left column */}
          <div className="flex-1 text-center lg:text-left">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-sm animate-fade-in">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">AI-Powered Predictions</span>
            </div>

            <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-[0.95] mb-6 animate-fade-in-up">
              <span className="bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent">AI-Powered</span>
              <br />
              <span className="bg-gradient-to-r from-white via-white to-slate-400 bg-clip-text text-transparent">Sports Picks.</span>
              <br />
              <span className="bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 bg-clip-text text-transparent animate-gradient-x bg-[length:200%_auto]">
                Blockchain Verified.
              </span>
            </h1>

            <p className="text-lg text-slate-400 mb-6 max-w-lg leading-relaxed animate-fade-in-up animation-delay-200">
              Our AI engine detects edges across 10+ sports. Every pick is timestamped on-chain before kickoff. Real odds. Real results. Real profit.
            </p>

            {/* Live stat badges */}
            {!loading && stats && stats.totalPicks > 0 && (
              <div className="flex flex-wrap gap-2.5 justify-center lg:justify-start mb-8 animate-fade-in-up animation-delay-400">
                {stats.winRate > 0 && <StatBadge color="emerald" label={`${stats.winRate}% Win Rate`} />}
                {stats.streak && stats.streak >= 2 && <StatBadge color="orange" label={`${stats.streak} Win Streak`} icon="fire" />}
                {stats.units > 0 && <StatBadge color="indigo" label={`+${stats.units}u Profit`} />}
                <StatBadge color="cyan" label={`${stats.totalPicks} Picks`} />
              </div>
            )}

            {/* CTAs */}
            <div className="flex gap-3 justify-center lg:justify-start flex-wrap animate-fade-in-up animation-delay-600">
              <a id="cta-hero-free" href={TELEGRAM_FREE} target="_blank" rel="noopener noreferrer"
                className="group relative px-8 py-4 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-2xl text-lg font-bold hover:shadow-2xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300">
                <span className="relative z-10">Join Free Channel</span>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-400 to-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl -z-10" />
              </a>
              <a id="cta-hero-vip" href="#pricing"
                className="px-8 py-4 bg-white/[0.06] backdrop-blur-sm text-slate-300 rounded-2xl text-lg font-semibold border border-white/10 hover:bg-white/[0.1] hover:border-white/20 transition-all duration-300">
                Get VIP Access
              </a>
            </div>
          </div>

          {/* Right column — Shark touchdown collage */}
          <div className="relative flex-shrink-0 w-full max-w-md lg:max-w-lg animate-fade-in animation-delay-400">
            <div className="rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl shadow-indigo-500/10">
              <Image
                src="/sharks/Sharkline.png"
                alt="Sharkline mascot — anthropomorphic shark playing soccer, football, baseball, basketball, tennis, and MMA"
                width={1024}
                height={1024}
                className="w-full h-auto"
                priority
              />
            </div>
          </div>
        </div>
      </section>

      {/* ═══ BLOCKCHAIN PROOF ═══ */}
      <section data-section="blockchain-proof" className="relative z-10 max-w-4xl mx-auto px-5 mb-16">
        <BlockchainProof />
      </section>

      {/* ═══ LIVE PERFORMANCE DASHBOARD ═══ */}
      <section id="dashboard" data-section="dashboard" className="relative z-10 max-w-6xl mx-auto px-5 mb-24 scroll-mt-20">
        <SectionTitle title="Live Performance Dashboard" subtitle="Real results, updated every 5 minutes. No cherry-picking." />

        {/* Stats row */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-10">
            {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-28 rounded-2xl bg-white/[0.03] animate-pulse" />)}
          </div>
        ) : stats && stats.totalPicks > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-10">
            <GlassCard label="Win Rate" value={stats.winRate > 0 ? `${stats.winRate}%` : "--"} icon={"\u{1F3AF}"} glow="emerald" />
            <GlassCard label="Total Profit" value={stats.units > 0 ? `+${stats.units}u` : "--"} icon={"\u{1F4B0}"} glow="indigo" />
            <GlassCard label="Avg Odds" value="+105" icon={"\u{1F4CA}"} />
            <GlassCard label="Total Picks" value={String(stats.totalPicks)} icon={"\u{1F4CB}"} />
            <GlassCard label="Best Sport" value={stats.bySport[0]?.sport ?? "--"} icon={SPORT_EMOJIS[stats.bySport[0]?.sport] ?? "\u{1F3C5}"} glow="cyan" />
          </div>
        ) : null}

        {/* Bankroll chart + sport breakdown */}
        <div className="grid lg:grid-cols-5 gap-6 mb-10">
          <div className="lg:col-span-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] p-5">
            <h3 className="font-bold text-sm text-slate-300 mb-4">Bankroll Growth (units)</h3>
            <BankrollChart data={bankroll} />
          </div>
          <div className="lg:col-span-2">
            <h3 className="font-bold text-sm text-slate-300 mb-3">By Sport</h3>
            {stats?.bySport && stats.bySport.length > 0 ? (
              <SportHeroCards sports={stats.bySport.slice(0, 6)} />
            ) : (
              <div className="text-sm text-slate-500">No sport data yet</div>
            )}
          </div>
        </div>

        {/* Recent results streak */}
        {!loading && stats && stats.totalPicks > 0 && (
          <div className="mb-6 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
            <h3 className="font-bold text-sm text-slate-300 mb-3">Recent Results</h3>
            <WinStreakGraphic results={stats.recentResults ?? []} />
          </div>
        )}

        {/* Picks table */}
        <PicksTable />

        {/* Blockchain info */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-600">
            {"\u26D3\uFE0F"} Every pick timestamped on Polygon blockchain before kickoff &middot; <a href="/public" className="text-indigo-400 hover:text-indigo-300 transition-colors">View full public record</a>
          </p>
        </div>
      </section>

      {/* ═══ HOW SHARKLINE FINDS EDGES ═══ */}
      <section id="how" data-section="how-it-works" className="relative z-10 max-w-5xl mx-auto px-5 mb-24 scroll-mt-20">
        <SectionTitle title="How Sharkline Finds Edges" subtitle="Four-stage pipeline from raw market data to your Telegram" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <EdgeCard
            color="cyan"
            step={1}
            title="Scan Markets"
            desc="Real-time odds from 15+ bookmakers. Pinnacle sharp lines as the anchor."
            visual={
              <div className="flex gap-1 items-end h-10 mb-3">
                {[60, 80, 45, 90, 70].map((h, i) => (
                  <div key={i} className="flex-1 rounded-t bg-gradient-to-t from-cyan-500/30 to-cyan-500/60" style={{ height: `${h}%` }} />
                ))}
              </div>
            }
          />
          <EdgeCard
            color="indigo"
            step={2}
            title="Detect Edges"
            desc="AI identifies reverse line movement, CLV, and sharp-vs-public divergence."
            visual={
              <div className="mb-3">
                <EdgeVisualization />
              </div>
            }
          />
          <EdgeCard
            color="purple"
            step={3}
            title="Verify On-Chain"
            desc="Pick hash written to Polygon before kickoff. Transparent, immutable, verifiable."
            visual={
              <div className="font-mono text-[10px] text-purple-400/70 mb-3 leading-relaxed">
                tx: 0x8a2e...4f1c<br />
                block: #58291037<br />
                {"\u2713"} confirmed
              </div>
            }
          />
          <EdgeCard
            color="emerald"
            step={4}
            title="Deliver Picks"
            desc="Instant Telegram alerts with full analysis, odds, and tier rating."
            visual={
              <div className="space-y-1 mb-3">
                {[{ r: "won", l: "\u2705" }, { r: "won", l: "\u2705" }, { r: "lost", l: "\u274C" }, { r: "won", l: "\u2705" }].map((x, i) => (
                  <div key={i} className={`text-[10px] font-semibold ${x.r === "won" ? "text-emerald-400" : "text-red-400"}`}>{x.l} {x.r === "won" ? "Won" : "Lost"}</div>
                ))}
              </div>
            }
          />
        </div>
      </section>

      {/* ═══ SHARK METHOD ═══ */}
      <SharkMethod />

      {/* ═══ FREE VS VIP ═══ */}
      <div className="relative z-10">
        <FreeVsVip />
      </div>

      {/* ═══ VIP PREVIEW (BLUR OVERLAY) ═══ */}
      <section className="relative z-10 max-w-4xl mx-auto px-5 mb-24">
        <SectionTitle title="VIP Pick Preview" subtitle="Here&apos;s what VIP members see every day" />
        <div className="relative rounded-3xl overflow-hidden border border-white/[0.06]">
          <div className="p-6 space-y-3 blur-[6px] select-none pointer-events-none">
            <FakePickCard sport="NBA" game="Lakers vs Celtics" pick="Lakers -3.5" odds="-110" tier="MAXIMUM" />
            <FakePickCard sport="EPL" game="Arsenal vs Man City" pick="Over 2.5 Goals" odds="+105" tier="STRONG VALUE" />
            <FakePickCard sport="NHL" game="Rangers vs Bruins" pick="Rangers ML" odds="+140" tier="VALUE" />
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-[#050510] via-[#050510]/60 to-transparent">
            <div className="text-center px-6">
              <div className="text-4xl mb-3">{"\u{1F512}"}</div>
              <h3 className="text-2xl font-black mb-2 text-white">Unlock VIP Picks</h3>
              <p className="text-slate-400 mb-5 max-w-sm mx-auto">Get MAXIMUM confidence plays, full analysis cards, and blockchain-verified results.</p>
              <a href="#pricing" className="inline-block px-8 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-lg shadow-purple-500/20">
                View VIP Plans
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ TRUST SIGNALS ═══ */}
      <section className="relative z-10 max-w-5xl mx-auto px-5 mb-24">
        <div className="grid sm:grid-cols-3 gap-6">
          <TrustCard icon={"\u26D3\uFE0F"} title="Blockchain Verified" desc="Every pick is timestamped on Polygon before the game starts. Impossible to fake." gradient="from-purple-500/10 to-indigo-500/10" border="border-purple-500/20" />
          <TrustCard icon={"\u{1F916}"} title="AI-Powered Engine" desc="Machine learning model trained on thousands of historical games. No gut feelings." gradient="from-cyan-500/10 to-blue-500/10" border="border-cyan-500/20" />
          <TrustCard icon={"\u{1F4C8}"} title="Transparent Results" desc="Full public track record. Every win, every loss. No cherry-picking. No hiding." gradient="from-emerald-500/10 to-teal-500/10" border="border-emerald-500/20" />
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <PricingSection onNotify={(e: string, tier: string) => {
        setEmail(e);
        setSelectedSports([tier]);
        handleWaitlistDirect(e, [tier]);
      }} />

      {/* ═══ AFFILIATE SPORTSBOOKS ═══ */}
      <section className="relative z-10 max-w-5xl mx-auto px-5 mb-24">
        <SectionTitle title="Trusted Sportsbooks" subtitle="Sign up through our partners to support Sharkline" />
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {AFFILIATE_BOOKS.map((book) => (
            <a key={book.name} href={book.url} target="_blank" rel="noopener noreferrer"
              className="group flex flex-col items-center gap-3 p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/20 hover:bg-white/[0.04] transition-all duration-300">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-black text-white" style={{ backgroundColor: book.color + "30", color: book.color }}>
                {book.name.charAt(0)}
              </div>
              <span className="font-bold text-sm text-slate-300 group-hover:text-white transition-colors">{book.name}</span>
              <span className="px-4 py-1.5 bg-white/[0.06] rounded-lg text-xs font-semibold text-slate-400 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                Sign Up
              </span>
            </a>
          ))}
        </div>
        <p className="text-center text-xs text-slate-600 mt-4">
          We may earn commissions from partner links. Please gamble responsibly. 18+
        </p>
      </section>

      {/* ═══ WAITLIST / EMAIL CAPTURE ═══ */}
      <section className="relative z-10 max-w-lg mx-auto mb-24 px-5">
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 via-transparent to-cyan-500/10" />
          <div className="relative bg-white/[0.03] backdrop-blur-sm border border-white/10 rounded-3xl p-8 text-center">
            <h3 className="font-black text-xl mb-2">Get Notified When VIP Launches</h3>
            <p className="text-sm text-slate-400 mb-5">Early subscribers get lifetime discount pricing.</p>

            {waitlistStatus === "done" ? (
              <div className="py-4 text-emerald-400 font-bold text-lg animate-fade-in">
                {"\u2705"} You&apos;re on the list!
              </div>
            ) : (
              <form onSubmit={handleWaitlist} className="flex gap-2 mb-4">
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="your@email.com" required
                  className="flex-1 px-4 py-3 bg-white/[0.06] border border-white/10 rounded-xl text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/25 transition-all" />
                <button type="submit" disabled={waitlistStatus === "loading"}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-500 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/20">
                  {waitlistStatus === "loading" ? "..." : "Notify Me"}
                </button>
              </form>
            )}
            {waitlistStatus === "error" && <p className="text-red-400 text-sm mb-3">Something went wrong. Try again.</p>}

            <div className="flex flex-wrap gap-2 justify-center">
              {["NBA", "NFL", "NHL", "MLB", "Soccer", "Tennis", "MMA"].map((sport) => (
                <button key={sport} type="button" onClick={() => toggleSport(sport)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 ${
                    selectedSports.includes(sport)
                      ? "bg-indigo-500/20 border-indigo-500/40 text-indigo-300 shadow-md shadow-indigo-500/10"
                      : "bg-white/[0.03] border-white/10 text-slate-400 hover:border-white/20 hover:text-slate-300"
                  }`}>
                  {SPORT_EMOJIS[sport] ?? "\u{1F3C5}"} {sport}
                </button>
              ))}
            </div>

            {stats && stats.waitlist > 0 && (
              <p className="text-xs text-slate-500 mt-4">{stats.waitlist} people already on the waitlist</p>
            )}
          </div>
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <section className="relative z-10 max-w-3xl mx-auto mb-20 px-5">
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-indigo-600/20 via-cyan-600/10 to-purple-600/20 animate-gradient-x bg-[length:200%_auto]" />
          <div className="relative text-center py-16 px-8">
            <h2 className="text-3xl sm:text-4xl font-black mb-3 text-white">Stop losing. Start winning.</h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">Free picks daily. Blockchain-verified results. No fluff, no fake screenshots.</p>
            <a id="cta-final-free" href={TELEGRAM_FREE} target="_blank" rel="noopener noreferrer"
              className="inline-block px-10 py-4 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white rounded-2xl text-lg font-black hover:shadow-2xl hover:shadow-indigo-500/30 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300">
              Join Sharkline Free
            </a>
          </div>
        </div>
      </section>

      {/* ═══ AD SLOT ═══ */}
      <section className="relative z-10 max-w-5xl mx-auto px-5 mb-16">
        <div className="flex items-center justify-center py-6 rounded-2xl bg-white/[0.02] border border-white/[0.04]">
          <span className="text-xs text-slate-600">Advertisement</span>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer className="relative z-10 border-t border-white/[0.06] bg-[#030308]">
        <div className="max-w-6xl mx-auto px-5 py-12">
          <div className="grid sm:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-sm font-black text-white">S</div>
                <span className="font-black text-lg text-white">Sharkline</span>
              </div>
              <p className="text-sm text-slate-500 leading-relaxed">AI-Powered Edge Detection</p>
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-300 mb-3">Product</h4>
              <div className="flex flex-col gap-2 text-sm text-slate-500">
                <a href="#dashboard" className="hover:text-slate-300 transition-colors">Dashboard</a>
                <a href="#method" className="hover:text-slate-300 transition-colors">Shark Method</a>
                <a href="#pricing" className="hover:text-slate-300 transition-colors">Pricing</a>
                <a href={TELEGRAM_FREE} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">Free Channel</a>
                <a href={TELEGRAM_VIP} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">VIP</a>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-300 mb-3">Social</h4>
              <div className="flex flex-col gap-2 text-sm text-slate-500">
                <a href="#" className="hover:text-slate-300 transition-colors">Twitter</a>
                <a href={TELEGRAM_FREE} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">Telegram</a>
                <a href="#" className="hover:text-slate-300 transition-colors">TikTok</a>
                <a href="#" className="hover:text-slate-300 transition-colors">Instagram</a>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-sm text-slate-300 mb-3">Sportsbook Partners</h4>
              <div className="flex flex-col gap-2 text-sm text-slate-500">
                {AFFILIATE_BOOKS.map((b) => (
                  <a key={b.name} href={b.url} target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">{b.name}</a>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-white/[0.06] pt-6 text-center">
            <p className="text-xs text-slate-600 leading-relaxed">
              &copy; 2026 Sharkline. Past performance does not guarantee future results. Please gamble responsibly. 18+
              <br />
              Must be 21+ in some jurisdictions. If you have a gambling problem, call 1-800-GAMBLER.
              <br />
              Affiliate links may earn commission at no extra cost to you.
            </p>
          </div>
        </div>
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
      setWaitlistStatus(res.ok ? "done" : "error");
    } catch {
      setWaitlistStatus("error");
    }
  }
}

// ═══════════════════════════════════════════════
// SUB-COMPONENTS (kept inline for simplicity)
// ═══════════════════════════════════════════════

function StatBadge({ color, label, icon }: { color: string; label: string; icon?: string }) {
  const colors: Record<string, string> = {
    emerald: "bg-emerald-500/15 border-emerald-500/30 text-emerald-400",
    orange: "bg-orange-500/15 border-orange-500/30 text-orange-400",
    indigo: "bg-indigo-500/15 border-indigo-500/30 text-indigo-400",
    cyan: "bg-cyan-500/15 border-cyan-500/30 text-cyan-400",
  };
  return (
    <span className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border backdrop-blur-sm ${colors[color]}`}>
      {icon === "fire" && "\u{1F525} "}{label}
    </span>
  );
}

function GlassCard({ label, value, icon, glow }: { label: string; value: string; icon: string; glow?: string }) {
  const glowColor = glow === "emerald" ? "group-hover:shadow-emerald-500/10"
    : glow === "indigo" ? "group-hover:shadow-indigo-500/10"
    : glow === "orange" ? "group-hover:shadow-orange-500/10"
    : glow === "cyan" ? "group-hover:shadow-cyan-500/10"
    : "";
  return (
    <div className={`group relative p-5 rounded-2xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-300 hover:shadow-xl ${glowColor}`}>
      <div className="absolute inset-0 rounded-2xl animate-shimmer pointer-events-none" />
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-2xl sm:text-3xl font-black text-white">{value}</div>
      <div className="text-xs text-slate-500 mt-1 font-medium uppercase tracking-wider">{label}</div>
    </div>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="text-center mb-10">
      <h2 className="text-2xl sm:text-3xl font-black text-white mb-2">{title}</h2>
      <p className="text-slate-500 text-sm">{subtitle}</p>
    </div>
  );
}

function EdgeCard({ step, title, desc, color, visual }: { step: number; title: string; desc: string; color: string; visual: React.ReactNode }) {
  const accent: Record<string, string> = {
    cyan: "border-t-cyan-500/60",
    indigo: "border-t-indigo-500/60",
    purple: "border-t-purple-500/60",
    emerald: "border-t-emerald-500/60",
  };
  const numColor: Record<string, string> = {
    cyan: "text-cyan-400",
    indigo: "text-indigo-400",
    purple: "text-purple-400",
    emerald: "text-emerald-400",
  };
  return (
    <div className={`p-5 rounded-2xl bg-white/[0.02] border border-white/[0.06] border-t-2 ${accent[color]} hover:bg-white/[0.04] transition-all duration-300`}>
      <div className={`text-[10px] font-bold ${numColor[color]} uppercase tracking-widest mb-3`}>Step {step}</div>
      {visual}
      <h3 className="font-bold text-sm text-white mb-1.5">{title}</h3>
      <p className="text-xs text-slate-400 leading-relaxed">{desc}</p>
    </div>
  );
}

function FakePickCard({ sport, game, pick, odds, tier }: { sport: string; game: string; pick: string; odds: string; tier: string }) {
  const tierColors: Record<string, string> = { VALUE: "text-emerald-400", "STRONG VALUE": "text-orange-400", MAXIMUM: "text-purple-400" };
  return (
    <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.04] border border-white/[0.08]">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{SPORT_EMOJIS[sport] ?? "\u{1F3C5}"}</span>
        <div>
          <div className="font-bold text-sm">{game}</div>
          <div className="text-xs text-slate-400">{pick} ({odds})</div>
        </div>
      </div>
      <span className={`font-bold text-sm ${tierColors[tier] ?? "text-slate-400"}`}>{tier}</span>
    </div>
  );
}

function TrustCard({ icon, title, desc, gradient, border }: { icon: string; title: string; desc: string; gradient: string; border: string }) {
  return (
    <div className={`relative p-6 rounded-2xl border ${border} overflow-hidden hover:scale-[1.02] transition-transform duration-300`}>
      <div className={`absolute inset-0 bg-gradient-to-br ${gradient}`} />
      <div className="relative">
        <div className="text-3xl mb-3">{icon}</div>
        <h3 className="font-bold text-lg text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function PricingSection({ onNotify }: { onNotify: (email: string, tier: string) => void }) {
  const [annual, setAnnual] = useState(false);

  return (
    <section id="pricing" className="relative z-10 max-w-4xl mx-auto mb-24 px-5 scroll-mt-20">
      <SectionTitle title="VIP Packages" subtitle="Unlock MAXIMUM confidence plays and full analysis cards" />
      <div className="flex items-center justify-center gap-3 mb-10">
        <span className={`text-sm font-semibold ${!annual ? "text-white" : "text-slate-500"}`}>Monthly</span>
        <button onClick={() => setAnnual(!annual)}
          className={`relative w-14 h-7 rounded-full transition-colors duration-300 ${annual ? "bg-indigo-600" : "bg-slate-700"}`}>
          <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform duration-300 shadow-md ${annual ? "translate-x-[30px]" : "translate-x-1"}`} />
        </button>
        <span className={`text-sm font-semibold ${annual ? "text-white" : "text-slate-500"}`}>Annual</span>
        {annual && <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider animate-fade-in">Save More</span>}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <PriceCard icon={"\u{1F3C0}"} name="Starter" desc="3 sports, delayed picks"
          price={annual ? LP.starter.annual : LP.starter.monthly} period={annual ? "/yr" : "/mo"}
          savings={annual ? LP.starter.savings : undefined}
          features={["3 sports of your choice", "Delayed picks (30 min)", "Basic stats dashboard", "Blockchain verification"]}
          onNotify={(e) => onNotify(e, "starter")} />
        <PriceCard icon={"\u26BD\u{1F3D2}\u{1F3C0}"} name="Pro" desc="All sports, real-time"
          price={annual ? LP.pro.annual : LP.pro.monthly} period={annual ? "/yr" : "/mo"}
          savings={annual ? LP.pro.savings : undefined}
          features={["ALL sports, real-time picks", "Full analysis cards", "Blockchain verification", "Full performance dashboard", "Priority support"]}
          onNotify={(e) => onNotify(e, "pro")} />
        <PriceCard icon={"\u{1F988}"} name="Shark Method Pro" desc="The complete system"
          price={annual ? LP.method.annual : LP.method.monthly} period={annual ? "/yr" : "/mo"}
          featured badge="FLAGSHIP" savings={annual ? LP.method.savings : undefined}
          features={["Everything in Pro", "Live bankroll tracker", "Personal unit calculator", "Monthly P&L reports", "Performance by sport/league", "Push notifications"]}
          onNotify={(e) => onNotify(e, "method")} />
        <PriceCard icon={"\u{1F30D}"} name="Elite" desc="Everything + direct access"
          price={annual ? LP.elite.annual : LP.elite.monthly} period={annual ? "/yr" : "/mo"}
          premium savings={annual ? LP.elite.savings : undefined}
          features={["Everything in Shark Method Pro", "Direct analyst access", "Custom sport alerts", "Monthly strategy calls", "Early access to new features"]}
          onNotify={(e) => onNotify(e, "elite")} />
      </div>
    </section>
  );
}

function PriceCard({ icon, name, desc, price, period, features, featured, badge, premium, savings, onNotify }: {
  icon: string; name: string; desc: string; price: number; period: string; features: string[];
  featured?: boolean; badge?: string; premium?: boolean; savings?: number;
  onNotify: (email: string) => void;
}) {
  const [cardEmail, setCardEmail] = useState("");
  const [showForm, setShowForm] = useState(false);

  const border = featured ? "border-2 border-indigo-500/50 shadow-xl shadow-indigo-500/10"
    : premium ? "border border-amber-500/30" : "border border-white/[0.08]";
  const bg = featured ? "bg-gradient-to-b from-indigo-900/30 via-indigo-900/10 to-transparent" : "bg-white/[0.02]";
  const priceColor = featured ? "text-indigo-300" : premium ? "text-amber-300" : "text-white";

  return (
    <div className={`relative ${bg} ${border} rounded-3xl p-7 text-center hover:scale-[1.02] transition-transform duration-300`}>
      {badge && <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-xs font-bold px-4 py-1 rounded-full shadow-lg">{badge}</div>}
      <div className="text-3xl mb-3">{icon}</div>
      <h3 className="text-lg font-black text-white mb-1">{name}</h3>
      <p className="text-sm text-slate-400 mb-5">{desc}</p>
      <div className={`text-4xl font-black ${priceColor} mb-1`}>
        ${price}<span className="text-base font-normal text-slate-500">{period}</span>
      </div>
      {savings && <div className="text-xs text-emerald-400 font-bold mb-2">Save ${savings}/year</div>}
      <ul className="text-left text-sm text-slate-300 mt-5 space-y-2.5">
        {features.map((f) => <li key={f} className="flex items-start gap-2"><span className="text-emerald-400 mt-0.5">{"\u2713"}</span><span>{f}</span></li>)}
      </ul>
      {showForm ? (
        <div className="mt-5 flex gap-1.5">
          <input type="email" value={cardEmail} onChange={(e) => setCardEmail(e.target.value)} placeholder="your@email.com"
            className="flex-1 px-3 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50" />
          <button onClick={() => onNotify(cardEmail)} className="px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-500 transition-colors">Go</button>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)}
          className={`mt-6 w-full py-3 rounded-xl font-bold text-sm transition-all duration-300 ${
            featured ? "bg-gradient-to-r from-indigo-600 to-cyan-600 text-white hover:shadow-lg hover:shadow-indigo-500/20"
            : premium ? "bg-amber-600/20 text-amber-300 border border-amber-500/30 hover:bg-amber-600/30"
            : "bg-white/[0.06] text-slate-300 border border-white/10 hover:bg-white/[0.1]"
          }`}>
          Notify Me &mdash; Coming Soon
        </button>
      )}
    </div>
  );
}
