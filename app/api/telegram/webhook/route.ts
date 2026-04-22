// Telegram Bot Webhook — interactive bot for Sharkline
// Handles /start, /today, /ask, /record, /bankroll, /pnl, /exposure, /why, /sharpest
// Tier detection via channel membership, rate limiting per user

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

// Lazy-load heavy deps to avoid serverless bundling issues at import time
async function getAnthropic() {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  return Anthropic;
}
async function getResearch() {
  return await import("@/lib/sports-data/research");
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const VIP_CHANNEL_ID = process.env.TELEGRAM_VIP_CHANNEL_ID ?? "";
const METHOD_CHANNEL_ID = process.env.TELEGRAM_METHOD_CHANNEL_ID ?? "-1003974071892";
const ADMIN_TELEGRAM_ID = process.env.ADMIN_TELEGRAM_ID ?? "";

type UserTier = "free" | "vip" | "method";

const RATE_LIMITS: Record<UserTier, number> = {
  free: 3,
  vip: 20,
  method: 999,
};

// ── Telegram API helpers ──

async function sendMessage(chatId: number | string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function getChatMember(chatId: string, userId: number): Promise<string> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getChatMember`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, user_id: userId }),
      },
    );
    const data = await res.json();
    return data.ok ? data.result.status : "left";
  } catch {
    return "left";
  }
}

// ── Tier detection via channel membership ──

async function detectTier(userId: number, supabase: AnySupabase): Promise<UserTier> {
  // Check cache first
  const { data: cached } = await supabase
    .from("bot_usage")
    .select("tier, tier_cached_at")
    .eq("telegram_user_id", String(userId))
    .single();

  if (cached?.tier && cached.tier_cached_at) {
    const cachedAt = new Date(cached.tier_cached_at);
    if (Date.now() - cachedAt.getTime() < 3600000) {
      return cached.tier as UserTier;
    }
  }

  // Check Method channel first (highest tier)
  if (METHOD_CHANNEL_ID) {
    const methodStatus = await getChatMember(METHOD_CHANNEL_ID, userId);
    if (["member", "administrator", "creator"].includes(methodStatus)) {
      await upsertTier(supabase, userId, "method");
      return "method";
    }
  }

  // Check VIP channel
  if (VIP_CHANNEL_ID) {
    const vipStatus = await getChatMember(VIP_CHANNEL_ID, userId);
    if (["member", "administrator", "creator"].includes(vipStatus)) {
      await upsertTier(supabase, userId, "vip");
      return "vip";
    }
  }

  await upsertTier(supabase, userId, "free");
  return "free";
}

async function upsertTier(supabase: AnySupabase, userId: number, tier: UserTier) {
  await supabase.from("bot_usage").upsert(
    { telegram_user_id: String(userId), tier, tier_cached_at: new Date().toISOString() },
    { onConflict: "telegram_user_id" },
  );
}

// ── Rate limiting ──

async function checkRateLimit(
  supabase: AnySupabase,
  userId: number,
  tier: UserTier,
): Promise<{ allowed: boolean; remaining: number }> {
  const today = new Date().toISOString().split("T")[0];
  const { data } = await supabase
    .from("bot_usage")
    .select("messages_today, last_reset_date")
    .eq("telegram_user_id", String(userId))
    .single();

  let messagesToday = 0;
  if (data) {
    if (data.last_reset_date === today) {
      messagesToday = data.messages_today ?? 0;
    } else {
      // Reset for new day
      await supabase
        .from("bot_usage")
        .update({ messages_today: 0, last_reset_date: today })
        .eq("telegram_user_id", String(userId));
    }
  }

  const limit = RATE_LIMITS[tier];
  if (messagesToday >= limit) {
    return { allowed: false, remaining: 0 };
  }

  // Increment
  await supabase
    .from("bot_usage")
    .upsert(
      {
        telegram_user_id: String(userId),
        messages_today: messagesToday + 1,
        last_reset_date: today,
      },
      { onConflict: "telegram_user_id" },
    );

  return { allowed: true, remaining: limit - messagesToday - 1 };
}

// ── Command handlers ──

async function handleStart(chatId: number, tier: UserTier): Promise<void> {
  const base = `🦈 <b>Welcome to Sharkline</b>\n\nYour tier: <b>${tier.toUpperCase()}</b>\n\n`;
  const commands =
    `/today — Today's picks\n` +
    `/ask [game or team] — Get analysis\n` +
    `/record — Win/loss record\n` +
    `/sharpest — Today's sharpest play\n`;

  const extra =
    tier === "method"
      ? `/bankroll [amount] — Set your bankroll\n/pnl — Your P&L\n/exposure — Today's exposure\n/why [game] — Post-game analysis\n`
      : tier === "vip"
        ? `/why [game] — Post-game analysis\n`
        : "";

  const cta =
    tier === "free"
      ? `\n💎 Upgrade to VIP for edge plays → sharkline.ai`
      : tier === "vip"
        ? `\n🦈 Upgrade to Method for staking + bankroll management → sharkline.ai`
        : "";

  await sendMessage(chatId, base + commands + extra + cta + `\n🦈`);
}

async function handleToday(
  chatId: number,
  tier: UserTier,
  supabase: AnySupabase,
): Promise<void> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: picks } = await supabase
    .from("picks")
    .select("*")
    .gte("sent_at", todayStart.toISOString())
    .neq("channel", "paper")
    .in("status", ["pending", "won", "lost", "push"])
    .order("confidence", { ascending: false });

  if (!picks || picks.length === 0) {
    await sendMessage(chatId, `🦈 No picks posted yet today. Check back soon.`);
    return;
  }

  if (tier === "free") {
    const safePicks = picks.filter((p) => p.pool === "safe");
    const edgeTease = picks.find((p) => p.pool === "edge" && !p.is_underdog_alert);
    const edgeCount = picks.filter((p) => p.pool === "edge").length;

    let msg = `🦈 <b>TODAY'S FREE PICKS</b>\n\n`;
    for (const p of safePicks) {
      msg += `🛡️ ${p.game} — <b>${p.pick}</b> @ ${p.odds}\n`;
    }
    if (edgeTease) {
      msg += `\n⚡ <b>EDGE PLAY</b>\n${edgeTease.game}\n${edgeTease.pick} @ ${edgeTease.odds}\n`;
    }
    msg += `\nVIP has ${edgeCount} edge plays today → sharkline.ai\n🦈`;
    await sendMessage(chatId, msg);
  } else if (tier === "vip") {
    const edgePicks = picks.filter((p) => p.pool === "edge");
    let msg = `🦈 <b>TODAY'S EDGE PLAYS</b>\n\n`;
    for (const p of edgePicks) {
      const label = p.is_sharpest ? "🎯 SHARPEST" : p.is_underdog_alert ? "🐕 UNDERDOG" : "💎 EDGE";
      msg += `${label}: ${p.game}\n${p.pick} @ ${p.odds} | Conf: ${p.confidence}%\n\n`;
    }
    msg += `🦈`;
    await sendMessage(chatId, msg);
  } else {
    // Method
    const methodPicks = picks.filter(
      (p) => (p.confidence >= 70 || p.pool === "safe") && !p.is_underdog_alert,
    );
    let msg = `🦈 <b>TODAY'S METHOD PICKS</b>\n\n`;
    for (const p of methodPicks) {
      msg += `${p.game}\n${p.pick} @ ${p.odds}\nStake: ${p.stake}u | Tier: ${p.tier}\n\n`;
    }
    msg += `🦈`;
    await sendMessage(chatId, msg);
  }
}

