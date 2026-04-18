// Community Moat — Telegram group automation for free + VIP groups
// Sharkline: build community engagement as a retention moat

import { type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getBrandPromptRules, BRAND } from "../tipster/brand";

const BRAND_URL = BRAND.url;

// Env vars — skip gracefully if not set
function getFreeGroupId(): string | null {
  return process.env.TELEGRAM_FREE_GROUP_ID || null;
}

function getVipGroupId(): string | null {
  return process.env.TELEGRAM_VIP_GROUP_ID || null;
}

async function sendToGroup(
  text: string,
  botToken: string,
  groupId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: groupId, text, parse_mode: "HTML" }),
    });
    const data = await res.json();
    if (data.ok) return String(data.result.message_id);
    console.log(`   Group send failed: ${data.description}`);
    return null;
  } catch (err) {
    console.log(`   Group send error: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Welcome new member to the free community group.
 */
export async function welcomeFreeMember(
  botToken: string,
  memberName: string,
): Promise<boolean> {
  const groupId = getFreeGroupId();
  if (!groupId) return false;

  const msg =
    `Welcome ${memberName} to the Sharkline community! 🦈\n\n` +
    `Free picks in the channel. Share your wins here.\n` +
    `Questions about value betting? Ask away.`;

  const msgId = await sendToGroup(msg, botToken, groupId);
  return !!msgId;
}

/**
 * Add subscriber to VIP group on subscribe.
 */
export async function addToVipGroup(
  botToken: string,
  userId: string,
): Promise<boolean> {
  const groupId = getVipGroupId();
  if (!groupId) return false;

  try {
    // Create invite link for the VIP group
    const res = await fetch(`https://api.telegram.org/bot${botToken}/createChatInviteLink`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: groupId,
        member_limit: 1,
        expire_date: Math.floor(Date.now() / 1000) + 86400, // 24h expiry
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.log(`   VIP invite failed: ${data.description}`);
      return false;
    }

    // DM the invite link to the user
    const inviteLink = data.result.invite_link;
    const dm = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: userId,
        text: `Welcome to Sharkline VIP! 🦈\n\nJoin the VIP discussion group: ${inviteLink}\n\nThis link expires in 24 hours.`,
      }),
    });
    const dmData = await dm.json();
    return dmData.ok;
  } catch (err) {
    console.log(`   VIP group add failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Remove subscriber from VIP group on cancel/expire.
 */
export async function removeFromVipGroup(
  botToken: string,
  userId: string,
): Promise<boolean> {
  const groupId = getVipGroupId();
  if (!groupId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/banChatMember`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: groupId,
        user_id: parseInt(userId, 10),
      }),
    });
    const data = await res.json();

    // Immediately unban so they can rejoin if they resubscribe
    if (data.ok) {
      await fetch(`https://api.telegram.org/bot${botToken}/unbanChatMember`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: groupId,
          user_id: parseInt(userId, 10),
          only_if_banned: true,
        }),
      });
    }

    return data.ok;
  } catch (err) {
    console.log(`   VIP group remove failed: ${(err as Error).message}`);
    return false;
  }
}

/**
 * Monday discussion starter — AI-generated topic based on upcoming fixtures.
 */
export async function postMondayDiscussion(
  supabase: SupabaseClient,
  botToken: string,
  anthropicApiKey: string,
): Promise<boolean> {
  const groupId = getFreeGroupId();
  if (!groupId) {
    console.log("   TELEGRAM_FREE_GROUP_ID not set — skipping community post");
    return false;
  }

  // Get this week's stats for context
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekPicks } = await supabase
    .from("picks")
    .select("sport, result, pick, odds")
    .neq("result", "pending")
    .gte("sent_at", weekAgo.toISOString());

  const wins = weekPicks?.filter((p) => p.result === "won").length ?? 0;
  const losses = weekPicks?.filter((p) => p.result === "lost").length ?? 0;
  const sports = [...new Set(weekPicks?.map((p) => p.sport) ?? [])];

  const client = new Anthropic({ apiKey: anthropicApiKey });

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{
      role: "user",
      content: `${getBrandPromptRules()}

Write a Monday discussion post for the Sharkline community group on Telegram.

Last week's record: ${wins}W-${losses}L across ${sports.join(", ") || "all sports"}.

Write a casual, conversational discussion starter about this week's most interesting betting angle. Ask the community what they're backing this week.

Rules:
- Sound like a group admin, not a corporate account
- "We" voice
- Ask an open-ended question at the end
- Under 300 characters
- No AI mentions
- End with 🦈

Return ONLY the message text, no JSON.`,
    }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") return false;

  const msg = textBlock.text.trim();
  const msgId = await sendToGroup(msg, botToken, groupId);
  return !!msgId;
}

/**
 * Check group member milestones and celebrate.
 */
export async function checkMilestones(
  botToken: string,
): Promise<boolean> {
  const groupId = getFreeGroupId();
  if (!groupId) return false;

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getChatMemberCount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: groupId }),
    });
    const data = await res.json();
    if (!data.ok) return false;

    const count = data.result;
    const milestones = [100, 250, 500, 1000, 2500, 5000, 10000];
    const milestone = milestones.find((m) => count >= m && count < m + 5);

    if (milestone) {
      const msg =
        `🎉 <b>${milestone} members!</b>\n\n` +
        `The Sharkline community just hit ${milestone} members. 🦈\n\n` +
        `Thank you for being here. Every win is sweeter when we share it.\n\n` +
        `Invite a friend → they get free picks, you get sharper lines.`;

      await sendToGroup(msg, botToken, groupId);
      console.log(`   🎉 Milestone celebrated: ${milestone} members`);
      return true;
    }

    return false;
  } catch {
    return false;
  }
}
