"use client";

import { useUniverseStore } from "@/store/universe";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";

interface TopBarProps {
  onScan?: () => void;
}

export default function TopBar({ onScan }: TopBarProps) {
  const { stats, scanning, autoMode, setAutoMode, setScanning } =
    useUniverseStore();

  const handleScan = async () => {
    if (onScan) {
      onScan();
      return;
    }
    // Fallback: direct API call
    setScanning(true);
    try {
      await fetch("/api/scan", { method: "POST" });
    } catch (err) {
      console.error("Scan failed:", err);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="h-14 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center px-6 gap-4 z-50 relative">
      {/* Logo */}
      <h1 className="font-[Orbitron] text-sm font-bold bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent tracking-wider">
        INCOME UNIVERSE
      </h1>

      <div className="h-5 w-px bg-slate-700" />

      {/* Live Revenue */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Revenue</span>
        <span className="text-sm font-mono font-bold text-green-400">
          ${(stats?.total_revenue || 0).toFixed(2)}
        </span>
      </div>

      <div className="h-5 w-px bg-slate-700" />

      {/* Active Planets */}
      <Badge color="cyan" pulse={scanning}>
        {stats?.active_planets || 0} planets
      </Badge>

      {/* Agents */}
      <Badge color="green">
        {stats?.agents_running || 0} agents
      </Badge>

      <div className="flex-1" />

      {/* Controls */}
      <Button
        variant="ghost"
        size="sm"
        onClick={handleScan}
        disabled={scanning}
        className={scanning ? "animate-pulse" : ""}
      >
        {scanning ? "Scanning..." : "Scan Now"}
      </Button>

      <button
        onClick={() => setAutoMode(!autoMode)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
          autoMode
            ? "bg-green-500/20 text-green-400 border border-green-500/30"
            : "bg-slate-700 text-slate-400 border border-slate-600"
        }`}
      >
        {autoMode && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        )}
        {autoMode ? "AUTO ON" : "AUTO OFF"}
      </button>
    </div>
  );
}
