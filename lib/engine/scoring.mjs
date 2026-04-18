// Scoring Engine — weighted confidence scoring with self-improving weights
// This is Sharkline's competitive moat.

const DEFAULT_WEIGHTS = {
  recent_form: 0.15,
  h2h_record: 0.10,
  line_movement: 0.20,
  injury_impact: 0.15,
  rest_travel: 0.15,
  home_away: 0.10,
  weather_venue: 0.05,
  claude_raw: 0.10,
};

// ─── Compute weighted score from analysis data ───
export function computeScore(analysisData, weights = DEFAULT_WEIGHTS) {
  const factors = {};

  // Recent form (0-100): team has been winning recently
  factors.recent_form = scoreRecentForm(analysisData.form_team1, analysisData.form_team2, analysisData.picked_team);

  // H2H record (0-100): picked team dominates head-to-head
  factors.h2h_record = scoreH2H(analysisData.h2h, analysisData.picked_team);

  // Line movement (0-100): line moving in our favor = sharp money agrees
  factors.line_movement = scoreLineMovement(analysisData.line_open, analysisData.line_current, analysisData.pick_side);

  // Injury impact (0-100): opponent missing key players
  factors.injury_impact = scoreInjuries(analysisData.injuries, analysisData.picked_team, analysisData.opponent_team);

  // Rest and travel (0-100): picked team has rest advantage
  factors.rest_travel = scoreRestTravel(analysisData.rest_days_picked, analysisData.rest_days_opponent, analysisData.travel_picked, analysisData.travel_opponent);

  // Home/Away record (0-100): strong home/away record
  factors.home_away = scoreHomeAway(analysisData.home_away_record, analysisData.is_home);

  // Weather/venue (0-100): favorable conditions for outdoor sports
  factors.weather_venue = scoreWeatherVenue(analysisData.weather, analysisData.is_outdoor);

  // Claude raw confidence (0-100)
  factors.claude_raw = Math.min(100, Math.max(0, analysisData.claude_confidence || 50));

  // Weighted sum
  let totalScore = 0;
  for (const [factor, weight] of Object.entries(weights)) {
    totalScore += (factors[factor] || 50) * weight;
  }

  // Clamp to 0-100
  totalScore = Math.round(Math.min(100, Math.max(0, totalScore)));

  return { score: totalScore, factors, weights };
}

// ─── Classify pick by confidence tier ───
export function classifyPick(score) {
  if (score >= 85) return { category: "MAXIMUM", stake: 2, stakeStars: "⭐⭐⭐", alert: true };
  if (score >= 75) return { category: "STRONG VALUE", stake: 1.5, stakeStars: "⭐⭐", alert: false };
  if (score >= 62) return { category: "VALUE", stake: 1, stakeStars: "⭐", alert: false };
  return null; // Below threshold — don't send
}

// ─── Factor scoring functions ───

function scoreRecentForm(form1, form2, pickedTeam) {
  // form is like "W-W-L-W-W" or ["W","W","L","W","W"]
  const parseForm = (f) => {
    if (!f) return [];
    if (Array.isArray(f)) return f;
    return f.split(/[-,\s]+/).filter(Boolean);
  };

  const picked = parseForm(form1);
  const opponent = parseForm(form2);

  if (picked.length === 0) return 50; // no data

  const pickedWins = picked.filter((r) => r.toUpperCase() === "W").length;
  const opponentWins = opponent.filter((r) => r.toUpperCase() === "W").length;

  const pickedRate = picked.length > 0 ? pickedWins / picked.length : 0.5;
  const opponentRate = opponent.length > 0 ? opponentWins / opponent.length : 0.5;

  // Score based on differential
  const diff = pickedRate - opponentRate;
  return Math.round(50 + (diff * 50)); // range: 0-100
}

function scoreH2H(h2hStr, pickedTeam) {
  if (!h2hStr) return 50;

  // Parse "Lakers 3-1" or "3-1 this season" or "Team A 2-0 vs Team B"
  const match = h2hStr.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return 50;

  const wins = parseInt(match[1]);
  const losses = parseInt(match[2]);
  const total = wins + losses;
  if (total === 0) return 50;

  const rate = wins / total;
  return Math.round(rate * 100);
}

function scoreLineMovement(lineOpen, lineCurrent, pickSide) {
  if (lineOpen == null || lineCurrent == null) return 50;

  const open = parseFloat(lineOpen);
  const current = parseFloat(lineCurrent);
  if (isNaN(open) || isNaN(current)) return 50;

  const movement = Math.abs(current) - Math.abs(open);

  // If the line moved toward our pick, sharp money agrees
  // For spread picks: line getting bigger = more confidence the favorite covers
  // For moneyline: odds shortening = more confidence
  if (pickSide === "favorite") {
    // Line moved from -2.5 to -3.5 means sharps agree with favorite
    if (current < open) return 75; // moved toward favorite
    if (current > open) return 35; // moved away
  } else {
    if (current > open) return 75; // moved toward underdog
    if (current < open) return 35;
  }

  return 50;
}

