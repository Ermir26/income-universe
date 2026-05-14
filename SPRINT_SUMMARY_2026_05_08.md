# Sprint Summary: REQUIREMENTS_2026_05_08

**Sprint dates:** 2026-05-08 through 2026-05-14
**Status:** All 5 tasks shipped and verified in production.

---

## Commits

### Pre-sprint (cleanup + diagnostics, 2026-05-08)

| Hash | Description |
|------|-------------|
| `9621b0a` | Fix: add `created_at` to PicksTable Pick interface + add `tsc --noEmit` to pre-commit hook |
| `bc0f711` | Fix: lower FOUNDATION factor anchoring (70-85 to 50-65) + deprecate `picks.category` writes |

### Sprint tasks

| Hash | Task | Description |
|------|------|-------------|
| `3a088f9` | 1.1 | Strict dupe enforcement: `event_id + bet_type + side + source` composite key |
| `ea4eb80` | 1.2 | Win rate honesty filter: exclude `source_unverifiable` + pre-parser-fix picks |
| `3abe86b` | 2.1 | Collapse tier ladder to VALUE + FOUNDATION only; add 11 tier edge-case tests |
| `3a71a3b` | 2.2 | Tier+score gated VIP/Method routing; FOUNDATION picks land as drafts |
| `acdb0dd` | 3.1 | Manual "Run Daily Picks Now" button on Health tab with audit logging |

---

## Test count

| Before | After | Delta |
|--------|-------|-------|
| 36 | 47 | +11 (tier edge-case tests) |

All 47 tests pass. TSC clean.

---

## Win rate

| Metric | Before (pre-filter) | After (honesty filter) |
|--------|---------------------|----------------------|
| `last_30_win_rate` | 56.7% on 30 picks | 52.0% on 25 picks |
| Filter applied | None | Excludes `data_quality_flag='source_unverifiable'` and `created_at < '2026-04-23'` |
| Sample | Includes Odds-API-era hallucinated lines | Only payload-validated picks |

---

## Tier distribution

### Before (pre-sprint)

| Tier | Count | Notes |
|------|-------|-------|
| VALUE | 27 | Includes 10 with mismatched `category=STRONG VALUE` |
| FOUNDATION | 4 | |
| STRONG VALUE | 10 | All mismatched `category` — actual `tier` was VALUE |
| NULL | 1 | Manual pick |

### After (post-sprint)

| Tier | Count | Notes |
|------|-------|-------|
| VALUE | 37 | Clean — all `category` mismatches reconciled |
| FOUNDATION | 4 | |
| NULL | 1 | Manual pick |
| STRONG VALUE | 0 | Deprecated — `getTier()` no longer produces this |
| MAXIMUM | 0 | Deprecated — `getTier()` no longer produces this |

---

## Behavioral changes

### Routing fallback changed (Task 2.2)

**Before:** Default routing fallback was `"vip,method"` — any unmapped pick silently published to VIP and Method channels.

**After:** Default routing fallback is `"draft"` — unmapped picks require operator approval before publishing. This is intentional: FOUNDATION picks and VALUE picks with `scoring_score < 65` now land as drafts only.

### FOUNDATION prompt anchoring (pre-sprint fix)

Claude was told to rate FOUNDATION factors 70-85, causing FOUNDATION picks to score higher (avg 70.3) than VALUE picks (avg 67.4). Fixed to 50-65. FOUNDATION picks now score lower as intended.

### Tier ladder collapse (Task 2.1)

STRONG VALUE (>=75) and MAXIMUM (>=85) removed from active code. The scoring engine produces scores in a 62-74 band — those thresholds were mathematically unreachable. `LegacyTierName` type preserved for historical DB reads. All UI consumers, Telegram templates, and config maps updated.

### VIP/Method routing rule (Task 2.2)

New rule: `tier = 'VALUE' AND scoring_score >= 65`. All candidates route to VIP + Method. Top 2 by `edge_percentage DESC, scoring_score DESC` also route to FREE. FOUNDATION picks are draft-only. Underdog alerts remain VIP-only.

### Manual run button (Task 3.1)

Operators can trigger pick generation on-demand via the Health tab. Respects `TIPSTER_ENABLED` kill switch. Every trigger logged to `agent_logs` with `action='manual_pick_run'`.

### Dupe enforcement (Task 1.1)

Pre-insert check uses `event_id + bet_type + side + source` composite key. Manual picks bypass the check (operator override is intentional). Duplicates logged to `agent_logs` with `reason='duplicate_pick'`.

---

## Operator action items (still open)

1. **Credential rotation** — `ADMIN_DASHBOARD_PASSWORD` must be rotated before flipping `TIPSTER_ENABLED=true`, exposing `/public` after the 50-pick reveal gate, or any public marketing push.

2. **TIPSTER_ENABLED flip decision** — After credential rotation, decide whether to resume daily cron generation or rely on the manual "Run Now" button. PM lean: flip on after credential rotation.

3. **BotFather copy update** — `/setname`, `/setabouttext`, `/setdescription` strings provided in prior PM/QC session not yet applied to @Galaxytipbot.

4. **Manual Run Now button dry-run** — Click the button on the Health tab to verify end-to-end kill-switch response (`{"skipped":"disabled","triggered_by":"manual"}`).

5. **Dashboard overview auth audit** — `GET /api/dashboard/overview` returned 200 without auth during smoke test. Verify whether this is intentional (public-readable overview) or an auth gap that needs fixing.

---

## Out of scope / deferred

| Item | Reason |
|------|--------|
| Tier 2 calibration fixes (prompt range widening to 30-95) | Needs separate product decision on tier ladder dormancy vs calibration investment |
| Tier 3 architectural (external probability signal) | 1-2 week rebuild, deferred until supervised flight produces enough sample |
| Pinnacle scraper revival | Deferred per B3 from prior sprint |
| Stripe / payments / affiliate / email capture | Out of scope |
| Phase 4.x bankroll features (Kelly stakes, daily exposure cap, recovery mode, public Method dashboard) | Next sprint candidate |
| Public dashboard reveal | Gated at graded >= 50, currently 41. Auto-reveals when threshold passes |

---

## Production verification

| Check | Result |
|-------|--------|
| Vercel deploy | Ready (`dpl_38WV5jrCn8gHAzDyfsLRT5w97ANE`) at `income-universe.vercel.app` |
| `GET /api/dashboard/overview` | 200 — `last_30_win_rate: 52`, `graded_picks: 41`, `reveal_ready: false` |
| `GET /api/tipster/public/stats` | 200 — `last_30_win_rate: 52`, `graded_ok: false` (41/50), `reveal_ready: false` |
| SQL: new STRONG VALUE/MAXIMUM since 2026-05-08 | 0 |
| SQL: tier distribution | VALUE: 37, FOUNDATION: 4, NULL: 1 |
| Test suite | 47/47 pass |
| TSC | Clean |
