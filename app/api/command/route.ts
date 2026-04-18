import { NextResponse } from "next/server";
import { runFullPipeline } from "@/lib/universe/pipeline";
import { seedUniverse } from "@/lib/universe/seeder";
import { optimizeUniverse } from "@/lib/universe/optimizer";

const COMMANDS: Record<string, () => Promise<unknown>> = {
  "scan for new opportunities": () => runFullPipeline(),
  "run optimizer": () => optimizeUniverse(),
  "deploy seed planets": () => seedUniverse(),
  "show revenue report": async () => ({ message: "Revenue report — check dashboard stats" }),
  "boost top performers": async () => ({ message: "Boost — optimizer will handle this on next run" }),
};

export async function POST(request: Request) {
  try {
    const { command } = (await request.json()) as { command: string };
    const normalized = command.toLowerCase().trim();

    // Exact match
    if (COMMANDS[normalized]) {
      const result = await COMMANDS[normalized]();
      return NextResponse.json({ success: true, command: normalized, result });
    }

    // Fuzzy match
    const match = Object.keys(COMMANDS).find((k) =>
      normalized.includes(k) || k.includes(normalized)
    );

    if (match) {
      const result = await COMMANDS[match]();
      return NextResponse.json({ success: true, command: match, result });
    }

    return NextResponse.json(
      { success: false, error: `Unknown command: ${command}` },
      { status: 400 }
    );
  } catch (error) {
    console.error("[API /command] Error:", error);
    return NextResponse.json(
      { error: "Command failed" },
      { status: 500 }
    );
  }
}