async function handleAsk(
  chatId: number,
  tier: UserTier,
  query: string,
  supabase: AnySupabase,
  userId?: number,
): Promise<void> {
  if (!query.trim()) {
    await sendMessage(chatId, `🦈 Usage: /ask [team or game]\nExample: /ask Arsenal vs Chelsea`);
    return;
  }

  if (tier === "free") {
    // Check if "Ask the Shark" window is active (Saturday 14:00-16:00 UTC)
    const now = new Date();
    const isSaturday = now.getUTCDay() === 6;
    const hour = now.getUTCHours();
    const isAskTheSharkWindow = isSaturday && hour >= 14 && hour < 16;

    // Check if user already used their Ask the Shark
    const { data: usage } = await supabase
      .from("bot_usage")
      .select("used_ask_the_shark")
      .eq("telegram_user_id", String(userId))
      .single();

    // Reset used_ask_the_shark on Monday (new week)
    const dayOfWeek = now.getUTCDay();
    if (dayOfWeek === 1 && usage?.used_ask_the_shark) {
      await supabase.from("bot_usage").update({ used_ask_the_shark: false })
        .eq("telegram_user_id", String(userId));
      // Refresh usage for this check
      if (usage) usage.used_ask_the_shark = false;
    }

    if (isAskTheSharkWindow && usage?.used_ask_the_shark) {
      // Already used their Ask the Shark this week
      await sendMessage(
        chatId,
        `🦈 You've used your Ask the Shark for this week. Every day could be like this → sharkline.ai`,
      );
      return;
    }

    if (isAskTheSharkWindow && !usage?.used_ask_the_shark) {
      // Give them ONE VIP-quality analysis
      await supabase.from("bot_usage").upsert(
        { telegram_user_id: String(userId), used_ask_the_shark: true },
        { onConflict: "telegram_user_id" },
      );

      const sportKeys = ["basketball_nba", "soccer_epl", "icehockey_nhl", "baseball_mlb"];
      const { buildResearchPackets, formatResearchForPrompt } = await getResearch();
      const research = await buildResearchPackets(sportKeys);
      const researchText = formatResearchForPrompt(research);

      const Anthropic = await getAnthropic();
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: `You are Sharkline's elite analyst bot. A free user is getting their Ask the Shark analysis for: "${query}"

Research data:
${researchText.slice(0, 3000)}

Give a FULL VIP-quality analysis (3-5 sentences) including specific pick, odds, confidence percentage, and key factors. This is their one free taste of VIP quality. Make it impressive. Under 250 words.`,
          },
        ],
      });
      const text = response.content.find((b) => b.type === "text");
      const answer = text?.type === "text" ? text.text : "Can't analyze that right now.";
      await sendMessage(
        chatId,
        `🦈 <b>ASK THE SHARK</b>\n\n${answer}\n\n🦈 That was your free Ask the Shark. Want this every day? VIP → sharkline.ai`,
      );
    } else {
      // Standard bar-talk opinion
      const Anthropic = await getAnthropic();
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        messages: [
          {
            role: "user",
            content: `You are the Sharkline sports analyst bot. Give a casual, bar-talk opinion about "${query}".
Sound confident and data-aware but DO NOT give: specific picks, odds, confidence percentages, or staking advice.
Keep it to 2-3 sentences. End with something like "The data says more but that's VIP territory."
Never use "I think" — use "the data shows" or "our model has".`,
          },
        ],
      });
      const text = response.content.find((b) => b.type === "text");
      const answer = text?.type === "text" ? text.text : "Can't analyze that right now.";
      await sendMessage(chatId, `${answer}\n\n🦈 Sharp analysis is VIP-only → sharkline.ai`);
    }
  } else {
    // VIP/Method: full analysis with Claude + research
    const sportKeys = ["basketball_nba", "soccer_epl", "icehockey_nhl", "baseball_mlb"];
    const { buildResearchPackets, formatResearchForPrompt } = await getResearch();
    const research = await buildResearchPackets(sportKeys);
    const researchText = formatResearchForPrompt(research);

    const Anthropic = await getAnthropic();
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `You are Sharkline's elite analyst bot. A ${tier.toUpperCase()} subscriber asks about: "${query}"

Research data:
${researchText.slice(0, 3000)}

Give a full analysis (3-5 sentences) including:
- Your specific pick with odds if a game is identifiable
- Confidence percentage
- Key factors from 17-dimension analysis
- ${tier === "method" ? "Recommended stake sizing" : ""}
Sound confident, use "the data shows", never "I think". Under 250 words.`,
        },
      ],
    });
    const text = response.content.find((b) => b.type === "text");
    const answer = text?.type === "text" ? text.text : "Can't analyze that right now.";

    let suffix = "\n🦈";
    if (tier === "vip") suffix = "\n\n💎 Want exact staking? → Shark Method\n🦈";
    await sendMessage(chatId, `${answer}${suffix}`);
  }
}

