// Waitlist Notification Script — notify subscribers when VIP launches
// For now: data collection + storage. Email sending comes with Stripe in Week 2.
import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function getWaitlistStats() {
  const { data: entries, count } = await supabase
    .from("waitlist")
    .select("email, sport_interest, source, created_at", { count: "exact" })
    .order("created_at", { ascending: false });

  if (!entries || entries.length === 0) {
    console.log("\n📋 Waitlist is empty.\n");
    return;
  }

  console.log(`\n📋 WAITLIST — ${count} subscribers\n`);
  console.log("━".repeat(50));

  // Sport interest breakdown
  const sportCounts = {};
  for (const entry of entries) {
    for (const sport of (entry.sport_interest || [])) {
      sportCounts[sport] = (sportCounts[sport] || 0) + 1;
    }
  }

  if (Object.keys(sportCounts).length > 0) {
    console.log("\nSport Interest:");
    for (const [sport, count] of Object.entries(sportCounts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${sport}: ${count}`);
    }
  }

  // Source breakdown
  const sourceCounts = {};
  for (const entry of entries) {
    const src = entry.source || "landing_page";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  }

  console.log("\nSources:");
  for (const [src, cnt] of Object.entries(sourceCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src}: ${cnt}`);
  }

  // Recent signups
  console.log("\nRecent signups:");
  for (const entry of entries.slice(0, 10)) {
    const date = new Date(entry.created_at).toLocaleDateString("en-US", {
      month: "short", day: "numeric",
    });
    console.log(`  ${date} — ${entry.email} [${(entry.sport_interest || []).join(", ") || "no preference"}]`);
  }

  console.log("\n" + "━".repeat(50));
}

async function exportWaitlist() {
  const { data: entries } = await supabase
    .from("waitlist")
    .select("email, sport_interest, source, created_at")
    .order("created_at", { ascending: true });

  if (!entries || entries.length === 0) {
    console.log("No entries to export.");
    return;
  }

  // CSV output
  console.log("email,sport_interest,source,created_at");
  for (const entry of entries) {
    const sports = (entry.sport_interest || []).join(";");
    console.log(`${entry.email},"${sports}",${entry.source},${entry.created_at}`);
  }
}

async function main() {
  const cmd = process.argv[2] || "stats";
  switch (cmd) {
    case "stats": await getWaitlistStats(); break;
    case "export": await exportWaitlist(); break;
    default:
      console.log("Usage: node notify-waitlist.mjs [stats|export]");
  }
}

main().catch(console.error);