function scoreInjuries(injuries, pickedTeam, opponentTeam) {
  if (!injuries) return 50;

  const text = typeof injuries === "string" ? injuries.toLowerCase() : JSON.stringify(injuries).toLowerCase();

  // Check if opponent has injuries (good for us)
  const opponentInjured = opponentTeam && text.includes(opponentTeam.toLowerCase());
  // Check if our team has injuries (bad for us)
  const pickedInjured = pickedTeam && text.includes(pickedTeam.toLowerCase());

  // Keywords indicating severity
  const severeKeywords = ["out", "ruled out", "season-ending", "acl", "torn"];
  const moderateKeywords = ["questionable", "doubtful", "game-time"];

  let score = 50;
  if (opponentInjured) {
    if (severeKeywords.some((k) => text.includes(k))) score += 25;
    else if (moderateKeywords.some((k) => text.includes(k))) score += 15;
    else score += 10;
  }
  if (pickedInjured) {
    if (severeKeywords.some((k) => text.includes(k))) score -= 25;
    else if (moderateKeywords.some((k) => text.includes(k))) score -= 15;
    else score -= 10;
  }

  return Math.min(100, Math.max(0, score));
}

function scoreRestTravel(restPicked, restOpponent, travelPicked, travelOpponent) {
  let score = 50;

  if (restPicked != null && restOpponent != null) {
    const restDiff = restPicked - restOpponent;
    score += restDiff * 10; // +1 day rest = +10 points
  }

  // Back-to-back penalty
  if (restPicked === 0) score -= 15;
  if (restOpponent === 0) score += 15;

  // Travel: home team advantage
  if (travelPicked === "home" && travelOpponent === "away") score += 5;

  return Math.min(100, Math.max(0, score));
}

function scoreHomeAway(record, isHome) {
  if (!record) return 50;

  // Parse "28-8 at home" or "28-8"
  const match = record.match(/(\d+)\s*-\s*(\d+)/);
  if (!match) return 50;

  const wins = parseInt(match[1]);
  const losses = parseInt(match[2]);
  const total = wins + losses;
  if (total === 0) return 50;

  const rate = wins / total;
  // Home advantage is real
  if (isHome) return Math.round(rate * 100);
  // Away record is usually worse, so a good one is more impressive
  return Math.round(rate * 100);
}

function scoreWeatherVenue(weather, isOutdoor) {
  if (!isOutdoor || !weather) return 50;

  const text = typeof weather === "string" ? weather.toLowerCase() : "";
  // Extreme weather can affect outdoor sports
  if (text.includes("rain") || text.includes("snow") || text.includes("wind")) return 40;
  if (text.includes("clear") || text.includes("sunny")) return 55;
  return 50;
}

// ─── Load sport-specific weights from Supabase ───
export async function loadWeights(supabase, sport) {
  if (!supabase) return DEFAULT_WEIGHTS;

  const { data } = await supabase
    .from("scoring_weights")
    .select("weights")
    .eq("sport", sport)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  return data?.weights || DEFAULT_WEIGHTS;
}

// ─── Save updated weights after calibration ───
export async function saveWeights(supabase, sport, weights, version) {
  if (!supabase) return;

  await supabase.from("scoring_weights").insert({
    sport,
    weights,
    version,
  });
}

// ─── Self-improving: recalibrate weights based on actual results ───
export async function recalibrateWeights(supabase, sport) {
  if (!supabase) return null;

  // Get last 100 completed picks for this sport with scoring data
  const { data: picks } = await supabase
    .from("picks")
    .select("result, confidence, scoring_factors, scoring_weights")
    .eq("sport", sport)
    .neq("result", "pending")
    .neq("result", "push")
    .order("sent_at", { ascending: false })
    .limit(100);

  if (!picks || picks.length < 20) {
    console.log(`   Not enough data for ${sport} calibration (${picks?.length || 0}/20 needed)`);
    return null;
  }

  const currentWeights = await loadWeights(supabase, sport);

  // For each factor, calculate correlation with winning
  const factorNames = Object.keys(DEFAULT_WEIGHTS);
  const adjustments = {};

  for (const factor of factorNames) {
    let highScoreWins = 0, highScoreTotal = 0;
    let lowScoreWins = 0, lowScoreTotal = 0;

    for (const pick of picks) {
      const factors = pick.scoring_factors;
      if (!factors || factors[factor] == null) continue;

      const val = factors[factor];
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
    const predictive = highRate - lowRate;

    // Adjust weight: more predictive factors get more weight
    adjustments[factor] = predictive;
  }

  // Normalize adjustments and apply
  const totalAdjustment = Object.values(adjustments).reduce((sum, v) => sum + Math.abs(v), 0);
  if (totalAdjustment === 0) return currentWeights;

  const newWeights = { ...currentWeights };
  for (const factor of factorNames) {
    const adj = adjustments[factor] || 0;
    // Move weight 10% toward the "correct" direction
    const shift = adj * 0.02;
    newWeights[factor] = Math.max(0.02, Math.min(0.40, (newWeights[factor] || 0.1) + shift));
  }

  // Renormalize to sum to 1.0
  const total = Object.values(newWeights).reduce((sum, v) => sum + v, 0);
  for (const key of Object.keys(newWeights)) {
    newWeights[key] = +(newWeights[key] / total).toFixed(4);
  }

  // Get current version
  const { data: current } = await supabase
    .from("scoring_weights")
    .select("version")
    .eq("sport", sport)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  const newVersion = (current?.version || 0) + 1;
  await saveWeights(supabase, sport, newWeights, newVersion);

  console.log(`   Calibrated ${sport} weights (v${newVersion}): ${JSON.stringify(newWeights)}`);
  return newWeights;
}

export { DEFAULT_WEIGHTS };