async function handleRecord(
  chatId: number,
  tier: UserTier,
  supabase: AnySupabase,
): Promise<void> {
  const { data: picks } = await supabase
    .from("picks")
    .select("result, profit, sport, pool")
    .in("result", ["won", "lost"]);

  if (!picks || picks.length === 0) {
    await sendMessage(chatId, `🦈 No settled picks yet.`);
    return;
  }

  if (tier === "free") {
    // Free users see edge pick record only — shows VIP value
    const edgePicks = picks.filter((p) => p.pool === "edge");
    const edgeWins = edgePicks.filter((p) => p.result === "won").length;
    const edgeLosses = edgePicks.filter((p) => p.result === "lost").length;
    const edgeTotal = edgeWins + edgeLosses;

    if (edgeTotal === 0) {
      await sendMessage(chatId, `🦈 No edge picks settled yet. Check back soon.\n🦈`);
      return;
    }

    const edgeWinRate = ((edgeWins / edgeTotal) * 100).toFixed(1);
    let msg = `🦈 <b>RECORD</b>\n`;
    msg += `Edge picks: ${edgeWins}W-${edgeLosses}L (${edgeWinRate}%)\n\n`;
    msg += `🔥 VIP picks are hitting ${edgeWinRate}% — upgrade at sharkline.ai\n🦈`;
    await sendMessage(chatId, msg);
  } else {
    // VIP/Method: full edge pick record with units and sport breakdown
    const edgePicks = picks.filter((p) => p.pool === "edge");
    const wins = edgePicks.filter((p) => p.result === "won").length;
    const losses = edgePicks.filter((p) => p.result === "lost").length;
    const winRate = (wins + losses) > 0 ? ((wins / (wins + losses)) * 100).toFixed(1) : "0.0";
    const netUnits = edgePicks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);

    let msg = `🦈 <b>RECORD</b>\n${wins}W-${losses}L (${winRate}%)\n`;
    msg += `Units: ${netUnits >= 0 ? "+" : ""}${netUnits.toFixed(1)}u\n`;

    // Sport breakdown
    const bySport: Record<string, { w: number; l: number }> = {};
    for (const p of edgePicks) {
      const sport = p.sport || "Unknown";
      if (!bySport[sport]) bySport[sport] = { w: 0, l: 0 };
      if (p.result === "won") bySport[sport].w++;
      else bySport[sport].l++;
    }
    msg += `\n<b>By Sport:</b>\n`;
    for (const [sport, { w, l }] of Object.entries(bySport)) {
      msg += `${sport}: ${w}W-${l}L\n`;
    }

    msg += `\n🦈`;
    await sendMessage(chatId, msg);
  }
}

