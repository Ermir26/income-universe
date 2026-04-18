// Referral System — Sharkline
// Tracks referrals and grants VIP access after 3 confirmed referrals.

import { type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

/**
 * Generate a unique referral code for a Telegram user.
 * Returns existing code if user already has one.
 */
export async function getOrCreateReferralCode(
  supabase: SupabaseClient,
  telegramId: string,
): Promise<string> {
  // Check for existing code
  const { data: existing } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("telegram_id", telegramId)
    .single() as { data: { code: string } | null };

  if (existing?.code) return existing.code;

  // Generate new code: SL-XXXXXX
  const code = `SL-${randomBytes(3).toString("hex").toUpperCase()}`;

  await supabase.from("referral_codes").insert({
    telegram_id: telegramId,
    code,
    total_referrals: 0,
  });

  return code;
}

/**
 * Record a referral when a new user joins with a referral code.
 * Returns { success, message, referrerReward }.
 */
export async function recordReferral(
  supabase: SupabaseClient,
  referralCode: string,
  referredTelegramId: string,
): Promise<{ success: boolean; message: string; referrerReward: boolean }> {
  // Look up the referral code
  const { data: codeEntry } = await supabase
    .from("referral_codes")
    .select("telegram_id, total_referrals")
    .eq("code", referralCode)
    .single() as { data: { telegram_id: string; total_referrals: number } | null };

  if (!codeEntry) {
    return { success: false, message: "Invalid referral code", referrerReward: false };
  }

  // Can't refer yourself
  if (codeEntry.telegram_id === referredTelegramId) {
    return { success: false, message: "Cannot refer yourself", referrerReward: false };
  }

  // Check if already referred
  const { data: existingRef } = await supabase
    .from("referrals")
    .select("id")
    .eq("referred_telegram_id", referredTelegramId)
    .limit(1);

  if (existingRef && existingRef.length > 0) {
    return { success: false, message: "User already referred", referrerReward: false };
  }

  // Record the referral
  await supabase.from("referrals").insert({
    referrer_telegram_id: codeEntry.telegram_id,
    referred_telegram_id: referredTelegramId,
    referral_code: referralCode,
    status: "confirmed",
  });

  // Increment referral count
  const newCount = (codeEntry.total_referrals || 0) + 1;
  await supabase
    .from("referral_codes")
    .update({ total_referrals: newCount })
    .eq("code", referralCode);

  // Check if referrer earned a reward (3 referrals = 1 week VIP)
  let referrerReward = false;
  if (newCount >= 3 && newCount % 3 === 0) {
    // Check if reward already granted for this milestone
    const { data: existingReward } = await supabase
      .from("referrals")
      .select("id")
      .eq("referrer_telegram_id", codeEntry.telegram_id)
      .eq("reward_granted", true);

    const rewardsGranted = existingReward?.length ?? 0;
    const rewardsEarned = Math.floor(newCount / 3);

    if (rewardsGranted < rewardsEarned) {
      // Grant VIP access — update subscriber or create temp access
      const vipExpiry = new Date();
      vipExpiry.setDate(vipExpiry.getDate() + 7); // 1 week

      await supabase.from("subscribers").upsert({
        telegram_user_id: codeEntry.telegram_id,
        tier: "all_sports",
        status: "active",
        expires_at: vipExpiry.toISOString(),
        source: "referral_reward",
      }, { onConflict: "telegram_user_id" });

      // Mark referrals as rewarded
      await supabase
        .from("referrals")
        .update({ reward_granted: true })
        .eq("referrer_telegram_id", codeEntry.telegram_id)
        .eq("reward_granted", false);

      referrerReward = true;
    }
  }

  return {
    success: true,
    message: `Referral recorded. ${newCount}/3 toward VIP reward.`,
    referrerReward,
  };
}

/**
 * Get referral stats for a user.
 */
export async function getReferralStats(
  supabase: SupabaseClient,
  telegramId: string,
): Promise<{ code: string; totalReferrals: number; rewardsEarned: number; nextRewardIn: number }> {
  const code = await getOrCreateReferralCode(supabase, telegramId);

  const { data: codeEntry } = await supabase
    .from("referral_codes")
    .select("total_referrals")
    .eq("telegram_id", telegramId)
    .single() as { data: { total_referrals: number } | null };

  const total = codeEntry?.total_referrals ?? 0;
  const rewardsEarned = Math.floor(total / 3);
  const nextRewardIn = 3 - (total % 3);

  return { code, totalReferrals: total, rewardsEarned, nextRewardIn };
}

/**
 * Format the /referral command response for Telegram (HTML).
 */
export async function formatReferralMessage(
  supabase: SupabaseClient,
  telegramId: string,
): Promise<string> {
  const stats = await getReferralStats(supabase, telegramId);

  let msg = `🎁 <b>Your Referral Link</b>\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `Share this link with friends:\n`;
  msg += `<code>https://t.me/SharklineFree?start=${stats.code}</code>\n\n`;
  msg += `Your code: <b>${stats.code}</b>\n`;
  msg += `Referrals: <b>${stats.totalReferrals}</b>\n`;

  if (stats.totalReferrals > 0 && stats.nextRewardIn <= 3) {
    msg += `\n🏆 ${stats.nextRewardIn} more referral${stats.nextRewardIn === 1 ? "" : "s"} = 1 week FREE VIP!\n`;
  } else {
    msg += `\n🏆 Refer 3 friends → Get 1 week FREE VIP access!\n`;
  }

  if (stats.rewardsEarned > 0) {
    msg += `✅ VIP weeks earned: ${stats.rewardsEarned}\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `🦈 Sharkline — sharkline.ai`;

  return msg;
}
