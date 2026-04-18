"use client";

import { useEffect, useRef, useCallback } from "react";
import { useUniverseStore } from "@/store/universe";
import { useFeedStore } from "@/store/feed";

export function useDataLoader() {
  const {
    setStats,
    setGalaxies,
    setPlanets,
    autoMode,
    setScanning,
  } = useUniverseStore();
  const { addEvent } = useFeedStore();
  const autoIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const agentIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initializedRef = useRef(false);

  // Load planets and stats from server
  const loadData = useCallback(async () => {
    try {
      const [planetsRes, statsRes] = await Promise.all([
        fetch("/api/planets"),
        fetch("/api/stats"),
      ]);
      if (planetsRes.ok) {
        const { planets, galaxies } = await planetsRes.json();
        setPlanets(planets || []);
        setGalaxies(galaxies || []);
      }
      if (statsRes.ok) {
        const stats = await statsRes.json();
        if (stats.id) setStats(stats);
      }
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  }, [setPlanets, setGalaxies, setStats]);

  // Seed the universe on first load if empty
  const seedAndLoad = useCallback(async () => {
    try {
      // Check if we have planets
      const check = await fetch("/api/planets");
      const { planets } = await check.json();

      if (!planets || planets.length === 0) {
        // Seed
        addEvent({
          id: `sys-${Date.now()}`,
          type: "system",
          message: "Initializing universe...",
          timestamp: new Date().toISOString(),
        });

        const seedRes = await fetch("/api/seed", { method: "POST" });
        if (seedRes.ok) {
          const data = await seedRes.json();
          setPlanets(data.planets || []);
          setGalaxies(data.galaxies || []);
          if (data.stats) setStats(data.stats);

          addEvent({
            id: `sys-${Date.now()}-seeded`,
            type: "planet",
            message: `Universe seeded: ${data.planets?.length || 0} planets deployed`,
            timestamp: new Date().toISOString(),
          });

          // Add individual planet events
          for (const planet of data.planets || []) {
            addEvent({
              id: `seed-${planet.id}`,
              type: "planet",
              message: `${planet.icon} ${planet.name} deployed`,
              planetName: planet.name,
              timestamp: new Date().toISOString(),
            });
          }
        }
      } else {
        setPlanets(planets);
        const { galaxies } = await (await fetch("/api/planets")).json();
        setGalaxies(galaxies || []);
      }

      // Load stats
      const statsRes = await fetch("/api/stats");
      if (statsRes.ok) {
        const stats = await statsRes.json();
        if (stats.id) setStats(stats);
      }
    } catch (err) {
      console.error("Seed failed:", err);
    }
  }, [setPlanets, setGalaxies, setStats, addEvent]);

  // Run agents (called periodically)
  const runAgents = useCallback(async () => {
    try {
      const res = await fetch("/api/agents/run", { method: "POST" });
      if (!res.ok) return;
      const data = await res.json();

      // Update stats
      if (data.stats) setStats(data.stats);
      if (data.planets) setPlanets(data.planets);

      // Add feed events
      for (const event of data.events || []) {
        addEvent({
          id: event.id,
          type: event.type,
          message: event.message,
          planetName: event.planetName,
          amount: event.amount,
          timestamp: event.timestamp,
        });
      }
    } catch {
      // Silently fail
    }
  }, [setStats, setPlanets, addEvent]);

  // Run a scan (called by AUTO mode or scan button)
  const runScan = useCallback(async () => {
    setScanning(true);
    try {
      addEvent({
        id: `scan-start-${Date.now()}`,
        type: "scan",
        message: "Scanning for new opportunities...",
        timestamp: new Date().toISOString(),
      });

      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 3 }),
      });

      if (!res.ok) throw new Error("Scan failed");
      const data = await res.json();

      // Update stores
      if (data.planets) setPlanets(data.planets);
      if (data.galaxies) setGalaxies(data.galaxies);
      if (data.stats) setStats(data.stats);

      // Add feed events
      for (const event of data.feedEvents || []) {
        addEvent({
          id: `feed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          type: event.type as "scan" | "planet" | "system",
          message: event.message,
          planetName: event.planetName,
          amount: event.amount,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.error("Scan failed:", err);
      addEvent({
        id: `scan-err-${Date.now()}`,
        type: "system",
        message: "Scan failed — will retry",
        timestamp: new Date().toISOString(),
      });
    } finally {
      setScanning(false);
    }
  }, [setScanning, setPlanets, setGalaxies, setStats, addEvent]);

  // Initial seed on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    seedAndLoad();
  }, [seedAndLoad]);

  // Agent runner — runs every 8 seconds when there are planets
  useEffect(() => {
    agentIntervalRef.current = setInterval(runAgents, 8000);
    return () => {
      if (agentIntervalRef.current) clearInterval(agentIntervalRef.current);
    };
  }, [runAgents]);

  // AUTO mode — run scan every 60 seconds when enabled
  useEffect(() => {
    if (autoMode) {
      // Run an initial scan after a short delay
      const timeout = setTimeout(runScan, 5000);
      autoIntervalRef.current = setInterval(runScan, 60000);
      return () => {
        clearTimeout(timeout);
        if (autoIntervalRef.current) clearInterval(autoIntervalRef.current);
      };
    } else {
      if (autoIntervalRef.current) {
        clearInterval(autoIntervalRef.current);
        autoIntervalRef.current = null;
      }
    }
  }, [autoMode, runScan]);

  return { loadData, runScan, runAgents };
}
