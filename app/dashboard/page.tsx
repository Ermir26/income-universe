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

function DraftCard({ draft, onApprove, onReject, onSave }: {
  draft: Pick;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onSave: (id: string, updates: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editFields, setEditFields] = useState({
    line: draft.line ?? "", odds: draft.odds?.toString() ?? "", bookmaker: draft.bookmaker ?? "",
    bet_type: draft.bet_type ?? "", side: draft.side ?? "", channel: draft.channel ?? "", reasoning: draft.reasoning ?? "",
  });

  const log = draft.decision_log;

  function handleSave() {
    const updates: Record<string, unknown> = {};
    if (editFields.line !== (draft.line ?? "")) updates.line = editFields.line;
    if (editFields.odds !== (draft.odds?.toString() ?? "")) updates.odds = parseFloat(editFields.odds) || editFields.odds;
    if (editFields.bookmaker !== (draft.bookmaker ?? "")) updates.bookmaker = editFields.bookmaker;
    if (editFields.bet_type !== (draft.bet_type ?? "")) updates.bet_type = editFields.bet_type;
    if (editFields.side !== (draft.side ?? "")) updates.side = editFields.side;
    if (editFields.channel !== (draft.channel ?? "")) updates.channel = editFields.channel;
    if (editFields.reasoning !== (draft.reasoning ?? "")) updates.reasoning = editFields.reasoning;
    if (Object.keys(updates).length > 0) onSave(draft.id, updates);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-slate-300">{draft.game}</p>
          <p className="text-base font-semibold text-white mt-0.5">{draft.pick}</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={draft.status} />
          {draft.confidence != null && <span className="text-xs text-slate-400">{draft.confidence}%</span>}
        </div>
      </div>

      {!editing ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
          {draft.line && <div><span className="text-slate-500">Line:</span> <span className="text-slate-300">{draft.line}</span></div>}
          <div><span className="text-slate-500">Odds:</span> <span className="text-slate-300">{draft.odds ?? "\u2014"}</span></div>
          <div><span className="text-slate-500">Bookmaker:</span> <span className="text-slate-300">{draft.bookmaker ?? "\u2014"}</span></div>
          {draft.channel && <div><span className="text-slate-500">Channel:</span> <span className="text-slate-300">{draft.channel}</span></div>}
          {draft.bet_type && <div><span className="text-slate-500">Bet type:</span> <span className="text-slate-300">{draft.bet_type}</span></div>}
          {draft.side && <div><span className="text-slate-500">Side:</span> <span className="text-slate-300">{draft.side}</span></div>}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
          {(["line", "odds", "bookmaker", "bet_type", "side", "channel"] as const).map((f) => (
            <div key={f}>
              <label className="text-slate-500 block mb-1">{f}</label>
              <input value={editFields[f]} onChange={(e) => setEditFields({ ...editFields, [f]: e.target.value })}
                className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500" />
            </div>
          ))}
          <div className="col-span-full">
            <label className="text-slate-500 block mb-1">reasoning</label>
            <textarea value={editFields.reasoning} onChange={(e) => setEditFields({ ...editFields, reasoning: e.target.value })} rows={3}
              className="w-full rounded border border-slate-700 bg-slate-800/50 px-2 py-1 text-sm text-slate-200 outline-none focus:border-blue-500" />
          </div>
        </div>
      )}

      {(draft.validator_corrected || draft.original_bookmaker) && (
        <div className="text-xs space-y-0.5 border-l-2 border-yellow-500/50 pl-3">
          {draft.validator_corrected && <p className="text-yellow-300">Validator corrected</p>}
          {draft.original_bookmaker && <p className="text-slate-400">Original bookmaker: {draft.original_bookmaker}</p>}
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
            <button onClick={() => onApprove(draft.id)} className="rounded-lg bg-green-600 px-4 py-2 text-xs font-medium text-white hover:bg-green-500 transition-colors">Approve</button>
            <button onClick={() => onReject(draft.id)} className="rounded-lg bg-red-600/80 px-4 py-2 text-xs font-medium text-white hover:bg-red-500 transition-colors">Reject</button>
            <button onClick={() => setEditing(true)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white transition-colors">Edit</button>
          </>
        ) : (
          <>
            <button onClick={handleSave} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white hover:bg-blue-500 transition-colors">Save</button>
            <button onClick={() => setEditing(false)} className="rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 transition-colors">Cancel</button>
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
      <td className="px-3 py-3 text-xs text-slate-300">{pick.odds ?? "\u2014"}</td>
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
          {draftsLoading ? <p className="text-sm text-slate-500 py-12 text-center">Loading drafts...</p>
            : drafts.length === 0 ? <p className="text-sm text-slate-500 py-12 text-center">No drafts pending review</p>
            : drafts.map((d) => <DraftCard key={d.id} draft={d} onApprove={handleApprove} onReject={(id) => setRejectingId(id)} onSave={handleSave} />)}
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
    </div>
  );
}