async function handleBankroll(
  chatId: number,
  tier: UserTier,
  amount: string,
  supabase: AnySupabase,
  userId: number,
): Promise<void> {
  if (tier !== "method") {
    await sendMessage(chatId, `🦈 Personal bankroll tracking is a Method feature → sharkline.ai`);
    return;
  }

  const bankroll = parseFloat(amount);
  if (isNaN(bankroll) || bankroll <= 0) {
    await sendMessage(chatId, `🦈 Usage: /bankroll 1000\nSets your bankroll for unit calculations.`);
    return;
  }

  await supabase
    .from("bot_usage")
    .upsert(
      { telegram_user_id: String(userId), bankroll },
      { onConflict: "telegram_user_id" },
    );

  const unitSize = (bankroll * 0.01).toFixed(2); // 1u = 1% of bankroll
  await sendMessage(
    chatId,
    `🦈 Bankroll set: $${bankroll.toFixed(0)}\n1 unit = $${unitSize} (1% of bankroll)\n\nYour stakes will be calculated from this.\n🦈`,
  );
}

async function handlePnl(
  chatId: number,
  tier: UserTier,
  supabase: AnySupabase,
  userId: number,
): Promise<void> {
  if (tier !== "method") {
    await sendMessage(chatId, `🦈 P&L tracking is a Method feature → sharkline.ai`);
    return;
  }

  const { data: userData } = await supabase
    .from("bot_usage")
    .select("bankroll")
    .eq("telegram_user_id", String(userId))
    .single();

  const bankroll = userData?.bankroll ?? 1000;
  const unitSize = bankroll * 0.01;

  const { data: picks } = await supabase
    .from("picks")
    .select("profit, stake")
    .in("result", ["won", "lost", "push"])
    .eq("pool", "edge");

  const netUnits = (picks ?? []).reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
  const dollarPnl = netUnits * unitSize;

  await sendMessage(
    chatId,
    `🦈 <b>P&L</b>\nUnit P&L: ${netUnits >= 0 ? "+" : ""}${netUnits.toFixed(1)}u\nDollar P&L: ${dollarPnl >= 0 ? "+" : ""}$${dollarPnl.toFixed(0)}\nBankroll: $${bankroll.toFixed(0)} (1u = $${unitSize.toFixed(2)})\n🦈`,
  );
}

