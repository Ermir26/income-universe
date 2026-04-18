import { NextResponse } from "next/server";
import {
  addDiscoveryMock,
  updateDiscoveryMock,
  findOrCreateGalaxyMock,
  addPlanetMock,
  updateScanStats,
  getPlanets,
  getGalaxies,
  getStats,
} from "@/lib/mock-db";
import { GALAXY_COLORS } from "@/lib/claude/builder";
import type { FeasibilityBreakdown, AgentConfig } from "@/lib/supabase/types";

// Randomized mock discoveries so each scan is different
const IDEA_POOL = [
  { name: "AI Logo Generator", icon: "🎨", category: "SaaS", desc: "Instant AI logos for startups. $19/logo, fully automated.", signal: "3.2k upvotes on r/entrepreneur" },
  { name: "Prompt Template Marketplace", icon: "💬", category: "Digital Products", desc: "Sell premium ChatGPT/Claude prompt packs on Gumroad.", signal: "Top sellers making $8k/mo on Gumroad" },
  { name: "AI SEO Blog Writer", icon: "✍️", category: "Content", desc: "Auto-generates SEO-optimized articles. Monetize with affiliate links.", signal: "Trending on Indie Hackers, 50+ success stories" },
  { name: "Niche Subreddit Monitor", icon: "📡", category: "SaaS", desc: "Monitors subreddits for buying signals, alerts businesses in real-time.", signal: "Multiple YC startups in this space" },
  { name: "AI Cold Email Engine", icon: "📧", category: "Services", desc: "Personalized cold emails at scale using AI. Charge per campaign.", signal: "B2B agencies reporting 3x response rates with AI" },
  { name: "Stock Photo Generator", icon: "📸", category: "Digital Products", desc: "AI-generated stock photos for specific niches. Sell on Shutterstock.", signal: "AI art selling well on stock platforms" },
  { name: "Micro SaaS Directory", icon: "📂", category: "Content", desc: "Curated directory of micro SaaS tools. Monetize with listings + affiliates.", signal: "Similar directories earning $5-10k/mo" },
  { name: "AI Course Creator", icon: "🎓", category: "Digital Products", desc: "Auto-generates online courses from topic prompts. Sell on Udemy.", signal: "Course creation market growing 15% YoY" },
  { name: "Telegram Trading Bot", icon: "📊", category: "Trading", desc: "Crypto/forex signal bot. Subscription-based alerts.", signal: "Top signal bots have 10k+ subscribers" },
  { name: "AI Bookkeeper", icon: "📒", category: "Services", desc: "Automated bookkeeping for freelancers. $29/mo subscription.", signal: "Massive underserved market of 60M freelancers" },
  { name: "Print-on-Demand Empire", icon: "👕", category: "Digital Products", desc: "AI-designed merch on Redbubble/TeeSpring. Fully automated.", signal: "Top POD sellers doing $20k+/mo" },
  { name: "Newsletter Sponsorship Broker", icon: "💼", category: "Services", desc: "Match newsletter creators with sponsors. Take 20% cut.", signal: "Newsletter ad market worth $2B+" },
  { name: "AI Podcast Clipper", icon: "🎙️", category: "SaaS", desc: "Auto-clips viral moments from podcasts for social media.", signal: "Opus Clip raised $20M — huge demand" },
  { name: "Arbitrage Finder", icon: "🔍", category: "Trading", desc: "Scans price differences across marketplaces for flip opportunities.", signal: "Retail arbitrage community growing fast on Reddit" },
  { name: "AI Recruiter Outreach", icon: "🤝", category: "Services", desc: "Automated candidate sourcing and outreach for recruiters.", signal: "Recruiters spending $500+/mo on sourcing tools" },
];

