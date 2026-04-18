import Anthropic from "@anthropic-ai/sdk";
import { supabaseAdmin } from "../supabase/server";
import type { DiscoveryInsert } from "../supabase/types";

const SOURCES = [
  "Reddit r/passive_income, r/entrepreneur, r/SideProject",
  "Product Hunt new AI tools",
  "Twitter/X trending AI business ideas",
  "Indie Hackers success stories",
  "Hacker News Show HN",
];

function getClient(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.log("SCANNER: Mock mode — no ANTHROPIC_API_KEY");
    return null;
  }
  return new Anthropic();
}

// Mock scanner: returns realistic fake discoveries
function mockScan(source: string): DiscoveryInsert[] {
  const mockIdeas: DiscoveryInsert[] = [
    {
      name: "AI Resume Builder SaaS",
      icon: "📄",
      category: "SaaS",
      description: "Automated resume optimization using AI. Charge $9.99/resume.",
      source,
      market_signal: "Growing demand on Reddit, multiple posts with 500+ upvotes",
      feasibility_score: null,
      feasibility_breakdown: null,
      status: "pending",
    },
    {
      name: "Notion Template Store",
      icon: "📋",
      category: "Digital Products",
      description: "Premium Notion templates for businesses. Sell on Gumroad/Etsy.",
      source,
      market_signal: "Trending on Product Hunt, several creators earning $5k+/mo",
      feasibility_score: null,
      feasibility_breakdown: null,
      status: "pending",
    },
    {
      name: "AI-Powered Newsletter Curation",
      icon: "📰",
      category: "Content",
      description: "Auto-curated niche newsletters using AI. Monetize with sponsorships.",
      source,
      market_signal: "Multiple Indie Hackers reporting $2k+/mo from curated newsletters",
      feasibility_score: null,
      feasibility_breakdown: null,
      status: "pending",
    },
  ];
  return mockIdeas;
}

export async function scanSource(source: string): Promise<DiscoveryInsert[]> {
  const client = getClient();

  if (!client) {
    console.log(`[Scanner] Mock scanning: ${source}`);
    const ideas = mockScan(source);
    await saveDiscoveries(ideas);
    return ideas;
  }

  console.log(`[Scanner] Scanning: ${source}`);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250514",
    max_tokens: 4096,
    tools: [
      {
        type: "web_search" as unknown as "computer_20250124",
        name: "web_search" as unknown as "computer",
        // web_search tool requires no additional params
      } as unknown as Anthropic.Tool,
    ],
    messages: [
      {
        role: "user",
        content: `You are an AI income opportunity scanner. Search the internet for the latest passive income and automated business opportunities.

Focus on: ${source}

Find 3-5 specific, actionable ideas that could be automated with AI. For each idea provide:
1. Name (short, catchy)
2. Category (SaaS, Digital Products, Content, Services, Trading, Affiliate, Other)
3. Description (2-3 sentences on what it is and how it makes money)
4. Market signal (evidence of demand or success)
5. Icon (single emoji)

Return as JSON array:
[{"name": "...", "category": "...", "description": "...", "market_signal": "...", "icon": "..."}]

Only return the JSON array, nothing else.`,
      },
    ],
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.log("[Scanner] No text response from Claude");
    return [];
  }

  try {
    // Parse JSON from response (may be wrapped in markdown code block)
    let jsonStr = textBlock.text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```$/g, "").trim();
    }

    const ideas = JSON.parse(jsonStr) as Array<{
      name: string;
      category: string;
      description: string;
      market_signal: string;
      icon: string;
    }>;

    const discoveries: DiscoveryInsert[] = ideas.map((idea) => ({
      name: idea.name,
      icon: idea.icon,
      category: idea.category,
      description: idea.description,
      source,
      market_signal: idea.market_signal,
      feasibility_score: null,
      feasibility_breakdown: null,
      status: "pending" as const,
    }));

    await saveDiscoveries(discoveries);
    return discoveries;
  } catch (err) {
    console.error("[Scanner] Failed to parse response:", err);
    return [];
  }
}

async function saveDiscoveries(discoveries: DiscoveryInsert[]) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.log(`[Scanner] Mock DB — would save ${discoveries.length} discoveries`);
    return;
  }

  const { error } = await supabaseAdmin.from("discoveries").insert(discoveries);
  if (error) {
    console.error("[Scanner] Failed to save discoveries:", error.message);
  } else {
    console.log(`[Scanner] Saved ${discoveries.length} discoveries`);
  }
}

export async function scanAll(): Promise<DiscoveryInsert[]> {
  const allDiscoveries: DiscoveryInsert[] = [];
  for (const source of SOURCES) {
    const ideas = await scanSource(source);
    allDiscoveries.push(...ideas);
  }
  return allDiscoveries;
}

export { SOURCES };
