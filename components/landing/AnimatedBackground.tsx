export default function AnimatedBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Radial gradient spots */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(99,102,241,0.15),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_40%_at_80%_80%,rgba(6,182,212,0.08),transparent)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_40%_30%_at_20%_60%,rgba(139,92,246,0.06),transparent)]" />

      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
        backgroundSize: "60px 60px",
      }} />

      {/* Floating orbs */}
      <div className="absolute top-[10%] left-[15%] w-80 h-80 rounded-full bg-cyan-500/10 blur-[120px] animate-float-slow" />
      <div className="absolute top-[30%] right-[10%] w-64 h-64 rounded-full bg-indigo-500/10 blur-[100px] animate-float-medium animation-delay-2000" />
      <div className="absolute bottom-[20%] left-[40%] w-72 h-72 rounded-full bg-violet-500/8 blur-[110px] animate-float-slow animation-delay-4000" />
      <div className="absolute top-[60%] right-[30%] w-48 h-48 rounded-full bg-blue-500/8 blur-[80px] animate-float-medium animation-delay-1000" />
    </div>
  );
}