function pickRandomIdeas(count: number) {
  const shuffled = [...IDEA_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function mockFeasibility(name: string): { score: number; breakdown: FeasibilityBreakdown } {
  const seed = name.length;
  const breakdown: FeasibilityBreakdown = {
    marketDemand: 14 + (seed % 11),
    automationPotential: 16 + ((seed * 3) % 9),
    timeToRevenue: 12 + ((seed * 7) % 13),
    startupCost: 15 + ((seed * 5) % 10),
  };
  const score = breakdown.marketDemand + breakdown.automationPotential + breakdown.timeToRevenue + breakdown.startupCost;
  return { score, breakdown };
}

function generateAgents(category: string): AgentConfig[] {
  const base: AgentConfig[] = [
    { name: "researcher", type: "research", schedule: "0 */6 * * *", enabled: true },
    { name: "executor", type: "executor", schedule: "0 */12 * * *", enabled: true },
  ];
  if (category === "Content") base.push({ name: "writer", type: "content", schedule: "0 8 * * 1,3,5", enabled: true });
  if (category === "Services") base.push({ name: "outreacher", type: "outreach", schedule: "0 10 * * 1-5", enabled: true });
  if (category === "Trading") base.push({ name: "scanner", type: "analytics", schedule: "0 */4 * * *", enabled: true });
  if (category === "SaaS") base.push({ name: "marketer", type: "social", schedule: "0 9,15 * * *", enabled: true });
  return base;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const count = (body as { count?: number }).count || 3;

    const ideas = pickRandomIdeas(count);
    const newPlanets: ReturnType<typeof getPlanets> = [];
    const feedEvents: Array<{ type: string; message: string; planetName?: string; amount?: number }> = [];

    let ideasFound = ideas.length;
    let ideasPassed = 0;
    let ideasFailed = 0;
    let planetsCreated = 0;

    feedEvents.push({ type: "scan", message: `Scanning ${ideasFound} opportunities...` });

    for (const idea of ideas) {
      // Add as discovery
      const discovery = addDiscoveryMock({
        name: idea.name,
        icon: idea.icon,
        category: idea.category,
        description: idea.desc,
        source: "AI Scanner",
        market_signal: idea.signal,
        feasibility_score: null,
        feasibility_breakdown: null,
        status: "pending",
      });

      feedEvents.push({ type: "scan", message: `Discovered: ${idea.icon} ${idea.name}` });

      // Run feasibility
      const { score, breakdown } = mockFeasibility(idea.name);
      const passed = score >= 62;

      updateDiscoveryMock(discovery.id, {
        feasibility_score: score,
        feasibility_breakdown: breakdown,
        status: passed ? "passed" : "rejected",
      });

      feedEvents.push({
        type: passed ? "planet" : "system",
        message: `${idea.name}: ${score}/100 ${passed ? "PASS" : "FAIL"}`,
      });

      if (passed) {
        ideasPassed++;

        // Build planet
        const galaxy = findOrCreateGalaxyMock(
          `${idea.category} Galaxy`,
          idea.category,
          GALAXY_COLORS[idea.category] || GALAXY_COLORS.Other
        );

        const planet = addPlanetMock({
          galaxy_id: galaxy.id,
          name: idea.name,
          icon: idea.icon,
          category: idea.category,
          status: "active",
          feasibility_score: score,
          monthly_target: "$500-2000",
          revenue_total: 0,
          revenue_today: 0,
          revenue_week: 0,
          agents: generateAgents(idea.category),
          config: { feasibility: breakdown },
          source_url: null,
          market_signal: idea.signal,
          description: idea.desc,
          first_task: `Initialize ${idea.name}: research market and set up automation`,
          activated_at: new Date().toISOString(),
          last_active: new Date().toISOString(),
        });

        newPlanets.push(planet);
        planetsCreated++;

        feedEvents.push({
          type: "planet",
          message: `Deployed: ${idea.icon} ${idea.name}`,
          planetName: idea.name,
        });
      } else {
        ideasFailed++;
      }
    }

    updateScanStats();

    feedEvents.push({
      type: "system",
      message: `Scan complete: ${ideasPassed} planets deployed, ${ideasFailed} rejected`,
    });

    return NextResponse.json({
      ideasFound,
      ideasPassed,
      ideasFailed,
      planetsCreated,
      newPlanets,
      galaxies: getGalaxies(),
      planets: getPlanets(),
      stats: getStats(),
      feedEvents,
    });
  } catch (error) {
    console.error("[API /scan] Error:", error);
    return NextResponse.json({ error: "Scan failed" }, { status: 500 });
  }
}
