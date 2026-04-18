const features = [
  { name: "Real-time picks", free: "Delayed", vip: "Instant" },
  { name: "All sports access", free: "Limited", vip: "Full" },
  { name: "Edge % shown", free: false, vip: true },
  { name: "Bankroll management", free: false, vip: true },
  { name: "Priority alerts", free: false, vip: true },
  { name: "Performance analytics", free: "Basic", vip: "Full" },
  { name: "Direct support", free: false, vip: true },
  { name: "Early access", free: false, vip: true },
] as const;

function CellValue({ value }: { value: string | boolean }) {
  if (value === true) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500/20">
        <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  if (value === false) {
    return (
      <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-white/[0.04]">
        <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    );
  }
  return <span className="text-sm text-slate-300">{value}</span>;
}

export default function FreeVsVip() {
  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-20">
      <h2 className="text-center text-3xl sm:text-4xl font-bold text-white mb-3">
        Free vs VIP
      </h2>
      <p className="text-center text-slate-400 mb-10 max-w-lg mx-auto">
        See what you unlock when you go VIP.
      </p>

      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl overflow-hidden">
        {/* Header row */}
        <div className="grid grid-cols-[1fr_100px_100px] sm:grid-cols-[1fr_130px_130px] text-center border-b border-white/[0.06]">
          <div />
          <div className="py-4 px-2">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-slate-400 border border-white/[0.08] rounded-full px-3 py-1">
              Free
            </span>
          </div>
          <div className="py-4 px-2 bg-gradient-to-b from-indigo-500/[0.12] to-indigo-500/[0.04]">
            <span className="inline-block text-xs font-semibold uppercase tracking-wider text-indigo-300 border border-indigo-400/30 rounded-full px-3 py-1">
              VIP
            </span>
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
              <CellValue value={f.free} />
            </div>
            <div className="flex items-center justify-center py-3.5 bg-gradient-to-b from-indigo-500/[0.06] to-transparent">
              <CellValue value={f.vip} />
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-8 text-center">
        <a
          href="#pricing"
          className="inline-block px-8 py-3 rounded-full font-semibold text-white bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 transition-all shadow-lg shadow-indigo-500/25"
        >
          Upgrade to VIP
        </a>
      </div>
    </section>
  );
}
