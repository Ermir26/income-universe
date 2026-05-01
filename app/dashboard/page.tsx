"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatAmericanOdds, formatPickDisplay, sideToTeamName, parseGameTeams } from "@/lib/tipster/format-helpers";

// ── Types ──

interface DecisionLog {
  id?: string;
  pick_id?: string;
  validator_result?: string;
  cross_check_result?: string;
  validator_correction?: string;
  odds_api_payload?: unknown;
  claude_output?: string;
  final_decision?: string;
  rejection_reason?: string;
}

interface Pick {
  id: string;
  game: string;
  pick: string;
  line?: string;
  odds?: number;
  bookmaker?: string;
  channel?: string;
  reasoning?: string;
  confidence?: number;
  status: string;
  result?: string;
  profit?: number;
  sport?: string;
  league?: string;
  side?: string;
  bet_type?: string;
  tier?: string;
  created_at?: string;
  validator_corrected?: boolean;
  original_bookmaker?: string;
  rejection_reason?: string;
  decision_log?: DecisionLog | null;
  reasoning_bookmaker?: string;
  reasoning_line?: string;
  reasoning_odds?: number;
  game_time?: string;
  source?: string;
}

// ── Game search result from odds API ──

interface GameSearchResult {
  id: string;
  sport_key: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers?: unknown;
  source?: "odds_api" | "espn";
}

interface ConfigEntry {
  key: string;
  value: string;
  updated_at: string;
  updated_by: string;
}

interface HealthData {
  last_cron: { action: string; result: string; created_at: string } | null;
  scraper_24h: { total: number; by_result: Record<string, number>; pinnacle_success_rate: string };
  errors: Array<{ agent_name: string; action: string; result: string; created_at: string }>;
  picks_by_status: Record<string, number>;
  decisions_by_result: Record<string, number>;
  cross_checks_by_result: Record<string, number>;
  odds_api_status?: {
    status: "available" | "credits_exhausted" | "error" | "not_configured";
    remaining?: string;
    checkedAt: number;
  } | null;
  bankroll_state?: {
    id: number;
    starting_balance: number;
    launch_timestamp: string | null;
    current_units: number | null;
    peak_units: number | null;
    drawdown_pct: number | null;
    recovery_tier: string;
    last_settled_pick_id: string | null;
    last_updated: string;
    notes: string | null;
  } | null;
}

interface LiveLogRow {
  _source: string;
  id: number;
  created_at: string;
  [key: string]: unknown;
}