async function handleExposure(
  chatId: number,
  tier: UserTier,
  supabase: AnySupabase,
): Promise<void> {
  if (tier !== "method") {
    await sendMessage(chatId, `🦈 Exposure tracking is a Method feature → sharkline.ai`);
    return;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: picks } = await supabase
    .from("picks")
    .select("game, pick, stake, result")
    .gte("sent_at", todayStart.toISOString())
    .neq("channel", "paper");

  if (!picks || picks.length === 0) {
    await sendMessage(chatId, `🦈 No picks today. Exposure: 0/6u\n🦈`);
    return;
  }

  const totalExposure = picks.reduce((s, p) => s + (parseFloat(p.stake) || 0), 0);
  let msg = `🦈 <b>TODAY'S EXPOSURE</b>\n`;
  for (const p of picks) {
    const status = p.result === "pending" ? "⏳" : p.result === "won" ? "✅" : "❌";
    msg += `${status} ${p.game} — ${p.stake}u\n`;
  }
  msg += `\nTotal: ${totalExposure.toFixed(1)}/6u\n🦈`;
  await sendMessage(chatId, msg);
}

async function handleWhy(
  chatId: number,
  tier: UserTier,
  query: string,
  supabase: AnySupabase,
): Promise<void> {
  if (tier === "free") {
    await sendMessage(chatId, `🦈 Post-game analysis is VIP-only → sharkline.ai`);
    return;
  }

  // Find the most recent settled pick matching the query
  const { data: pick } = await supabase
    .from("picks")
    .select("*")
    .in("result", ["won", "lost"])
    .ilike("game", `%${query}%`)
    .order("settled_at", { ascending: false })
    .limit(1)
    .single();

  if (!pick) {
    await sendMessage(chatId, `🦈 Couldn't find a settled pick for "${query}". Try the full team name.\n🦈`);
    return;
  }

  const Anthropic = await getAnthropic();
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are Sharkline's analyst. A settled pick:
Game: ${pick.game}
Pick: ${pick.pick} @ ${pick.odds}
Result: ${pick.result?.toUpperCase()} (${pick.actual_result || "score unknown"})
Pre-game reasoning: ${pick.reasoning || "N/A"}

Write a 2-3 sentence post-game analysis. What happened vs what we expected? Was the process right? Sound confident, use "the data showed". End with "Process over outcomes." if it was a loss.`,
      },
    ],
  });
  const text = response.content.find((b) => b.type === "text");
  const answer = text?.type === "text" ? text.text : "Can't analyze that right now.";
  const emoji = pick.result === "won" ? "✅" : "❌";

  await sendMessage(
    chatId,
    `📝 <b>POST-GAME: ${pick.game}</b>\n${emoji} ${pick.result?.toUpperCase()} — ${pick.pick} @ ${pick.odds}\n\n${answer}\n🦈`,
  );
}

async function handleSharpest(
  chatId: number,
  tier: UserTier,
  supabase: AnySupabase,
): Promise<void> {
  if (tier === "free") {
    await sendMessage(
      chatId,
      `🦈 The sharpest play is our highest-conviction edge bet — the one where the odds are most mispriced.\nVIP only → sharkline.ai`,
    );
    return;
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: pick } = await supabase
    .from("picks")
    .select("*")
    .eq("is_sharpest", true)
    .gte("sent_at", todayStart.toISOString())
    .limit(1)
    .single();

  if (!pick) {
    await sendMessage(chatId, `🦈 No sharpest play posted yet today. Check back after picks drop.\n🦈`);
    return;
  }

  let msg = `🎯 <b>TODAY'S SHARPEST PLAY</b>\n\n`;
  msg += `${pick.game}\n`;
  msg += `Pick: <b>${pick.pick}</b> @ ${pick.odds}\n`;
  msg += `Confidence: ${pick.confidence}%\n\n`;
  msg += `📊 <b>Why this is sharp:</b>\n${pick.reasoning}\n\n`;
  msg += `🔥 This is the one. Full conviction.\n🦈`;
  await sendMessage(chatId, msg);
}

