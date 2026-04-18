"use client";

import { useEffect, useState } from "react";

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
  profit: string | number | null;
  game_time: string;
  sent_at: string;
  tier: string;
  stake: number;
  category: string;
  bookmaker: string;
  tx_hash: string | null;
}

const SPORT_EMOJIS: Record<string, string> = {
  NBA: "\u{1F3C0}", NFL: "\u{1F3C8}", NHL: "\u{1F3D2}", MLB: "\u26BE", MMA: "\u{1F94A}",
  "Premier League": "\u26BD", EPL: "\u26BD", "La Liga": "\u26BD",
  "Serie A": "\u26BD", Bundesliga: "\u26BD", Soccer: "\u26BD",
  Tennis: "\u{1F3BE}",
};

const RESULT_STYLES: Record<string, { text: string; bg: string; label: string }> = {
  won: { text: "text-emerald-400", bg: "bg-emerald-500/10", label: "\u2705 Won" },
  lost: { text: "text-red-400", bg: "bg-red-500/10", label: "\u274C Lost" },
  push: { text: "text-slate-400", bg: "bg-slate-500/10", label: "\u2796 Push" },
  void: { text: "text-slate-500", bg: "bg-slate-500/5", label: "\u26AB Void" },
  pending: { text: "text-amber-400", bg: "bg-amber-500/10", label: "\u23F3 Pending" },
};

type Tab = "results" | "upcoming" | "all";

export default function PicksTable() {
  const [picks, setPicks] = useState<Pick[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("results");

  useEffect(() => {
    fetch("/api/tipster/public/picks")
      .then((r) => r.json())
      .then((d) => { setPicks(d.picks ?? d ?? []); setLoading(false); })
      .catch(() => setLoading(false));

    const interval = setInterval(() => {
      fetch("/api/tipster/public/picks")
        .then((r) => r.json())
        .then((d) => setPicks(d.picks ?? d ?? []))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const settled = picks.filter((p) => p.result && p.result !== "pending");
  const upcoming = picks.filter((p) => !p.result || p.result === "pending");
  const displayed = tab === "results" ? settled : tab === "upcoming" ? upcoming : picks;
  const sorted = [...displayed].sort((a, b) => new Date(b.game_time || b.sent_at).getTime() - new Date(a.game_time || a.sent_at).getTime());

  return (
    <div>
      {/* Tabs */}
      <div className="flex gap-1 mb-5 bg-white/[0.03] rounded-xl p-1 w-fit mx-auto">
        {(["results", "upcoming", "all"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              tab === t ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-slate-400 hover:text-white"
            }`}>
            {t === "results" ? `Results (${settled.length})` : t === "upcoming" ? `Upcoming (${upcoming.length})` : `All (${picks.length})`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-10 text-slate-500">No picks to display</div>
      ) : (
        <div className="space-y-2">
          {sorted.slice(0, 20).map((pick) => {
            const isUpcoming = !pick.result || pick.result === "pending";
            const rs = RESULT_STYLES[pick.result] ?? RESULT_STYLES.pending;

            return (
              <div key={pick.id} className={`relative flex items-center justify-between px-4 py-3.5 rounded-xl border transition-all duration-200 ${
                isUpcoming ? "bg-white/[0.02] border-white/[0.06]" : `${rs.bg} border-white/[0.06] hover:border-white/[0.12]`
              }`}>
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <span className="text-xl shrink-0">{SPORT_EMOJIS[pick.sport] ?? SPORT_EMOJIS[pick.league] ?? "\u{1F3C5}"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm text-white truncate">{pick.game}</div>
                    <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>{pick.league || pick.sport}</span>
                      <span className="text-slate-600">&middot;</span>
                      <span>{new Date(pick.game_time || pick.sent_at).toLocaleDateString()}</span>
                      {pick.tier && (
                        <>
                          <span className="text-slate-600">&middot;</span>
                          <span className={pick.tier === "MAXIMUM" ? "text-purple-400" : pick.tier === "STRONG VALUE" ? "text-orange-400" : "text-emerald-400"}>
                            {pick.tier}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Pick + Odds — blurred for upcoming */}
                {isUpcoming ? (
                  <div className="relative flex items-center gap-3 shrink-0 ml-3">
                    <div className="blur-sm select-none pointer-events-none text-sm font-semibold text-slate-300">
                      {pick.pick} ({pick.odds})
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="px-3 py-1 bg-indigo-600/80 backdrop-blur-sm text-white text-[10px] font-bold rounded-full whitespace-nowrap">
                        {"\u{1F512}"} VIP Only
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <div className="text-right">
                      <div className="text-sm font-semibold text-slate-200">{pick.pick}</div>
                      <div className="text-xs text-slate-400">{pick.odds}</div>
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${rs.text} ${rs.bg} border border-current/20 whitespace-nowrap`}>
                      {rs.label}
                    </span>
                  </div>
                )}

                {/* Blockchain badge */}
                {pick.tx_hash && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-purple-600 flex items-center justify-center" title="Blockchain verified">
                    <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
