// Telegram Bot Webhook — interactive bot for Sharkline
// Handles /start, /today, /ask, /record, /bankroll, /pnl, /exposure, /why, /sharpest
// Tier detection via channel membership, rate limiting per user

import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { buildResearchPackets, formatResearchForPrompt } from "@/lib/sports-data/research";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const VIP_CHANNEL_ID = process.env.TELEGRAM_VIP_CHANNEL_ID ?? "";
const METHOD_CHANNEL_ID = process.env.TELEGRAM_METHOD_CHANNEL_ID ?? "-1003974071892";

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

    if (isAskTheSharkWindow && !usage?.used_ask_the_shark) {
      // Give them ONE VIP-quality analysis
      await supabase.from("bot_usage").upsert(
        { telegram_user_id: String(userId), used_ask_the_shark: true },
        { onConflict: "telegram_user_id" },
      );

      const sportKeys = ["basketball_nba", "soccer_epl", "icehockey_nhl", "baseball_mlb"];
      const research = await buildResearchPackets(sportKeys);
      const researchText = formatResearchForPrompt(research);

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
    const research = await buildResearchPackets(sportKeys);
    const researchText = formatResearchForPrompt(research);

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

  const wins = picks.filter((p) => p.result === "won").length;
  const losses = picks.filter((p) => p.result === "lost").length;
  const winRate = ((wins / (wins + losses)) * 100).toFixed(1);

  let msg = `🦈 <b>RECORD</b>\n${wins}W-${losses}L (${winRate}%)\n`;

  if (tier !== "free") {
    const netUnits = picks.reduce((s, p) => s + (parseFloat(p.profit) || 0), 0);
    msg += `Units: ${netUnits >= 0 ? "+" : ""}${netUnits.toFixed(1)}u\n`;

    // Sport breakdown
    const bySport: Record<string, { w: number; l: number }> = {};
    for (const p of picks) {
      const sport = p.sport || "Unknown";
      if (!bySport[sport]) bySport[sport] = { w: 0, l: 0 };
      if (p.result === "won") bySport[sport].w++;
      else bySport[sport].l++;
    }
    msg += `\n<b>By Sport:</b>\n`;
    for (const [sport, { w, l }] of Object.entries(bySport)) {
      msg += `${sport}: ${w}W-${l}L\n`;
    }
  }

  msg += `\n🦈`;
  await sendMessage(chatId, msg);
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

// ── Webhook handler ──

export async function POST(request: Request) {
  const body = await request.json();
  const message = body.message;
  if (!message?.text || !message.from) {
    return NextResponse.json({ ok: true });
  }

  // Only respond to private messages (DMs), ignore group/channel messages
  if (message.chat.type !== "private") {
    return NextResponse.json({ ok: true });
  }

  const chatId = message.chat.id;
  const userId = message.from.id;
  const text = message.text.trim();

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Detect tier
  const tier = await detectTier(userId, supabase);

  // Rate limit
  const { allowed, remaining } = await checkRateLimit(supabase, userId, tier);
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

  // Route commands
  try {
    if (text === "/start" || text === "/help") {
      await handleStart(chatId, tier);
    } else if (text === "/today") {
      await handleToday(chatId, tier, supabase);
    } else if (text.startsWith("/ask")) {
      const query = text.replace("/ask", "").trim();
      await handleAsk(chatId, tier, query, supabase, userId);
    } else if (text === "/record") {
      await handleRecord(chatId, tier, supabase);
    } else if (text.startsWith("/bankroll")) {
      const amount = text.replace("/bankroll", "").trim();
      await handleBankroll(chatId, tier, amount, supabase, userId);
    } else if (text === "/pnl") {
      await handlePnl(chatId, tier, supabase, userId);
    } else if (text === "/exposure") {
      await handleExposure(chatId, tier, supabase);
    } else if (text.startsWith("/why")) {
      const query = text.replace("/why", "").trim();
      await handleWhy(chatId, tier, query, supabase);
    } else if (text === "/sharpest") {
      await handleSharpest(chatId, tier, supabase);
    } else {
      // Free text — detect if sports-related
      if (text.startsWith("/")) {
        await sendMessage(chatId, `🦈 Unknown command. Try /start for available commands.\n🦈`);
      } else {
        // Route to /ask logic for natural language
        await handleAsk(chatId, tier, text, supabase, userId);
      }
    }
  } catch (err) {
    console.error("Bot error:", err);
    await sendMessage(chatId, `🦈 Something went wrong. Try again.\n🦈`);
  }

  return NextResponse.json({ ok: true });
}
