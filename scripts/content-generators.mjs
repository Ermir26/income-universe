// Content Generators — Twitter threads, TikTok scripts, reasoning replays
// Sharkline: all content from real data, never mention AI
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getRecord, getWeeklyRecord } from "./update-results.mjs";
import { getSportEmoji } from "./tipster-core.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
const BRAND_URL = "sharkline.ai";
const DASHBOARD_URL = "sharkline.ai/public";
const pickUrl = (id) => `${BRAND_URL}/public/pick/${id}`;

// ═══════════════════════════════════
// A) TWITTER THREAD GENERATOR
// ═══════════════════════════════════

export async function generateTwitterThread() {
  console.log("\n🐦 Content Generator — Twitter Thread...\n");

  const record = await getRecord(supabase);
  const weekly = await getWeeklyRecord(supabase);

  if (record.total < 5) {
    console.log("   Not enough data for a thread — skipping");
    return null;
  }

  // Get recent notable wins
  const { data: recentWins } = await supabase
    .from("picks")
    .select("id, sport, sport_key, game, pick, odds, profit, category, reasoning, scoring_factors")
    .eq("result", "won")
    .order("sent_at", { ascending: false })
    .limit(5);

  // Build positive stats only
  const statLines = [];
  if (record.winRate >= 55) statLines.push(`${record.wins}W-${record.losses}L (${record.winRate}%)`);
  else statLines.push(`${record.wins} verified wins`);
  if (record.roi > 0) statLines.push(`+${record.roi}% ROI`);
  if (record.streakType === "win" && record.streakCount >= 3) statLines.push(`${record.streakCount} win streak`);
  if (weekly.wins > weekly.losses) statLines.push(`This week: ${weekly.wins}W-${weekly.losses}L`);

  const winsContext = (recentWins ?? [])
    .map((w) => `- ${w.sport}: ${w.pick} at ${w.odds} (link: ${pickUrl(w.id)})`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2000,
    messages: [{
      role: "user",
      content: `You are the copywriter for Sharkline, a sports picks service. Write as a confident human sports analyst. NEVER mention AI, algorithms, models, or automation.

Write a Twitter/X thread (5-7 tweets) showcasing our track record and recent wins.

REAL stats:
${statLines.map(l => `- ${l}`).join("\n")}

Recent wins with links:
${winsContext}

Dashboard: ${DASHBOARD_URL}

Rules:
- Tweet 1: Hook — bold claim backed by our real numbers
- Tweets 2-4: Highlight specific wins with pick page links
- Tweet 5-6: What makes us different (transparency — we show ALL results, wins AND losses)
- Last tweet: CTA — follow + free picks daily at ${BRAND_URL}
- Each tweet under 280 chars
- Use sports emojis naturally
- Write in first person plural ("we")
- Sound confident but authentic, not scammy
- ONLY use real stats provided. Never invent numbers.
- Include #SportsBetting #FreePicks on first and last tweets

Return ONLY this JSON array:
[
  {"tweet": 1, "content": "..."},
  {"tweet": 2, "content": "..."},
  ...
]`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return null;

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
  }

  let thread;
  try {
    thread = JSON.parse(jsonStr);
  } catch {
    console.log("   Failed to parse thread response");
    return null;
  }

  // Save to Supabase
  await supabase.from("marketing_posts").insert({
    platform: "twitter_thread",
    content: JSON.stringify(thread),
    performance_data: { type: "twitter_thread", stats: statLines },
    posted: false,
  });

  console.log(`   Generated ${thread.length}-tweet thread:`);
  for (const t of thread) {
    console.log(`\n   [${t.tweet}] ${t.content.substring(0, 120)}${t.content.length > 120 ? "..." : ""}`);
  }
  console.log(`\n   [SAVED — for Ermir to post manually]`);

  return thread;
}

// ═══════════════════════════════════
// B) TIKTOK SCRIPT GENERATOR
// ═══════════════════════════════════

export async function generateTikTokScript() {
  console.log("\n🎬 Content Generator — TikTok Script...\n");

  const record = await getRecord(supabase);

  if (record.total < 5) {
    console.log("   Not enough data — skipping");
    return null;
  }

  // Get best recent win for the story
  const { data: bestWins } = await supabase
    .from("picks")
    .select("id, sport, game, pick, odds, profit, reasoning")
    .eq("result", "won")
    .order("profit", { ascending: false })
    .limit(3);

  const bestWin = bestWins?.[0];
  if (!bestWin) {
    console.log("   No wins to feature — skipping");
    return null;
  }

  // Build stat context
  const statLines = [];
  if (record.winRate >= 55) statLines.push(`Win rate: ${record.winRate}%`);
  if (record.roi > 0) statLines.push(`ROI: +${record.roi}%`);
  statLines.push(`Total picks: ${record.total}`);
  if (record.streakType === "win" && record.streakCount >= 3) statLines.push(`Current streak: ${record.streakCount}`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You write TikTok scripts for Sharkline, a sports picks service. Write as a confident sports analyst on camera. NEVER mention AI, algorithms, or automation.

Write a 30-45 second TikTok script about this winning pick:
- Sport: ${bestWin.sport}
- Game: ${bestWin.game}
- Pick: ${bestWin.pick} at ${bestWin.odds}
- Reasoning: ${bestWin.reasoning || "Edge in the odds"}

Our real stats:
${statLines.join("\n")}

Format:
HOOK (first 3 seconds — must stop the scroll)
BODY (the breakdown — why we took the pick, what we saw)
PROOF (show the win, reference our public dashboard at ${DASHBOARD_URL})
CTA (follow for free picks daily)

Rules:
- Conversational, like talking to a friend
- "We" not "I"
- Reference the specific game and odds
- No jargon — keep it accessible
- Transparency angle: "We show ALL our results, wins AND losses, at ${DASHBOARD_URL}"
- ONLY use real stats. Never invent numbers.
- NEVER mention AI or algorithms

Return ONLY this JSON:
{
  "hook": "...",
  "body": "...",
  "proof": "...",
  "cta": "...",
  "caption": "... (under 150 chars with hashtags)",
  "duration_estimate": "30s"
}`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return null;

  let jsonStr = textBlock.text.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
  }

  let script;
  try {
    script = JSON.parse(jsonStr);
  } catch {
    console.log("   Failed to parse TikTok script");
    return null;
  }

  await supabase.from("marketing_posts").insert({
    platform: "tiktok_script",
    content: JSON.stringify(script),
    pick_ids: [bestWin.id],
    performance_data: { type: "tiktok_script", featured_pick: bestWin.id },
    posted: false,
  });

  console.log(`   Generated TikTok script (~${script.duration_estimate}):`);
  console.log(`   HOOK: ${script.hook}`);
  console.log(`   BODY: ${script.body.substring(0, 120)}...`);
  console.log(`   CAPTION: ${script.caption}`);
  console.log(`   [SAVED — for Ermir to record]`);

  return script;
}

// ═══════════════════════════════════
// C) REASONING REPLAY GENERATOR
// ═══════════════════════════════════

export async function generateReasoningReplay(pickId) {
  console.log(`\n🧠 Content Generator — Reasoning Replay${pickId ? ` for pick ${pickId}` : ""}...\n`);

  // Get the pick — either specified or most recent notable win
  let pick;
  if (pickId) {
    const { data } = await supabase
      .from("picks")
      .select("id, sport, sport_key, game, pick, odds, profit, category, reasoning, scoring_factors, scoring_weights, result, actual_result")
      .eq("id", pickId)
      .single();
    pick = data;
  } else {
    const { data } = await supabase
      .from("picks")
      .select("id, sport, sport_key, game, pick, odds, profit, category, reasoning, scoring_factors, scoring_weights, result, actual_result")
      .eq("result", "won")
      .not("scoring_factors", "is", null)
      .order("sent_at", { ascending: false })
      .limit(1)
      .single();
    pick = data;
  }

  if (!pick) {
    console.log("   No pick found with scoring data — skipping");
    return null;
  }

  const emoji = getSportEmoji(pick.sport_key) || "🏅";
  const factors = pick.scoring_factors ?? {};
  const weights = pick.scoring_weights ?? {};
  const link = pickUrl(pick.id);

  // Build factor breakdown
  const factorLabels = {
    odds_value: "Odds Value",
    form_factor: "Form",
    h2h_factor: "H2H",
    market_movement: "Market Movement",
    public_vs_sharp: "Sharp Money",
    situational: "Situational",
  };

  const breakdown = Object.entries(factors)
    .sort((a, b) => (b[1] * (weights[b[0]] || 0.15)) - (a[1] * (weights[a[0]] || 0.15)))
    .map(([key, score]) => {
      const label = factorLabels[key] || key;
      const weight = weights[key] || 0.15;
      const weighted = (score * weight).toFixed(0);
      const bar = score >= 75 ? "🟢" : score >= 50 ? "🟡" : "🔴";
      return `${bar} ${label}: ${score}/100 (${(weight * 100).toFixed(0)}% weight → ${weighted} pts)`;
    })
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1500,
    messages: [{
      role: "user",
      content: `You write reasoning breakdowns for Sharkline. Write as a confident sports analyst explaining your thinking AFTER the result. NEVER mention AI, algorithms, or automation.

Write a "Reasoning Replay" post for this ${pick.result === "won" ? "winning" : "losing"} pick:
- ${emoji} ${pick.sport}: ${pick.game}
- Pick: ${pick.pick} at ${pick.odds}
- Result: ${pick.result === "won" ? "✅ WON" : "❌ LOST"}
- Actual result: ${pick.actual_result || "N/A"}
- Category: ${pick.category || "VALUE"}

Scoring breakdown:
${breakdown}

Original reasoning: ${pick.reasoning || "Edge detected in odds movement"}

Write a post that:
1. Walks through WHY we took this pick (which factors stood out)
2. Shows the scoring breakdown in a readable way
3. Explains what we saw that the market missed (if won) or what went wrong (if lost)
4. Links to the full analysis page: ${link}
5. Transparency angle: we show EVERYTHING — wins AND losses

Format for Telegram (HTML parse_mode). Keep it under 1500 chars.

Rules:
- Write in first person plural ("we")
- Be honest about losses — that builds trust
- Reference specific scoring factors
- NEVER mention AI or algorithms — we are "sports analysts" who "do the research"
- End with: "Full breakdown → ${link}"

Return ONLY the HTML text (no JSON wrapper).`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock) return null;

  let content = textBlock.text.trim();
  // Strip markdown code fences if present
  if (content.startsWith("```")) {
    content = content.replace(/```html?\n?/g, "").replace(/```$/g, "").trim();
  }

  await supabase.from("marketing_posts").insert({
    platform: "telegram_replay",
    content,
    pick_ids: [pick.id],
    performance_data: {
      type: "reasoning_replay",
      pick_id: pick.id,
      result: pick.result,
      factors: Object.keys(factors),
    },
    posted: false,
  });

  console.log(`   Generated reasoning replay for ${pick.game}:`);
  console.log(`   ${content.substring(0, 200)}...`);
  console.log(`   [SAVED — ready to post]`);

  return content;
}

// ═══════════════════════════════════
// D) BATCH GENERATOR — run after results settle
// ═══════════════════════════════════

export async function generateAllContent() {
  console.log("\n═══ Content Generation Batch ═══\n");

  const results = {
    twitter_thread: null,
    tiktok_script: null,
    reasoning_replay: null,
  };

  try {
    results.twitter_thread = await generateTwitterThread();
  } catch (err) {
    console.log(`   Twitter thread failed: ${err.message}`);
  }

  try {
    results.tiktok_script = await generateTikTokScript();
  } catch (err) {
    console.log(`   TikTok script failed: ${err.message}`);
  }

  try {
    results.reasoning_replay = await generateReasoningReplay();
  } catch (err) {
    console.log(`   Reasoning replay failed: ${err.message}`);
  }

  const generated = Object.values(results).filter(Boolean).length;
  console.log(`\n═══ Generated ${generated}/3 content pieces ═══\n`);
  return results;
}

// ─── CLI ───
async function main() {
  const cmd = process.argv[2] || "all";
  const arg = process.argv[3];

  switch (cmd) {
    case "thread": await generateTwitterThread(); break;
    case "tiktok": await generateTikTokScript(); break;
    case "replay": await generateReasoningReplay(arg); break;
    case "all": await generateAllContent(); break;
    default:
      console.log("Usage: node content-generators.mjs [thread|tiktok|replay|all]");
      console.log("       node content-generators.mjs replay <pick_id>");
  }
}

const isDirectRun = process.argv[1]?.endsWith("content-generators.mjs");
if (isDirectRun) main().catch(console.error);
