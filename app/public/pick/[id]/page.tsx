"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatAmericanOdds } from "@/lib/tipster/format-helpers";

interface PickDetail {
  id: string;
  sport: string;
  sport_key: string;
  league: string;
  game: string;
  pick: string;
  odds: string;
  bookmaker?: string;
  tier: string;
  stake: number;
  confidence: number;
  scoring_factors: Record<string, number> | null;
  scoring_weights: Record<string, number> | null;
  scoring_score: number | null;
  reasoning: string;
  result: string;
  actual_result: string;
  settled_at: string;
  created_at: string;
  game_time: string;
  edge_percentage: number | null;
  research_data: string | null;
  profit: number | null;
  pick_hash: string | null;
  tx_hash: string | null;
  block_number: number | null;
  block_timestamp: string | null;
  verified: boolean;
}

const TIER_STYLE: Record<string, { emoji: string; cls: string; bg: string }> = {
  VALUE: { emoji: "✅", cls: "text-emerald-400", bg: "bg-emerald-500/15 border-emerald-500/30" },
  "STRONG VALUE": { emoji: "🔥", cls: "text-orange-400", bg: "bg-orange-500/15 border-orange-500/30" },
  MAXIMUM: { emoji: "💎", cls: "text-purple-400", bg: "bg-purple-500/15 border-purple-500/30" },
};

const SPORT_EMOJI: Record<string, string> = {
  NBA: "🏀", NFL: "🏈", NHL: "🏒", MLB: "⚾", MMA: "🥊",
  "Premier League": "⚽", EPL: "⚽", "La Liga": "⚽",
  "Serie A": "⚽", Bundesliga: "⚽", "Ligue 1": "⚽",
  "Champions League": "⚽", MLS: "⚽", Euroleague: "🏀",
};

const FACTOR_LABELS: Record<string, string> = {
  odds_value: "Odds Value",
  form_factor: "Form Factor",
  h2h_factor: "H2H Record",
  market_movement: "Market Movement",
  public_vs_sharp: "Sharp Money",
  situational: "Situational",
};

