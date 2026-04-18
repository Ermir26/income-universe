"use client";

import { useUniverseStore } from "@/store/universe";
import TopBar from "@/components/dashboard/TopBar";
import UniverseStats from "@/components/dashboard/UniverseStats";
import UniverseMap from "@/components/universe/UniverseMap";
import LiveFeed from "@/components/dashboard/LiveFeed";
import PlanetDetail from "@/components/planet/PlanetDetail";

export default function UniversePage() {
  const {
    selectedPlanetId,
    planets,
    galaxies,
    setSelectedPlanet,
    updatePlanet,
  } = useUniverseStore();

  const selectedPlanet = planets.find((p) => p.id === selectedPlanetId);
  const selectedGalaxy = selectedPlanet
    ? galaxies.find((g) => g.id === selectedPlanet.galaxy_id)
    : undefined;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <TopBar />
      <UniverseStats />

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          <UniverseMap />
        </div>
        <LiveFeed />
      </div>

      {selectedPlanet && (
        <PlanetDetail
          planet={selectedPlanet}
          galaxy={selectedGalaxy}
          onClose={() => setSelectedPlanet(null)}
          onToggleStatus={(id, status) => updatePlanet(id, { status })}
        />
      )}
    </div>
  );
}
