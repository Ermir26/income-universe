// Content Buffer — pre-generate 30 days of content for the content calendar
// Sharkline: educational posts, TikTok scripts, Twitter threads, Telegram previews

import { type SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { getBrandPromptRules, BRAND } from "../tipster/brand";

const EDUCATIONAL_TOPICS = [
  "How to read line movement",
  "What sharp money means",
  "Kelly criterion explained",
  "Why value beats winners",
  "How we find edges the market misses",
  "What is expected value in betting",
  "Why bankroll management matters",
  "Understanding closing line value",
  "Public vs sharp money explained",
  "How injuries affect betting lines",
  "Why chasing losses destroys bankrolls",
  "The difference between good and bad odds",
  "How weather affects totals in outdoor sports",
  "Why correlated parlays are dangerous",
  "Understanding vig and how bookmakers profit",
];

const SPORTS = ["Soccer", "NBA", "NFL", "Tennis", "MLB", "NHL", "MMA"];

interface ContentDay {
  id: string;
  date: string;
  sport: string;
  tiktok_script: string;
  twitter_thread: object[];
  educational_post: string;
  telegram_preview: string;
  content_type: string;
}

export async function generateContentBuffer(
  supabase: SupabaseClient,
  anthropicApiKey: string,
  days: number = 30,
): Promise<{ generated: number; skipped: number }> {
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const today = new Date();
  let generated = 0;
  let skipped = 0;

  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split("T")[0];

    // Check if content already exists for this date
    const { data: existing } = await supabase
      .from("content_calendar")
      .select("id")
      .eq("date", dateStr)
      .limit(1);

    if (existing && existing.length > 0) {
      skipped++;
      continue;
    }

    const sport = SPORTS[d % SPORTS.length];
    const topic = EDUCATIONAL_TOPICS[d % EDUCATIONAL_TOPICS.length];
    const dayOfWeek = date.toLocaleDateString("en-US", { weekday: "long" });

    console.log(`   Generating content for ${dateStr} (${dayOfWeek}, ${sport})...`);

    try {
      const response = await client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [{
          role: "user",
          content: `${getBrandPromptRules()}

Generate a full day's content package for Sharkline. Date: ${dateStr} (${dayOfWeek}). Featured sport: ${sport}.

Generate ALL of the following in one response:

1. TIKTOK SCRIPT (30 seconds):
   Format: HOOK (3 sec scroll-stopper) → DATA (show stats) → PICK TEASE (what we're looking at) → CTA (follow for free picks)
   Conversational, "we" voice, no AI mentions.

2. TWITTER THREAD (5-7 tweets, each under 280 chars):
   Hook tweet → analysis tweets → transparency tweet → CTA tweet
   Include #SportsBetting #FreePicks on first and last tweets.

3. EDUCATIONAL POST for "${topic}":
   3-4 paragraphs explaining this concept in plain English.
   Use real examples. Sound like an experienced bettor teaching a friend.
   End with how Sharkline applies this concept.
   For Telegram (HTML parse_mode).

4. TELEGRAM PREVIEW (free channel teaser):
   Short teaser for upcoming picks. Build anticipation.
   Format: emoji + sport + "plays loading" style message.
   End with 🦈 Sharkline — sharkline.ai

Return ONLY this JSON (no markdown fences):
{
  "tiktok_script": "HOOK: ...\\nBODY: ...\\nDATA: ...\\nCTA: ...",
  "twitter_thread": [{"tweet": 1, "content": "..."}, ...],
  "educational_post": "<b>...</b>\\n...",
  "telegram_preview": "..."
}`,
        }],
      });

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        console.log(`   Failed to generate for ${dateStr}`);
        continue;
      }

      let jsonStr = textBlock.text.trim();
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log(`   Failed to parse JSON for ${dateStr}`);
        continue;
      }

      const content = JSON.parse(jsonMatch[0]);

      await supabase.from("content_calendar").insert({
        date: dateStr,
        sport,
        tiktok_script: content.tiktok_script,
        twitter_thread: content.twitter_thread,
        educational_post: content.educational_post,
        telegram_preview: content.telegram_preview,
        content_type: "pick",
        status: "pending",
      });

      generated++;
      console.log(`   ✅ ${dateStr} — ${sport}`);

      // Rate limit: small delay between API calls
      if (d < days - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    } catch (err) {
      console.log(`   ❌ ${dateStr} failed: ${(err as Error).message}`);
    }
  }

  return { generated, skipped };
}