export default function PickPage() {
  const params = useParams();
  const id = params?.id as string;
  const [pick, setPick] = useState<PickDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/tipster/public/pick/${id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setPick(d.pick);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080814] flex items-center justify-center text-slate-400">
        Loading pick...
      </div>
    );
  }

  if (error || !pick) {
    return (
      <div className="min-h-screen bg-[#080814] flex flex-col items-center justify-center gap-3">
        <p className="text-slate-400 text-lg">Pick not found</p>
        <Link href="/public" className="text-indigo-400 hover:underline text-sm">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  const tier = TIER_STYLE[pick.tier] ?? TIER_STYLE.VALUE;
  const isWin = pick.result === "won";
  const isLoss = pick.result === "lost";
  const isPending = pick.result === "pending";
  const resultText = isWin ? "✅ WON" : isLoss ? "❌ LOST" : isPending ? "⏳ PENDING" : "➖ PUSH";
  const resultColor = isWin ? "text-emerald-400" : isLoss ? "text-red-400" : isPending ? "text-amber-400" : "text-slate-400";
  const gameDate = pick.game_time
    ? new Date(pick.game_time).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
    : pick.created_at
      ? new Date(pick.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })
      : "";

  const shareText = `${pick.game} — ${pick.pick} (${formatAmericanOdds(pick.odds)}) ${isWin ? "✅ Winner!" : ""}`;

  return (
    <div className="min-h-screen bg-[#080814] text-slate-200 antialiased">
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(99,102,241,0.08)_0%,_transparent_50%)] pointer-events-none" />

      <div className="relative max-w-xl mx-auto px-5 py-8">
        {/* Back link */}
        <Link href="/public" className="text-indigo-400 hover:underline text-sm mb-6 inline-block">
          ← All Results
        </Link>

        {/* Result badge */}
        <div className={`text-center mb-4`}>
          <span className={`text-3xl font-black ${resultColor}`}>{resultText}</span>
        </div>

        {/* Game card */}
        <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">{SPORT_EMOJI[pick.sport] ?? "🏅"}</span>
            <div>
              <div className="text-xs text-slate-500">{pick.league || pick.sport}</div>
              <div className="font-bold text-base">{pick.game}</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-slate-500 text-xs">Pick</span>
              <div className="font-semibold">{pick.pick}</div>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Odds</span>
              <div className="font-semibold">{formatAmericanOdds(pick.odds)}</div>
            </div>
            <div>
              <span className="text-slate-500 text-xs">Game Time</span>
              <div className="font-semibold">{gameDate || "—"}</div>
            </div>
          </div>

          {/* Tier + Stake */}
          <div className="flex items-center gap-3 mt-4">
            <span className={`px-3 py-1 rounded-lg text-xs font-bold border ${tier.bg} ${tier.cls}`}>
              {tier.emoji} {pick.tier}
            </span>
            <span className="text-xs text-slate-400">Stake: <strong className="text-slate-200">{pick.stake}u</strong></span>
            {pick.confidence > 0 && (
              <span className="text-xs text-slate-400">Confidence: <strong className="text-slate-200">{pick.confidence}%</strong></span>
            )}
          </div>

          {/* Profit */}
          {pick.profit != null && !isPending && (
            <div className="mt-3 text-sm">
              <span className="text-slate-500">Profit: </span>
              <span className={`font-bold ${(pick.profit ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {(pick.profit ?? 0) >= 0 ? "+" : ""}{((pick.profit ?? 0) / 100).toFixed(1)}u
              </span>
            </div>
          )}

          {pick.actual_result && (
            <div className="mt-2 text-xs text-slate-400">
              Final: <span className="text-slate-300">{pick.actual_result}</span>
            </div>
          )}
        </div>

        {/* Scoring Factors */}
        {pick.scoring_factors && Object.keys(pick.scoring_factors).length > 0 && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-4">
            <h3 className="text-sm font-bold mb-3 text-slate-300">Scoring Breakdown</h3>
            <div className="space-y-3">
              {Object.entries(pick.scoring_factors).map(([key, value]) => {
                const score = typeof value === "number" ? value : 0;
                const weight = pick.scoring_weights?.[key];
                return (
                  <div key={key}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-400">{FACTOR_LABELS[key] ?? key}</span>
                      <span className="text-slate-300 font-semibold">
                        {score.toFixed(0)}/100
                        {weight != null && <span className="text-slate-500 ml-1">({(weight * 100).toFixed(0)}%w)</span>}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          score >= 75 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500"
                        }`}
                        style={{ width: `${Math.min(score, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            {pick.edge_percentage != null && (
              <div className="mt-3 pt-3 border-t border-white/[0.06] text-xs text-slate-400">
                Edge: <strong className="text-indigo-400">{pick.edge_percentage.toFixed(1)}%</strong>
              </div>
            )}
          </div>
        )}

        {/* Blockchain Verification */}
        {pick.tx_hash && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔗</span>
              <h3 className="text-sm font-bold text-emerald-400">Blockchain Verified</h3>
              {pick.verified && (
                <span className="px-2 py-0.5 bg-emerald-500/20 border border-emerald-500/30 rounded-full text-[10px] font-bold text-emerald-400">
                  VERIFIED
                </span>
              )}
            </div>
            <div className="space-y-2 text-xs">
              {pick.block_timestamp && (
                <div>
                  <span className="text-slate-500">Timestamped on Polygon: </span>
                  <span className="text-slate-300">
                    {new Date(pick.block_timestamp).toLocaleString("en-US", {
                      month: "short", day: "numeric", year: "numeric",
                      hour: "numeric", minute: "2-digit", hour12: true,
                    })}
                  </span>
                  {pick.game_time && pick.block_timestamp && (() => {
                    const mins = Math.round(
                      (new Date(pick.game_time).getTime() - new Date(pick.block_timestamp).getTime()) / 60000
                    );
                    return mins > 0 ? (
                      <span className="text-emerald-400 ml-1">({mins} min before kickoff)</span>
                    ) : null;
                  })()}
                </div>
              )}
              {pick.pick_hash && (
                <div>
                  <span className="text-slate-500">Pick Hash: </span>
                  <span className="text-slate-400 font-mono break-all">{pick.pick_hash}</span>
                </div>
              )}
              <a
                href={`https://polygonscan.com/tx/${pick.tx_hash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-1 text-indigo-400 hover:underline font-semibold"
              >
                Verify on PolygonScan →
              </a>
            </div>
          </div>
        )}

        {/* Reasoning */}
        {pick.reasoning && (
          <div className="bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5 mb-4">
            <h3 className="text-sm font-bold mb-2 text-slate-300">Analysis</h3>
            <p className="text-sm text-slate-400 leading-relaxed whitespace-pre-wrap">{pick.reasoning}</p>
          </div>
        )}

        {/* Share Buttons */}
        <div className="flex gap-2 mb-8">
          <button
            onClick={() => {
              if (typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard.writeText(window.location.href);
              }
            }}
            className="flex-1 py-2.5 bg-white/[0.05] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-300 hover:bg-white/[0.08] transition-colors"
          >
            Copy Link
          </button>
          <a
            href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${typeof window !== "undefined" ? encodeURIComponent(window.location.href) : ""}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 bg-sky-600/20 border border-sky-500/20 rounded-xl text-xs font-semibold text-sky-400 hover:bg-sky-600/30 transition-colors text-center"
          >
            Share on X
          </a>
          <a
            href={`https://t.me/share/url?url=${typeof window !== "undefined" ? encodeURIComponent(window.location.href) : ""}&text=${encodeURIComponent(shareText)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 bg-blue-600/20 border border-blue-500/20 rounded-xl text-xs font-semibold text-blue-400 hover:bg-blue-600/30 transition-colors text-center"
          >
            Telegram
          </a>
        </div>

        {/* CTA */}
        <div className="text-center bg-white/[0.03] border border-white/[0.06] rounded-2xl p-5">
          <p className="text-sm text-slate-400 mb-3">Get picks like this delivered to your phone daily</p>
          <a
            href="https://t.me/SharklineFree"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-xl font-bold text-sm hover:scale-[1.03] active:scale-[0.98] transition-transform"
          >
            Join Sharkline Free →
          </a>
        </div>

        {/* Footer */}
        <footer className="text-center py-6 text-slate-600 text-xs mt-4">
          Sharkline — sharkline.ai
        </footer>
      </div>
    </div>
  );
}
