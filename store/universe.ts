import { create } from "zustand";
import type { Galaxy, Planet, UniverseStats } from "@/lib/supabase/types";

interface UniverseState {
  stats: UniverseStats | null;
  galaxies: Galaxy[];
  planets: Planet[];
  selectedPlanetId: string | null;
  autoMode: boolean;
  scanning: boolean;

  setStats: (stats: UniverseStats) => void;
  setGalaxies: (galaxies: Galaxy[]) => void;
  setPlanets: (planets: Planet[]) => void;
  addPlanet: (planet: Planet) => void;
  updatePlanet: (id: string, updates: Partial<Planet>) => void;
  setSelectedPlanet: (id: string | null) => void;
  setAutoMode: (on: boolean) => void;
  setScanning: (on: boolean) => void;
}

export const useUniverseStore = create<UniverseState>((set) => ({
  stats: null,
  galaxies: [],
  planets: [],
  selectedPlanetId: null,
  autoMode: true,
  scanning: false,

  setStats: (stats) => set({ stats }),
  setGalaxies: (galaxies) => set({ galaxies }),
  setPlanets: (planets) => set({ planets }),
  addPlanet: (planet) =>
    set((state) => ({ planets: [...state.planets, planet] })),
  updatePlanet: (id, updates) =>
    set((state) => ({
      planets: state.planets.map((p) =>
        p.id === id ? { ...p, ...updates } : p
      ),
    })),
  setSelectedPlanet: (id) => set({ selectedPlanetId: id }),
  setAutoMode: (on) => set({ autoMode: on }),
  setScanning: (on) => set({ scanning: on }),
}));