/**
 * Get today's content from the buffer based on yesterday's results.
 * Returns the appropriate content type based on performance.
 */
export async function getTodayContent(
  supabase: SupabaseClient,
): Promise<{
  type: "celebration" | "educational" | "fomo" | "standard";
  content: ContentDay | null;
}> {
  const today = new Date().toISOString().split("T")[0];

  // Get today's buffered content
  const { data: buffered } = await supabase
    .from("content_calendar")
    .select("*")
    .eq("date", today)
    .eq("status", "pending")
    .limit(1)
    .single();

  if (!buffered) {
    return { type: "standard", content: null };
  }

  // Check yesterday's results
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setHours(23, 59, 59, 999);

  const { data: yesterdayPicks } = await supabase
    .from("picks")
    .select("result")
    .gte("sent_at", yesterday.toISOString())
    .lte("sent_at", yesterdayEnd.toISOString())
    .neq("result", "pending");

  const wins = yesterdayPicks?.filter((p) => p.result === "won").length ?? 0;
  const losses = yesterdayPicks?.filter((p) => p.result === "lost").length ?? 0;
  const isLosingDay = losses > wins;

  // Check for win streak
  const { data: recentPicks } = await supabase
    .from("picks")
    .select("result")
    .neq("result", "pending")
    .order("sent_at", { ascending: false })
    .limit(10);

  let streak = 0;
  for (const p of recentPicks ?? []) {
    if (p.result === "won") streak++;
    else break;
  }

  let type: "celebration" | "educational" | "fomo" | "standard";
  if (streak >= 3) {
    type = "fomo";
  } else if (isLosingDay) {
    type = "educational";
  } else if (wins > losses) {
    type = "celebration";
  } else {
    type = "standard";
  }

  return { type, content: buffered };
}

/**
 * Post today's content from the buffer to the free Telegram channel.
 * Called by the cron — decides what to post based on yesterday's results.
 */
export async function postBufferedContent(
  supabase: SupabaseClient,
  telegramBotToken: string,
  channelId: string,
): Promise<{ posted: boolean; type: string }> {
  const { type, content } = await getTodayContent(supabase);

  if (!content) {
    console.log("   No buffered content for today");
    return { posted: false, type: "none" };
  }

  let postText: string;

  switch (type) {
    case "educational":
      // Bad day — post educational content
      postText = content.educational_post;
      console.log("   📚 Posting educational content (yesterday was a losing day)");
      break;
    case "fomo":
      // Win streak 3+ — post FOMO conversion content
      postText = content.telegram_preview + "\n\n🔥 We're on a streak. Don't miss tomorrow's plays.\n🦈 Sharkline — sharkline.ai";
      console.log("   🔥 Posting FOMO content (win streak active)");
      break;
    case "celebration":
      // Winning day — post pick-focused content
      postText = content.telegram_preview;
      console.log("   🎉 Posting celebration content (yesterday was a winning day)");
      break;
    default:
      // Standard day — post preview
      postText = content.telegram_preview;
      console.log("   📤 Posting standard preview content");
      break;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channelId, text: postText, parse_mode: "HTML" }),
    });
    const data = await res.json();

    if (data.ok) {
      // Mark content as posted
      await supabase
        .from("content_calendar")
        .update({ status: "posted" })
        .eq("id", content.id);

      console.log(`   ✅ Posted buffered ${type} content → msg:${data.result.message_id}`);
      return { posted: true, type };
    } else {
      console.log(`   ❌ Telegram error: ${data.description}`);
      return { posted: false, type };
    }
  } catch (err) {
    console.log(`   ❌ Post failed: ${(err as Error).message}`);
    return { posted: false, type };
  }
}
