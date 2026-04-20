const features = [
  { name: "8-10 daily picks across all sports", vip: true, method: true },
  { name: "Full 17-dimension research analysis", vip: true, method: true },
  { name: "Confidence tiers and reasoning", vip: true, method: true },
  { name: "Live score updates", vip: true, method: true },
  { name: "Curated top 2-3 picks (highest confidence only)", vip: false, method: true },
  { name: "Exact unit staking instructions", vip: false, method: true },
  { name: "Daily bankroll & exposure tracking", vip: false, method: true },
  { name: "Streak alerts & system status updates", vip: false, method: true },
  { name: '"No edge" days — we sit out weak days', vip: false, method: true },
  { name: "Sport ROI breakdown", vip: false, method: true },
  { name: "Monthly performance reports", vip: false, method: true },
] as const;

function CellValue({ value }: { value: boolean }) {
  if (value) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20">
        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/[0.04]">
      <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  );
}

export default function FreeVsVip() {
  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-20">
      <h2 className="text-center text-3xl sm:text-4xl font-bold text-white mb-3">
        VIP vs Shark Method
      </h2>
      <p className="text-center text-slate-400 mb-10 max-w-lg mx-auto">
        See what you unlock with the full Shark Method system.
      </p>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_100px_100px] sm:grid-cols-[1fr_130px_130px] text-center border-b border-white/[0.06]">
          <div />
          <div className="py-4 px-2">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-slate-400 border border-white/[0.08] rounded-full px-3 py-1">
              VIP
            </span>
            <div className="text-[10px] text-slate-500 mt-1">from $37</div>
          </div>
          <div className="py-4 px-2 bg-gradient-to-b from-cyan-500/[0.12] to-cyan-500/[0.04]">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-cyan-300 border border-cyan-400/30 rounded-full px-3 py-1">
              Method
            </span>
            <div className="text-[10px] text-cyan-400 mt-1">from $67</div>
          </div>
        </div>

        {/* Feature rows */}
        {features.map((f, i) => (
          <div
            key={f.name}
            className={`grid grid-cols-[1fr_100px_100px] sm:grid-cols-[1fr_130px_130px] items-center text-center ${
              i !== features.length - 1 ? "border-b border-white/[0.06]" : ""
            }`}
          >
            <span className="text-sm text-slate-300 text-left pl-5 py-3.5">
              {f.name}
            </span>
            <div className="flex items-center justify-center py-3.5">
              <CellValue value={f.vip} />
            </div>
            <div className="flex items-center justify-center py-3.5 bg-gradient-to-b from-cyan-500/[0.06] to-transparent">
              <CellValue value={f.method} />
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-8 text-center">
        <a
          href="#pricing"
          className="inline-block px-8 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 transition-all shadow-lg shadow-cyan-500/25"
        >
          View Pricing
        </a>
      </div>
    </section>
  );
}
