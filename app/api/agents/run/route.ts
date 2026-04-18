import { NextResponse } from "next/server";
import {
  getPlanets,
  getStats,
  addAgentLogMock,
  addRevenueMock,
} from "@/lib/mock-db";

const AGENT_ACTIONS: Record<string, { actions: string[]; results: string[] }> = {
  research: {
    actions: [
      "Researched market trends",
      "Analyzed competitor landscape",
      "Scraped new lead sources",
      "Identified trending niches",
    ],
    results: [
      "Found 3 high-potential niches with low competition",
      "Competitor analysis complete — gap identified in pricing",
      "Discovered 12 new lead sources in target market",
      "Trend report: AI automation up 40% MoM",
    ],
  },
  content: {
    actions: [
      "Generated blog post",
      "Wrote newsletter issue",
      "Created social media thread",
      "Drafted email sequence",
    ],
    results: [
      "Published: '7 AI Side Hustles That Actually Work'",
      "Newsletter #12 sent to 847 subscribers",
      "Twitter thread posted — 12 tweets on passive income",
      "5-email welcome sequence drafted and scheduled",
    ],
  },
  outreach: {
    actions: [
      "Sent cold emails",
      "Followed up with leads",
      "Personalized outreach batch",
      "Responded to inquiries",
    ],
    results: [
      "Emailed 20 prospects — 4 opened, 2 replied",
      "3 warm leads moved to next stage",
      "Sent 15 personalized pitches via Resend",
      "Replied to 5 inbound inquiries",
    ],
  },
  social: {
    actions: [
      "Published social media post",
      "Scheduled content batch",
      "Engaged with audience",
      "Posted daily tip",
    ],
    results: [
      "Tweet posted — 89 impressions, 12 likes",
      "Scheduled 7 posts via Buffer for next week",
      "Replied to 15 comments, followed 30 accounts",
      "Daily tip thread: '3 ways to automate X'",
    ],
  },
  sales: {
    actions: [
      "Processed orders",
      "Listed new products",
      "Updated pricing",
      "Ran promotions",
    ],
    results: [
      "3 new orders fulfilled automatically",
      "Listed 2 new digital products on Etsy",
      "Optimized pricing for top 5 SKUs",
      "Flash sale created — 24hr 20% off",
    ],
  },
  analytics: {
    actions: [
      "Ran analytics review",
      "Generated performance report",
      "Scanned for opportunities",
      "Monitored KPIs",
    ],
    results: [
      "Revenue up 18% WoW — top performer: premium pack",
      "Weekly report: 142 visits, 12 conversions, $89 revenue",
      "Found 3 new arbitrage opportunities",
      "All KPIs green — conversion rate 8.4%",
    ],
  },
  executor: {
    actions: [
      "Executed automation task",
      "Ran daily pipeline",
      "Processed batch job",
      "Deployed update",
    ],
    results: [
      "Pipeline complete — 12 items processed",
      "Daily tasks executed: 8/8 successful",
      "Batch job finished: 45 records updated",
      "v1.2 update deployed successfully",
    ],
  },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export async function POST() {
  try {
    const planets = getPlanets().filter((p) => p.status === "active");

    if (planets.length === 0) {
      return NextResponse.json({ events: [], stats: getStats() });
    }

    // Pick 1-3 random active planets to run agents on
    const count = Math.min(planets.length, Math.floor(Math.random() * 3) + 1);
    const shuffled = [...planets].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, count);

    const events: Array<{
      id: string;
      type: "agent" | "revenue";
      message: string;
      planetName: string;
      amount?: number;
      timestamp: string;
    }> = [];

    for (const planet of selected) {
      // Pick a random enabled agent from this planet
      const enabledAgents = planet.agents.filter((a) => a.enabled);
      if (enabledAgents.length === 0) continue;

      const agent = pick(enabledAgents);
      const agentType = agent.type;
      const pool = AGENT_ACTIONS[agentType] || AGENT_ACTIONS.executor;

      const action = pick(pool.actions);
      const result = pick(pool.results);

      // 25% chance of generating revenue
      const generatesRevenue = Math.random() < 0.25;
      const revenueAmount = generatesRevenue
        ? Math.round((Math.random() * 45 + 5) * 100) / 100
        : 0;

      const log = addAgentLogMock({
        planet_id: planet.id,
        agent_name: agent.name,
        action,
        result,
        revenue_generated: revenueAmount,
      });

      events.push({
        id: log.id,
        type: "agent",
        message: `${agent.name}: ${action}`,
        planetName: planet.name,
        timestamp: log.created_at,
      });

      if (revenueAmount > 0) {
        addRevenueMock(planet.id, revenueAmount, agent.name, result);

        events.push({
          id: `rev-${log.id}`,
          type: "revenue",
          message: `${planet.icon} ${planet.name} earned revenue`,
          planetName: planet.name,
          amount: revenueAmount,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return NextResponse.json({
      events,
      stats: getStats(),
      planets: getPlanets(),
    });
  } catch (error) {
    console.error("[API /agents/run] Error:", error);
    return NextResponse.json({ error: "Agent run failed" }, { status: 500 });
  }
}
