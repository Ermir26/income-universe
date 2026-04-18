import { scanSource, SOURCES } from "../claude/scanner";
import { testFeasibility } from "../claude/feasibility";
import { buildPlanet } from "../claude/builder";
import { supabaseAdmin } from "../supabase/server";
import {
  addFeasibilityJob,
  addBuildJob,
} from "../queue/dispatcher";
import type { Discovery } from "../supabase/types";

// Run a full pipeline: scan → discover → test → build → deploy
export async function runFullPipeline(source?: string): Promise<{
  ideasFound: number;
  ideasPassed: number;
  ideasFailed: number;
  planetsCreated: number;
  durationSeconds: number;
}> {
  const startTime = Date.now();
  const sources = source ? [source] : SOURCES;

  console.log(`[Pipeline] Starting scan of ${sources.length} source(s)...`);

  let ideasFound = 0;
  let ideasPassed = 0;
  let ideasFailed = 0;
  let planetsCreated = 0;

  for (const src of sources) {
    // Step 1: Scan
    const discoveries = await scanSource(src);
    ideasFound += discoveries.length;

    // Step 2: Test feasibility for each discovery
    for (const disc of discoveries) {
      if (!disc.name || !disc.description) continue;

      const result = await testFeasibility(
        "pending", // discoveryId — would be real UUID from DB
        disc.name,
        disc.description,
        disc.category || "Other",
        disc.market_signal || ""
      );

      if (result.passed) {
        ideasPassed++;

        // Step 3: Build planet
        const planet = await buildPlanet(
          "pending",
          disc.name,
          disc.category || "Other",
          disc.description,
          result.score,
          result.breakdown
        );

        if (planet) {
          planetsCreated++;
          console.log(`[Pipeline] Planet deployed: ${disc.name}`);
        }
      } else {
        ideasFailed++;
      }
    }
  }

  const durationSeconds = Math.round((Date.now() - startTime) / 1000);

  // Log scan history
  if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
    await supabaseAdmin.from("scan_history").insert({
      source: sources.join(", "),
      ideas_found: ideasFound,
      ideas_passed: ideasPassed,
      ideas_failed: ideasFailed,
      planets_created: planetsCreated,
      duration_seconds: durationSeconds,
    });

    // Update universe stats
    await supabaseAdmin
      .from("universe_stats")
      .update({
        last_scan: new Date().toISOString(),
        scans_today: 1, // Should be incremented atomically
        updated_at: new Date().toISOString(),
      })
      .not("id", "is", null);
  }

  console.log(
    `[Pipeline] Complete: ${ideasFound} found, ${ideasPassed} passed, ${ideasFailed} failed, ${planetsCreated} planets built (${durationSeconds}s)`
  );

  return { ideasFound, ideasPassed, ideasFailed, planetsCreated, durationSeconds };
}

// Queue-based pipeline (dispatches jobs instead of running inline)
export async function dispatchPipelineScan(source?: string) {
  const sources = source ? [source] : SOURCES;
  for (const src of sources) {
    // This would use the dispatcher to add discovery jobs
    // Each discovery job's worker would then dispatch feasibility jobs, etc.
    console.log(`[Pipeline] Dispatched scan job for: ${src}`);
  }
}

// Process a single discovery through the pipeline
export async function processDiscovery(discovery: Discovery): Promise<boolean> {
  if (!discovery.name || !discovery.description) return false;

  const result = await testFeasibility(
    discovery.id,
    discovery.name,
    discovery.description,
    discovery.category || "Other",
    discovery.market_signal || ""
  );

  if (!result.passed) return false;

  const planet = await buildPlanet(
    discovery.id,
    discovery.name,
    discovery.category || "Other",
    discovery.description,
    result.score,
    result.breakdown
  );

  return planet !== null;
}
