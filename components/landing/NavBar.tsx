"use client";

import { useEffect, useState } from "react";

const TELEGRAM_FREE = "https://t.me/SharklineFree";

export default function NavBar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 20);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
      scrolled ? "bg-[#050510]/80 backdrop-blur-xl border-b border-white/[0.06] shadow-lg shadow-black/20" : "bg-transparent"
    }`}>
      <div className="flex items-center justify-between px-6 py-3.5 max-w-7xl mx-auto">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center text-sm font-black text-white shadow-lg shadow-indigo-500/25 group-hover:shadow-indigo-500/40 transition-shadow">
            S
          </div>
          <span className="text-lg font-black tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
            Sharkline
          </span>
        </a>

        <div className="hidden md:flex items-center gap-7 text-sm text-slate-400">
          <a href="#dashboard" className="hover:text-white transition-colors">Dashboard</a>
          <a href="#how" className="hover:text-white transition-colors">How It Works</a>
          <a href="/method" className="hover:text-white transition-colors">Shark Method</a>
          <a href="#pricing" className="hover:text-white transition-colors">Pricing</a>
        </div>

        <div className="flex items-center gap-3">
          <a href={TELEGRAM_FREE} target="_blank" rel="noopener noreferrer"
            className="hidden sm:inline-flex px-4 py-2 text-sm text-slate-300 font-semibold border border-white/10 rounded-lg hover:bg-white/[0.06] hover:border-white/20 transition-all">
            Free Channel
          </a>
          <a href="#pricing"
            className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-cyan-600 text-white text-sm font-bold rounded-lg hover:shadow-lg hover:shadow-indigo-500/20 transition-all">
            Get VIP
          </a>
        </div>
      </div>
    </nav>
  );
}
