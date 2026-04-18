import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const ODDS_API_KEY = process.env.ODDS_API_KEY;

async function debug() {
  const { data: picks } = await supabase.from("picks").select("*").eq("status", "pending");
  console.log("=== PENDING PICKS ===");
  for (const p of picks || []) {
    console.log(`  DB: ${p.sport} | "${p.game}" | sport_key=${p.sport_key} | event_id=${p.event_id} | game_time=${p.game_time}`);
  }

  const sportKeys = [...new Set((picks || []).map(p => p.sport_key).filter(Boolean))];
  console.log(`\n=== FETCHING SCORES FOR: ${sportKeys.join(", ")} ===`);

  for (const sk of sportKeys) {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sk}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`);
    const scores = await res.json();
    if (!Array.isArray(scores)) {
      console.log(`  ${sk}: ERROR — ${JSON.stringify(scores)}`);
      continue;
    }
    const completed = scores.filter(s => s.completed);
    console.log(`\n  ${sk}: ${completed.length} completed, ${scores.length - completed.length} other`);

    const sportPicks = (picks || []).filter(p => p.sport_key === sk && p.status === "pending");
    for (const pick of sportPicks) {
      const teams = pick.game.split(" vs ").map(t => t.trim().toLowerCase());
      console.log(`\n  PICK: "${pick.game}"`);
      console.log(`    teams: [${teams.join(", ")}]`);

      let found = false;
      for (const s of scores) {
        const sHome = s.home_team.toLowerCase();
        const sAway = s.away_team.toLowerCase();

        const fuzzy = (a, b) => a.includes(b) || b.includes(a) || a.split(" ").some(w => w.length > 3 && b.includes(w));
        const m1 = fuzzy(teams[0], sHome) && fuzzy(teams[1], sAway);
        const m2 = fuzzy(teams[0], sAway) && fuzzy(teams[1], sHome);

        if (m1 || m2) {
          const status = s.completed ? "COMPLETED" : "IN PROGRESS";
          const scoreStr = s.scores ? s.scores.map(x => `${x.name}: ${x.score}`).join(", ") : "no scores";
          console.log(`    ✅ MATCH: "${s.home_team} vs ${s.away_team}" [${status}] — ${scoreStr}`);
          found = true;
          break;
        }
      }

      if (!found) {
        console.log(`    ❌ NO MATCH. All ${sk} completed games:`);
        for (const s of completed) {
          console.log(`      "${s.home_team} vs ${s.away_team}" — ${s.scores?.map(x => x.name + ":" + x.score).join(", ")}`);
        }
      }
    }
  }
}

debug().catch(console.error);
