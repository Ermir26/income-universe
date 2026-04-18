// Scoring Engine — weighted confidence scoring with self-improving weights
// Sharkline's competitive moat.

import { type SupabaseClient } from "@supabase/supabase-js";

export interface ScoringFactors {
  odds_value: number;       // 0-100: how good the odds are vs implied probability
  form_factor: number;      // 0-100: recent team/player form
  h2h_factor: number;       // 0-100: head-to-head record
  market_movement: number;  // 0-100: line movement direction
  public_vs_sharp: number;  // 0-100: contrarian indicator
  situational: number;      // 0-100: rest days, travel, injuries, motivation
}

export interface ScoringWeights {
  odds_value: number;
  form_factor: number;
  h2h_factor: number;
  market_movement: number;
  public_vs_sharp: number;
  situational: number;
}

export interface ScoringResult {
  confidence: number;
  factors: ScoringFactors;
  weights: ScoringWeights;
  breakdown: Record<string, number>;
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  odds_value: 0.25,
  form_factor: 0.20,
  h2h_factor: 0.15,
  market_movement: 0.15,
  public_vs_sharp: 0.10,
  situational: 0.15,
};

const FACTOR_KEYS = Object.keys(DEFAULT_WEIGHTS) as (keyof ScoringWeights)[];

/**
 * Calculate confidence score from individual scoring factors.
 * Returns 0-100.
 */
export function calculateConfidence(
  factors: ScoringFactors,
  weights: ScoringWeights = DEFAULT_WEIGHTS,
): ScoringResult {
  const breakdown: Record<string, number> = {};
  let totalScore = 0;

  for (const key of FACTOR_KEYS) {
    const factorValue = Math.min(100, Math.max(0, factors[key] ?? 50));
    const weight = weights[key] ?? 0;
    const contribution = factorValue * weight;
    breakdown[key] = +contribution.toFixed(2);
    totalScore += contribution;
  }

  const confidence = Math.round(Math.min(100, Math.max(0, totalScore)));

  return { confidence, factors, weights, breakdown };
}

/**
 * Load sport-specific weights from Supabase. Falls back to defaults.
 */
export async function loadWeights(
  supabase: SupabaseClient,
  sport?: string,
): Promise<ScoringWeights> {
  if (!supabase || !sport) return DEFAULT_WEIGHTS;

  const { data } = await supabase
    .from("scoring_weights")
    .select("weights")
    .eq("sport", sport)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (data?.weights) {
    // Merge with defaults so any new factors get default weight
    return { ...DEFAULT_WEIGHTS, ...data.weights };
  }

  return DEFAULT_WEIGHTS;
}

/**
 * Save weight snapshot after calibration.
 */
export async function saveWeights(
  supabase: SupabaseClient,
  weights: ScoringWeights,
  winRate: number,
  periodStart: string,
  periodEnd: string,
  sport?: string,
): Promise<void> {
  await supabase.from("scoring_weights").insert({
    weights,
    win_rate: winRate,
    period_start: periodStart,
    period_end: periodEnd,
    sport: sport ?? null,
  });
}

/**
 * Weekly self-improvement: analyze past picks and adjust weights
 * based on which factors correlated most with wins.
 */
export async function recalibrateWeights(
  supabase: SupabaseClient,
  sport?: string,
): Promise<ScoringWeights | null> {
  // Get completed picks with scoring data from last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  let query = supabase
    .from("picks")
    .select("result, scoring_factors, confidence")
    .in("result", ["won", "lost"])
    .not("scoring_factors", "is", null)
    .gte("sent_at", thirtyDaysAgo.toISOString())
    .order("sent_at", { ascending: false })
    .limit(200);

  if (sport) {
    query = query.eq("sport_key", sport);
  }

  const { data: picks } = await query;

  if (!picks || picks.length < 20) {
    console.log(`   Not enough data for recalibration (${picks?.length ?? 0}/20 needed)`);
    return null;
  }

  const currentWeights = await loadWeights(supabase, sport);
  const wins = picks.filter((p) => p.result === "won").length;
  const currentWinRate = +(wins / picks.length * 100).toFixed(1);

  // For each factor, measure correlation with wins
  const adjustments: Record<string, number> = {};

  for (const key of FACTOR_KEYS) {
    let highScoreWins = 0, highScoreTotal = 0;
    let lowScoreWins = 0, lowScoreTotal = 0;

    for (const pick of picks) {
      const factors = pick.scoring_factors as Record<string, number> | null;
      if (!factors || factors[key] == null) continue;

      const val = factors[key];
      const won = pick.result === "won";

      if (val >= 60) {
        highScoreTotal++;
        if (won) highScoreWins++;
      } else {
        lowScoreTotal++;
        if (won) lowScoreWins++;
      }
    }

    const highRate = highScoreTotal > 0 ? highScoreWins / highScoreTotal : 0.5;
    const lowRate = lowScoreTotal > 0 ? lowScoreWins / lowScoreTotal : 0.5;
    adjustments[key] = highRate - lowRate; // positive = predictive
  }

  // Apply adjustments: shift weights 10% toward better-performing factors
  const newWeights = { ...currentWeights };

  for (const key of FACTOR_KEYS) {
    const adj = adjustments[key] ?? 0;
    const shift = adj * 0.02; // conservative adjustment
    newWeights[key] = Math.max(0.03, Math.min(0.40, newWeights[key] + shift));
  }

  // Renormalize to sum to 1.0
  const total = FACTOR_KEYS.reduce((sum, k) => sum + newWeights[k], 0);
  for (const key of FACTOR_KEYS) {
    newWeights[key] = +(newWeights[key] / total).toFixed(4);
  }

  // Save the new weights
  const periodEnd = new Date().toISOString().split("T")[0];
  const periodStart = thirtyDaysAgo.toISOString().split("T")[0];

  await saveWeights(supabase, newWeights, currentWinRate, periodStart, periodEnd, sport);

  console.log(`   Recalibrated${sport ? ` (${sport})` : ""}: win_rate=${currentWinRate}%, picks=${picks.length}`);
  console.log(`   New weights: ${JSON.stringify(newWeights)}`);

  return newWeights;
}
