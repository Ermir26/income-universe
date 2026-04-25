"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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

// ── Collapsible Section ──

function Collapsible({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
      >
        <span className="text-[10px]">{open ? "▼" : "▶"}</span>
        {title}
      </button>
      {open && <div className="mt-1.5">{children}</div>}
    </div>
  );
}

// ── Reject Modal ──

function RejectModal({
  pickId,
  onClose,
  onConfirm,
}: {
  pickId: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-6 space-y-4">
        <h3 className="text-lg font-semibold">Reject Pick #{pickId.slice(0, 8)}</h3>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason for rejection..."
          rows={3}
          className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-red-500"
          autoFocus
        />
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={!reason.trim()}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Reject
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Draft Card ──

function DraftCard({
  draft,
  onApprove,
  onReject,
  onSave,
}: {
  draft: Pick;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSave: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    line: draft.line ?? "",
    odds: draft.odds?.toString() ?? "",
    bookmaker: draft.bookmaker ?? "",
    bet_type: draft.bet_type ?? "",
    side: draft.side ?? "",
    channel: draft.channel ?? "",
    reasoning: draft.reasoning ?? "",
  });

  const log = draft.decision_log;

  function handleSave() {
    const updates: Record<string, unknown> = {};
    if (editFields.line !== (draft.line ?? "")) updates.line = editFields.line;
    if (editFields.odds !== (draft.odds?.toString() ?? ""))
      updates.odds = parseFloat(editFields.odds) || editFields.odds;
    if (editFields.bookmaker !== (draft.bookmaker ?? "")) updates.bookmaker = editFields.bookmaker;
    if (editFields.bet_type !== (draft.bet_type ?? "")) updates.bet_type = editFields.bet_type;
    if (editFields.side !== (draft.side ?? "")) updates.side = editFields.side;
    if (editFields.channel !== (draft.channel ?? "")) updates.channel = editFields.channel;
    if (editFields.reasoning !== (draft.reasoning ?? "")) updates.reasoning = editFields.reasoning;

    if (Object.keys(updates).length > 0) {
      onSave(draft.id, updates);
    }
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300">{draft.game}</p>
          <p className="text-base font-semibold text-white mt-0.5">{draft.pick}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={draft.status} />
          {draft.confidence != null && (
            <span className="text-xs text-slate-400">{draft.confidence}%</span>
          )}
        </div>
      </div>

      {/* Details grid */}
      {!editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {draft.line && (
            <div>
              <span className="text-slate-500">Line:</span>{" "}
              <span className="text-slate-300">{draft.line}</span>
            </div>
          )}
          <div>
            <span className="text-slate-500">Odds:</span>{" "}
            <span className="text-slate-300">{draft.odds ?? "—"}</span>
          </div>
          <div>
            <span className="text-slate-500">Bookmaker:</span>{" "}
            <span className="text-slate-300">{draft.bookmaker ?? "—"}</span>
          </div>
          {draft.channel && (
            <div>
              <span className="text-slate-500">Channel:</span>{" "}
              <span className="text-slate-300">{draft.channel}</span>
            </div>
          )}
          {draft.bet_type && (
            <div>
              <span className="text-slate-500">Bet type:</span>{" "}
              <span className="text-slate-300">{draft.bet_type}</span>
            </div>
          )}
          {draft.side && (
            <div>
              <span className="text-slate-500">Side:</span>{" "}
              <span className="text-slate-300">{draft.side}</span>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {(["line", "odds", "bookmaker", "bet_type", "side", "channel"] as const).map((f) => (
            <div key={f}>
              <label className="text-slate-500 block mb-1">{f}</label>
              <input
                value={editFields[f]}
                onChange={(e) => setEditFields({ ...editFields, [f]: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500"
              />
            </div>
          ))}
          <div className="col-span-full">
            <label className="text-slate-500 block mb-1">reasoning</label>
            <textarea
              value={editFields.reasoning}
              onChange={(e) => setEditFields({ ...editFields, reasoning: e.target.value })}
              rows={3}
              className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Corrections */}
      {(draft.validator_corrected || draft.original_bookmaker) && (
        <div className="text-xs space-y-0.5 border-l-2 border-yellow-500/50 pl-3">
          {draft.validator_corrected && (
            <p className="text-yellow-300">Validator corrected</p>
          )}
          {draft.original_bookmaker && (
            <p className="text-slate-400">
              Original bookmaker: {draft.original_bookmaker}
            </p>
          )}
        </div>
      )}

      {/* Reasoning */}
      {draft.reasoning && !editing && (
        <Collapsible title="Reasoning">
          <p className="text-xs text-slate-400 whitespace-pre-wrap leading-relaxed">
            {draft.reasoning}
          </p>
        </Collapsible>
      )}

      {/* Decision log */}
      {log && (
        <>
          {(log.validator_result || log.cross_check_result) && (
            <div className="text-xs space-y-1 border-l-2 border-blue-500/50 pl-3">
              {log.validator_result && (
                <div>
                  <span className="text-slate-500">Validator:</span>{" "}
                  <span className="text-slate-300">{String(log.validator_result)}</span>
                </div>
              )}
              {log.cross_check_result && (
                <div>
                  <span className="text-slate-500">Cross-check:</span>{" "}
                  <span className="text-slate-300">{String(log.cross_check_result)}</span>
                </div>
              )}
            </div>
          )}
          {log.odds_api_payload && (
            <Collapsible title="Raw odds_api_payload">
              <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] text-slate-400 leading-relaxed">
                {JSON.stringify(log.odds_api_payload, null, 2)}
              </pre>
            </Collapsible>
          )}
        </>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-1">
        {!editing ? (
          <>
            <button
              onClick={() => onApprove(draft.id)}
              className="rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-500 transition-colors"
            >
              Approve
            </button>
            <button
              onClick={() => onReject(draft.id)}
              className="rounded-lg bg-red-600/80 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 transition-colors"
            >
              Reject
            </button>
            <button
              onClick={() => setEditing(true)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors"
            >
              Edit
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSave}
              className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors"
            >
              Save
            </button>
            <button
              onClick={() => setEditing(false)}
              className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 transition-colors"
            >
              Cancel
            </button>
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
      <td className="px-3 py-3 text-xs text-white font-medium max-w-[160px] truncate">{pick.pick}</td>
      <td className="px-3 py-3 text-xs text-slate-300">{pick.odds ?? "—"}</td>
      <td className="px-3 py-3 text-xs text-slate-300">{pick.bookmaker ?? "—"}</td>
      <td className="px-3 py-3 text-xs text-slate-300">{pick.confidence ?? "—"}</td>
      <td className="px-3 py-3"><StatusBadge status={pick.status} /></td>
      <td className="px-3 py-3 text-xs">
        {pick.result ? <StatusBadge status={pick.result} /> : <span className="text-slate-500">—</span>}
      </td>
      <td className="px-3 py-3 text-xs text-slate-400">
        {pick.created_at ? new Date(pick.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
      </td>
    </tr>
  );
}

// ── Main Dashboard ──

const STATUS_FILTERS = ["all", "draft", "pending", "published", "approved", "rejected", "settled"];

export default function AdminDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"drafts" | "history">("drafts");

  // Drafts state
  const [drafts, setDrafts] = useState<Pick[]>([]);
  const [draftsLoading, setDraftsLoading] = useState(true);

  // History state
  const [picks, setPicks] = useState<Pick[]>([]);
  const [picksLoading, setPicksLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  // Modals & feedback
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Fetch drafts
  const fetchDrafts = useCallback(async () => {
    setDraftsLoading(true);
    try {
      const res = await fetch("/api/admin/drafts");
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      setDrafts(data.drafts ?? []);
    } catch {
      setFeedback({ type: "error", message: "Failed to load drafts" });
    } finally {
      setDraftsLoading(false);
    }
  }, [router]);

  // Fetch history
  const fetchHistory = useCallback(async () => {
    setPicksLoading(true);
    try {
      const res = await fetch(`/api/admin/picks?status=${statusFilter}`);
      if (res.status === 401) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      setPicks(data.picks ?? []);
    } catch {
      setFeedback({ type: "error", message: "Failed to load picks" });
    } finally {
      setPicksLoading(false);
    }
  }, [statusFilter, router]);

  useEffect(() => {
    if (tab === "drafts") {
      fetchDrafts();
    }
  }, [tab, fetchDrafts]);

  useEffect(() => {
    if (tab === "history") {
      fetchHistory();
    }
  }, [tab, fetchHistory]);

  // Clear feedback after 4s
  useEffect(() => {
    if (feedback) {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  // Actions
  async function handleApprove(id: string) {
    if (!confirm(`Approve pick ${id.slice(0, 8)}... and publish to channels?`)) return;
    try {
      const res = await fetch(`/api/admin/picks/${id}/approve`, { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ type: "success", message: data.message });
        fetchDrafts();
      } else {
        setFeedback({ type: "error", message: data.error ?? "Approve failed" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error" });
    }
  }

  async function handleReject(id: string, reason: string) {
    try {
      const res = await fetch(`/api/admin/picks/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ type: "success", message: data.message });
        setRejectingId(null);
        fetchDrafts();
      } else {
        setFeedback({ type: "error", message: data.error ?? "Reject failed" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error" });
    }
  }

  async function handleSave(id: string, updates: Record<string, unknown>) {
    try {
      const res = await fetch(`/api/admin/picks/${id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.ok) {
        setFeedback({ type: "success", message: data.message });
        fetchDrafts();
      } else {
        setFeedback({ type: "error", message: data.error ?? "Save failed" });
      }
    } catch {
      setFeedback({ type: "error", message: "Network error" });
    }
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold tracking-tight">
          {"🦈"} Sharkline Admin
        </h1>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Feedback toast */}
      {feedback && (
        <div
          className={`mb-6 rounded-lg border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-300"
              : "border-red-500/30 bg-red-500/10 text-red-300"
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-slate-800">
        <button
          onClick={() => setTab("drafts")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "drafts"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          Drafts{drafts.length > 0 ? ` (${drafts.length})` : ""}
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
            tab === "history"
              ? "border-blue-500 text-white"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          History
        </button>
      </div>

      {/* Drafts Tab */}
      {tab === "drafts" && (
        <div className="space-y-4">
          {draftsLoading ? (
            <p className="text-sm text-slate-500 py-12 text-center">Loading drafts...</p>
          ) : drafts.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">No drafts pending review</p>
          ) : (
            drafts.map((d) => (
              <DraftCard
                key={d.id}
                draft={d}
                onApprove={handleApprove}
                onReject={(id) => setRejectingId(id)}
                onSave={handleSave}
              />
            ))
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div>
          {/* Filter */}
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  statusFilter === s
                    ? "bg-blue-600 text-white"
                    : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {picksLoading ? (
            <p className="text-sm text-slate-500 py-12 text-center">Loading picks...</p>
          ) : picks.length === 0 ? (
            <p className="text-sm text-slate-500 py-12 text-center">No picks found</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50">
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Game</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Pick</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Odds</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Book</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Conf.</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Status</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Result</th>
                    <th className="px-3 py-2.5 text-left text-xs font-medium text-slate-400">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {picks.map((p) => (
                    <HistoryRow key={p.id} pick={p} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Reject modal */}
      {rejectingId && (
        <RejectModal
          pickId={rejectingId}
          onClose={() => setRejectingId(null)}
          onConfirm={(reason) => handleReject(rejectingId, reason)}
        />
      )}
    </div>
  );
}
