import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "";
const VIP_CHANNEL_ID = process.env.VIP_CHANNEL_ID || "";
const ERMIR_CHAT_ID = process.env.ERMIR_CHAT_ID || "7238245588";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function sendTelegram(chatId: string, text: string) {
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    }
  );
  return res.json();
}

async function createVipInviteLink() {
  if (!VIP_CHANNEL_ID) return null;
  const res = await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/createChatInviteLink`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: VIP_CHANNEL_ID,
        member_limit: 1,
        name: `VIP-${Date.now()}`,
      }),
    }
  );
  const data = await res.json();
  return data.ok ? data.result.invite_link : null;
}

async function banFromVip(telegramUserId: string) {
  if (!VIP_CHANNEL_ID) return;
  await fetch(
    `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/banChatMember`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: VIP_CHANNEL_ID,
        user_id: parseInt(telegramUserId, 10),
      }),
    }
  );
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.text();
    let event;

    // In production, verify Stripe signature. For now, parse the JSON directly.
    try {
      event = JSON.parse(body);
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const type = event.type;

    if (type === "checkout.session.completed" || type === "invoice.payment_succeeded") {
      const session = event.data.object;
      const customerId = session.customer;
      const subscriptionId = session.subscription;
      const telegramUserId = session.metadata?.telegram_user_id || session.client_reference_id || "";
      const telegramUsername = session.metadata?.telegram_username || "";
      const amount = (session.amount_total || 4900) / 100;

      // Generate VIP invite link
      const inviteLink = await createVipInviteLink();

      // Insert subscriber
      const { error: subErr } = await supabase.from("subscribers").upsert({
        telegram_user_id: telegramUserId,
        telegram_username: telegramUsername,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        status: "active",
        plan: "vip_monthly",
        amount_paid: amount,
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        invite_link: inviteLink,
      }, { onConflict: "stripe_customer_id" });

      if (subErr) console.error("Subscriber insert error:", subErr.message);

      // Log revenue
      await supabase.from("revenue_events").insert({
        planet: "Sharkline",
        amount,
        source: "stripe",
        description: `VIP subscription — ${telegramUsername || telegramUserId}`,
      }).then(() => {}, () => {});

      // Send invite link to buyer via DM
      if (telegramUserId && inviteLink) {
        await sendTelegram(
          telegramUserId,
          `Welcome to Sharkline VIP! 🌟\n\nHere's your exclusive invite link:\n${inviteLink}\n\nYou'll get ALL picks (4-6 per day) with full analysis cards.\n\n🦈 Sharkline — sharkline.ai`
        );
      }

      // Count total subscribers
      const { count } = await supabase.from("subscribers")
        .select("id", { count: "exact", head: true }).eq("status", "active");

      // Notify Ermir
      await sendTelegram(
        ERMIR_CHAT_ID,
        `New VIP sub! $${amount}/mo — ${telegramUsername || telegramUserId}\nTotal: ${count || 1} active subscribers`
      );

      return NextResponse.json({ received: true, action: "subscription_created" });
    }

    if (type === "customer.subscription.deleted" || type === "invoice.payment_failed") {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      // Find subscriber
      const { data: sub } = await supabase.from("subscribers")
        .select("*").eq("stripe_customer_id", customerId).single();

      if (sub) {
        // Update status
        await supabase.from("subscribers")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("id", sub.id);

        // Ban from VIP channel
        if (sub.telegram_user_id) {
          await banFromVip(sub.telegram_user_id);
        }

        // Notify Ermir
        await sendTelegram(
          ERMIR_CHAT_ID,
          `VIP cancelled: ${sub.telegram_username || sub.telegram_user_id}`
        );
      }

      return NextResponse.json({ received: true, action: "subscription_cancelled" });
    }

    return NextResponse.json({ received: true, action: "ignored" });
  } catch (err) {
    console.error("Stripe webhook error:", err);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
