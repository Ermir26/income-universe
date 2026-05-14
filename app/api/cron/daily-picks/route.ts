// Daily picks cron — 13:00 UTC (6 AM Arizona) via Vercel cron
// Auth: CRON_SECRET bearer token or Vercel cron user-agent
// Generation logic lives in lib/tipster/run-pick-generation.ts

import { NextResponse } from "next/server";
import { runPickGeneration } from "@/lib/tipster/run-pick-generation";

const CRON_SECRET = process.env.CRON_SECRET ?? "";

export const maxDuration = 120;

export async function GET(request: Request) {
  // Auth: require Bearer CRON_SECRET or Vercel's built-in cron user-agent
  const authHeader = request.headers.get("authorization");
  const ua = request.headers.get("user-agent") ?? "";
  const isVercelCron = ua.startsWith("vercel-cron/");
  const isValidBearer = CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`;

  if (!isVercelCron && !isValidBearer) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPickGeneration("cron");
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
