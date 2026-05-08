# Testing

## Running Tests

```bash
npm test          # Run all tests once (vitest run)
npx vitest        # Run in watch mode
npx vitest run __tests__/daily-picks.test.ts   # Run a single file
```

## Test Types

### Unit Tests (`__tests__/`)

- **`daily-picks.test.ts`** — Tests the daily-picks cron handler: kill switch, MAX_PICKS_PER_DAY cap, zero-candidate handling. Uses vitest mocks for Supabase, tipster-agent, and safety modules.
- **`reasoning-matrix.test.ts`** — Tests the `detectEditCategory` function from the edit route: classifies edits as cosmetic, directional, structural, or none based on which fields changed.

### Synthetic Tests (`lib/tipster/__tests__/`)

- **`validator-synthetic.test.ts`** — Tests the pick validator (`validatePickAgainstPayload`) and ESPN odds parser (`parseESPNOddsData`). Covers matching/mismatched lines, price tolerance, bookmaker auto-correction, and empty-bookmaker rejection.

## Configuration

- **Framework:** Vitest 4.x
- **Config:** `vitest.config.ts` (Node environment, `@` alias resolves to repo root)
- **Path aliases:** `@/lib/...` maps to `./lib/...`, matching Next.js tsconfig paths

## Pre-commit Hook

A git pre-commit hook runs `npm test` before every commit. If tests fail, the commit is rejected. To bypass in emergencies: `git commit --no-verify` (use sparingly).