// ── Admin command handlers ──

function isAdmin(userId: number): boolean {
  return ADMIN_TELEGRAM_ID !== "" && String(userId) === ADMIN_TELEGRAM_ID;
}

async function handleApprove(
  chatId: number,
  pickIdStr: string,
  supabase: AnySupabase,
  userId: number,
): Promise<void> {
  const pickId = pickIdStr.trim();
  if (!pickId) {
    await sendMessage(chatId, `❌ Invalid pick ID. Usage: approve <id>`);
    return;
  }

  const { publishApprovedPick } = await import("@/lib/tipster/tipster-agent");
  const result = await publishApprovedPick(pickId, supabase, String(userId));

  if (result.ok) {
    await sendMessage(chatId, `✅ Pick ${pickId} approved and published to channels.`);
  } else {
    await sendMessage(chatId, `❌ ${result.error}`);
  }
}

async function handleReject(
  chatId: number,
  pickIdStr: string,
  supabase: AnySupabase,
): Promise<void> {
  const pickId = pickIdStr.trim();
  if (!pickId) {
    await sendMessage(chatId, `❌ Invalid pick ID. Usage: reject <id>`);
    return;
  }

  const { data: pick } = await supabase
    .from("picks")
    .select("id, game, pick, status")
    .eq("id", pickId)
    .single();

  if (!pick) {
    await sendMessage(chatId, `❌ Pick ${pickId} not found.`);
    return;
  }
  if (pick.status !== "draft") {
    await sendMessage(chatId, `❌ Pick ${pickId} is not a draft (status: ${pick.status}).`);
    return;
  }

  await supabase.from("picks").update({ status: "rejected" }).eq("id", pickId);
  await sendMessage(chatId, `❌ Pick rejected: ${pick.game} — ${pick.pick}`);
}

async function handleEdit(
  chatId: number,
  args: string,
  supabase: AnySupabase,
): Promise<void> {
  // Format: edit <id> <field> <value>
  // UUID IDs contain hyphens, so split carefully: first token is ID, second is field, rest is value
  const firstSpace = args.indexOf(" ");
  if (firstSpace === -1) {
    await sendMessage(chatId, `❌ Usage: edit <id> odds 1.95\nFields: odds, pick, stake`);
    return;
  }
  const pickId = args.slice(0, firstSpace).trim();
  const rest = args.slice(firstSpace + 1).trim();
  const secondSpace = rest.indexOf(" ");
  if (secondSpace === -1) {
    await sendMessage(chatId, `❌ Usage: edit <id> odds 1.95\nFields: odds, pick, stake`);
    return;
  }
  const field = rest.slice(0, secondSpace).toLowerCase();
  const value = rest.slice(secondSpace + 1).trim();

  if (!pickId) {
    await sendMessage(chatId, `❌ Invalid pick ID.`);
    return;
  }

  const allowedFields: Record<string, string> = { odds: "odds", pick: "pick", stake: "stake" };
  const dbField = allowedFields[field];
  if (!dbField) {
    await sendMessage(chatId, `❌ Can only edit: odds, pick, stake`);
    return;
  }

  const { data: pick } = await supabase
    .from("picks")
    .select("id, status")
    .eq("id", pickId)
    .eq("status", "draft")
    .single();

  if (!pick) {
    await sendMessage(chatId, `❌ Pick ${pickId} not found or not a draft.`);
    return;
  }

  const updateValue = field === "odds" || field === "stake" ? parseFloat(value) : value;
  if ((field === "odds" || field === "stake") && isNaN(updateValue as number)) {
    await sendMessage(chatId, `❌ Invalid number for ${field}.`);
    return;
  }

  await supabase.from("picks").update({ [dbField]: updateValue }).eq("id", pickId);
  await sendMessage(chatId, `✏️ Pick ${pickId} updated: ${field} → ${value}`);
}