// ── Status Badge ──

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
  pending: "bg-blue-500/20 text-blue-300 border-blue-500/30",
  published: "bg-green-500/20 text-green-300 border-green-500/30",
  approved: "bg-green-500/20 text-green-300 border-green-500/30",
  rejected: "bg-red-500/20 text-red-300 border-red-500/30",
  settled: "bg-slate-500/20 text-slate-300 border-slate-500/30",
  won: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  lost: "bg-red-500/20 text-red-300 border-red-500/30",
  push: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function StatusBadge({ status }: { status: string }) {
  const colors = STATUS_COLORS[status] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${colors}`}>
      {status}
    </span>
  );
}

// ── Collapsible ──

function Collapsible({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">
        <span className="text-[10px]">{open ? "\u25BC" : "\u25B6"}</span>
        {title}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

// ── Confirmation Modal ──

function ConfirmModal({ title, description, requireType, onConfirm, onClose }: {
  title: string;
  description: string;
  requireType?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = requireType ? typed === "CONFIRM" : true;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-sm text-slate-400">{description}</p>
        {requireType && (
          <div>
            <label className="text-xs text-slate-500 block mb-1">Type CONFIRM to proceed</label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="CONFIRM"
              autoFocus
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-red-500"
            />
          </div>
        )}
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
          <button
            onClick={() => canConfirm && onConfirm()}
            disabled={!canConfirm}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Reject Modal ──

function RejectModal({ pickId, onClose, onConfirm }: { pickId: string; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Reject Pick #{pickId.slice(0, 8)}</h3>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for rejection..." rows={3} autoFocus
          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-red-500" />
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
          <button onClick={() => reason.trim() && onConfirm(reason.trim())} disabled={!reason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draft Card ──

// Determine edit severity category client-side for UI gating
function detectEditCategoryClient(
  original: Pick,
  editFields: { line: string; odds: string; bookmaker: string; bet_type: string; side: string; channel: string; reasoning: string },
): "cosmetic" | "directional" | "structural" | "none" {
  const marketChanged = editFields.bet_type !== (original.bet_type ?? "");
  const sideChanged = editFields.side !== (original.side ?? "");
  const lineChanged = editFields.line !== (original.line ?? "");
  const oddsChanged = editFields.odds !== (original.odds?.toString() ?? "");

  if (marketChanged) return "structural";
  if (sideChanged) return "directional";
  if (lineChanged || oddsChanged) return "cosmetic";
  return "none";
}

function DraftCard({ draft, onApprove, onReject, onSave, onRefreshDrafts }: {
  draft: Pick;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSave: (id: string, updates: Record<string, unknown>) => void;
  onRefreshDrafts: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    line: draft.line ?? "", odds: draft.odds?.toString() ?? "", bookmaker: draft.bookmaker ?? "",
    bet_type: draft.bet_type ?? "", side: draft.side ?? "", channel: draft.channel ?? "", reasoning: draft.reasoning ?? "",
  });
  const [regenerating, setRegenerating] = useState(false);
  const [staleDismissed, setStaleDismissed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [directionalAcknowledged, setDirectionalAcknowledged] = useState(false);
  const [postSaveBanner, setPostSaveBanner] = useState<string | null>(null);

  // Parse channel into set of active tokens for multi-select
  const channelTokens = new Set(editFields.channel.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  function toggleChannel(token: string) {
    const next = new Set(channelTokens);
    if (next.has(token)) next.delete(token);
    else next.add(token);
    setEditFields({ ...editFields, channel: Array.from(next).join(",") });
  }

  // Side options depend on selected market — show team names for h2h/spreads
  const draftTeams = parseGameTeams(draft.game);
  const sideOptions: { label: string; value: string }[] = (() => {
    if (editFields.bet_type === "totals") return [{ label: "Over", value: "over" }, { label: "Under", value: "under" }];
    if (draftTeams) {
      return [
        { label: draftTeams.home, value: "home" },
        { label: draftTeams.away, value: "away" },
      ];
    }
    return [{ label: "Home", value: "home" }, { label: "Away", value: "away" }];
  })();

  // Auto-clear line + odds + side when market changes
  function handleMarketChange(newMarket: string) {
    if (newMarket !== editFields.bet_type) {
      setEditFields({ ...editFields, bet_type: newMarket, line: "", odds: "", side: "" });
      setDirectionalAcknowledged(false);
    }
  }

  // Reset directional acknowledgment when side changes
  function handleSideChange(newSide: string) {
    setEditFields({ ...editFields, side: newSide });
    setDirectionalAcknowledged(false);
  }

  const log = draft.decision_log;

  // ── Edit category detection for UI gating ──
  const editCategory = editing ? detectEditCategoryClient(draft, editFields) : "none";

  // Directional: check if operator manually rewrote reasoning to acknowledge new side
  const reasoningManuallyEdited = editFields.reasoning !== (draft.reasoning ?? "");
  const directionalGateSatisfied = directionalAcknowledged || reasoningManuallyEdited;

  // Save button disabled when directional edit is ungated
  const saveBlocked = editCategory === "directional" && !directionalGateSatisfied;

  // ── Kickoff state: >10min / <10min warning / past kickoff ──
  const kickoffState = (() => {
    if (!draft.game_time) return { state: "unknown" as const, minsUntil: Infinity, kickoffStr: "" };
    const gt = new Date(draft.game_time);
    const minsUntil = (gt.getTime() - Date.now()) / 60000;
    const kickoffStr = gt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    if (minsUntil <= 0) return { state: "past" as const, minsUntil, kickoffStr };
    if (minsUntil <= 10) return { state: "imminent" as const, minsUntil, kickoffStr };
    return { state: "ok" as const, minsUntil, kickoffStr };
  })();

  async function handleSave() {
    setSaveError(null);
    setPostSaveBanner(null);
    const updates: Record<string, unknown> = {};
    if (editFields.line !== (draft.line ?? "")) updates.line = editFields.line;
    if (editFields.odds !== (draft.odds?.toString() ?? "")) updates.odds = parseFloat(editFields.odds) || editFields.odds;
    if (editFields.bookmaker !== (draft.bookmaker ?? "")) updates.bookmaker = editFields.bookmaker;
    if (editFields.bet_type !== (draft.bet_type ?? "")) updates.bet_type = editFields.bet_type;
    if (editFields.side !== (draft.side ?? "")) updates.side = editFields.side;
    if (editFields.channel !== (draft.channel ?? "")) updates.channel = editFields.channel;
    if (editFields.reasoning !== (draft.reasoning ?? "")) updates.reasoning = editFields.reasoning;
    if (Object.keys(updates).length === 0) {
      setEditing(false);
      return;
    }
    try {
      const res = await fetch(`/api/dashboard/picks/${draft.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Save failed");
        return;
      }
      setStaleDismissed(false);
      setDirectionalAcknowledged(false);
      setEditing(false);
      // Show post-save banner for structural edits
      if (data.edit_category === "structural" && data.regenerated_reasoning) {
        setPostSaveBanner("Reasoning regenerated to match new market \u2014 review before approving.");
      }
      onRefreshDrafts();
    } catch {
      setSaveError("Network error saving edit");
    }
  }

  async function handleRegenerate() {
    setRegenerating(true);
    try {
      const res = await fetch(`/api/dashboard/picks/${draft.id}/regenerate-reasoning`, { method: "POST" });
      const data = await res.json();
      if (res.ok && data.reasoning) {
        // Update local edit fields with regenerated reasoning
        setEditFields((prev) => ({ ...prev, reasoning: data.reasoning }));
        setDirectionalAcknowledged(true);
        setStaleDismissed(true);
        onRefreshDrafts();
      } else {
        alert(data.error ?? "Failed to regenerate reasoning");
      }
    } catch {
      alert("Network error regenerating reasoning");
    } finally {
      setRegenerating(false);
    }
  }

  // Stale reasoning detection
  const staleFields: string[] = [];
  if (draft.reasoning_bookmaker && draft.bookmaker !== draft.reasoning_bookmaker)
    staleFields.push(`${draft.reasoning_bookmaker}`);
  if (draft.reasoning_line && draft.line !== draft.reasoning_line)
    staleFields.push(`line ${draft.reasoning_line}`);
  if (draft.reasoning_odds != null && draft.odds !== draft.reasoning_odds)
    staleFields.push(`${draft.reasoning_odds > 0 ? "+" : ""}${draft.reasoning_odds}`);
  const hasStaleReasoning = staleFields.length > 0 && !staleDismissed;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300">{draft.game}</p>
          <p className="text-base font-semibold text-white mt-0.5">{formatPickDisplay({ side: draft.side ?? draft.pick, bet_type: draft.bet_type ?? "h2h", game: draft.game, line: draft.line })}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={draft.status} />
          {draft.source && draft.source !== "system_generated" && (
            <span className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-medium ${draft.source === "manual_validated" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"}`}>
              {draft.source === "manual_validated" ? "manual (validated)" : "manual (unverified)"}
            </span>
          )}
          {draft.confidence != null && draft.confidence > 0 && <span className="text-xs text-slate-400">{draft.confidence}%</span>}
        </div>
      </div>

      {/* Kickoff: past → hard reject (red) */}
      {kickoffState.state === "past" && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
          Cannot publish — kickoff was at {kickoffState.kickoffStr}. Pick is now unpublishable. Reject this draft instead.
        </div>
      )}

      {/* Kickoff: <10 min → warning (amber) */}
      {kickoffState.state === "imminent" && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Kickoff in {Math.ceil(kickoffState.minsUntil)} minute{Math.ceil(kickoffState.minsUntil) !== 1 ? "s" : ""} — approve now to publish in time
        </div>
      )}

      {!editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {draft.line && <div><span className="text-slate-500">Line:</span> <span className="text-slate-300">{draft.line}</span></div>}
          <div><span className="text-slate-500">Odds:</span> <span className="text-slate-300">{draft.odds != null ? formatAmericanOdds(draft.odds) : "\u2014"}</span></div>
          <div><span className="text-slate-500">Bookmaker:</span> <span className="text-slate-300">{draft.bookmaker ?? "\u2014"}</span></div>
          {draft.channel && <div><span className="text-slate-500">Channel:</span> <span className="text-slate-300">{draft.channel}</span></div>}
          {draft.bet_type && <div><span className="text-slate-500">Market:</span> <span className="text-slate-300">{draft.bet_type}</span></div>}
          {draft.side && <div><span className="text-slate-500">Side:</span> <span className="text-slate-300">{sideToTeamName(draft.side, draft.game)}</span></div>}
          {draft.game_time && <div><span className="text-slate-500">Kickoff:</span> <span className="text-slate-300">{new Date(draft.game_time).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></div>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {(["line", "odds", "bookmaker"] as const).map((f) => (
            <div key={f}>
              <label className="text-slate-500 block mb-1">{f}</label>
              <input value={editFields[f]} onChange={(e) => setEditFields({ ...editFields, [f]: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500" />
            </div>
          ))}
          {/* Market (bet_type) dropdown — auto-clears line+odds on change */}
          <div>
            <label className="text-slate-500 block mb-1">market</label>
            <select value={editFields.bet_type} onChange={(e) => handleMarketChange(e.target.value)}
              className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500">
              <option value="">—</option>
              <option value="h2h">moneyline</option>
              <option value="spreads">spread</option>
              <option value="totals">total</option>
            </select>
          </div>
          {/* Side — constrained dropdown based on market, shows team names */}
          <div>
            <label className="text-slate-500 block mb-1">side</label>
            <select value={editFields.side} onChange={(e) => handleSideChange(e.target.value)}
              disabled={sideOptions.length === 0}
              className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500 disabled:opacity-50">
              <option value="">— select market first —</option>
              {sideOptions.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          {/* Channel multi-select checkboxes */}
          <div>
            <label className="text-slate-500 block mb-1">channels</label>
            <div className="flex gap-3 pt-1">
              {(["free", "vip", "method"] as const).map((ch) => (
                <label key={ch} className="flex items-center gap-1 cursor-pointer">
                  <input type="checkbox" checked={channelTokens.has(ch)} onChange={() => toggleChannel(ch)}
                    className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0" />
                  <span className="text-slate-300 text-xs uppercase">{ch}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="col-span-full">
            <label className="text-slate-500 block mb-1">reasoning</label>
            <textarea value={editFields.reasoning} onChange={(e) => setEditFields({ ...editFields, reasoning: e.target.value })} rows={3}
              className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500" />
          </div>
          {/* ── Reasoning regeneration matrix banners ── */}
          {editCategory === "cosmetic" && (
            <div className="col-span-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-2">
              <p className="text-xs text-amber-300">
                Line or price changed — reasoning may reference old values.
              </p>
              <button onClick={handleRegenerate} disabled={regenerating}
                className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {regenerating ? "Regenerating..." : "Regenerate reasoning"}
              </button>
            </div>
          )}
          {editCategory === "directional" && (
            <div className={`col-span-full rounded-lg border px-3 py-2 space-y-2 ${directionalGateSatisfied ? "border-green-500/40 bg-green-500/10" : "border-red-500/40 bg-red-500/10"}`}>
              <p className={`text-xs ${directionalGateSatisfied ? "text-green-300" : "text-red-300"}`}>
                {directionalGateSatisfied
                  ? "Reasoning updated to match new side."
                  : `\u26A0 Side changed from ${draft.side ?? "—"} to ${editFields.side || "—"} \u2014 reasoning text references the old side and will read incorrectly. Regenerate or rewrite before saving.`}
              </p>
              {!directionalGateSatisfied && (
                <button onClick={handleRegenerate} disabled={regenerating}
                  className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-500 disabled:opacity-50 transition-colors">
                  {regenerating ? "Regenerating..." : "Regenerate reasoning"}
                </button>
              )}
            </div>
          )}
          {editCategory === "structural" && (
            <div className="col-span-full rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2">
              <p className="text-xs text-blue-300">
                Market changed — reasoning will be auto-regenerated on save.
              </p>
            </div>
          )}
          {saveError && (
            <div className="col-span-full rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {saveError}
            </div>
          )}
        </div>
      )}

      {/* Post-save banner for structural edits */}
      {postSaveBanner && !editing && (
        <div className="rounded-lg border border-blue-500/40 bg-blue-500/10 px-3 py-2 space-y-2">
          <p className="text-xs text-blue-300">{postSaveBanner}</p>
          <button onClick={() => setPostSaveBanner(null)}
            className="rounded border border-blue-500/30 px-3 py-1 text-xs font-medium text-blue-300 hover:text-white hover:border-blue-400 transition-colors">
            Dismiss
          </button>
        </div>
      )}

      {(draft.validator_corrected || draft.original_bookmaker) && (
        <div className="text-xs space-y-0.5 border-l-2 border-yellow-500/50 pl-3">
          {draft.validator_corrected && <p className="text-yellow-300">Validator corrected</p>}
          {draft.original_bookmaker && <p className="text-slate-400">Original bookmaker: {draft.original_bookmaker}</p>}
        </div>
      )}

      {/* Stale reasoning warning with regenerate/accept buttons */}
      {!editing && hasStaleReasoning && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 space-y-2">
          <p className="text-xs text-amber-300">
            Reasoning was written for {staleFields.join(" / ")} — current values differ.
          </p>
          <div className="flex gap-2">
            <button onClick={handleRegenerate} disabled={regenerating}
              className="rounded bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors">
              {regenerating ? "Regenerating..." : "Regenerate reasoning"}
            </button>
            <button onClick={() => setStaleDismissed(true)}
              className="rounded border border-amber-500/30 px-3 py-1 text-xs font-medium text-amber-300 hover:text-white hover:border-amber-400 transition-colors">
              Accept as is
            </button>
          </div>
        </div>
      )}

      {draft.reasoning && !editing && (
        <Collapsible title="Reasoning">
          <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">{draft.reasoning}</p>
        </Collapsible>
      )}

      {log && (
        <>
          {(log.validator_result || log.cross_check_result) && (
            <div className="text-xs space-y-1 border-l-2 border-blue-500/50 pl-3">
              {log.validator_result && <div><span className="text-slate-500">Validator:</span> <span className="text-slate-300">{String(log.validator_result)}</span></div>}
              {log.cross_check_result && <div><span className="text-slate-500">Cross-check:</span> <span className="text-slate-300">{String(log.cross_check_result)}</span></div>}
            </div>
          )}
          {log.odds_api_payload && (
            <Collapsible title="Raw odds_api_payload">
              <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-400 leading-relaxed">{JSON.stringify(log.odds_api_payload, null, 2)}</pre>
            </Collapsible>
          )}
        </>
      )}

      <div className="flex gap-2 pt-1">
        {!editing ? (
          <>
            <button onClick={() => onApprove(draft.id)} disabled={kickoffState.state === "past"}
              className={`rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors ${kickoffState.state === "past" ? "bg-slate-700 cursor-not-allowed opacity-50" : "bg-green-600 hover:bg-green-500"}`}>
              Approve
            </button>
            <button onClick={() => onReject(draft.id)} className="rounded-lg bg-red-600/80 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 transition-colors">Reject</button>
            <button onClick={() => setEditing(true)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors">Edit</button>
          </>
        ) : (
          <>
            <button onClick={handleSave} disabled={saveBlocked}
              className={`rounded-lg px-4 py-2 text-xs font-medium text-white transition-colors ${saveBlocked ? "bg-slate-700 cursor-not-allowed opacity-50" : "bg-blue-600 hover:bg-blue-500"}`}>
              {editCategory === "structural" ? "Save & Regenerate" : "Save"}
            </button>
            <button onClick={() => { setEditing(false); setDirectionalAcknowledged(false); setPostSaveBanner(null); }} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 transition-colors">Cancel</button>
          </>
        )}
      </div>
    </div>
  );
}

// ── History Row ──

function HistoryRow({ pick }: { pick: Pick }) {
  return (
    <tr className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
      <td className="px-3 py-3 text-xs text-slate-300 max-w-[200px] truncate">{pick.game}</td>
      <td className="px-3 py-3 text-xs text-white font-medium max-w-[160px] truncate">{formatPickDisplay({ side: pick.side ?? pick.pick, bet_type: pick.bet_type ?? "h2h", game: pick.game, line: pick.line })}</td>
      <td className="px-3 py-3 text-xs text-slate-300">{pick.odds != null ? formatAmericanOdds(pick.odds) : "\u2014"}</td>
      <td className="px-3 py-3 text-xs text-slate-300">{pick.bookmaker ?? "\u2014"}</td>
      <td className="px-3 py-3 text-xs text-slate-300">{pick.confidence ?? "\u2014"}</td>
      <td className="px-3 py-3"><StatusBadge status={pick.status} /></td>
      <td className="px-3 py-3 text-xs">{pick.result ? <StatusBadge status={pick.result} /> : <span className="text-slate-500">{"\u2014"}</span>}</td>
      <td className="px-3 py-3 text-xs text-slate-400">{pick.created_at ? new Date(pick.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "\u2014"}</td>
    </tr>
  );
}

// ── Controls Tab ──

function ControlsTab({ configs, onToggle, onTriggerCron, cronLoading }: {
  configs: ConfigEntry[];
  onToggle: (key: string, newValue: string) => void;
  onTriggerCron: () => void;
  cronLoading: boolean;
}) {
  const boolFlags = ["TIPSTER_ENABLED", "PINNACLE_CROSSCHECK_ENABLED"];

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-slate-300">System Flags</h3>
        {configs.map((c) => (
          <div key={c.key} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4">
            <div>
              <p className="text-sm font-mono text-slate-200">{c.key}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Updated {new Date(c.updated_at).toLocaleString()} by {c.updated_by}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-sm font-mono ${c.value === "true" ? "text-green-400" : c.value === "false" ? "text-red-400" : "text-slate-300"}`}>
                {c.value}
              </span>
              {boolFlags.includes(c.key) ? (
                <button
                  onClick={() => onToggle(c.key, c.value === "true" ? "false" : "true")}
                  className={`relative h-6 w-11 rounded-full transition-colors ${c.value === "true" ? "bg-green-600" : "bg-slate-700"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${c.value === "true" ? "left-[22px]" : "left-0.5"}`} />
                </button>
              ) : (
                <button
                  onClick={() => {
                    const newVal = prompt(`New value for ${c.key}:`, c.value);
                    if (newVal !== null && newVal !== c.value) onToggle(c.key, newVal);
                  }}
                  className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
                >
                  Edit
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800 pt-6">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Manual Actions</h3>
        <button
          onClick={onTriggerCron}
          disabled={cronLoading}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {cronLoading ? "Running cron..." : "Run daily-picks cron now"}
        </button>
        <p className="text-xs text-slate-500 mt-2">Triggers the daily-picks cron immediately. Picks will be inserted as drafts.</p>
      </div>
    </div>
  );
}

// ── Health Tab ──

function HealthTab({ health, loading }: { health: HealthData | null; loading: boolean }) {
  if (loading || !health) return <p className="text-sm text-slate-500 py-12 text-center">{loading ? "Loading health..." : "No data"}</p>;

  return (
    <div className="space-y-6">
      {/* Last cron */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Last Cron Run</h3>
        {health.last_cron ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><span className="text-slate-500">Action:</span> <span className="text-slate-300">{health.last_cron.action}</span></div>
            <div><span className="text-slate-500">Time:</span> <span className="text-slate-300">{new Date(health.last_cron.created_at).toLocaleString()}</span></div>
            <div className="col-span-2"><span className="text-slate-500">Result:</span> <span className="text-slate-300 font-mono text-[11px]">{typeof health.last_cron.result === "string" ? health.last_cron.result.slice(0, 200) : JSON.stringify(health.last_cron.result).slice(0, 200)}</span></div>
          </div>
        ) : (
          <p className="text-xs text-slate-500">No cron runs recorded</p>
        )}
      </div>

      {/* Bankroll State */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Bankroll</h3>
        {(() => {
          const bs = health.bankroll_state;
          if (!bs) return <p className="text-xs text-slate-500">No bankroll state data</p>;

          const tierColors: Record<string, string> = {
            normal: "bg-green-500/20 text-green-400 border-green-500/30",
            recovery_25: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
            recovery_50: "bg-orange-500/20 text-orange-400 border-orange-500/30",
            paused: "bg-red-500/20 text-red-400 border-red-500/30",
          };

          const notLaunched = !bs.launch_timestamp;

          return (
            <div className="space-y-3">
              {notLaunched && (
                <div className="rounded-lg bg-blue-500/10 border border-blue-500/30 px-3 py-2 text-center">
                  <span className="text-xs font-medium text-blue-400">Tracking begins at supervised enable</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Starting Balance</span>
                  <p className="text-slate-300 font-mono">{bs.starting_balance}u</p>
                </div>
                <div>
                  <span className="text-slate-500">Current Units</span>
                  <p className="text-slate-300 font-mono">{bs.current_units != null ? `${bs.current_units}u` : "\u2014"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Peak Units</span>
                  <p className="text-slate-300 font-mono">{bs.peak_units != null ? `${bs.peak_units}u` : "\u2014"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Drawdown</span>
                  <p className="text-slate-300 font-mono">{bs.drawdown_pct != null ? `${(bs.drawdown_pct * 100).toFixed(1)}%` : "\u2014"}</p>
                </div>
                <div>
                  <span className="text-slate-500">Recovery Tier</span>
                  <p><span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium border ${tierColors[bs.recovery_tier] ?? tierColors.normal}`}>{bs.recovery_tier}</span></p>
                </div>
                <div>
                  <span className="text-slate-500">Last Settled</span>
                  <p className="text-slate-300 font-mono text-[10px]">{bs.last_settled_pick_id ? bs.last_settled_pick_id.slice(0, 8) : "\u2014"}</p>
                </div>
              </div>
              {bs.last_updated && (
                <p className="text-[10px] text-slate-600 text-right">Updated: {new Date(bs.last_updated).toLocaleString()}</p>
              )}
            </div>
          );
        })()}
      </div>

      {/* Odds API Status */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Odds API Status</h3>
        {(() => {
          const s = health.odds_api_status;
          if (!s) return <p className="text-xs text-slate-500">Status unknown</p>;
          const statusConfig: Record<string, { label: string; color: string; dot: string }> = {
            available: { label: "Available", color: "text-green-400", dot: "bg-green-400" },
            credits_exhausted: { label: "Credits Exhausted", color: "text-yellow-400", dot: "bg-yellow-400" },
            error: { label: "Error", color: "text-red-400", dot: "bg-red-400" },
            not_configured: { label: "Not Configured", color: "text-slate-400", dot: "bg-slate-400" },
          };
          const cfg = statusConfig[s.status] ?? statusConfig.error;
          return (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className={`inline-block w-2.5 h-2.5 rounded-full ${cfg.dot}`} />
                <span className={`text-sm font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
              {s.remaining != null && (
                <span className="text-xs text-slate-500">({s.remaining} requests remaining)</span>
              )}
              {s.checkedAt > 0 && (
                <span className="text-xs text-slate-600 ml-auto">checked {new Date(s.checkedAt).toLocaleTimeString()}</span>
              )}
            </div>
          );
        })()}
        {health.odds_api_status?.status === "credits_exhausted" && (
          <p className="text-xs text-yellow-500/70 mt-2">Game search and validation will use ESPN as fallback.</p>
        )}
      </div>

      {/* Scraper rates */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Scraper Success Rate (24h)</h3>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-white">{health.scraper_24h.total}</p>
            <p className="text-xs text-slate-500">Total checks</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-green-400">{health.scraper_24h.pinnacle_success_rate}%</p>
            <p className="text-xs text-slate-500">Pinnacle success</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-400">{health.scraper_24h.by_result?.scraper_failed ?? 0}</p>
            <p className="text-xs text-slate-500">Failures</p>
          </div>
        </div>
      </div>

      {/* Row counts */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Picks by Status</h3>
          <div className="space-y-1.5">
            {Object.entries(health.picks_by_status).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between text-xs">
                <StatusBadge status={status} />
                <span className="text-slate-300 font-mono">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h3 className="text-sm font-medium text-slate-300 mb-3">Decision Log by Result</h3>
          <div className="space-y-1.5">
            {Object.entries(health.decisions_by_result).sort((a, b) => b[1] - a[1]).map(([result, count]) => (
              <div key={result} className="flex items-center justify-between text-xs">
                <span className="text-slate-400">{result}</span>
                <span className="text-slate-300 font-mono">{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Errors */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Recent Errors</h3>
        {health.errors.length === 0 ? (
          <p className="text-xs text-slate-500">No errors in the last 24h</p>
        ) : (
          <div className="space-y-2">
            {health.errors.map((e, i) => (
              <div key={i} className="text-xs border-l-2 border-red-500/50 pl-3">
                <p className="text-red-400">{e.agent_name}: {typeof e.result === "string" ? e.result.slice(0, 150) : JSON.stringify(e.result).slice(0, 150)}</p>
                <p className="text-slate-500">{new Date(e.created_at).toLocaleString()}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Live Log Tab ──

function LiveLogTab({ rows, tableFilter, setTableFilter, loading }: {
  rows: LiveLogRow[];
  tableFilter: string;
  setTableFilter: (v: string) => void;
  loading: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {["all", "decision_log", "audit_log"].map((t) => (
          <button key={t} onClick={() => setTableFilter(t)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${tableFilter === t ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}>
            {t === "all" ? "All" : t === "decision_log" ? "Decision Log" : "Audit Log"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500 py-12 text-center">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500 py-12 text-center">No log entries</p>
      ) : (
        <div className="space-y-1">
          {rows.map((row) => {
            const rowKey = `${row._source}-${row.id}`;
            const isExpanded = expandedId === rowKey;
            const isDecision = row._source === "pick_decision_log";

            return (
              <div key={rowKey} className="rounded-lg border border-slate-800/50 bg-slate-900/30">
                <button onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                  className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-slate-800/30 transition-colors">
                  <span className="text-[10px] text-slate-500">{isExpanded ? "\u25BC" : "\u25B6"}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isDecision ? "bg-blue-500/20 text-blue-400" : "bg-purple-500/20 text-purple-400"}`}>
                    {isDecision ? "DEC" : "AUD"}
                  </span>
                  <span className="text-xs text-slate-300 flex-1 truncate">
                    {isDecision
                      ? `${(row.game as string) ?? ""} \u2014 ${(row.final_decision as string) ?? ""}`
                      : `${(row.action as string) ?? ""} \u2014 ${(row.target_type as string) ?? ""} ${(row.target_id as string)?.slice(0, 8) ?? ""}`}
                  </span>
                  <span className="text-[10px] text-slate-500">{new Date(row.created_at).toLocaleString()}</span>
                </button>
                {isExpanded && (
                  <div className="px-4 pb-3">
                    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-400 leading-relaxed">
                      {JSON.stringify(row, null, 2)}
                    </pre>
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

// ── New Pick Modal ──

const ACTIVE_SPORTS = ["soccer", "basketball", "football", "tennis", "baseball", "hockey", "mma"];
const MARKET_OPTIONS = [
  { value: "h2h", label: "Moneyline" },
  { value: "spreads", label: "Spread" },
  { value: "totals", label: "Total" },
];

function NewPickModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [sport, setSport] = useState("soccer");
  const [gameSearch, setGameSearch] = useState("");
  const [gameResults, setGameResults] = useState<GameSearchResult[]>([]);
  const [selectedGame, setSelectedGame] = useState<GameSearchResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [market, setMarket] = useState("h2h");
  const [side, setSide] = useState("");
  const [line, setLine] = useState("");
  const [price, setPrice] = useState("");
  const [bookmaker, setBookmaker] = useState("");
  const [channels, setChannels] = useState<Set<string>>(new Set(["free"]));
  const [reasoning, setReasoning] = useState("");
  const [kickoffTime, setKickoffTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationWarning, setValidationWarning] = useState<{ message: string; actual_line?: number | null; actual_price?: number | null } | null>(null);

  // Generate from notes state
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState(false);

  // Side options: for h2h/spreads show team names when game selected, fall back to Home/Away
  const sideOptions: { label: string; value: string }[] = (() => {
    if (market === "totals") return [{ label: "Over", value: "over" }, { label: "Under", value: "under" }];
    if (selectedGame) {
      return [
        { label: selectedGame.home_team, value: "home" },
        { label: selectedGame.away_team, value: "away" },
      ];
    }
    return [{ label: "Home", value: "home" }, { label: "Away", value: "away" }];
  })();

  // Track whether dropdown should be shown
  const [gameDropdownOpen, setGameDropdownOpen] = useState(false);

  // Fetch games for sport (search optional)
  const fetchGames = useCallback(async (searchStr: string) => {
    setSearchLoading(true);
    try {
      const searchParam = searchStr.trim().length >= 2 ? `&search=${encodeURIComponent(searchStr.trim())}` : "";
      const res = await fetch(`/api/dashboard/picks/games?sport=${sport}${searchParam}`);
      const data = await res.json();
      setGameResults(data.games ?? []);
    } catch {
      setGameResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [sport]);

  // Debounced game search
  useEffect(() => {
    if (!gameDropdownOpen) return;
    if (selectedGame) return; // Already selected, don't re-search
    const timer = setTimeout(() => fetchGames(gameSearch), 400);
    return () => clearTimeout(timer);
  }, [gameSearch, gameDropdownOpen, selectedGame, fetchGames]);

  function selectGame(g: GameSearchResult) {
    setSelectedGame(g);
    setGameSearch(`${g.home_team} vs ${g.away_team}`);
    setGameResults([]);
    setSide(""); // Clear side when game changes (team names change)
    // Auto-fill kickoff time
    const dt = new Date(g.commence_time);
    const local = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setKickoffTime(local);
  }

  function handleMarketChange(newMarket: string) {
    setMarket(newMarket);
    setSide("");
    setLine("");
    setPrice("");
  }

  function toggleChannel(ch: string) {
    const next = new Set(channels);
    if (next.has(ch)) next.delete(ch);
    else next.add(ch);
    setChannels(next);
  }

  async function handleGenerateFromNotes() {
    if (!notes.trim()) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/dashboard/picks/generate-reasoning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim(),
          game: gameSearch || "TBD",
          sport,
          market,
          side,
          line: line || undefined,
          odds: price || undefined,
        }),
      });
      const data = await res.json();
      if (data.ok && data.reasoning) {
        setReasoning(data.reasoning);
        setShowNotesModal(false);
        setNotes("");
      } else {
        alert(data.error ?? "Failed to generate reasoning");
      }
    } catch {
      alert("Network error generating reasoning");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSubmit(forceUnverified = false) {
    setError(null);
    setValidationWarning(null);

    if (!selectedGame) { setError("Select a game from the dropdown"); return; }
    if (!side) { setError("Side is required"); return; }
    if (!price) { setError("Price (odds) is required"); return; }
    if (!bookmaker.trim()) { setError("Bookmaker is required"); return; }
    if (channels.size === 0) { setError("At least one channel is required"); return; }
    if (!reasoning.trim()) { setError("Reasoning is required"); return; }
    if (!kickoffTime) { setError("Kickoff time is required"); return; }
    if ((market === "spreads" || market === "totals") && !line) { setError("Line is required for spread/total markets"); return; }

    setSubmitting(true);
    try {
      const payload = {
        sport,
        game: selectedGame ? `${selectedGame.home_team} vs ${selectedGame.away_team}` : gameSearch.trim(),
        game_id: selectedGame?.id ?? undefined,
        sport_key: selectedGame?.sport_key ?? undefined,
        home_team: selectedGame?.home_team ?? undefined,
        away_team: selectedGame?.away_team ?? undefined,
        market,
        side,
        line: line ? parseFloat(line) : null,
        odds: parseFloat(price),
        bookmaker: bookmaker.trim(),
        channels: Array.from(channels),
        reasoning: reasoning.trim(),
        game_time: new Date(kickoffTime).toISOString(),
        force_unverified: forceUnverified,
      };

      const res = await fetch("/api/dashboard/picks/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.status === 422 && data.validation_warning) {
        setValidationWarning(data.validation_warning);
        setSubmitting(false);
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Insert failed");
        setSubmitting(false);
        return;
      }

      onCreated();
      onClose();
    } catch {
      setError("Network error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-4 pt-8 overflow-y-auto">
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-5 mb-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Compose New Pick</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
        </div>

        {/* Sport */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Sport</label>
          <select value={sport} onChange={(e) => { setSport(e.target.value); setGameSearch(""); setSelectedGame(null); setGameResults([]); setSide(""); }}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500">
            {ACTIVE_SPORTS.map((s) => (
              <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
            ))}
          </select>
        </div>

        {/* Game search with autocomplete dropdown — selection required */}
        <div className="relative">
          <label className="text-xs text-slate-500 block mb-1">Game / Match</label>
          <input value={gameSearch}
            onChange={(e) => { setGameSearch(e.target.value); setSelectedGame(null); setGameDropdownOpen(true); }}
            onFocus={() => { setGameDropdownOpen(true); if (!selectedGame) fetchGames(gameSearch); }}
            onBlur={() => { setTimeout(() => setGameDropdownOpen(false), 200); }}
            placeholder="Search for a game..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500" />
          {searchLoading && <p className="text-[10px] text-slate-500 mt-1">Searching...</p>}
          {gameDropdownOpen && !selectedGame && gameResults.length > 0 && (
            <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 shadow-xl max-h-48 overflow-y-auto">
              {gameResults.map((g) => {
                const dt = new Date(g.commence_time);
                const dateLabel = dt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) + " EST";
                return (
                  <button key={g.id} onClick={() => { selectGame(g); setGameDropdownOpen(false); }}
                    className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-700 transition-colors border-b border-slate-700/50 last:border-0">
                    <span className="font-medium">{g.home_team} vs {g.away_team}</span>
                    <span className="text-xs text-slate-400 ml-2">{dateLabel}</span>
                    {g.source === "espn" && <span className="text-[10px] bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded px-1 ml-2">ESPN</span>}
                  </button>
                );
              })}
            </div>
          )}
          {selectedGame && <p className="text-[10px] text-green-400 mt-1">Matched: {selectedGame.home_team} vs {selectedGame.away_team} ({selectedGame.sport_key}){selectedGame.source === "espn" ? " (via ESPN)" : ""}</p>}
        </div>

        {/* Market / Side / Line / Price */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500 block mb-1">Market</label>
            <select value={market} onChange={(e) => handleMarketChange(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500">
              {MARKET_OPTIONS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 block mb-1">Side</label>
            <select value={side} onChange={(e) => setSide(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500">
              <option value="">-- select --</option>
              {sideOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          {(market === "spreads" || market === "totals") && (
            <div>
              <label className="text-xs text-slate-500 block mb-1">Line</label>
              <input type="number" step="0.5" value={line} onChange={(e) => setLine(e.target.value)}
                placeholder={market === "totals" ? "e.g. 215.5" : "e.g. -3.5"}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500" />
            </div>
          )}
          <div>
            <label className="text-xs text-slate-500 block mb-1">Price (American)</label>
            <input type="number" value={price} onChange={(e) => setPrice(e.target.value)}
              placeholder="e.g. -110"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500" />
          </div>
        </div>

        {/* Bookmaker */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Bookmaker</label>
          <input value={bookmaker} onChange={(e) => setBookmaker(e.target.value)}
            placeholder="e.g. DraftKings, FanDuel, Pinnacle..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500" />
        </div>

        {/* Channel multi-select */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Channels</label>
          <div className="flex gap-4 pt-1">
            {(["free", "vip", "method"] as const).map((ch) => (
              <label key={ch} className="flex items-center gap-1.5 cursor-pointer">
                <input type="checkbox" checked={channels.has(ch)} onChange={() => toggleChannel(ch)}
                  className="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500 focus:ring-offset-0" />
                <span className="text-slate-300 text-xs uppercase">{ch}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Reasoning */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs text-slate-500">Reasoning</label>
            <button onClick={() => setShowNotesModal(true)}
              className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors">
              Generate from notes
            </button>
          </div>
          <textarea value={reasoning} onChange={(e) => setReasoning(e.target.value)} rows={4}
            placeholder="Your analysis — why this pick has value..."
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500" />
        </div>

        {/* Kickoff time */}
        <div>
          <label className="text-xs text-slate-500 block mb-1">Kickoff Time</label>
          <input type="datetime-local" value={kickoffTime} onChange={(e) => setKickoffTime(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 outline-none focus:border-blue-500" />
        </div>

        {/* Validation warning */}
        {validationWarning && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 space-y-2">
            <p className="text-sm text-amber-300 font-medium">Validation Warning</p>
            <p className="text-xs text-amber-200">{validationWarning.message}</p>
            {validationWarning.actual_price != null && (
              <p className="text-xs text-slate-400">Actual offered price: {validationWarning.actual_price}{validationWarning.actual_line != null ? ` (line: ${validationWarning.actual_line})` : ""}</p>
            )}
            <div className="flex gap-2 pt-1">
              <button onClick={() => handleSubmit(true)} disabled={submitting}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-50 transition-colors">
                {submitting ? "Saving..." : "Save Unverified"}
              </button>
              <button onClick={() => setValidationWarning(null)}
                className="rounded-lg border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:text-white transition-colors">
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            {error}
          </div>
        )}

        {/* Submit */}
        {!validationWarning && (
          <div className="flex gap-3 justify-end pt-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
            <button onClick={() => handleSubmit(false)} disabled={submitting}
              className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
              {submitting ? "Inserting..." : "Insert as Draft"}
            </button>
          </div>
        )}

        {/* Generate from notes sub-modal */}
        {showNotesModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
            <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
              <h3 className="text-base font-semibold">Generate Reasoning from Notes</h3>
              <p className="text-xs text-slate-400">Type bullet-point notes about your analysis. Claude will polish them into Sharkline voice.</p>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={5} autoFocus
                placeholder="- Team A on 5-game win streak&#10;- Key player returning from injury&#10;- H2H favors home side..."
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500" />
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowNotesModal(false)} className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
                <button onClick={handleGenerateFromNotes} disabled={generating || !notes.trim()}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors">
                  {generating ? "Generating..." : "Generate"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Dashboard ──

type Tab = "drafts" | "history" | "controls" | "health" | "live-log";
const STATUS_FILTERS = ["all", "draft", "pending", "published", "approved", "rejected", "settled"];

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("drafts");

  // Drafts
  const [drafts, setDrafts] = useState<Pick[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  // History
  const [picks, setPicks] = useState<Pick[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Controls
  const [configs, setConfigs] = useState<ConfigEntry[]>([]);
  const [configsLoading, setConfigsLoading] = useState(false);
  const [cronLoading, setCronLoading] = useState(false);

  // Health
  const [health, setHealth] = useState<HealthData | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Live Log
  const [logRows, setLogRows] = useState<LiveLogRow[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logTableFilter, setLogTableFilter] = useState("all");

  // New Pick modal
  const [showNewPick, setShowNewPick] = useState(false);

  // Modals
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    title: string; description: string; requireType?: boolean; onConfirm: () => void;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // ── Fetchers ──

  const authRedirect = useCallback((res: Response) => {
    if (res.status === 401) { router.push("/dashboard/login"); return true; }
    return false;
  }, [router]);

  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await fetch("/api/dashboard/drafts");
      if (authRedirect(res)) return;
      const data = await res.json();
      setDrafts(data.drafts ?? []);
    } catch { setFeedback({ type: "error", message: "Failed to load drafts" }); }
    finally { setDraftsLoading(false); }
  }, [authRedirect]);

  const fetchHistory = useCallback(async () => {
    setPicksLoading(true);
    try {
      const res = await fetch(`/api/dashboard/picks?status=${statusFilter}`);
      if (authRedirect(res)) return;
      const data = await res.json();
      setPicks(data.picks ?? []);
    } catch { setFeedback({ type: "error", message: "Failed to load picks" }); }
    finally { setPicksLoading(false); }
  }, [statusFilter, authRedirect]);

  const fetchConfigs = useCallback(async () => {
    setConfigsLoading(true);
    try {
      const res = await fetch("/api/dashboard/config");
      if (authRedirect(res)) return;
      const data = await res.json();
      setConfigs(data.configs ?? []);
    } catch { setFeedback({ type: "error", message: "Failed to load config" }); }
    finally { setConfigsLoading(false); }
  }, [authRedirect]);

  const fetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const res = await fetch("/api/dashboard/health");
      if (authRedirect(res)) return;
      const data = await res.json();
      setHealth(data);
    } catch { setFeedback({ type: "error", message: "Failed to load health" }); }
    finally { setHealthLoading(false); }
  }, [authRedirect]);

  const fetchLiveLog = useCallback(async () => {
    setLogLoading(true);
    try {
      const res = await fetch(`/api/dashboard/live-log?table=${logTableFilter}`);
      if (authRedirect(res)) return;
      const data = await res.json();
      setLogRows(data.rows ?? []);
    } catch { setFeedback({ type: "error", message: "Failed to load log" }); }
    finally { setLogLoading(false); }
  }, [logTableFilter, authRedirect]);

  // ── Tab-based loading ──

  useEffect(() => {
    if (tab === "drafts") fetchDrafts();
  }, [tab, fetchDrafts]);

  useEffect(() => {
    if (tab === "history") fetchHistory();
  }, [tab, fetchHistory]);

  useEffect(() => {
    if (tab === "controls") fetchConfigs();
  }, [tab, fetchConfigs]);

  useEffect(() => {
    if (tab === "health") {
      fetchHealth();
      const interval = setInterval(fetchHealth, 30_000);
      return () => clearInterval(interval);
    }
  }, [tab, fetchHealth]);

  useEffect(() => {
    if (tab === "live-log") fetchLiveLog();
  }, [tab, fetchLiveLog]);

  // Clear feedback
  useEffect(() => {
    if (feedback) { const t = setTimeout(() => setFeedback(null), 4000); return () => clearTimeout(t); }
  }, [feedback]);

  // ── Actions ──

  async function handleApprove(id: string) {
    setConfirmAction({
      title: `Approve pick ${id.slice(0, 8)}...`,
      description: "This will publish the pick to Telegram channels. This action cannot be undone.",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const res = await fetch(`/api/dashboard/picks/${id}/approve`, { method: "POST" });
          const data = await res.json();
          if (data.ok) { setFeedback({ type: "success", message: data.message }); fetchDrafts(); }
          else setFeedback({ type: "error", message: data.error ?? "Approve failed" });
        } catch { setFeedback({ type: "error", message: "Network error" }); }
      },
    });
  }

  async function handleReject(id: string, reason: string) {
    try {
      const res = await fetch(`/api/dashboard/picks/${id}/reject`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.ok) { setFeedback({ type: "success", message: data.message }); setRejectingId(null); fetchDrafts(); }
      else setFeedback({ type: "error", message: data.error ?? "Reject failed" });
    } catch { setFeedback({ type: "error", message: "Network error" }); }
  }

  async function handleSave(id: string, updates: Record<string, unknown>) {
    setConfirmAction({
      title: `Edit pick ${id.slice(0, 8)}...`,
      description: `Updating: ${Object.keys(updates).join(", ")}`,
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const res = await fetch(`/api/dashboard/picks/${id}/edit`, {
            method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates),
          });
          const data = await res.json();
          if (data.ok) { setFeedback({ type: "success", message: data.message }); fetchDrafts(); }
          else setFeedback({ type: "error", message: data.error ?? "Save failed" });
        } catch { setFeedback({ type: "error", message: "Network error" }); }
      },
    });
  }

  function handleToggleFlag(key: string, newValue: string) {
    setConfirmAction({
      title: `Change ${key}`,
      description: `Set ${key} to '${newValue}'. This change takes effect immediately for new cron runs.`,
      requireType: key === "TIPSTER_ENABLED",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          const res = await fetch("/api/dashboard/config", {
            method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key, value: newValue }),
          });
          const data = await res.json();
          if (data.ok) { setFeedback({ type: "success", message: data.message }); fetchConfigs(); }
          else setFeedback({ type: "error", message: data.error ?? "Update failed" });
        } catch { setFeedback({ type: "error", message: "Network error" }); }
      },
    });
  }

  function handleTriggerCron() {
    setConfirmAction({
      title: "Run daily-picks cron now",
      description: "This will trigger the daily-picks cron immediately. New picks will be inserted as drafts.",
      requireType: true,
      onConfirm: async () => {
        setConfirmAction(null);
        setCronLoading(true);
        try {
          const res = await fetch("/api/dashboard/cron/trigger", { method: "POST" });
          const data = await res.json();
          if (data.ok) {
            setFeedback({ type: "success", message: `Cron completed in ${data.duration_ms}ms. Generated: ${data.result?.generated ?? 0}` });
          } else {
            setFeedback({ type: "error", message: data.error ?? "Cron failed" });
          }
        } catch { setFeedback({ type: "error", message: "Network error" }); }
        finally { setCronLoading(false); }
      },
    });
  }

  async function handleLogout() {
    await fetch("/api/dashboard/logout", { method: "POST" });
    router.push("/dashboard/login");
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "drafts", label: `Drafts${drafts.length > 0 ? ` (${drafts.length})` : ""}` },
    { key: "history", label: "History" },
    { key: "controls", label: "Controls" },
    { key: "health", label: "Health" },
    { key: "live-log", label: "Live Log" },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">{"\uD83E\uDD88"} Sharkline Dashboard</h1>
        <button onClick={handleLogout} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors">Logout</button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={`mb-6 rounded-lg border px-4 py-3 text-sm ${feedback.type === "success" ? "border-green-500/30 bg-green-500/10 text-green-300" : "border-red-500/30 bg-red-500/10 text-red-300"}`}>
          {feedback.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-800 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${tab === t.key ? "border-blue-500 text-white" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Drafts */}
      {tab === "drafts" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowNewPick(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors">
              + New Pick
            </button>
          </div>
          {draftsLoading ? <p className="text-sm text-slate-500 py-12 text-center">Loading drafts...</p>
            : drafts.length === 0 ? <p className="text-sm text-slate-500 py-12 text-center">No drafts pending review</p>
            : drafts.map((d) => <DraftCard key={d.id} draft={d} onApprove={handleApprove} onReject={(id) => setRejectingId(id)} onSave={handleSave} onRefreshDrafts={fetchDrafts} />)}
        </div>
      )}

      {/* History */}
      {tab === "history" && (
        <div>
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUS_FILTERS.map((s) => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${statusFilter === s ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"}`}>
                {s}
              </button>
            ))}
          </div>
          {picksLoading ? <p className="text-sm text-slate-500 py-12 text-center">Loading picks...</p>
            : picks.length === 0 ? <p className="text-sm text-slate-500 py-12 text-center">No picks found</p>
            : (
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full">
                  <thead><tr className="border-b border-slate-800 bg-slate-900/50">
                    {["Game", "Pick", "Odds", "Book", "Conf.", "Status", "Result", "Created"].map((h) => (
                      <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{picks.map((p) => <HistoryRow key={p.id} pick={p} />)}</tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* Controls */}
      {tab === "controls" && (
        configsLoading ? <p className="text-sm text-slate-500 py-12 text-center">Loading controls...</p>
          : <ControlsTab configs={configs} onToggle={handleToggleFlag} onTriggerCron={handleTriggerCron} cronLoading={cronLoading} />
      )}

      {/* Health */}
      {tab === "health" && <HealthTab health={health} loading={healthLoading} />}

      {/* Live Log */}
      {tab === "live-log" && <LiveLogTab rows={logRows} tableFilter={logTableFilter} setTableFilter={setLogTableFilter} loading={logLoading} />}

      {/* Modals */}
      {rejectingId && <RejectModal pickId={rejectingId} onClose={() => setRejectingId(null)} onConfirm={(reason) => handleReject(rejectingId, reason)} />}
      {confirmAction && <ConfirmModal title={confirmAction.title} description={confirmAction.description} requireType={confirmAction.requireType} onConfirm={confirmAction.onConfirm} onClose={() => setConfirmAction(null)} />}
      {showNewPick && <NewPickModal onClose={() => setShowNewPick(false)} onCreated={() => { setShowNewPick(false); fetchDrafts(); setFeedback({ type: "success", message: "Manual pick inserted as draft" }); }} />}
    </div>
  );
}
