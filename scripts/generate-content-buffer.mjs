// CLI: Generate 30 days of content buffer for Sharkline content calendar
// Usage: node scripts/generate-content-buffer.mjs [days]
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function main() {
  const days = parseInt(process.argv[2] || "30", 10);

  console.log("═".repeat(50));
  console.log("SHARKLINE — Content Buffer Generator");
  console.log("═".repeat(50));
  console.log(`Generating ${days} days of content...`);
  console.log();

  const { generateContentBuffer } = await import("../lib/agents/content-buffer.ts");
  const result = await generateContentBuffer(supabase, ANTHROPIC_API_KEY, days);

  console.log();
  console.log("═".repeat(50));
  console.log(`Generated: ${result.generated} days`);
  console.log(`Skipped (already exists): ${result.skipped} days`);
  console.log("═".repeat(50));
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