async function handleBulkApprove(
  chatId: number,
  supabase: AnySupabase,
  userId: number,
): Promise<void> {
  const { data: drafts } = await supabase
    .from("picks")
    .select("id")
    .eq("status", "draft")
    .order("id", { ascending: true });

  if (!drafts || drafts.length === 0) {
    await sendMessage(chatId, `No drafts to approve.`);
    return;
  }

  const { publishApprovedPick } = await import("@/lib/tipster/tipster-agent");
  let approved = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const draft of drafts) {
    const result = await publishApprovedPick(draft.id, supabase, String(userId));
    if (result.ok) {
      approved++;
    } else {
      failed++;
      errors.push(result.error ?? `#${draft.id} failed`);
    }
  }

  let msg = `✅ Bulk approve: ${approved} published`;
  if (failed > 0) msg += `, ${failed} failed`;
  if (errors.length > 0) msg += `\n${errors.join("\n")}`;
  await sendMessage(chatId, msg);
}

async function handleBulkReject(
  chatId: number,
  supabase: AnySupabase,
): Promise<void> {
  // Count drafts first, then reject
  const { data: drafts } = await supabase
    .from("picks")
    .select("id")
    .eq("status", "draft");

  const draftCount = drafts?.length ?? 0;

  if (draftCount > 0) {
    await supabase
      .from("picks")
      .update({ status: "rejected" })
      .eq("status", "draft");
  }

  await sendMessage(chatId, `❌ Bulk reject: ${draftCount} drafts rejected.`);
}

async function handleDrafts(
  chatId: number,
  supabase: AnySupabase,
): Promise<void> {
  const { data: drafts } = await supabase
    .from("picks")
    .select("id, game, pick, odds, confidence, pool, game_time")
    .eq("status", "draft")
    .order("game_time", { ascending: true });

  if (!drafts || drafts.length === 0) {
    await sendMessage(chatId, `No pending drafts.`);
    return;
  }

  let msg = `📋 <b>${drafts.length} PENDING DRAFTS</b>\n━━━━━━━━━━━━━━━━━━━━━━\n`;
  for (const d of drafts) {
    const gt = d.game_time ? new Date(d.game_time) : null;
    const timeStr = gt ? gt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "?";
    const poolEmoji = d.pool === "safe" ? "🛡️" : "⚡";
    msg += `\n${poolEmoji} #${d.id}: ${d.game}\n${d.pick} @ ${d.odds} | ${d.confidence}% | ${timeStr}\n`;
  }
  msg += `\n✅ <code>approve all</code> | ❌ <code>reject all</code>`;
  await sendMessage(chatId, msg);
}

// ── Health check (GET) — for browser testing ──

export async function GET() {
  return NextResponse.json({
    status: "webhook endpoint alive",
    bot_token_set: !!TELEGRAM_BOT_TOKEN,
    supabase_url_set: !!SUPABASE_URL,
    anthropic_key_set: !!ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
  });
}

