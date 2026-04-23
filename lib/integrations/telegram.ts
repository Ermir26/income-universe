const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

const isMock = !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID;

export async function sendTelegramMessage(text: string): Promise<boolean> {
  if (isMock) {
    console.log(`[Telegram/Mock] ${text}`);
    return true;
  }

  try {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "Markdown",
      }),
    });

    if (!res.ok) {
      console.error("[Telegram] Send failed:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Telegram] Error:", err);
    return false;
  }
}

export async function sendRevenueAlert(
  planetName: string,
  amount: number,
  source: string
): Promise<boolean> {
  const text = `💰 *Revenue: +$${amount.toFixed(2)}*\n🪐 ${planetName}\n📌 ${source}`;
  return sendTelegramMessage(text);
}

export async function sendScanReport(
  ideasFound: number,
  ideasPassed: number,
  planetsCreated: number,
  durationSeconds: number
): Promise<boolean> {
  const text = [
    `🔭 *Scan Complete*`,
    `Ideas found: ${ideasFound}`,
    `Passed feasibility: ${ideasPassed}`,
    `Planets deployed: ${planetsCreated}`,
    `Duration: ${durationSeconds}s`,
  ].join("\n");
  return sendTelegramMessage(text);
}

/**
 * Send an admin alert to the dedicated admin chat (not public channels).
 * Uses TELEGRAM_ADMIN_CHAT_ID env var.
 */
export async function sendAdminAlert(message: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN || "";
  const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID || "";

  if (!botToken || !adminChatId) {
    console.log(`[Telegram/AdminAlert] ${message}`);
    return true;
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: adminChatId,
        text: message,
        parse_mode: "HTML",
      }),
    });

    if (!res.ok) {
      console.error("[Telegram/AdminAlert] Send failed:", await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("[Telegram/AdminAlert] Error:", err);
    return false;
  }
}
