// STUB: Proof-of-wiring for Phase 4 admin alerts.
// Sends exactly one alert to TELEGRAM_ADMIN_CHAT_ID.
// Does NOT touch FREE, VIP, or METHOD channels.
// Must be removed before merge.

import { NextResponse } from "next/server";

export async function GET() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  const freeChannelId = process.env.TELEGRAM_CHANNEL_ID;
  const vipChannelId = process.env.TELEGRAM_VIP_CHANNEL_ID;

  // ── Hard fail if admin chat ID is missing ──
  if (!adminChatId) {
    console.error("FATAL: TELEGRAM_ADMIN_CHAT_ID is not set.");
    return NextResponse.json(
      { error: "TELEGRAM_ADMIN_CHAT_ID is not set. Set it in .env.local and retry." },
      { status: 500 },
    );
  }

  if (!botToken) {
    console.error("FATAL: TELEGRAM_BOT_TOKEN is not set.");
    return NextResponse.json(
      { error: "TELEGRAM_BOT_TOKEN is not set." },
      { status: 500 },
    );
  }

  // ── Safety: confirm we are NOT sending to public channels ──
  if (adminChatId === freeChannelId || adminChatId === vipChannelId) {
    return NextResponse.json(
      { error: "TELEGRAM_ADMIN_CHAT_ID must differ from FREE and VIP channel IDs." },
      { status: 500 },
    );
  }

  // ── Stubbed validator auto-correction alert ──
  const alertBody =
    `[Sharkline alert] <b>BOOKMAKER AUTO-CORRECTED</b>\n` +
    `Game: Denver Nuggets vs Minnesota Timberwolves\n` +
    `Pick: Under 223 @ -110\n` +
    `Claude said: bet365\n` +
    `Corrected to: DraftKings\n` +
    `Reason: bet365 does not offer this line in the odds payload`;

  // ── Send via Telegram Bot API directly (same path as sendAdminAlert) ──
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const telegramRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: adminChatId,
      text: alertBody,
      parse_mode: "HTML",
    }),
  });

  const telegramJson = await telegramRes.json();

  if (!telegramRes.ok) {
    return NextResponse.json(
      {
        error: "Telegram API rejected the request",
        status: telegramRes.status,
        telegram_response: telegramJson,
        admin_chat_id_used: adminChatId,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    delivered_to: "TELEGRAM_ADMIN_CHAT_ID",
    admin_chat_id: adminChatId,
    free_channel_contacted: false,
    vip_channel_contacted: false,
    message_text: alertBody,
    telegram_message_id: telegramJson.result?.message_id,
    telegram_chat: telegramJson.result?.chat,
  });
}