// ── Webhook handler ──

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    console.error("[webhook] Failed to parse request body");
    return NextResponse.json({ ok: true });
  }

  console.log("[webhook] Incoming update:", JSON.stringify(body).slice(0, 500));

  const message = body.message as Record<string, unknown> | undefined;
  if (!message?.text || !message.from) {
    console.log("[webhook] No text or from field — skipping");
    return NextResponse.json({ ok: true });
  }

  const chat = message.chat as Record<string, unknown>;
  // Only respond to private messages (DMs), ignore group/channel messages
  if (chat.type !== "private") {
    console.log(`[webhook] Ignoring non-private chat type: ${chat.type}`);
    return NextResponse.json({ ok: true });
  }

  const chatId = chat.id as number;
  const from = message.from as Record<string, unknown>;
  const userId = from.id as number;
  const text = (message.text as string).trim();

  console.log(`[webhook] Private message from ${userId}: "${text}"`);

  // Quick env check
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("[webhook] Missing SUPABASE env vars");
    await sendMessage(chatId, `🦈 Bot is misconfigured. Contact admin.\n🦈`);
    return NextResponse.json({ ok: true });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Detect tier — wrap in try/catch so Supabase errors don't kill the handler
  let tier: UserTier = "free";
  try {
    tier = await detectTier(userId, supabase);
    console.log(`[webhook] Tier for ${userId}: ${tier}`);
  } catch (err) {
    console.error("[webhook] Tier detection failed:", err);
    // Default to free tier if detection fails
  }

  // Rate limit (admins bypass)
  if (!isAdmin(userId)) {
    try {
      const { allowed } = await checkRateLimit(supabase, userId, tier);
      if (!allowed) {
        const limit = RATE_LIMITS[tier];
        const cta =
          tier === "free"
            ? "Upgrade to VIP for 20 messages/day → sharkline.ai"
            : tier === "vip"
              ? "Upgrade to Method for unlimited → sharkline.ai"
              : "";
        await sendMessage(
          chatId,
          `🦈 You've used your ${limit} messages today. ${cta}`,
        );
        return NextResponse.json({ ok: true });
      }
    } catch (err) {
      console.error("[webhook] Rate limit check failed:", err);
      // Continue anyway — better to respond than to silently fail
    }
  }

  // Strip @BotUsername suffix from commands (Telegram sends /start@SharklineBot)
  const cmd = text.split("@")[0].toLowerCase();

  // Route commands
  try {
    // ── Admin commands (text-based, no slash prefix) ──
    const lowerText = text.toLowerCase().trim();

    if (cmd === "/myid") {
      await sendMessage(chatId, `Your Telegram ID: <code>${userId}</code>`);
    } else if (isAdmin(userId) && (lowerText.startsWith("approve ") || lowerText.startsWith("✅ "))) {
      const arg = text.replace(/^(approve|✅)\s+/i, "").trim();
      if (arg.toLowerCase() === "all") {
        await handleBulkApprove(chatId, supabase, userId);
      } else {
        await handleApprove(chatId, arg, supabase, userId);
      }
    } else if (isAdmin(userId) && (lowerText.startsWith("reject ") || lowerText.startsWith("❌ "))) {
      const arg = text.replace(/^(reject|❌)\s+/i, "").trim();
      if (arg.toLowerCase() === "all") {
        await handleBulkReject(chatId, supabase);
      } else {
        await handleReject(chatId, arg, supabase);
      }
    } else if (isAdmin(userId) && (lowerText.startsWith("edit ") || lowerText.startsWith("✏️ "))) {
      const args = text.replace(/^(edit|✏️)\s+/i, "").trim();
      await handleEdit(chatId, args, supabase);
    } else if (isAdmin(userId) && (cmd === "/drafts" || lowerText === "drafts")) {
      await handleDrafts(chatId, supabase);
    } else if (cmd === "/start" || cmd === "/help") {
      await handleStart(chatId, tier);
    } else if (cmd === "/today") {
      await handleToday(chatId, tier, supabase);
    } else if (cmd.startsWith("/ask")) {
      const query = text.replace(/^\/ask(@\S+)?\s*/i, "").trim();
      await handleAsk(chatId, tier, query, supabase, userId);
    } else if (cmd === "/record") {
      await handleRecord(chatId, tier, supabase);
    } else if (cmd.startsWith("/bankroll")) {
      const amount = text.replace(/^\/bankroll(@\S+)?\s*/i, "").trim();
      await handleBankroll(chatId, tier, amount, supabase, userId);
    } else if (cmd === "/pnl") {
      await handlePnl(chatId, tier, supabase, userId);
    } else if (cmd === "/exposure") {
      await handleExposure(chatId, tier, supabase);
    } else if (cmd.startsWith("/why")) {
      const query = text.replace(/^\/why(@\S+)?\s*/i, "").trim();
      await handleWhy(chatId, tier, query, supabase);
    } else if (cmd === "/sharpest") {
      await handleSharpest(chatId, tier, supabase);
    } else {
      // Free text — detect if sports-related
      if (text.startsWith("/")) {
        await sendMessage(chatId, `🦈 Unknown command. Try /start for available commands.\n🦈`);
      } else if (!isAdmin(userId)) {
        // Route to /ask logic for natural language (non-admin only)
        await handleAsk(chatId, tier, text, supabase, userId);
      } else {
        await sendMessage(chatId, `🦈 Unknown command. Admin commands: approve/reject/edit/drafts\n🦈`);
      }
    }
  } catch (err) {
    console.error("[webhook] Command handler error:", err);
    try {
      await sendMessage(chatId, `🦈 Something went wrong. Try again.\n🦈`);
    } catch { /* don't let error response crash us */ }
  }

  return NextResponse.json({ ok: true });
}
